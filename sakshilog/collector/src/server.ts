import express from "express";
import { CollectorDB } from "./db.ts";
import type { CollectorLogEntry, CollectorBatch } from "./db.ts";
import * as path from "node:path";

const PORT = Number(process.env.PORT || process.env.COLLECTOR_PORT || 4002);
const DB_PATH = process.env.COLLECTOR_DB_PATH || path.resolve(import.meta.dirname, "../collector.db");

export function createCollectorApp(dbFilePath = DB_PATH) {
  const db = new CollectorDB(dbFilePath);
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // Health check
  app.get("/health", (req, res) => {
    const stats = db.getStats();
    res.json({
      status: "ok",
      role: "sakshilog-collector",
      ...stats,
    });
  });

  // Ingest logs in real time from victim agent
  app.post("/api/collector/ingest", (req, res) => {
    const payload = req.body;
    if (Array.isArray(payload)) {
      db.ingestBatch(payload as CollectorLogEntry[]);
      res.json({ success: true, count: payload.length });
    } else if (payload && typeof payload === "object" && "seq" in payload) {
      db.ingest(payload as CollectorLogEntry);
      res.json({ success: true, count: 1 });
    } else {
      res.status(400).json({ error: "Invalid log payload" });
    }
  });

  // Record batch anchor
  app.post("/api/collector/batch", (req, res) => {
    const b = req.body as CollectorBatch;
    if (b.batchId === undefined || b.startSeq === undefined || b.endSeq === undefined) {
      return res.status(400).json({ error: "Missing required batch fields" });
    }
    db.recordBatch(b);
    res.json({ success: true, batchId: b.batchId });
  });

  // Query off-host logs (used by Verifier for entry-by-entry forensic comparison)
  app.get("/api/collector/logs", (req, res) => {
    const limit = Math.min(Number(req.query.limit || 100), 5000);
    const offset = Number(req.query.offset || 0);
    const batchId = req.query.batchId !== undefined ? Number(req.query.batchId) : undefined;

    const data = db.getLogs(limit, offset, batchId);
    res.json(data);
  });

  // Get specific entry by seq for forensic diff
  app.get("/api/collector/entry/:seq", (req, res) => {
    const seq = Number(req.params.seq);
    const entry = db.getEntry(seq);
    if (!entry) {
      return res.status(404).json({ error: `Entry seq ${seq} not found in collector` });
    }
    res.json(entry);
  });

  // Get all recorded batches
  app.get("/api/collector/batches", (req, res) => {
    const batches = db.getBatches();
    res.json(batches);
  });

  // Collector statistics
  app.get("/api/collector/stats", (req, res) => {
    res.json(db.getStats());
  });

  return { app, db };
}

if (process.argv[1] && process.argv[1].endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const { app } = createCollectorApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SakshiLog Collector] Off-host store listening on http://0.0.0.0:${PORT}`);
    console.log(`[SakshiLog Collector] Database: ${DB_PATH}`);
  });
}
