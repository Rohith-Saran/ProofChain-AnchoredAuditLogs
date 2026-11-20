/**
 * LogEntry, Batch and Verdict types matching INTERFACES.md.
 */

export interface LogEntry {
  seq: number;
  ts: number;
  host: string;
  source: string;
  level: string;
  message: string;
  prevHash: string; // 64-char hex
  hash: string; // sha256(seq | ts | host | source | message | prevHash)
  batchId?: number | null;
}

export interface Batch {
  batchId: number;
  startSeq: number;
  endSeq: number;
  merkleRoot: string; // 0x-prefixed 32-byte hex (ZeroHash for a heartbeat)
  lastChainHash: string; // 0x-prefixed 32-byte hex
  txHash: string | null;
  blockNumber: number;
  timestamp?: number; // unix seconds
}

export type Verdict =
  | "OK"
  | "MODIFIED"
  | "DELETED"
  | "INSERTED"
  | "REORDERED"
  | "TRUNCATED"
  | "UNANCHORED_WINDOW"
  | "ANCHOR_SILENCE";

export const GENESIS_PREV_HASH = "0".repeat(64);
export const ZERO_HASH_64 = "0".repeat(64);

export interface EntryVerdict {
  seq: number;
  verdict: Verdict;
  batchId: number | null;
  detail: string;
  local: LogEntry | null;
  collector: LogEntry | null;
}

export interface BatchVerdict {
  batchId: number;
  startSeq: number;
  endSeq: number;
  isHeartbeat: boolean;
  rootMatches: boolean;
  lastChainHashMatches: boolean;
  localMerkleRoot: string;
  onChainMerkleRoot: string;
  localLastChainHash: string;
  onChainLastChainHash: string;
  expectedCount: number;
  localCount: number;
}

export interface SilenceAlert {
  triggered: boolean;
  lastBatchId: number | null;
  lastAnchorTs: number | null;
  nowTs: number;
  secondsSinceLastAnchor: number | null;
  thresholdSeconds: number;
}

export interface VerificationResult {
  generatedAt: number;
  entries: EntryVerdict[];
  batches: BatchVerdict[];
  silence: SilenceAlert;
  summary: {
    total: number;
    byVerdict: Record<Verdict, number>;
    tamperedCount: number;
    ok: boolean; // true iff no tampering and no silence alert
  };
}

/** Plain hash-chain-only check result: what a system *without* a blockchain anchor would see. */
export interface BaselineResult {
  ok: boolean;
  brokenLinks: Array<{ seq: number; reason: string }>;
}
