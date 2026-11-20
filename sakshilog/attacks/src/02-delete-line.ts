/**
 * Attack 2: delete a line (the sudo entry) outright.
 * Usage: node --experimental-strip-types src/02-delete-line.ts [seq]
 */
import { openVictimDb, banner, log, defaultVictimDbPath } from "./common.ts";
import { deleteLine } from "./mutations.ts";

const seqArg = process.argv[2] && !process.argv[2].startsWith("--") ? Number(process.argv[2]) : undefined;

banner("ATTACK 2: Delete a line (the sudo entry)");
const db = openVictimDb(defaultVictimDbPath());
try {
  const result = deleteLine(db, seqArg);
  log(result.summary);
  log("Expected: plain hash chain CATCHES this (broken link) | SakshiLog verdict: DELETED");
} finally {
  db.close();
}
