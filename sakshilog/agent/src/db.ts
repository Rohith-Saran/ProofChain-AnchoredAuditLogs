import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LogEntry } from "./types.ts";

export class AgentDB {
  readonly db: DatabaseSync;
  readonly dbPath: string;

  constructor(filePath?: string) {
    this.dbPath = filePath ?? path.resolve(process.cwd(), "victim.db");
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        seq INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        host TEXT NOT NULL,
        source TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        prevHash TEXT NOT NULL,
        hash TEXT NOT NULL,
        batchId INTEGER DEFAULT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_logs_batchId ON logs(batchId);
      CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
    `);
  }

  insert(entry: LogEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO logs (seq, ts, host, source, level, message, prevHash, hash, batchId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.seq,
      entry.ts,
      entry.host,
      entry.source,
      entry.level,
      entry.message,
      entry.prevHash,
      entry.hash,
      entry.batchId ?? null
    );
  }

  insertBatch(entries: LogEntry[]): void {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const stmt = this.db.prepare(`
        INSERT INTO logs (seq, ts, host, source, level, message, prevHash, hash, batchId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of entries) {
        stmt.run(
          e.seq,
          e.ts,
          e.host,
          e.source,
          e.level,
          e.message,
          e.prevHash,
          e.hash,
          e.batchId ?? null
        );
      }
      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  getLatestEntry(): LogEntry | null {
    const stmt = this.db.prepare(`
      SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
      FROM logs
      ORDER BY seq DESC
      LIMIT 1
    `);
    const row = stmt.get() as unknown as LogEntry | undefined;
    return row ?? null;
  }

  getEntryBySeq(seq: number): LogEntry | null {
    const stmt = this.db.prepare(`
      SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
      FROM logs
      WHERE seq = ?
    `);
    const row = stmt.get(seq) as unknown as LogEntry | undefined;
    return row ?? null;
  }

  getUnanchoredEntries(limit = 1000): LogEntry[] {
    const stmt = this.db.prepare(`
      SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
      FROM logs
      WHERE batchId IS NULL
      ORDER BY seq ASC
      LIMIT ?
    `);
    return stmt.all(limit) as unknown as LogEntry[];
  }

  markAnchored(startSeq: number, endSeq: number, batchId: number): void {
    const stmt = this.db.prepare(`
      UPDATE logs
      SET batchId = ?
      WHERE seq >= ? AND seq <= ?
    `);
    stmt.run(batchId, startSeq, endSeq);
  }

  getLogs(limit = 100, offset = 0, batchId?: number): { logs: LogEntry[]; total: number } {
    const countStmt = batchId !== undefined
      ? this.db.prepare("SELECT COUNT(*) as count FROM logs WHERE batchId = ?")
      : this.db.prepare("SELECT COUNT(*) as count FROM logs");

    const countRow = (batchId !== undefined ? countStmt.get(batchId) : countStmt.get()) as { count: number };
    const total = countRow ? Number(countRow.count) : 0;

    const queryStmt = batchId !== undefined
      ? this.db.prepare(`
          SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
          FROM logs
          WHERE batchId = ?
          ORDER BY seq DESC
          LIMIT ? OFFSET ?
        `)
      : this.db.prepare(`
          SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
          FROM logs
          ORDER BY seq DESC
          LIMIT ? OFFSET ?
        `);

    const logs = (batchId !== undefined
      ? queryStmt.all(batchId, limit, offset)
      : queryStmt.all(limit, offset)) as unknown as LogEntry[];

    return { logs, total };
  }

  getStats(): { totalLogs: number; unanchoredLogs: number; lastSeq: number; lastHash: string } {
    const countRow = this.db.prepare("SELECT COUNT(*) as count FROM logs").get() as { count: number } | undefined;
    const unanchoredRow = this.db.prepare("SELECT COUNT(*) as count FROM logs WHERE batchId IS NULL").get() as { count: number } | undefined;
    const latest = this.getLatestEntry();

    return {
      totalLogs: countRow ? Number(countRow.count) : 0,
      unanchoredLogs: unanchoredRow ? Number(unanchoredRow.count) : 0,
      lastSeq: latest ? latest.seq : 0,
      lastHash: latest ? latest.hash : "0".repeat(64),
    };
  }

  close(): void {
    this.db.close();
  }
}
