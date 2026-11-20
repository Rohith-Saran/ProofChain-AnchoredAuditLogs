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

### Anchor service (anchor-service/src/server.ts, M1 Phase 2, port 4003)
The dedicated HTTP front door to AnchorRegistry: owns nextBatchId allocation, retries
transient failures (chain slow / nonce race) with backoff, and pushes every anchor to
connected dashboards over Socket.IO the moment it lands on-chain — regardless of whether
it was submitted through this service or straight from an agent's in-process AnchorClient.
- `GET /health` - status, contract address, nextBatchId
- `POST /api/anchor` - body `{ merkleRoot, lastChainHash, startSeq, endSeq }` (no batchId -
  the service assigns it). Queues the request, retries up to 3x with backoff on failure,
  resyncs once on a BadBatchId race. Returns the anchored Batch (+ gasUsed as a string,
  latencyMs).
- `GET /api/anchors` (alias `/anchors`) - all on-chain batches, oldest first. `?from=N` to
  skip ahead.
- `GET /api/anchors/:id` (alias `/anchors/:id`) - one batch, 404 if not anchored yet.
- Socket.IO event `"anchored"` - payload is one Batch, pushed in real time (dashboard: no
  polling needed for new anchors).

agent/src/anchorServiceConnector.ts prefers this service when `ANCHOR_SERVICE_URL` is set
(start.sh / start.bat set it to `http://127.0.0.1:4003`), falling back to its own
in-process AnchorClient if the service is unreachable so a demo doesn't stall over one
process being down.

### Adaptive anchoring (agent/src/riskScorer.ts, M1 Phase 4a)
A rule-based `RiskScorer` (no ML, no network call — weighted pattern matches on a 10s
sliding window) replaces AnchorConnector's old fixed `setInterval`. Every entry from
`HashChain.onEntries` also goes to `connector.observeEntries()`; a burst of failed logins,
a new sudo-group member, or odd-hour activity raises `score` (0..1) and shrinks the anchor
interval from `ANCHOR_INTERVAL_MS` (default 5000, the quiet-era ceiling) down to
`ANCHOR_MIN_INTERVAL_MS` (default 1000, the saturated-risk floor) — the score decays back
down on its own once the triggering events age out of the window. Disable with
`ADAPTIVE_ANCHORING=false` to fall back to the old fixed interval.
```ts
RiskState { score: number, anchorIntervalMs: number, reason: string, updatedAt: number }
```
- `GET /api/risk` (agent, port 4001) - current `RiskState`
- Socket.IO event `"risk"` (agent) - a `RiskState`, pushed every time a new entry is
  observed (not just on an anchor tick) and whenever the agent cuts its current wait short
  because risk just rose
- `/api/stats` and `/health` also include the current risk/interval
- Exposure-window + gas-cost comparison (fixed 5s vs adaptive): `cd bench && npm run
  bench:exposure` → `bench/results/exposure-window.md` / `.json`. Runs the real
  `RiskScorer` against a simulated timeline (virtual clock, not live-chain), using the
  Phase 1 measured gas-per-anchor numbers from this file's M1 log.

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
- Socket.IO event `"log"` - payload is one LogEntry, pushed the instant it's written
  (manual write, simulate, or load generator — all go through the same HashChain).
- Socket.IO event `"batch"` - payload is one Batch, pushed the instant it anchors
  (normal batch or heartbeat; mirrors anchor-service's own `"anchored"` event but is
  what the dashboard actually connects to — see Known gap below).

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
- AI incident report wiring (M2 Phase 4b, evidence/src/aiReport.ts): `EvidencePack.aiIncidentReport`
  is always present in the pack — the real `IncidentReport` (see below) if
  `AI_INVESTIGATOR_URL` is set and that service answers `GET {url}/api/incident-report`
  within 2s, otherwise `null` with an honest "not configured / didn't respond" note in the
  generated markdown report. Never a fabricated report. The AI investigator itself
  (the LLM call + citation checker) is M4's build (Phase 4a); this is just the integration
  point so M4 can wire it in without touching exportPack.ts again.
```ts
IncidentClaim { text, citedEntries: number[] }
IncidentReport { claims: IncidentClaim[], blockedClaims: IncidentClaim[], generatedAt }
// Checker rule (M4): every seq in citedEntries must exist, be verified OK, and not belong
// to a tampered batch - otherwise the claim moves to blockedClaims, never shown as fact.
```

## M3 Component Endpoints and CLIs

### Verifier (Port 4004)
Reads the victim's SQLite logs (read-only) + the off-host collector + on-chain batches (via anchor-service/src/anchorClient.ts), and emits a per-entry verdict. Core logic is a pure function (`verifier/src/verifier.ts::verifyLogs`), covered by `verifier/test-verifier.ts` (synthetic scenario for each of the 8 attacks, no live chain needed).
- `GET /health` - status, DB paths in use
- `GET /api/verify` - full verification: `{ entries: EntryVerdict[], batches: BatchVerdict[], silence: SilenceAlert, summary }`
- `GET /api/verify/batch/:id` - just one on-chain batch's entries + its root/lastChainHash check (attack console diff view)
- `GET /api/verify/baseline` - what a plain hash chain (no blockchain, no collector) would conclude: `{ ok, brokenLinks }` — this is the "obvious fix fails" demo
- `GET /api/silence` - silence status alone (cheap)
- `GET /api/attacks` - lists all 8 supported attacks and their specifications
- `POST /api/attacks/run/:id` - execute attack 1-8 against live victim system (or body `{ attackId, ... }`)
- `POST /api/attacks/reset` - restore victim SQLite store from pristine off-host collector copy
- `GET /api/evidence/export` - real CERT-In evidence pack (wraps `evidence/src/exportPack.ts`
  against the live victim + collector DBs and on-chain state): `{ version, entries (with
  Merkle proofs, tampered flags), batches, stats, aiIncidentReport, ... }` — see
  `evidence/src/exportPack.ts` for the full `EvidencePack` shape. Fetches the AI incident
  report (`evidence/src/aiReport.ts`) if `AI_INVESTIGATOR_URL` is set, else embeds `null`.
  Also writes `evidence-pack.json` / `-report.md` to the verifier process's cwd as a side
  effect (same as `npm run export` in `evidence/`).
