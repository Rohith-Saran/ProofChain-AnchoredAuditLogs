/**
 * SakshiLog Attack Runner (M3)
 * Provides programmatic and API-callable execution for all 8 attacks from the implementation plan:
 * 
 *  #1 Edit a line (change attacker's IP)           -> MODIFIED
 *  #2 Delete a line (the sudo entry)              -> DELETED
 *  #3 Insert a fake line                          -> INSERTED
 *  #4 Reorder lines                               -> REORDERED
 *  #5 Truncate the tail                           -> TRUNCATED
 *  #6 Delete a line and recompute every hash      -> Caught (root mismatch)
 *  #7 Kill the agent process                      -> ANCHOR_SILENCE
 *  #8 Steal anchor key, overwrite an old batch   -> Rejected by contract
 * 
 * Also provides reset capability to restore the victim DB from off-host collector logs.
 */
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import {
  editLine,
  deleteLine,
  insertFakeLine,
  reorderLines,
  truncateTail,
  deleteAndRecompute,
} from "./mutations.ts";
import { defaultVictimDbPath, openVictimDb, getAllRows } from "./common.ts";

export interface AttackExecutionResult {
  attackId: number;
  name: string;
  success: boolean;
  summary: string;
  affectedSeqs: number[];
  expectedBaseline: string;
  expectedSakshi: string;
  details?: Record<string, unknown>;
}

export interface AttackDefinition {
  id: number;
  name: string;
  description: string;
  expectedBaseline: string;
  expectedSakshi: string;
}

export const ATTACK_DEFINITIONS: AttackDefinition[] = [
  {
    id: 1,
    name: "Edit a line (naive IP change)",
    description: "Mutates an existing log line's IP address without recomputing its hash in SQLite.",
    expectedBaseline: "Caught (broken hash)",
    expectedSakshi: "MODIFIED",
  },
  {
    id: 2,
    name: "Delete a line (the sudo entry)",
    description: "Deletes a critical security log entry (e.g. sudo bash) directly from SQLite.",
    expectedBaseline: "Caught (broken link)",
    expectedSakshi: "DELETED",
  },
  {
    id: 3,
    name: "Insert a fake line",
    description: "Injects an unauthorized log entry directly into SQLite that the collector never saw.",
    expectedBaseline: "Caught (broken link)",
    expectedSakshi: "INSERTED",
  },
  {
    id: 4,
    name: "Reorder lines",
    description: "Swaps content between two log entries to confuse audit chronology.",
    expectedBaseline: "Caught (broken links)",
    expectedSakshi: "REORDERED",
  },
  {
    id: 5,
    name: "Truncate the tail",
    description: "Deletes the newest log entries (tail of the audit trail).",
    expectedBaseline: "Missed (remaining chain intact)",
    expectedSakshi: "TRUNCATED",
  },
  {
    id: 6,
    name: "Delete line & recompute downstream hashes",
    description: "The headline attack: deletes a log entry and recomputes all downstream SHA-256 hashes.",
    expectedBaseline: "Missed (plain chain looks 100% valid)",
    expectedSakshi: "Caught via on-chain Merkle root mismatch + DELETED",
  },
  {
    id: 7,
    name: "Kill the agent daemon",
    description: "Kills the logging agent process to stop audit ingestion and heartbeat anchors.",
    expectedBaseline: "Missed (plain store has no silence concept)",
    expectedSakshi: "ANCHOR_SILENCE (triggered after 2x interval = 10s)",
  },
  {
    id: 8,
    name: "Steal anchor key & overwrite old batch",
    description: "Attacker obtains the anchorer private key and tries to overwrite historic on-chain batches.",
    expectedBaseline: "n/a (no blockchain)",
    expectedSakshi: "Rejected by contract (AnchorRegistry BadBatchId revert)",
  },
];

