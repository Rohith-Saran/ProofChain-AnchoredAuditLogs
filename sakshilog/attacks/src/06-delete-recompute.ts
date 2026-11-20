/**
 * Attack 6 (the headline attack): delete a line and recompute every hash after it, so a
 * plain hash chain reads as perfectly intact.
 * Usage: node --experimental-strip-types src/06-delete-recompute.ts [seq]
 */
import { openVictimDb, banner, log, defaultVictimDbPath } from "./common.ts";
import { deleteAndRecompute } from "./mutations.ts";

const seqArg = process.argv[2] ? Number(process.argv[2]) : undefined;

banner("ATTACK 6: Delete a line and recompute every hash after it");
const db = openVictimDb(defaultVictimDbPath());
try {
  const result = deleteAndRecompute(db, seqArg);
  log(result.summary);
  log("Expected: plain hash chain MISSES this (looks self-consistent) | SakshiLog verdict: Caught via on-chain Merkle root mismatch");
} finally {
  db.close();
}
