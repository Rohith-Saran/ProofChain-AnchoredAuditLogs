/**
 * Core verification engine. Pure functions only (no file / network I/O) so they can be
 * unit tested and reused, unmodified, by the live server (src/loaders.ts feeds it real
 * SQLite + on-chain data) and by bench/ (which fabricates the same shapes in memory to
 * run hundreds of attack trials fast, with no live chain required).
 *
 * Algorithm (see INTERFACES.md for the frozen Verdict list):
 *  1. Batch level: for every on-chain batch, rebuild the Merkle root from the local
 *     entries in [startSeq..endSeq] and compare it to the anchored root. This is what
 *     catches attack 6 (delete + recompute every downstream hash): the local hash chain
 *     is self-consistent, but it no longer produces the root that was anchored.
 *  2. Entry level: cross-check every seq against the off-host collector copy to name
 *     exactly what happened (MODIFIED / DELETED / INSERTED / REORDERED / TRUNCATED).
 *  3. Silence: if no batch (including heartbeats) has landed within 2x the anchor
 *     interval, raise ANCHOR_SILENCE.
 */
import { MerkleTree } from "./merkle.ts";
import { computeEntryHash, hexEquals, normalizeHex } from "./hash.ts";
import type {
  BaselineResult,
  Batch,
  BatchVerdict,
  EntryVerdict,
  LogEntry,
  SilenceAlert,
  Verdict,
  VerificationResult,
} from "./types.ts";
import { GENESIS_PREV_HASH, ZERO_HASH_64 } from "./types.ts";

export interface VerifyInput {
  /** Entries as they currently stand on the (possibly tampered) victim host, seq ascending. */
  localEntries: LogEntry[];
  /** Entries as received, in real time, by the off-host collector, seq ascending. */
  collectorEntries: LogEntry[];
  /** On-chain batches (AnchorClient.getAllBatches()), batchId ascending. */
  batches: Batch[];
  /** Agent's anchor interval; used for silence detection. Default 5000 ms. */
  anchorIntervalMs?: number;
  /** Override "now" for deterministic tests / benchmarks. Default Date.now(). */
  nowMs?: number;
  /** Anchoring intentionally suspended: don't raise ANCHOR_SILENCE. */
  baselineMode?: boolean;
}

function isHeartbeatBatch(b: Batch): boolean {
  return b.startSeq === b.endSeq + 1 && normalizeHex(b.merkleRoot) === ZERO_HASH_64;
}

function byMap(entries: LogEntry[]): Map<number, LogEntry> {
  const m = new Map<number, LogEntry>();
  for (const e of entries) m.set(e.seq, e);
  return m;
}

