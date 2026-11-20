/**
 * Anchor service (M1, Phase 2): the dedicated HTTP front door to AnchorRegistry.
 *
 * - POST /api/anchor   write path: an agent hands it { merkleRoot, lastChainHash,
 *   startSeq, endSeq } (no batchId — the service owns nextBatchId); it queues the
 *   request (so concurrent callers never race), retries with backoff if the chain is
 *   slow or momentarily out of sync, and resyncs once on a BadBatchId race instead of
 *   failing outright.
 * - GET  /api/anchors[/:id]   read path: on-chain batch history, oldest first.
 * - Socket.IO "anchored" event: pushed the moment ANY batch lands on-chain (watched
 *   directly via AnchorRegistry's Anchored event), regardless of whether it was
 *   submitted through this service or straight from an agent's in-process AnchorClient.
 *   That's what lets the dashboard show live anchors without polling.
 *
 * agent/src/anchorServiceConnector.ts already knows how to use this: set
 * ANCHOR_SERVICE_URL=http://127.0.0.1:4003 before starting the agent and it prefers
 * this service, falling back to its own in-process AnchorClient if the service is
 * unreachable.
 */
import express from "express";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { AnchorClient, AnchorError } from "./anchorClient.ts";
import type { AnchorInput, AnchorResult, Batch } from "./anchorClient.ts";

