/**
 * Attack 3: insert a fake line that the off-host collector never received.
 * Usage: node --experimental-strip-types src/03-insert-line.ts ["fake message"]
 */
import { openVictimDb, banner, log, defaultVictimDbPath } from "./common.ts";
import { insertFakeLine } from "./mutations.ts";

const message = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;

banner("ATTACK 3: Insert a fake line");
const db = openVictimDb(defaultVictimDbPath());
try {
  const result = insertFakeLine(db, message);
  log(result.summary);
  log("Expected: plain hash chain CATCHES this (broken link) | SakshiLog verdict: INSERTED");
} finally {
  db.close();
}