- Env: `VICTIM_DB_PATH`, `COLLECTOR_DB_PATH`, `ANCHOR_INTERVAL_MS` (default 5000), `BASELINE_MODE=true` to suppress ANCHOR_SILENCE (anchoring intentionally off), `AI_INVESTIGATOR_URL` (optional, for `/api/evidence/export`'s AI report)

Detection model: per on-chain batch, rebuild the Merkle root from the victim's current local entries in that batch's range and compare it to the anchored root (catches attack 6 — chain self-consistent locally, but the root no longer matches). Per entry, cross-check against the off-host collector to name exactly what happened (DELETED / INSERTED / MODIFIED / REORDERED / TRUNCATED). If a batch's root doesn't match but every entry in it already got a specific diagnosis, that diagnosis is trusted — the whole batch is only blanket-flagged when nothing else explains the mismatch, so one tampered line doesn't turn the rest of the batch red too.

**Fixed — verifier JSON shape vs. dashboard's expected shape.** This interface file only ever froze the Verdict *enum*, not the full response envelope, so verifier/ (M3) and dashboard/ (M4) independently invented incompatible field names for the same data (`result.ok` vs `result.summary.ok`, `silent` vs `triggered`, `reason`/`entry`/`offHostEntry` vs `detail`/`local`/`collector`, etc.). Rather than change either side's own shape (and risk the verifier's 9 unit tests or the dashboard's existing components), `dashboard/src/api/normalize.ts` adapts the verifier's real wire shape into `dashboard/src/types.ts`'s shape; `apiClient.getVerification()` / `getBaselineVerification()` call it instead of passing the response straight through. Validated live end-to-end (real agent + collector + verifier + an actual attack 1): `isAnchorSilent`, the attack console's diff view (diagnosis text + both rows), and `summary.ok` all now reflect real data. If verifier/'s shape ever changes, update `normalize.ts`, not every component.

Nothing crashes — the dashboard's `safeFetch` silently falls back to mock data on a thrown error, and these are just-different-shaped objects (not throws), so it renders *something*, just not the real verdict. Whoever picks this up next: it's a one-sided adapter fix in either the verifier's API layer or the dashboard's `api/client.ts`, not a redesign — pick one shape and make the other side conform.

### Attacks (`attacks/`)
`cd attacks && node --experimental-strip-types src/run.ts <1-8> [args]` - runs as root against `agent/victim.db` directly (SQLite), or (attack 7) kills whatever process is listening on the agent's port, or (attack 8) uses the anchorer key against the live contract. Env: `VICTIM_DB_PATH` to target a different DB file.
1 edit-line `[seq]` · 2 delete-line `[seq]` · 3 insert-line `["message"]` · 4 reorder-lines `[seqA] [seqB]` · 5 truncate-tail `[keepCount]` · 6 delete-recompute `[seq]` (the headline attack) · 7 kill-agent `[port]` · 8 steal-key-overwrite `[batchId]`
Mutation logic lives in `attacks/src/mutations.ts`, shared conceptually with `bench/src/attackScenarios.ts` (same semantics, array-based instead of SQLite-based, for fast benchmarking).

### Bench (`bench/`)
`cd bench && npm run bench` - 20 runs per attack (1-6) at random positions on a fresh in-memory scenario, baseline vs SakshiLog, plus 20 clean runs (false-positive check) and a silence-timing sweep. Writes `bench/results/results.json` and `bench/results/results.md` (the attack matrix table with measured numbers, for the slides). Runs entirely against the pure `verifyLogs()`/`verifyBaseline()` functions — no live chain or agent needed, so it's fast and reproducible. Attacks 7 and 8 are operational / contract-level and are validated live instead (attacks/src/07, attacks/src/08, anchor-service's smoke test).

`cd bench && npm run bench:exposure` (M1 Phase 4b) - fixed 5s anchor interval vs adaptive anchoring on the same simulated brute-force-login-then-attack timeline, run against the real `agent/src/riskScorer.ts` (virtual clock, not live-chain). Writes `bench/results/exposure-window.md` / `.json`: lines exposed at the moment of attack under each policy, and the gas cost of the extra anchors adaptive anchoring fires (using the Phase 1 measured gas-per-anchor numbers from this file's M1 log).

### Known caveat when testing by hand
`anchor-service`'s smoke test (`npm run smoke`) anchors synthetic batches straight to whatever contract is currently deployed. If you run it against the *same* deployment you then use for a live agent demo, the verifier will (correctly) flag the smoke test's unrelated batches as not matching the agent's real data. Redeploy fresh (`cd contracts && npm run deploy:local`) before a real demo run if `npm run smoke` has touched that chain.