export function verifyLogs(input: VerifyInput): VerificationResult {
  const localEntries = [...input.localEntries].sort((a, b) => a.seq - b.seq);
  const collectorEntries = [...input.collectorEntries].sort((a, b) => a.seq - b.seq);
  const batches = [...input.batches].sort((a, b) => a.batchId - b.batchId);
  const anchorIntervalMs = input.anchorIntervalMs ?? 5000;
  const nowMs = input.nowMs ?? Date.now();

  const localMap = byMap(localEntries);
  const collectorMap = byMap(collectorEntries);
  const localMaxSeq = localEntries.length ? localEntries[localEntries.length - 1].seq : 0;
  const collectorMaxSeq = collectorEntries.length ? collectorEntries[collectorEntries.length - 1].seq : 0;
  const knownMaxSeq = Math.max(localMaxSeq, collectorMaxSeq);

  // ---------------------------------------------------------------- 1. batch level
  const batchVerdicts: BatchVerdict[] = [];
  const batchForSeq = new Map<number, number>();
  let runningLastChainHash = GENESIS_PREV_HASH;
  let coveredThroughSeq = 0;
  const rootMismatchedRanges: Array<{ startSeq: number; endSeq: number }> = [];

  for (const batch of batches) {
    const heartbeat = isHeartbeatBatch(batch);

    if (!heartbeat) {
      for (let s = batch.startSeq; s <= batch.endSeq; s++) batchForSeq.set(s, batch.batchId);
      coveredThroughSeq = Math.max(coveredThroughSeq, batch.endSeq);
    }

    const rangeLocal: LogEntry[] = [];
    if (!heartbeat) {
      for (let s = batch.startSeq; s <= batch.endSeq; s++) {
        const e = localMap.get(s);
        if (e) rangeLocal.push(e);
      }
    }

    const localTree = new MerkleTree(rangeLocal.map((e) => e.hash));
    const localRoot = localTree.root;
    const onChainRoot = normalizeHex(batch.merkleRoot);
    const rootMatches = heartbeat ? true : localRoot === onChainRoot;

    const localLastChainHash = heartbeat
      ? runningLastChainHash
      : rangeLocal.length > 0
        ? normalizeHex(rangeLocal[rangeLocal.length - 1].hash)
        : runningLastChainHash;
    const lastChainHashMatches = hexEquals(localLastChainHash, batch.lastChainHash);

    batchVerdicts.push({
      batchId: batch.batchId,
      startSeq: batch.startSeq,
      endSeq: batch.endSeq,
      isHeartbeat: heartbeat,
      rootMatches,
      lastChainHashMatches,
      localMerkleRoot: localRoot,
      onChainMerkleRoot: onChainRoot,
      localLastChainHash,
      onChainLastChainHash: normalizeHex(batch.lastChainHash),
      expectedCount: heartbeat ? 0 : batch.endSeq - batch.startSeq + 1,
      localCount: rangeLocal.length,
    });

    if (!heartbeat && (!rootMatches || !lastChainHashMatches)) {
      rootMismatchedRanges.push({ startSeq: batch.startSeq, endSeq: batch.endSeq });
    }

    // Carry the *on-chain* value forward: it is what the next batch (or heartbeat) is
    // expected to repeat / build on, independent of whether this batch's root matched.
    runningLastChainHash = normalizeHex(batch.lastChainHash);
  }

  const unanchoredStart = coveredThroughSeq + 1;

  // ---------------------------------------------------------------- 2. entry level
  const entries: EntryVerdict[] = [];
  const collectorHashToSeq = new Map<string, number>();
  for (const e of collectorEntries) collectorHashToSeq.set(normalizeHex(e.hash), e.seq);

  for (let seq = 1; seq <= knownMaxSeq; seq++) {
    const local = localMap.get(seq) ?? null;
    const collector = collectorMap.get(seq) ?? null;
    const batchId = batchForSeq.get(seq) ?? null;
    const unanchored = seq >= unanchoredStart;

    let verdict: Verdict;
    let detail: string;

    if (!local && !collector) {
      // Neither source ever had this seq (shouldn't happen given knownMaxSeq derivation).
      continue;
    } else if (!local && collector) {
      const isTrailing = localMaxSeq < seq;
      verdict = isTrailing ? "TRUNCATED" : "DELETED";
      detail = isTrailing
        ? `Entry seq ${seq} is missing locally and the local log never continues past seq ${localMaxSeq} (tail truncated)`
        : `Entry seq ${seq} is missing locally but present in the off-host collector copy (message: "${collector.message.slice(0, 80)}")`;
    } else if (local && !collector) {
      verdict = "INSERTED";
      detail = `Entry seq ${seq} exists locally but the off-host collector never received it (message: "${local.message.slice(0, 80)}")`;
    } else {
      // both present
      const l = local as LogEntry;
      const c = collector as LogEntry;
      const contentMatches =
        hexEquals(l.hash, c.hash) &&
        l.message === c.message &&
        l.ts === c.ts &&
        l.host === c.host &&
        l.source === c.source &&
        hexEquals(l.prevHash, c.prevHash);

      if (!contentMatches) {
        const movedFromSeq = collectorHashToSeq.get(normalizeHex(l.hash));
        if (movedFromSeq !== undefined && movedFromSeq !== seq) {
          verdict = "REORDERED";
          detail = `Entry at seq ${seq} carries content that the collector recorded for seq ${movedFromSeq} (rows swapped)`;
        } else {
          verdict = "MODIFIED";
          detail = `Entry seq ${seq} content differs from the off-host collector copy (message or hash changed)`;
        }
      } else {
        const recomputed = computeEntryHash(l);
        if (!hexEquals(recomputed, l.hash)) {
          verdict = "MODIFIED";
          detail = `Entry seq ${seq} stored hash does not match sha256 of its own content`;
        } else {
          const prevLocal = localMap.get(seq - 1);
          if (prevLocal && !hexEquals(l.prevHash, prevLocal.hash)) {
            verdict = "MODIFIED";
            detail = `Entry seq ${seq} prevHash does not match seq ${seq - 1}'s hash (broken chain link)`;
          } else {
            verdict = unanchored ? "UNANCHORED_WINDOW" : "OK";
            detail = unanchored ? `Not yet anchored (beyond seq ${coveredThroughSeq})` : `Matches batch ${batchId}`;
          }
        }
      }
    }

    entries.push({ seq, verdict, batchId, detail, local, collector });
  }

  // Safety net for attack 6 specifically: the attacker deleted a line and recomputed
  // every downstream hash, so the local chain is perfectly self-consistent and the
  // per-entry pass above may find nothing to point at *inside this batch* beyond the
  // deletion itself. The root is the final word in that case: escalate the batch's
  // still-OK entries to MODIFIED. But if the per-entry pass already explained the
  // mismatch (edits, reorders, etc. it could trace via the collector), trust that
  // specific diagnosis instead of blanket-flagging the whole batch — one tampered
  // line must not turn every untouched line in the batch red too.
  for (const range of rootMismatchedRanges) {
    const alreadyExplained = entries.some(
      (ev) => ev.seq >= range.startSeq && ev.seq <= range.endSeq && ev.verdict !== "OK" && ev.verdict !== "UNANCHORED_WINDOW"
    );
    if (alreadyExplained) continue;
    for (const ev of entries) {
      if (ev.seq >= range.startSeq && ev.seq <= range.endSeq && ev.verdict === "OK") {
        ev.verdict = "MODIFIED";
        ev.detail = `Batch covering seq ${range.startSeq}..${range.endSeq} does not match its on-chain Merkle root / lastChainHash`;
      }
    }
  }

  // ---------------------------------------------------------------- 3. silence
  const sortedBatches = batches; // already sorted by batchId above
  const lastBatch = sortedBatches.length > 0 ? sortedBatches[sortedBatches.length - 1] : null;
  const thresholdSeconds = Math.ceil((2 * anchorIntervalMs) / 1000);
  const nowTs = Math.floor(nowMs / 1000);

  let silence: SilenceAlert;
  if (input.baselineMode) {
    silence = {
      triggered: false,
      lastBatchId: lastBatch?.batchId ?? null,
      lastAnchorTs: lastBatch?.timestamp ?? null,
      nowTs,
      secondsSinceLastAnchor: null,
      thresholdSeconds,
    };
  } else if (lastBatch && lastBatch.timestamp !== undefined) {
    const secondsSince = nowTs - lastBatch.timestamp;
    silence = {
      triggered: secondsSince > thresholdSeconds,
      lastBatchId: lastBatch.batchId,
      lastAnchorTs: lastBatch.timestamp,
      nowTs,
      secondsSinceLastAnchor: secondsSince,
      thresholdSeconds,
    };
  } else {
    // No batch has ever landed. Only alarm once there is actually something to anchor
    // and it has sat around for longer than the threshold.
    const earliestLocalTs = localEntries.length > 0 ? Math.floor(localEntries[0].ts / 1000) : null;
    const secondsSince = earliestLocalTs !== null ? nowTs - earliestLocalTs : null;
    silence = {
      triggered: secondsSince !== null && secondsSince > thresholdSeconds,
      lastBatchId: null,
      lastAnchorTs: null,
      nowTs,
      secondsSinceLastAnchor: secondsSince,
      thresholdSeconds,
    };
  }

  // ---------------------------------------------------------------- summary
  const byVerdict: Record<Verdict, number> = {
    OK: 0,
    MODIFIED: 0,
    DELETED: 0,
    INSERTED: 0,
    REORDERED: 0,
    TRUNCATED: 0,
    UNANCHORED_WINDOW: 0,
    ANCHOR_SILENCE: 0,
  };
  for (const e of entries) byVerdict[e.verdict]++;
  const tamperedCount = entries.length - byVerdict.OK - byVerdict.UNANCHORED_WINDOW;

  return {
    generatedAt: nowMs,
    entries,
    batches: batchVerdicts,
    silence,
    summary: {
      total: entries.length,
      byVerdict,
      tamperedCount,
      ok: tamperedCount === 0 && !silence.triggered,
    },
  };
}

