/**
 * Attack 4: reorder lines (swap the content of two rows).
 * Usage: node --experimental-strip-types src/04-reorder-lines.ts [seqA] [seqB]
 */
import { openVictimDb, banner, log, defaultVictimDbPath } from "./common.ts";
import { reorderLines } from "./mutations.ts";

const a = process.argv[2] ? Number(process.argv[2]) : undefined;
const b = process.argv[3] ? Number(process.argv[3]) : undefined;

banner("ATTACK 4: Reorder lines (swap two rows' content)");
const db = openVictimDb(defaultVictimDbPath());
try {
  const result = reorderLines(db, a, b);
  log(result.summary);
  log("Expected: plain hash chain CATCHES this (broken links) | SakshiLog verdict: REORDERED");
} finally {
  db.close();
}
