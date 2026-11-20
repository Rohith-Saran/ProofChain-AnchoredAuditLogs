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

## Ports (fill in)
chain: 8545 | agent: | collector: | anchor-service: | verifier: | dashboard:
