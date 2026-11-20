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

## Verdicts
OK, MODIFIED, DELETED, INSERTED, REORDERED, TRUNCATED, UNANCHORED_WINDOW, ANCHOR_SILENCE

## Ports (fill in)
chain: 8545 | agent: | collector: | anchor-service: | verifier: | dashboard:
