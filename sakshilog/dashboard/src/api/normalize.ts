/**
 * verifier/ (M3) and this dashboard (M4) independently invented different field names
 * for the same verdict/silence/batch data — INTERFACES.md only ever froze the Verdict
 * enum, not the full response shape (see INTERFACES.md "Known gap"). These functions
 * adapt the verifier's actual wire shape into the shape dashboard/src/types.ts expects,
 * so every current and future consumer (isAnchorSilent, DiffView, etc.) gets correct
 * data instead of silently-undefined fields.
 */
import type { Batch, BatchVerdict, BaselineVerificationResult, EntryVerdict, LogEntry, VerificationResult, Verdict } from "../types";

interface RawEntryVerdict {
  seq: number;
  verdict: string;
  batchId: number | null;
  detail: string;
  local: LogEntry | null;
  collector: LogEntry | null;
}

interface RawBatchVerdict {
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

interface RawSilenceAlert {
  triggered: boolean;
  lastBatchId: number | null;
  lastAnchorTs: number | null; // unix seconds
  nowTs: number; // unix seconds
  secondsSinceLastAnchor: number | null;
  thresholdSeconds: number;
}

export interface RawVerificationResult {
  generatedAt: number;
  entries: RawEntryVerdict[];
  batches: RawBatchVerdict[];
  silence: RawSilenceAlert;
  summary: { total: number; byVerdict: Record<string, number>; tamperedCount: number; ok: boolean };
}

export interface RawBaselineResult {
  ok: boolean;
  brokenLinks: { seq: number; reason: string }[];
}

function with0x(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

function normalizeBatchVerdict(b: RawBatchVerdict, onChainBatches: Map<number, Batch>): BatchVerdict {
  const onChain = onChainBatches.get(b.batchId);
  return {
    batchId: b.batchId,
    startSeq: b.startSeq,
    endSeq: b.endSeq,
    merkleRoot: with0x(b.onChainMerkleRoot),
    calculatedRoot: with0x(b.localMerkleRoot),
    rootMatches: b.rootMatches && b.lastChainHashMatches,
    lastChainHash: with0x(b.onChainLastChainHash),
    txHash: onChain?.txHash ?? "",
    blockNumber: onChain?.blockNumber ?? 0,
    isHeartbeat: b.isHeartbeat,
  };
}

/**
 * @param onChainBatches Raw on-chain Batch[] (e.g. from collector's /api/collector/batches),
 *   used only to fill in txHash/blockNumber, which the verifier's own BatchVerdict doesn't carry.
 */
export function normalizeVerification(raw: RawVerificationResult, onChainBatches: Batch[] = []): VerificationResult {
  const batchMap = new Map(onChainBatches.map((b) => [b.batchId, b]));

  return {
    ok: raw.summary.ok,
    entries: raw.entries.map(
      (e): EntryVerdict => ({
        seq: e.seq,
        verdict: e.verdict as Verdict,
        reason: e.detail,
        expectedHash: e.collector?.hash,
        actualHash: e.local?.hash,
        batchId: e.batchId ?? undefined,
        entry: e.local ?? undefined,
        offHostEntry: e.collector ?? undefined,
      })
    ),
    batches: raw.batches.map((b) => normalizeBatchVerdict(b, batchMap)),
    silence: {
      silent: raw.silence.triggered,
      lastAnchorTs: (raw.silence.lastAnchorTs ?? 0) * 1000,
      elapsedMs: (raw.silence.secondsSinceLastAnchor ?? 0) * 1000,
      intervalMs: (raw.silence.thresholdSeconds * 1000) / 2,
      thresholdMs: raw.silence.thresholdSeconds * 1000,
    },
    summary: {
      totalEntries: raw.summary.total,
      tamperedEntries: raw.summary.tamperedCount,
      verdicts: raw.summary.byVerdict as Record<Verdict, number>,
    },
  };
}

export function normalizeBaseline(raw: RawBaselineResult, totalEntries: number): BaselineVerificationResult {
  return {
    ok: raw.ok,
    // The verifier's plain-hash-chain check only reports a human-readable reason today,
    // not the two hex values separately — left blank rather than guessed.
    brokenLinks: raw.brokenLinks.map((b) => ({ seq: b.seq, expectedPrevHash: "", actualPrevHash: "" })),
    totalEntries,
  };
}
