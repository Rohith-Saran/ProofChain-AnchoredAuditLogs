// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AnchorRegistry
/// @notice Append-only registry of SakshiLog batch anchors. Each batch commits to
///         the Merkle root of a contiguous range of log entries plus the hash-chain
///         head at the end of that range.
/// @dev Security property: batch N can be written exactly once, and only after
///      batch N-1. Someone who steals the anchorer key can append new batches.
///      They cannot overwrite or backfill old ones, so the history stays fixed.
contract AnchorRegistry {
    struct Batch {
        uint256 batchId;
        bytes32 merkleRoot;
        bytes32 lastChainHash;
        uint64 startSeq;
        uint64 endSeq;
        uint64 timestamp; // block.timestamp when anchored
        uint64 blockNumber; // block.number when anchored
    }

    address public owner;
    mapping(address => bool) public isAnchorer;

    /// @notice The only batchId that anchor() will accept next.
    uint256 public nextBatchId;

    /// @dev Storage layout without batchId (it is the mapping key): 3 slots, where
    ///      the four uint64 fields share one slot. getBatch() adds the id back.
    struct StoredBatch {
        bytes32 merkleRoot;
        bytes32 lastChainHash;
        uint64 startSeq;
        uint64 endSeq;
        uint64 timestamp;
        uint64 blockNumber;
    }

    mapping(uint256 => StoredBatch) private _batches;

    event Anchored(
        uint256 indexed batchId,
        bytes32 merkleRoot,
        bytes32 lastChainHash,
        uint64 startSeq,
        uint64 endSeq,
        uint256 timestamp
    );
    event AnchorerSet(address indexed account, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner(address caller);
    error NotAnchorer(address caller);
    error BadBatchId(uint256 expected, uint256 got);
    error InvalidRange(uint64 startSeq, uint64 endSeq);
    error BatchNotFound(uint256 batchId);
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    modifier onlyAnchorer() {
        if (!isAnchorer[msg.sender]) revert NotAnchorer(msg.sender);
        _;
    }

    constructor(address initialAnchorer) {
        if (initialAnchorer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        isAnchorer[initialAnchorer] = true;
        emit AnchorerSet(initialAnchorer, true);
    }

    /// @notice Anchor one batch. batchId must equal nextBatchId: no gaps, no overwrites.
    /// @dev A heartbeat batch (no new logs in the interval) uses the empty range
    ///      startSeq == endSeq + 1 and repeats the previous lastChainHash.
    function anchor(
        uint256 batchId,
        bytes32 merkleRoot,
        bytes32 lastChainHash,
        uint64 startSeq,
        uint64 endSeq
    ) external onlyAnchorer {
        if (batchId != nextBatchId) revert BadBatchId(nextBatchId, batchId);
        // A normal range has startSeq <= endSeq. The only empty range allowed is
        // the heartbeat one, startSeq == endSeq + 1.
        if (uint256(startSeq) > uint256(endSeq) + 1) revert InvalidRange(startSeq, endSeq);

        _batches[batchId] = StoredBatch({
            merkleRoot: merkleRoot,
            lastChainHash: lastChainHash,
            startSeq: startSeq,
            endSeq: endSeq,
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number)
        });
        unchecked {
            nextBatchId = batchId + 1;
        }

        emit Anchored(batchId, merkleRoot, lastChainHash, startSeq, endSeq, block.timestamp);
    }

    /// @notice Read an anchored batch. Reverts if it has not been anchored yet.
    function getBatch(uint256 id) external view returns (Batch memory) {
        if (id >= nextBatchId) revert BatchNotFound(id);
        StoredBatch storage s = _batches[id];
        return Batch({
            batchId: id,
            merkleRoot: s.merkleRoot,
            lastChainHash: s.lastChainHash,
            startSeq: s.startSeq,
            endSeq: s.endSeq,
            timestamp: s.timestamp,
            blockNumber: s.blockNumber
        });
    }

    /// @notice Number of batches anchored so far (same as nextBatchId).
    function batchCount() external view returns (uint256) {
        return nextBatchId;
    }

    function setAnchorer(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isAnchorer[account] = allowed;
        emit AnchorerSet(account, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
