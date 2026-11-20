# Interfaces (frozen at H0:45, change only after telling everyone)

## LogEntry
{ seq, ts, host, source, level, message, prevHash, hash }
hash = sha256(seq | ts | host | source | message | prevHash)

## Batch
{ batchId, startSeq, endSeq, merkleRoot, lastChainHash, txHash, blockNumber }

## Contract: AnchorRegistry
function anchor(uint256 batchId, bytes32 merkleRoot, bytes32 lastChainHash, uint64 startSeq, uint64 endSeq) external onlyAnchorer;
// require(batchId == nextBatchId): no gaps, no overwrites
event Anchored(batchId, merkleRoot, lastChainHash, startSeq, endSeq, timestamp);
function getBatch(uint256 id) view returns (Batch);
// Batch on-chain = { batchId, merkleRoot, lastChainHash, startSeq, endSeq, timestamp, blockNumber }
// txHash is not stored on-chain; anchorClient fills it from the Anchored event.
// getBatch reverts BatchNotFound(id) for ids not yet anchored (client returns null).

### Contract rules (M1, implemented H1)
- anchor() reverts BadBatchId(expected, got) unless batchId == nextBatchId. Batch ids start at 0.
- anchor() reverts NotAnchorer(caller) unless the caller is an anchorer. The owner is NOT an anchorer by default.
- Range rule: startSeq <= endSeq for a normal batch. **Heartbeat batch** (no new logs in the interval):
  startSeq = endSeq + 1 (empty range), merkleRoot = 0x00..00, lastChainHash = previous batch's lastChainHash.
  Anything else with startSeq > endSeq reverts InvalidRange.
- Hashes go on-chain as bytes32: 0x + 64 lowercase hex. anchorClient.toBytes32() accepts sha256 hex with or without 0x.

### anchorClient (anchor-service/src/anchorClient.ts)
```ts
const c = AnchorClient.fromEnv();                 // writer; AnchorClient.fromEnv({ readOnly: true }) for readers
await c.anchor({ batchId, merkleRoot, lastChainHash, startSeq, endSeq }) // -> Batch + gasUsed + latencyMs
await c.getBatch(id)        // -> Batch | null
await c.getAllBatches()     // -> Batch[] oldest first (use in verifier)
await c.nextBatchId()       // -> number
c.onAnchored(batch => ...)  // -> unsubscribe()
```
Errors are thrown as AnchorError { reason: "BadBatchId" | "NotAnchorer" | "InvalidRange", args }.
Deployment info (address, chainId, abi, deployBlock) is in contracts/deployments/localhost.json after deploy.

## Verdicts
OK, MODIFIED, DELETED, INSERTED, REORDERED, TRUNCATED, UNANCHORED_WINDOW, ANCHOR_SILENCE

## Ports
chain: 8545 | agent: 4001 | collector: 4002 | anchor-service: 4003 | verifier: 4004 | dashboard: 5173

## M2 Component Endpoints

### Agent (Port 4001)
- `GET /health` - status, current seq, total logs, baseline mode
- `GET /api/logs?limit=50&offset=0&batchId=0` - get paginated logs
- `GET /api/stats` - stats on SQLite logs, load generator, and anchoring
- `POST /api/logs/write` - write custom log `{ message, source?, level?, host? }`
- `POST /api/actions/simulate` - simulate realistic activity `{ type: "login"|"sudo"|"file"|"admin" }`
- `POST /api/load/start` - start load generator `{ rate: 10..1000 }` (logs/sec)
- `POST /api/load/stop` - stop load generator
- `POST /api/baseline` - toggle baseline mode `{ enabled: boolean }` (anchoring suspended, plain hash chain)
- `POST /api/anchor/trigger` - manually trigger Merkle batch and anchor

### Collector (Port 4002)
- `GET /health` - status, total off-host logs, total batches
- `POST /api/collector/ingest` - ingest log entry or array of entries from agent immediately
- `POST /api/collector/batch` - store batch mapping `{ batchId, startSeq, endSeq, merkleRoot, lastChainHash, txHash, blockNumber }`
- `GET /api/collector/logs` - query off-host logs for verifier comparison
- `GET /api/collector/entry/:seq` - query specific off-host entry for forensic diff
- `GET /api/collector/batches` - list all anchored batches
- `GET /api/collector/stats` - get total off-host counts

