/**
 * Real I/O for the verifier: read-only SQLite access to the victim and collector
 * databases, plus the on-chain AnchorRegistry via anchor-service/src/anchorClient.ts.
 * Kept separate from verifier.ts so that module stays a pure, fast-to-test function.
 */
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { Batch, LogEntry } from "./types.ts";

export function readEntries(dbPath: string, table: string): LogEntry[] {
  if (!fs.existsSync(dbPath)) return [];
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT seq, ts, host, source, level, message, prevHash, hash, batchId FROM ${table} ORDER BY seq ASC`
      )
      .all() as unknown as LogEntry[];
    return rows;
  } finally {
    db.close();
  }
}

export function readLocalEntries(victimDbPath: string): LogEntry[] {
  return readEntries(victimDbPath, "logs");
}

export function readCollectorEntries(collectorDbPath: string): LogEntry[] {
  return readEntries(collectorDbPath, "collector_logs");
}

// Loaded dynamically (not a static import) so tsc's per-package rootDir doesn't need to
// span anchor-service/, matching the pattern used by agent/src/anchorServiceConnector.ts.
let anchorClientModulePromise: Promise<any> | null = null;

async function loadAnchorClientModule(): Promise<any> {
  if (!anchorClientModulePromise) {
    const p = path.resolve(import.meta.dirname, "../../anchor-service/src/anchorClient.ts");
    // pathToFileURL: a bare Windows absolute path ("C:\...") isn't a valid specifier for
    // the ESM loader, which requires a file:// URL for absolute paths on that platform.
    anchorClientModulePromise = import(pathToFileURL(p).href);
  }
  return anchorClientModulePromise;
}

/** Read-only view of all on-chain batches, oldest first. Returns [] if the chain isn't up / deployed yet. */
export async function readOnChainBatches(): Promise<Batch[]> {
  try {
    const mod = await loadAnchorClientModule();
    const client = mod.AnchorClient.fromEnv({ readOnly: true });
    const batches = await client.getAllBatches();
    await client.close();
    return batches as unknown as Batch[];
  } catch (err) {
    console.warn("[verifier] Could not read on-chain batches:", (err as Error).message);
    return [];
  }
}

export interface VerifierPaths {
  victimDbPath: string;
  collectorDbPath: string;
}

export function defaultPaths(): VerifierPaths {
  const relVictim = path.resolve(import.meta.dirname, "../../agent/victim.db");
  const relCollector = path.resolve(import.meta.dirname, "../../collector/collector.db");
  return {
    victimDbPath: process.env.VICTIM_DB_PATH || (fs.existsSync(relVictim) ? relVictim : path.resolve(process.cwd(), "../agent/victim.db")),
    collectorDbPath: process.env.COLLECTOR_DB_PATH || (fs.existsSync(relCollector) ? relCollector : path.resolve(process.cwd(), "../collector/collector.db")),
  };
}