const PORT = Number(process.env.PORT || process.env.ANCHOR_SERVICE_PORT || 4003);
const ANCHOR_INTERVAL_MS = Number(process.env.ANCHOR_INTERVAL_MS || 5000);
const SILENCE_THRESHOLD_MS = 2 * ANCHOR_INTERVAL_MS;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [500, 1000, 2000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON can't carry a BigInt (gasUsed); stringify it for the wire. */
function toJsonSafe(result: AnchorResult) {
  return { ...result, gasUsed: result.gasUsed.toString() };
}

export function createAnchorServiceApp() {
  const writeClient = AnchorClient.fromEnv();
  const watchClient = AnchorClient.fromEnv({ readOnly: true });

  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log(`[AnchorService] dashboard connected: ${socket.id}`);
  });

  // Silence detection & performance metrics (M1 Phase 3)
  let lastAnchorTs = Date.now();
  let lastBatchId = -1;
  let totalAnchors = 0;
  let cumulativeGas = 0n;
  let cumulativeLatencyMs = 0;
  let silenceAlertActive = false;

  const silenceCheckTimer = setInterval(() => {
    const idleMs = Date.now() - lastAnchorTs;
    const isSilent = totalAnchors > 0 && idleMs >= SILENCE_THRESHOLD_MS;
    if (isSilent && !silenceAlertActive) {
      silenceAlertActive = true;
      const payload = {
        triggered: true,
        idleSeconds: Math.floor(idleMs / 1000),
        thresholdSeconds: SILENCE_THRESHOLD_MS / 1000,
        lastBatchId,
      };
      console.warn(`[AnchorService] ALERT: ANCHOR_SILENCE detected! No anchor in ${Math.floor(idleMs / 1000)}s (threshold: ${SILENCE_THRESHOLD_MS / 1000}s)`);
      io.emit("silence", payload);
    } else if (!isSilent && silenceAlertActive) {
      silenceAlertActive = false;
      io.emit("silence", { triggered: false, idleSeconds: Math.floor(idleMs / 1000) });
    }
  }, 1000);

  // Broadcast every on-chain anchor to every connected dashboard, no matter who wrote it.
  const unsubscribeWatch = watchClient.onAnchored((batch: Batch) => {
    lastAnchorTs = Date.now();
    lastBatchId = batch.batchId;
    io.emit("anchored", batch);
  });

  // Serialises writes and retries transient failures; resyncs once on a BadBatchId race
  // (e.g. an agent anchored directly in between this request being queued and run).
  let queueTail: Promise<unknown> = Promise.resolve();
  function enqueueAnchor(input: Omit<AnchorInput, "batchId">): Promise<AnchorResult> {
    const run = async (): Promise<AnchorResult> => {
      let attemptInput: AnchorInput = { ...input, batchId: await writeClient.nextBatchId() };
      let lastErr: unknown;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await writeClient.anchor(attemptInput);
          totalAnchors++;
          cumulativeGas += res.gasUsed;
          cumulativeLatencyMs += res.latencyMs;
          lastAnchorTs = Date.now();
          lastBatchId = res.batchId;
          return res;
        } catch (err) {
          lastErr = err;
          if (err instanceof AnchorError && err.reason === "BadBatchId") {
            const expected = Number(err.args.expected);
            console.warn(`[AnchorService] batchId race: resyncing to ${expected} and retrying once`);
            attemptInput = { ...attemptInput, batchId: expected };
            continue; // resync doesn't count against the retry budget
          }
          if (attempt < MAX_RETRIES) {
            const backoff = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
            console.warn(`[AnchorService] anchor attempt ${attempt + 1} failed (${(err as Error).message}), retrying in ${backoff} ms`);
            await sleep(backoff);
          }
        }
      }
      throw lastErr;
    };

    const p = queueTail.then(run, run);
    queueTail = p.catch(() => undefined);
    return p;
  }

  app.get("/health", async (req, res) => {
    res.json({ status: "ok", role: "sakshilog-anchor-service", address: writeClient.address, nextBatchId: await writeClient.nextBatchId() });
  });

  app.post("/api/anchor", async (req, res) => {
    const { merkleRoot, lastChainHash, startSeq, endSeq } = req.body ?? {};
    if (merkleRoot === undefined || lastChainHash === undefined || startSeq === undefined || endSeq === undefined) {
      return res.status(400).json({ error: "merkleRoot, lastChainHash, startSeq, endSeq are required" });
    }
    try {
      const result = await enqueueAnchor({ merkleRoot, lastChainHash, startSeq: Number(startSeq), endSeq: Number(endSeq) });
      res.json(toJsonSafe(result));
    } catch (err) {
      if (err instanceof AnchorError) return res.status(409).json({ error: err.reason, args: err.args });
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get(["/api/anchors", "/anchors"], async (req, res) => {
    try {
      const fromBatchId = req.query.from !== undefined ? Number(req.query.from) : 0;
      res.json(await writeClient.getAllBatches(fromBatchId));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get(["/api/anchors/:id", "/anchors/:id"], async (req, res) => {
    try {
      const batch = await writeClient.getBatch(Number(req.params.id));
      if (!batch) return res.status(404).json({ error: `Batch ${req.params.id} not found` });
      res.json(batch);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // M1 Phase 3: Active silence detection status endpoint
  app.get("/api/silence", (req, res) => {
    const idleMs = Date.now() - lastAnchorTs;
    res.json({
      triggered: totalAnchors > 0 && idleMs >= SILENCE_THRESHOLD_MS,
      idleSeconds: Math.floor(idleMs / 1000),
      thresholdSeconds: SILENCE_THRESHOLD_MS / 1000,
      lastBatchId,
      alertActive: silenceAlertActive,
    });
  });

  // M1 Phase 3: Gas & throughput performance metrics
  app.get("/api/metrics", (req, res) => {
    res.json({
      totalAnchors,
      avgGasUsed: totalAnchors > 0 ? (cumulativeGas / BigInt(totalAnchors)).toString() : "0",
      avgLatencyMs: totalAnchors > 0 ? Math.round(cumulativeLatencyMs / totalAnchors) : 0,
      silenceThresholdSeconds: SILENCE_THRESHOLD_MS / 1000,
      lastAnchorTs,
    });
  });

  async function close(): Promise<void> {
    clearInterval(silenceCheckTimer);
    unsubscribeWatch();
    await writeClient.close();
    await watchClient.close();
  }

  return { app, httpServer, io, writeClient, watchClient, close };
}

if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))) {
  const { httpServer, writeClient } = createAnchorServiceApp();
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[AnchorService] Listening on http://0.0.0.0:${PORT} (contract ${writeClient.address})`);
  });
}
