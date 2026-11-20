/**
 * CLI dispatcher for the attack simulator.
 * Usage: node --experimental-strip-types src/run.ts <1-8> [args...]
 */
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPTS: Record<string, string> = {
  "1": "01-edit-line.ts",
  "2": "02-delete-line.ts",
  "3": "03-insert-line.ts",
  "4": "04-reorder-lines.ts",
  "5": "05-truncate-tail.ts",
  "6": "06-delete-recompute.ts",
  "7": "07-kill-agent.ts",
  "8": "08-steal-key-overwrite.ts",
};

const [, , n, ...rest] = process.argv;
const script = n ? SCRIPTS[n] : undefined;

if (!script) {
  console.log("Usage: node --experimental-strip-types src/run.ts <1-8> [args...]");
  console.log("  1  edit a line           2  delete a line        3  insert a fake line  4  reorder lines");
  console.log("  5  truncate the tail     6  delete + recompute   7  kill the agent      8  steal key, overwrite a batch");
  process.exit(1);
}

process.argv = [process.argv[0], path.resolve(import.meta.dirname, script), ...rest];
await import(pathToFileURL(path.resolve(import.meta.dirname, script)).href);
