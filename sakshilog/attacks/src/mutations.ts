/**
 * The actual attack logic, factored out so both the CLI scripts (attacks/src/0N-*.ts,
 * run against a live agent's victim.db) and bench/ (which runs the same mutations at
 * scale against disposable seeded databases) share one implementation.
 *
 * Every function takes an open, writable DatabaseSync over the victim's SQLite file and
 * mutates it directly with raw SQL — simulating an attacker who already has root on the
 * victim host and bypasses the agent/hash-chain service entirely.
 */
import type { DatabaseSync } from "node:sqlite";
import { computeEntryHash } from "./hash.ts";
import { getAllRows, getRow, updateRow, deleteRow, deleteRowsFrom, insertRow, randomInt, randomInteriorSeq } from "./common.ts";
import type { Row } from "./common.ts";

export interface AttackResult {
  attack: string;
  summary: string;
  affectedSeqs: number[];
}

/** Attack 1: edit a line (e.g. change the attacker's IP) without recomputing its hash. */
export function editLine(db: DatabaseSync, seq?: number, newMessage?: string): AttackResult {
  const rows = getAllRows(db);
  const targetSeq = seq ?? randomInteriorSeq(rows);
  const row = getRow(db, targetSeq);
  if (!row) throw new Error(`No log entry at seq ${targetSeq}`);

  const message = newMessage ?? row.message.replace(/\d{1,3}(\.\d{1,3}){3}/, "6.6.6.6");
  updateRow(db, targetSeq, { message });

  return {
    attack: "edit-line",
    summary: `seq ${targetSeq}: "${row.message}" -> "${message}" (hash left stale)`,
    affectedSeqs: [targetSeq],
  };
}

/** Attack 2: delete a line (e.g. the sudo entry) outright. */
export function deleteLine(db: DatabaseSync, seq?: number): AttackResult {
  const rows = getAllRows(db);
  const targetSeq = seq ?? (rows.find((r) => r.source === "sudo")?.seq ?? randomInteriorSeq(rows));
  const row = getRow(db, targetSeq);
  if (!row) throw new Error(`No log entry at seq ${targetSeq}`);

  deleteRow(db, targetSeq);

  return {
    attack: "delete-line",
    summary: `seq ${targetSeq} deleted outright: "${row.message}"`,
    affectedSeqs: [targetSeq],
  };
}

/** Attack 3: insert a fake line the real pipeline never produced (collector never saw it). */
export function insertFakeLine(db: DatabaseSync, message?: string): AttackResult {
  const rows = getAllRows(db);
  if (rows.length === 0) throw new Error("No log entries to anchor a fake insert onto.");
  const last = rows[rows.length - 1];
  const fakeSeq = last.seq + 1000; // well outside the real sequence so it never collides
  const ts = Date.now();
  const msg = message ?? "usermod: add 'attacker' to group 'sudo'";
  // Naive insert: the attacker doesn't know the agent's exact running hash, so the fake
  // row's prevHash is plausible-looking but wrong (unlike attack 6's careful re-chaining),
  // and a plain hash chain replay catches the broken link immediately.
  const forgedPrevHash = "f".repeat(64);
  const base = { seq: fakeSeq, ts, host: last.host, source: "usermod", message: msg, prevHash: forgedPrevHash };
  const hash = computeEntryHash(base);

  insertRow(db, { ...base, level: "notice", hash, batchId: null });

  return {
    attack: "insert-fake-line",
    summary: `seq ${fakeSeq} injected: "${msg}"`,
    affectedSeqs: [fakeSeq],
  };
}

/** Attack 4: reorder lines (swap the content of two rows, keeping their seq positions). */
export function reorderLines(db: DatabaseSync, seqA?: number, seqB?: number): AttackResult {
  const rows = getAllRows(db);
  if (rows.length < 4) throw new Error("Need at least 4 log rows to reorder two of them.");

  let a = seqA;
  let b = seqB;
  if (a === undefined || b === undefined) {
    const idxA = randomInt(1, rows.length - 2);
    let idxB = randomInt(1, rows.length - 2);
    while (idxB === idxA) idxB = randomInt(1, rows.length - 2);
    a = rows[idxA].seq;
    b = rows[idxB].seq;
  }

  const rowA = getRow(db, a);
  const rowB = getRow(db, b);
  if (!rowA || !rowB) throw new Error(`Could not find both seq ${a} and seq ${b}`);

  updateRow(db, a, { message: rowB.message, ts: rowB.ts, hash: rowB.hash, prevHash: rowB.prevHash });
  updateRow(db, b, { message: rowA.message, ts: rowA.ts, hash: rowA.hash, prevHash: rowA.prevHash });

  return {
    attack: "reorder-lines",
    summary: `swapped content between seq ${a} and seq ${b}`,
    affectedSeqs: [a, b],
  };
}

/** Attack 5: truncate the tail (delete the most recent N rows and nothing else). */
export function truncateTail(db: DatabaseSync, keepCount?: number): AttackResult {
  const rows = getAllRows(db);
  if (rows.length < 2) throw new Error("Need at least 2 log rows to truncate.");
  const keep = keepCount ?? Math.max(1, Math.floor(rows.length * 0.7));
  const fromSeq = rows[keep]?.seq;
  if (fromSeq === undefined) throw new Error("Nothing to truncate.");

  const deletedCount = deleteRowsFrom(db, fromSeq);

  return {
    attack: "truncate-tail",
    summary: `deleted the last ${deletedCount} rows (seq >= ${fromSeq})`,
    affectedSeqs: rows.filter((r) => r.seq >= fromSeq).map((r) => r.seq),
  };
}

/**
 * Attack 6 (the headline attack): delete a line, then recompute every downstream hash so
 * the local chain is perfectly self-consistent again. A plain hash chain says "all good".
 */
export function deleteAndRecompute(db: DatabaseSync, seq?: number): AttackResult {
  const rows = getAllRows(db);
  const targetSeq = seq ?? randomInteriorSeq(rows);
  const idx = rows.findIndex((r) => r.seq === targetSeq);
  if (idx === -1) throw new Error(`No log entry at seq ${targetSeq}`);
  if (idx === 0) throw new Error("Pick an entry that has a predecessor (not the first row).");

  const deletedRow = rows[idx];
  let prevHash = rows[idx - 1].hash;

  for (let i = idx + 1; i < rows.length; i++) {
    const r = rows[i];
    const hash = computeEntryHash({ seq: r.seq, ts: r.ts, host: r.host, source: r.source, message: r.message, prevHash });
    updateRow(db, r.seq, { prevHash, hash });
    prevHash = hash;
  }

  deleteRow(db, targetSeq);

  return {
    attack: "delete-and-recompute",
    summary: `deleted seq ${targetSeq} ("${deletedRow.message}") and re-chained every entry after it`,
    affectedSeqs: [targetSeq],
  };
}
