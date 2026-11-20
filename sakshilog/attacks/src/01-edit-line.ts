/**
 * Attack 1: edit a line (change the attacker's IP) without recomputing its hash.
 * Usage: node --experimental-strip-types src/01-edit-line.ts [seq] [--db path]
 */
import { openVictimDb, banner, log, defaultVictimDbPath } from "./common.ts";
import { editLine } from "./mutations.ts";

const seqArg = process.argv[2] && !process.argv[2].startsWith("--") ? Number(process.argv[2]) : undefined;
const dbPath = defaultVictimDbPath();

banner("ATTACK 1: Edit a line (naive — hash left stale)");
const db = openVictimDb(dbPath);
try {
  const result = editLine(db, seqArg);
  log(result.summary);
  log("Expected: plain hash chain CATCHES this (stale hash) | SakshiLog verdict: MODIFIED");
} finally {
  db.close();
}
