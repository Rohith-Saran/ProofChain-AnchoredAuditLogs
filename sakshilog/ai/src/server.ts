import express from "express";
import { fetchInvestigatorInput } from "./verifierClient.ts";
import { buildPrompt, toIncidentReport, SYSTEM_PROMPT } from "./investigator.ts";
import { callInvestigatorModel } from "./llmClient.ts";
import type { AiIncidentReport } from "../../evidence/src/aiReport.ts";

const PORT = Number(process.env.PORT || process.env.AI_PORT || 4005);
const VERIFIER_URL = process.env.VERIFIER_URL || "http://127.0.0.1:4004";

/** The whole pipeline: fetch live verdicts -> prompt -> LLM -> citation checker. Throws
 *  (never fabricates) if the model isn't configured, the verifier is unreachable, or the
 *  model call itself fails — callers decide how to surface that. */
export async function generateIncidentReport(): Promise<AiIncidentReport> {
  const input = await fetchInvestigatorInput(VERIFIER_URL);
  const prompt = buildPrompt(input);
  const rawClaims = await callInvestigatorModel(SYSTEM_PROMPT, prompt);
  const verifiedSeqs = new Set(input.verifiedEntries.map((e) => e.seq));
  return toIncidentReport(rawClaims, verifiedSeqs);
}

export function createAiApp() {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      role: "sakshilog-ai-investigator",
      modelConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      verifierUrl: VERIFIER_URL,
    });
  });

  // The only endpoint evidence/src/aiReport.ts's fetchAiIncidentReport() calls. 503, not
  // a fabricated 200, when the model isn't configured or the call fails for any reason.
  app.get("/api/incident-report", async (req, res) => {
    try {
      const report = await generateIncidentReport();
      res.json(report);
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  return { app };
}

if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))) {
  const { app } = createAiApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SakshiLog AI Investigator] Listening on http://0.0.0.0:${PORT}`);
    console.log(
      process.env.ANTHROPIC_API_KEY
        ? "[SakshiLog AI Investigator] ANTHROPIC_API_KEY set — ready to generate real incident reports."
        : "[SakshiLog AI Investigator] ANTHROPIC_API_KEY not set — /api/incident-report will return 503 until it is."
    );
  });
}
