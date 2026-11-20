/**
 * Shared helpers for the attack simulator. Every attack is run "as root": it opens the
 * victim's SQLite file directly (no HTTP, no agent API) and mutates rows with raw SQL,
 * exactly the way a real attacker with root on the victim host would.
 */
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

export interface Row {
  seq: number;
  ts: number;
  host: string;
  source: string;
  level: string;
  message: string;
  prevHash: string;
  hash: string;
  batchId: number | null;
}

export function defaultVictimDbPath(): string {
  return process.env.VICTIM_DB_PATH || path.resolve(import.meta.dirname, "../../agent/victim.db");
}

export function openVictimDb(dbPath = defaultVictimDbPath()): DatabaseSync {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Victim DB not found at ${dbPath}. Start the agent first (cd agent && npm start) and write some logs.`
    );
  }
  return new DatabaseSync(dbPath);
}

export function getAllRows(db: DatabaseSync): Row[] {
  return db
    .prepare("SELECT seq, ts, host, source, level, message, prevHash, hash, batchId FROM logs ORDER BY seq ASC")
    .all() as unknown as Row[];
}

export function getRow(db: DatabaseSync, seq: number): Row | null {
  const row = db
    .prepare("SELECT seq, ts, host, source, level, message, prevHash, hash, batchId FROM logs WHERE seq = ?")
    .get(seq) as unknown as Row | undefined;
  return row ?? null;
}

export function updateRow(db: DatabaseSync, seq: number, fields: Partial<Omit<Row, "seq">>): void {
  const keys = Object.keys(fields) as Array<keyof typeof fields>;
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${String(k)} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  db.prepare(`UPDATE logs SET ${setClause} WHERE seq = ?`).run(...values, seq);
}

export function deleteRow(db: DatabaseSync, seq: number): void {
  db.prepare("DELETE FROM logs WHERE seq = ?").run(seq);
}

export function deleteRowsFrom(db: DatabaseSync, fromSeqInclusive: number): number {
  const rows = db.prepare("SELECT COUNT(*) as c FROM logs WHERE seq >= ?").get(fromSeqInclusive) as { c: number };
  db.prepare("DELETE FROM logs WHERE seq >= ?").run(fromSeqInclusive);
  return Number(rows.c);
}

export function insertRow(db: DatabaseSync, row: Row): void {
  db.prepare(
    `INSERT INTO logs (seq, ts, host, source, level, message, prevHash, hash, batchId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(row.seq, row.ts, row.host, row.source, row.level, row.message, row.prevHash, row.hash, row.batchId);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random seq that isn't the very first or very last row (so neighbours exist). */
export function randomInteriorSeq(rows: Row[]): number {
  if (rows.length < 3) throw new Error("Need at least 3 log rows to pick an interior seq. Generate more logs first.");
  const idx = randomInt(1, rows.length - 2);
  return rows[idx].seq;
}

export function banner(title: string): void {
  console.log("==================================================================");
  console.log(`  ${title}`);
  console.log("==================================================================");
}

export function log(line: string): void {
  console.log(`  ${line}`);
}
