/**
 * In-memory versions of attacks/src/mutations.ts (array-based instead of SQLite-based) so
 * the benchmark can run hundreds of trials fast with no live agent / chain required. Same
 * attack semantics as attacks/, just applied to a cloned LogEntry[] instead of a DB file.
 */
import type { LogEntry, Verdict } from "../../verifier/src/types.ts";
import { computeEntryHash } from "./scenario.ts";

export interface MutationOutcome {
  name: string;
  local: LogEntry[];
  affectedSeqs: number[];
  expectedVerdict: Verdict;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** A random seq that has both a predecessor and a successor in the array. */
function randomInteriorSeq(entries: LogEntry[]): number {
  const idx = randomInt(2, entries.length - 3);
  return entries[idx].seq;
}

export function attackEditLine(clean: LogEntry[]): MutationOutcome {
  const local = clean.map((e) => ({ ...e }));
  const seq = randomInteriorSeq(local);
  const idx = local.findIndex((e) => e.seq === seq);
  local[idx] = { ...local[idx], message: local[idx].message + " [TAMPERED]" }; // hash left stale
  return { name: "edit-line", local, affectedSeqs: [seq], expectedVerdict: "MODIFIED" };
}

export function attackDeleteLine(clean: LogEntry[]): MutationOutcome {
  const seq = randomInteriorSeq(clean);
  const local = clean.filter((e) => e.seq !== seq).map((e) => ({ ...e }));
  return { name: "delete-line", local, affectedSeqs: [seq], expectedVerdict: "DELETED" };
}

export function attackInsertLine(clean: LogEntry[]): MutationOutcome {
  const local = clean.map((e) => ({ ...e }));
  const last = local[local.length - 1];
  const fakeSeq = last.seq + 1000 + randomInt(0, 900);
  // Naive insert: the attacker doesn't know the agent's exact running hash, so the
  // fake row's prevHash is plausible-looking but wrong. A plain hash chain replay
  // catches the broken link immediately (unlike attack 6's careful re-chaining).
  const forgedPrevHash = "f".repeat(64);
  const base = { seq: fakeSeq, ts: last.ts + 500, host: last.host, source: "usermod", message: "add 'attacker' to group 'sudo'", prevHash: forgedPrevHash };
  const hash = computeEntryHash(base);
  local.push({ ...base, level: "notice", hash, batchId: null });
  return { name: "insert-fake-line", local, affectedSeqs: [fakeSeq], expectedVerdict: "INSERTED" };
}

export function attackReorderLines(clean: LogEntry[]): MutationOutcome {
  const local = clean.map((e) => ({ ...e }));
  const idxA = randomInt(2, local.length - 3);
  let idxB = randomInt(2, local.length - 3);
  while (idxB === idxA) idxB = randomInt(2, local.length - 3);

  const a = local[idxA];
  const b = local[idxB];
  local[idxA] = { ...a, message: b.message, ts: b.ts, hash: b.hash, prevHash: b.prevHash };
  local[idxB] = { ...b, message: a.message, ts: a.ts, hash: a.hash, prevHash: a.prevHash };

  return { name: "reorder-lines", local, affectedSeqs: [a.seq, b.seq], expectedVerdict: "REORDERED" };
}

export function attackTruncateTail(clean: LogEntry[]): MutationOutcome {
  const keep = randomInt(Math.floor(clean.length * 0.5), clean.length - 2);
  const fromSeq = clean[keep].seq;
  const local = clean.filter((e) => e.seq < fromSeq).map((e) => ({ ...e }));
  const affected = clean.filter((e) => e.seq >= fromSeq).map((e) => e.seq);
  return { name: "truncate-tail", local, affectedSeqs: affected, expectedVerdict: "TRUNCATED" };
}

export function attackDeleteAndRecompute(clean: LogEntry[]): MutationOutcome {
  const seq = randomInteriorSeq(clean);
  const idx = clean.findIndex((e) => e.seq === seq);
  const rebuilt = clean.filter((_, i) => i !== idx).map((e) => ({ ...e }));

  let prevHash = rebuilt[idx - 1].hash;
  for (let i = idx; i < rebuilt.length; i++) {
    const e = rebuilt[i];
    e.prevHash = prevHash;
    e.hash = computeEntryHash(e);
    prevHash = e.hash;
  }

  return { name: "delete-and-recompute", local: rebuilt, affectedSeqs: [seq], expectedVerdict: "DELETED" };
}

export const ATTACKS: Array<{ id: number; name: string; run: (clean: LogEntry[]) => MutationOutcome }> = [
  { id: 1, name: "edit-line", run: attackEditLine },
  { id: 2, name: "delete-line", run: attackDeleteLine },
  { id: 3, name: "insert-fake-line", run: attackInsertLine },
  { id: 4, name: "reorder-lines", run: attackReorderLines },
  { id: 5, name: "truncate-tail", run: attackTruncateTail },
  { id: 6, name: "delete-and-recompute", run: attackDeleteAndRecompute },
];