### Evidence
- `npm run export` - generates CERT-In format `evidence-pack.json` & markdown report
- `node verify-standalone.js <pack.json> [rpcUrl]` - standalone zero-dependency auditor verifier script

## M3 Component Endpoints and CLIs

### Verifier (Port 4004)
Reads the victim's SQLite logs (read-only) + the off-host collector + on-chain batches (via anchor-service/src/anchorClient.ts), and emits a per-entry verdict. Core logic is a pure function (`verifier/src/verifier.ts::verifyLogs`), covered by `verifier/test-verifier.ts` (synthetic scenario for each of the 8 attacks, no live chain needed).
- `GET /health` - status, DB paths in use
- `GET /api/verify` - full verification: `{ entries: EntryVerdict[], batches: BatchVerdict[], silence: SilenceAlert, summary }`
- `GET /api/verify/batch/:id` - just one on-chain batch's entries + its root/lastChainHash check (attack console diff view)
- `GET /api/verify/baseline` - what a plain hash chain (no blockchain, no collector) would conclude: `{ ok, brokenLinks }` — this is the "obvious fix fails" demo
- `GET /api/silence` - silence status alone (cheap)
- Env: `VICTIM_DB_PATH`, `COLLECTOR_DB_PATH`, `ANCHOR_INTERVAL_MS` (default 5000), `BASELINE_MODE=true` to suppress ANCHOR_SILENCE (anchoring intentionally off)

Detection model: per on-chain batch, rebuild the Merkle root from the victim's current local entries in that batch's range and compare it to the anchored root (catches attack 6 — chain self-consistent locally, but the root no longer matches). Per entry, cross-check against the off-host collector to name exactly what happened (DELETED / INSERTED / MODIFIED / REORDERED / TRUNCATED). If a batch's root doesn't match but every entry in it already got a specific diagnosis, that diagnosis is trusted — the whole batch is only blanket-flagged when nothing else explains the mismatch, so one tampered line doesn't turn the rest of the batch red too.

### Attacks (`attacks/`)
`cd attacks && node --experimental-strip-types src/run.ts <1-8> [args]` - runs as root against `agent/victim.db` directly (SQLite), or (attack 7) kills whatever process is listening on the agent's port, or (attack 8) uses the anchorer key against the live contract. Env: `VICTIM_DB_PATH` to target a different DB file.
1 edit-line `[seq]` · 2 delete-line `[seq]` · 3 insert-line `["message"]` · 4 reorder-lines `[seqA] [seqB]` · 5 truncate-tail `[keepCount]` · 6 delete-recompute `[seq]` (the headline attack) · 7 kill-agent `[port]` · 8 steal-key-overwrite `[batchId]`
Mutation logic lives in `attacks/src/mutations.ts`, shared conceptually with `bench/src/attackScenarios.ts` (same semantics, array-based instead of SQLite-based, for fast benchmarking).

### Bench (`bench/`)
`cd bench && npm run bench` - 20 runs per attack (1-6) at random positions on a fresh in-memory scenario, baseline vs SakshiLog, plus 20 clean runs (false-positive check) and a silence-timing sweep. Writes `bench/results/results.json` and `bench/results/results.md` (the attack matrix table with measured numbers, for the slides). Runs entirely against the pure `verifyLogs()`/`verifyBaseline()` functions — no live chain or agent needed, so it's fast and reproducible. Attacks 7 and 8 are operational / contract-level and are validated live instead (attacks/src/07, attacks/src/08, anchor-service's smoke test).

### Known caveat when testing by hand
`anchor-service`'s smoke test (`npm run smoke`) anchors synthetic batches straight to whatever contract is currently deployed. If you run it against the *same* deployment you then use for a live agent demo, the verifier will (correctly) flag the smoke test's unrelated batches as not matching the agent's real data. Redeploy fresh (`cd contracts && npm run deploy:local`) before a real demo run if `npm run smoke` has touched that chain.
