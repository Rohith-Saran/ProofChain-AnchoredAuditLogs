import express from "express";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyLogs, verifyBaseline } from "./verifier.ts";
import { readLocalEntries, readCollectorEntries, readOnChainBatches, defaultPaths } from "./loaders.ts";

const PORT = Number(process.env.PORT || process.env.VERIFIER_PORT || 4004);
const ANCHOR_INTERVAL_MS = Number(process.env.ANCHOR_INTERVAL_MS || 5000);
const BASELINE_MODE = process.env.BASELINE_MODE === "true";

export function createVerifierApp() {
  const { victimDbPath, collectorDbPath } = defaultPaths();
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  async function runFullVerification(baselineModeOverride?: boolean) {
    const [localEntries, collectorEntries, batches] = await Promise.all([
      Promise.resolve(readLocalEntries(victimDbPath)),
      Promise.resolve(readCollectorEntries(collectorDbPath)),
      readOnChainBatches(),
    ]);
    return verifyLogs({
      localEntries,
      collectorEntries,
      batches,
      anchorIntervalMs: ANCHOR_INTERVAL_MS,
      baselineMode: baselineModeOverride ?? BASELINE_MODE,
    });
  }

  app.get("/health", (req, res) => {
    res.json({ status: "ok", role: "sakshilog-verifier", victimDbPath, collectorDbPath });
  });

  // Full verification: per-entry verdicts, per-batch root checks, silence status.
  app.get("/api/verify", async (req, res) => {
    try {
      const result = await runFullVerification();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Same, but only the entries belonging to one on-chain batch (for the attack console's diff view).
  app.get("/api/verify/batch/:id", async (req, res) => {
    try {
      const batchId = Number(req.params.id);
      const result = await runFullVerification();
      const entries = result.entries.filter((e) => e.batchId === batchId);
      const batch = result.batches.find((b) => b.batchId === batchId);
      if (!batch) return res.status(404).json({ error: `Batch ${batchId} not found on-chain` });
      res.json({ batch, entries });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // What a plain hash chain (no blockchain) would conclude: used for the "obvious fix fails" demo.
  app.get("/api/verify/baseline", (req, res) => {
    try {
      const localEntries = readLocalEntries(victimDbPath);
      const result = verifyBaseline(localEntries);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // CERT-In style evidence pack (real one: entries, Merkle proofs, on-chain batch info,
  // tampered entries flagged), generated on demand so the dashboard's "Export Evidence
  // Pack" button can download real data instead of the placeholder it used to fake.
  app.get("/api/evidence/export", async (req, res) => {
    try {
      const exportPackPath = path.resolve(import.meta.dirname, "../../evidence/src/exportPack.ts");
      const aiReportPath = path.resolve(import.meta.dirname, "../../evidence/src/aiReport.ts");
      const [exportMod, aiMod] = await Promise.all([
        import(pathToFileURL(exportPackPath).href),
        import(pathToFileURL(aiReportPath).href),
      ]);
      // Real report if the AI investigator (M4) is configured and reachable; null — never
      // fabricated — otherwise. See evidence/src/aiReport.ts and exportPack.ts's own
      // "not configured" note in the generated markdown report.
      const aiReport = await aiMod.fetchAiIncidentReport();
      const pack = exportMod.exportEvidencePack({ victimDbPath, collectorDbPath, aiReport });
      res.json(pack);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Silence status alone (cheap: skips SQLite reads).
  app.get("/api/silence", async (req, res) => {
    try {
      const batches = await readOnChainBatches();
      const result = verifyLogs({
        localEntries: [],
        collectorEntries: [],
        batches,
        anchorIntervalMs: ANCHOR_INTERVAL_MS,
        baselineMode: BASELINE_MODE,
      });
      res.json(result.silence);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // M3: Adversarial Attack Execution Endpoints (attacks 1 through 8)
  async function loadAttackRunner() {
    const attackRunnerPath = path.resolve(import.meta.dirname, "../../attacks/src/attackRunner.ts");
    return import(pathToFileURL(attackRunnerPath).href);
  }

  // Get list of all available attacks and their specifications
  app.get("/api/attacks", async (req, res) => {
    try {
      const { ATTACK_DEFINITIONS } = await loadAttackRunner();
      res.json({ attacks: ATTACK_DEFINITIONS });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Execute an attack by ID (1 through 8)
  app.post("/api/attacks/run/:id", async (req, res) => {
    try {
      const attackId = Number(req.params.id);
      const { executeAttack } = await loadAttackRunner();
      const result = await executeAttack(attackId, {
        victimDbPath,
        collectorDbPath,
        ...req.body,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Alias for running attack via body
  app.post("/api/attacks/run", async (req, res) => {
    try {
      const attackId = Number(req.body.attackId);
      const { executeAttack } = await loadAttackRunner();
      const result = await executeAttack(attackId, {
        victimDbPath,
        collectorDbPath,
        ...req.body,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Reset victim DB back to untampered state from off-host collector
  app.post("/api/attacks/reset", async (req, res) => {
    try {
      const { resetVictimDatabase } = await loadAttackRunner();
      const result = resetVictimDatabase(victimDbPath, collectorDbPath);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return { app };
}

if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))) {
  const { app } = createVerifierApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SakshiLog Verifier] Listening on http://0.0.0.0:${PORT}`);
  });
}
