/**
 * LogEntry and Batch types matching INTERFACES.md.
 */

export interface LogEntry {
  seq: number;
  ts: number;
  host: string;
  source: string;
  level: string;
  message: string;
  prevHash: string; // 64-char hex
  hash: string;     // sha256(seq | ts | host | source | message | prevHash)
  batchId?: number | null;
}

export interface Batch {
  batchId: number;
  startSeq: number;
  endSeq: number;
  merkleRoot: string;    // 0x-prefixed 32-byte hex
  lastChainHash: string; // 0x-prefixed 32-byte hex
  txHash: string | null;
  blockNumber: number;
  timestamp?: number;
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