/**
 * What a plain hash chain (no blockchain, no off-host collector) would report: just
 * replay the log top to bottom and check each entry's own hash and its link to the
 * entry physically before it. Used by bench/ to produce the "baseline" column of the
 * attack matrix, and to demonstrate live why the obvious fix fails.
 */
export function verifyBaseline(localEntries: LogEntry[]): BaselineResult {
  const sorted = [...localEntries].sort((a, b) => a.seq - b.seq);
  const brokenLinks: Array<{ seq: number; reason: string }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const recomputed = computeEntryHash(e);
    if (!hexEquals(recomputed, e.hash)) {
      brokenLinks.push({ seq: e.seq, reason: "stored hash does not match sha256 of content" });
      continue;
    }
    if (i === 0) {
      if (!hexEquals(e.prevHash, GENESIS_PREV_HASH) && e.seq === 1) {
        brokenLinks.push({ seq: e.seq, reason: "genesis entry prevHash is not all zeros" });
      }
      continue;
    }
    const prev = sorted[i - 1];
    if (!hexEquals(e.prevHash, prev.hash)) {
      brokenLinks.push({ seq: e.seq, reason: `prevHash does not match the previous line's hash (seq ${prev.seq})` });
    }
  }

  return { ok: brokenLinks.length === 0, brokenLinks };
}