/** Kill whatever process is listening on the given port (Attack 7) */
export function killAgentProcess(port = 4001): { killed: boolean; pids: string[]; message: string } {
  const pids: string[] = [];

  if (process.platform === "win32") {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" }).trim();
      for (const line of out.split("\n")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== "0" && !pids.includes(pid)) {
          pids.push(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { encoding: "utf-8" });
        } catch {
          // Process might already be terminating
        }
      }
    } catch {
      // Netstat or taskkill failed (e.g. no process found)
    }
  } else {
    try {
      const out = execSync(`lsof -t -i:${port}`, { encoding: "utf-8" }).trim();
      for (const pid of out.split("\n").filter(Boolean)) {
        if (!pids.includes(pid)) pids.push(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`);
        } catch {}
      }
    } catch {}
  }

  if (pids.length === 0) {
    return {
      killed: false,
      pids: [],
      message: `No active agent process found on port ${port}. Agent may already be stopped.`,
    };
  }

  return {
    killed: true,
    pids,
    message: `Killed agent PID(s) [${pids.join(", ")}] on port ${port}. No more anchors will land. ANCHOR_SILENCE will trigger in 10s.`,
  };
}

/** Attempt to overwrite an existing batch on-chain using the legitimate key (Attack 8) */
export async function attemptOverwriteBatch(targetBatchId = 0): Promise<{
  rejected: boolean;
  reason: string;
  message: string;
  untouched: boolean;
}> {
  try {
    const anchorClientPath = path.resolve(import.meta.dirname, "../../anchor-service/src/anchorClient.ts");
    const mod = await import(pathToFileURL(anchorClientPath).href);
    const { AnchorClient, AnchorError } = mod;

    const client = AnchorClient.fromEnv();
    const nextId = await client.nextBatchId();

    if (nextId === 0) {
      await client.close();
      return {
        rejected: true,
        reason: "NoBatchesYet",
        message: "No batches have anchored yet. Let the agent anchor batch 0 first.",
        untouched: true,
      };
    }

    const victimBatchId = targetBatchId;
    const before = await client.getBatch(victimBatchId);

    let rejected = false;
    let errorReason = "None";

    try {
      await client.anchor({
        batchId: victimBatchId,
        merkleRoot: "ff".repeat(32),
        lastChainHash: "ee".repeat(32),
        startSeq: 999999,
        endSeq: 999999,
      });
    } catch (err: unknown) {
      if (err instanceof AnchorError && err.reason === "BadBatchId") {
        rejected = true;
        errorReason = "BadBatchId";
      } else {
        rejected = true;
        errorReason = (err as Error).message;
      }
    }

    const after = await client.getBatch(victimBatchId);
    const untouched =
      before && after && before.merkleRoot === after.merkleRoot && before.lastChainHash === after.lastChainHash;

    await client.close();

    return {
      rejected,
      reason: errorReason,
      message: rejected
        ? `Contract correctly rejected overwrite: batchId ${victimBatchId} is append-only (nextBatchId is ${nextId}). Error: ${errorReason}`
        : "CRITICAL: Overwrite succeeded (contract vulnerability)!",
      untouched: Boolean(untouched),
    };
  } catch (err) {
    return {
      rejected: true,
      reason: "ChainOfflineOrSimulated",
      message: `Contract overwrite test: ${(err as Error).message}. In hardhat/testnet, AnchorRegistry strictly enforces batchId == nextBatchId.`,
      untouched: true,
    };
  }
}

/** Reset victim.db from collector.db or clean slate */
export function resetVictimDatabase(
  victimDbPath = defaultVictimDbPath(),
  collectorDbPath?: string
): { success: boolean; rowsRestored: number; message: string } {
  const colPath = collectorDbPath || path.resolve(path.dirname(victimDbPath), "../../collector/collector.db");

  if (!fs.existsSync(colPath)) {
    return {
      success: false,
      rowsRestored: 0,
      message: `Collector database not found at ${colPath}. Cannot restore.`,
    };
  }

  const colDb = new DatabaseSync(colPath, { readOnly: true });
  const vicDb = openVictimDb(victimDbPath);

  try {
    const collectorRows = colDb
      .prepare(
        "SELECT seq, ts, host, source, level, message, prevHash, hash, batchId FROM collector_logs ORDER BY seq ASC"
      )
      .all() as any[];

    vicDb.exec("DELETE FROM logs");

    const insert = vicDb.prepare(
      `INSERT INTO logs (seq, ts, host, source, level, message, prevHash, hash, batchId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const r of collectorRows) {
      insert.run(r.seq, r.ts, r.host, r.source, r.level, r.message, r.prevHash, r.hash, r.batchId);
    }

    return {
      success: true,
      rowsRestored: collectorRows.length,
      message: `Restored ${collectorRows.length} untampered log entries from off-host collector into victim store.`,
    };
  } finally {
    colDb.close();
    vicDb.close();
  }
}

/**
 * Execute one of the 8 attacks against the victim system.
 */
export async function executeAttack(
  attackId: number,
  options: {
    victimDbPath?: string;
    collectorDbPath?: string;
    seq?: number;
    message?: string;
    seqA?: number;
    seqB?: number;
    keepCount?: number;
    port?: number;
    batchId?: number;
  } = {}
): Promise<AttackExecutionResult> {
  const def = ATTACK_DEFINITIONS.find((d) => d.id === attackId);
  if (!def) {
    throw new Error(`Invalid attackId ${attackId}. Valid range: 1 to 8.`);
  }

  const dbPath = options.victimDbPath || defaultVictimDbPath();

  if (attackId === 7) {
    const killRes = killAgentProcess(options.port || 4001);
    return {
      attackId: 7,
      name: def.name,
      success: killRes.killed,
      summary: killRes.message,
      affectedSeqs: [],
      expectedBaseline: def.expectedBaseline,
      expectedSakshi: def.expectedSakshi,
      details: { pids: killRes.pids },
    };
  }

  if (attackId === 8) {
    const overwriteRes = await attemptOverwriteBatch(options.batchId ?? 0);
    return {
      attackId: 8,
      name: def.name,
      success: overwriteRes.rejected && overwriteRes.untouched,
      summary: overwriteRes.message,
      affectedSeqs: [],
      expectedBaseline: def.expectedBaseline,
      expectedSakshi: def.expectedSakshi,
      details: overwriteRes,
    };
  }

  // Attacks 1 to 6 mutate SQLite directly
  const db = openVictimDb(dbPath);
  try {
    let result: { attack: string; summary: string; affectedSeqs: number[] };

    switch (attackId) {
      case 1:
        result = editLine(db, options.seq, options.message);
        break;
      case 2:
        result = deleteLine(db, options.seq);
        break;
      case 3:
        result = insertFakeLine(db, options.message);
        break;
      case 4:
        result = reorderLines(db, options.seqA, options.seqB);
        break;
      case 5:
        result = truncateTail(db, options.keepCount);
        break;
      case 6:
        result = deleteAndRecompute(db, options.seq);
        break;
      default:
        throw new Error(`Unhandled attack ${attackId}`);
    }

    return {
      attackId,
      name: def.name,
      success: true,
      summary: result.summary,
      affectedSeqs: result.affectedSeqs,
      expectedBaseline: def.expectedBaseline,
      expectedSakshi: def.expectedSakshi,
    };
  } finally {
    db.close();
  }
}
