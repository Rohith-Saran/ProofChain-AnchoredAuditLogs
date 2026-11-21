import express from "express";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { AgentDB } from "./db.ts";
import { HashChain } from "./hashChain.ts";
import { CollectorClient } from "./collectorClient.ts";
import { AnchorConnector } from "./anchorServiceConnector.ts";
import { LoadGenerator, generateRandomAction } from "./loadGenerator.ts";
import * as path from "node:path";

const PORT = Number(process.env.PORT || process.env.AGENT_PORT || 4001);
const DB_PATH = process.env.DB_PATH || path.resolve(import.meta.dirname, "../victim.db");
const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://127.0.0.1:4002";
const ANCHOR_INTERVAL_MS = Number(process.env.ANCHOR_INTERVAL_MS || 5000);

export function createAgentApp(dbFilePath = DB_PATH) {
  const db = new AgentDB(dbFilePath);
  const collector = new CollectorClient(COLLECTOR_URL);
  const chain = new HashChain(db, collector, "victim-server");
  const connector = new AnchorConnector(db, collector, {
    intervalMs: ANCHOR_INTERVAL_MS,
    baselineMode: process.env.BASELINE_MODE === "true",
  });
  const loadGen = new LoadGenerator(chain);

  const app = express();
  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // Realtime push for the dashboard: "log" on every new entry, "batch" on every anchor
  // (normal batch or heartbeat). No request/response here — purely outbound events.
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
  io.on("connection", (socket) => {
    console.log(`[SakshiLog Agent] dashboard connected: ${socket.id}`);
  });
  chain.onEntries = (entries) => {
    for (const entry of entries) io.emit("log", entry);
    // Adaptive anchoring (Phase 4a, M1): every new entry also feeds the risk scorer,
    // which can shrink the next anchor wait well before the timer would've fired anyway.
    connector.observeEntries(entries);
  };
  connector.onBatch = (batch) => {
    io.emit("batch", batch);
  };
  connector.onRisk = (state) => {
    io.emit("risk", state);
  };

  // Health endpoint
  app.get("/health", (req, res) => {
    const stats = db.getStats();
    res.json({
      status: "ok",
      role: "sakshilog-agent",
      host: "victim-server",
      totalLogs: stats.totalLogs,
      lastSeq: stats.lastSeq,
      baselineMode: connector.isBaseline(),
      anchorIntervalMs: connector.getCurrentIntervalMs(),
    });
  });

  // Query logs
  app.get("/api/logs", (req, res) => {
    const limit = Math.min(Number(req.query.limit || 50), 1000);
    const offset = Number(req.query.offset || 0);
    const batchId = req.query.batchId !== undefined ? Number(req.query.batchId) : undefined;

    const result = db.getLogs(limit, offset, batchId);
    res.json(result);
  });

  // Get statistics
  app.get("/api/stats", (req, res) => {
    const dbStats = db.getStats();
    const loadStats = loadGen.getStats();
    res.json({
      ...dbStats,
      loadGenerator: loadStats,
      baselineMode: connector.isBaseline(),
      risk: connector.getRiskState(),
    });
  });

  // Adaptive anchoring: current risk score, the anchor interval it's driving, and why.
  app.get("/api/risk", (req, res) => {
    res.json(connector.getRiskState());
  });

  // Write custom log entry
  app.post("/api/logs/write", (req, res) => {
    const { message, source = "app", level = "info", host = "victim-server" } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const entry = chain.append({
      source,
      level,
      message,
      host,
    });

    res.json({ success: true, entry });
  });

  // Simulate realistic security action (login, sudo, file, admin)
  app.post("/api/actions/simulate", (req, res) => {
    const { type } = req.body;
    const action = generateRandomAction(type);
    const entry = chain.append(action);
    res.json({ success: true, actionType: type || "random", entry });
  });

  // Adaptive anchoring live trigger (Phase 4a, M1): fire a burst of failed logins + privilege escalation
  // to immediately demonstrate risk score spike (0 -> 1.0) and anchor interval shrinking (5s -> 1s)
  app.post("/api/actions/burst", (req, res) => {
    const count = Number(req.body?.count || 5);
    const ip = req.body?.ip || "203.0.113.19";
    const entries = [];
    for (let i = 0; i < count; i++) {
      entries.push(
        chain.append({
          source: "auth",
          level: "warning",
          message: `Failed password for invalid user hacker from ${ip} port ${51200 + i} ssh2`,
          host: "victim-server",
        })
      );
    }
    if (req.body?.includeSudo !== false) {
      entries.push(
        chain.append({
          source: "usermod",
          level: "notice",
          message: `add 'hacker' to group 'sudo'`,
          host: "victim-server",
        })
      );
    }
    const risk = connector.getRiskState();
    res.json({ success: true, count: entries.length, entries, risk });
  });

  // Start / set load generator (10 to 1,000 logs/sec)
  app.post("/api/load/start", (req, res) => {
    const rate = Number(req.body.rate || 50);
    loadGen.start(rate);
    res.json({ success: true, stats: loadGen.getStats() });
  });

  // Stop load generator
  app.post("/api/load/stop", (req, res) => {
    loadGen.stop();
    res.json({ success: true, stats: loadGen.getStats() });
  });

  // Toggle baseline mode (disables anchoring, leaves plain hash chain)
  app.post("/api/baseline", (req, res) => {
    const enabled = Boolean(req.body.enabled);
    connector.setBaselineMode(enabled);
    res.json({ success: true, baselineMode: connector.isBaseline() });
  });

  // Trigger immediate Merkle batch and anchor
  app.post("/api/anchor/trigger", async (req, res) => {
    const batch = await connector.triggerBatch();
    res.json({ success: true, batch });
  });

  return { app, httpServer, io, db, chain, connector, loadGen, collector };
}

if (process.argv[1] && process.argv[1].endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const { httpServer, connector } = createAgentApp();
  connector.start().then(() => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`[SakshiLog Agent] Victim server listening on http://0.0.0.0:${PORT}`);
      console.log(`[SakshiLog Agent] SQLite database at ${DB_PATH}`);
      console.log(`[SakshiLog Agent] Forwarding off-host copies to ${COLLECTOR_URL}`);
    });
  });
}
