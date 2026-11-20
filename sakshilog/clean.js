/**
 * Clean Install / State Reset Script (Phase 5, M1/M2)
 * Wipes ephemeral state, SQLite databases, and temporary artifacts for a clean reboot.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const rootDir = import.meta.dirname;

const filesToDelete = [
  path.join(rootDir, "agent/victim.db"),
  path.join(rootDir, "agent/victim.db-shm"),
  path.join(rootDir, "agent/victim.db-wal"),
  path.join(rootDir, "collector/collector.db"),
  path.join(rootDir, "collector/collector.db-shm"),
  path.join(rootDir, "collector/collector.db-wal"),
  path.join(rootDir, "contracts/deployments/localhost.json"),
  path.join(rootDir, "evidence/evidence-pack.json"),
  path.join(rootDir, "evidence/evidence-pack-report.md"),
];

console.log("==================================================================");
console.log("            SakshiLog Clean State Reset (Phase 5)                ");
console.log("==================================================================");

let deletedCount = 0;
for (const file of filesToDelete) {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`  ✓ Removed ${path.relative(rootDir, file)}`);
      deletedCount++;
    } catch (err) {
      console.warn(`  ! Could not delete ${file}: ${err.message}`);
    }
  }
}

// Clean any tmp*.db in root
for (const f of fs.readdirSync(rootDir)) {
  if (f.startsWith("tmp") && (f.endsWith(".db") || f.endsWith(".db-shm") || f.endsWith(".db-wal"))) {
    try {
      fs.unlinkSync(path.join(rootDir, f));
      console.log(`  ✓ Removed ${f}`);
      deletedCount++;
    } catch {}
  }
}

console.log(`\nClean reset complete (${deletedCount} ephemeral files removed).`);
console.log("Ready for clean launch via start-all.bat / start-all.sh or docker compose.");
console.log("==================================================================\n");
