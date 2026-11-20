import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

export interface CollectorLogEntry {
  seq: number;
  ts: number;
  host: string;
  source: string;
  level: string;
  message: string;
  prevHash: string;
  hash: string;
  batchId?: number | null;
}

export interface CollectorBatch {
  batchId: number;
  startSeq: number;
  endSeq: number;
  merkleRoot: string;
  lastChainHash: string;
  txHash: string | null;
  blockNumber: number;
  timestamp?: number;
}

export class CollectorDB {
  readonly db: DatabaseSync;
  readonly dbPath: string;

  constructor(filePath?: string) {
    this.dbPath = filePath ?? path.resolve(process.cwd(), "collector.db");
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collector_logs (
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
      CREATE INDEX IF NOT EXISTS idx_collector_logs_batchId ON collector_logs(batchId);
      CREATE INDEX IF NOT EXISTS idx_collector_logs_ts ON collector_logs(ts);

      CREATE TABLE IF NOT EXISTS collector_batches (
        batchId INTEGER PRIMARY KEY,
        startSeq INTEGER NOT NULL,
        endSeq INTEGER NOT NULL,
        merkleRoot TEXT NOT NULL,
        lastChainHash TEXT NOT NULL,
        txHash TEXT,
        blockNumber INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  ingest(entry: CollectorLogEntry): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO collector_logs (seq, ts, host, source, level, message, prevHash, hash, batchId)
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

  ingestBatch(entries: CollectorLogEntry[]): void {
    if (entries.length === 0) return;
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO collector_logs (seq, ts, host, source, level, message, prevHash, hash, batchId)
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

  recordBatch(b: CollectorBatch): void {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const bStmt = this.db.prepare(`
        INSERT OR REPLACE INTO collector_batches (batchId, startSeq, endSeq, merkleRoot, lastChainHash, txHash, blockNumber, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      bStmt.run(
        b.batchId,
        b.startSeq,
        b.endSeq,
        b.merkleRoot,
        b.lastChainHash,
        b.txHash ?? null,
        b.blockNumber,
        b.timestamp ?? Math.floor(Date.now() / 1000)
      );

      const updateLogsStmt = this.db.prepare(`
        UPDATE collector_logs
        SET batchId = ?
        WHERE seq >= ? AND seq <= ?
      `);
      updateLogsStmt.run(b.batchId, b.startSeq, b.endSeq);

      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  getEntry(seq: number): CollectorLogEntry | null {
    const stmt = this.db.prepare(`
      SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
      FROM collector_logs
      WHERE seq = ?
    `);
    const row = stmt.get(seq) as unknown as CollectorLogEntry | undefined;
    return row ?? null;
  }

  getLogs(limit = 100, offset = 0, batchId?: number): { logs: CollectorLogEntry[]; total: number } {
    const countStmt = batchId !== undefined
      ? this.db.prepare("SELECT COUNT(*) as count FROM collector_logs WHERE batchId = ?")
      : this.db.prepare("SELECT COUNT(*) as count FROM collector_logs");

    const countRow = (batchId !== undefined ? countStmt.get(batchId) : countStmt.get()) as { count: number };
    const total = countRow ? Number(countRow.count) : 0;

    const queryStmt = batchId !== undefined
      ? this.db.prepare(`
          SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
          FROM collector_logs
          WHERE batchId = ?
          ORDER BY seq ASC
          LIMIT ? OFFSET ?
        `)
      : this.db.prepare(`
          SELECT seq, ts, host, source, level, message, prevHash, hash, batchId
          FROM collector_logs
          ORDER BY seq ASC
          LIMIT ? OFFSET ?
        `);

    const logs = (batchId !== undefined
      ? queryStmt.all(batchId, limit, offset)
      : queryStmt.all(limit, offset)) as unknown as CollectorLogEntry[];

    return { logs, total };
  }

  getBatches(): CollectorBatch[] {
    const stmt = this.db.prepare(`
      SELECT batchId, startSeq, endSeq, merkleRoot, lastChainHash, txHash, blockNumber, timestamp
      FROM collector_batches
      ORDER BY batchId ASC
    `);
    return stmt.all() as unknown as CollectorBatch[];
  }

  getStats(): { totalLogs: number; totalBatches: number; lastSeq: number } {
    const logCount = this.db.prepare("SELECT COUNT(*) as c FROM collector_logs").get() as { c: number };
    const batchCount = this.db.prepare("SELECT COUNT(*) as c FROM collector_batches").get() as { c: number };
    const latest = this.db.prepare("SELECT seq FROM collector_logs ORDER BY seq DESC LIMIT 1").get() as { seq: number } | undefined;

    return {
      totalLogs: logCount ? Number(logCount.c) : 0,
      totalBatches: batchCount ? Number(batchCount.c) : 0,
      lastSeq: latest ? Number(latest.seq) : 0,
    };
  }

  close(): void {
    this.db.close();
  }
}
