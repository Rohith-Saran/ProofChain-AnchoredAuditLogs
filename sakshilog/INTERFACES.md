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
