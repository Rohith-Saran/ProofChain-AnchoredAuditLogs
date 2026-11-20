/**
 * Attack 5: truncate the tail (delete the most recent rows, nothing else).
 * Usage: node --experimental-strip-types src/05-truncate-tail.ts [keepCount]
 */
import { openVictimDb, banner, log, defaultVictimDbPath } from "./common.ts";
import { truncateTail } from "./mutations.ts";

const keepCount = process.argv[2] ? Number(process.argv[2]) : undefined;

banner("ATTACK 5: Truncate the tail");
const db = openVictimDb(defaultVictimDbPath());
try {
  const result = truncateTail(db, keepCount);
  log(result.summary);
  log("Expected: plain hash chain MISSES this (nothing left to contradict) | SakshiLog verdict: TRUNCATED");
} finally {
  db.close();
}
