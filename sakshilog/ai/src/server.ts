import express from "express";
import { fetchEvidenceContext, VerifierUnreachableError } from "./verifierClient.ts";
import { buildPrompt, toIncidentReport, SYSTEM_PROMPT } from "./investigator.ts";
import {
  callInvestigatorModel,
  callStructured,
  isModelConfigured,
  MODEL,
  AiNotConfiguredError,
  AiModelError,
  AiRefusalError,
  AiTruncatedError,
} from "./llmClient.ts";
import { cached, evidenceKey } from "./cache.ts";
import { TIMELINE_SCHEMA, TIMELINE_SYSTEM, buildTimelinePrompt, toAttackTimeline, type RawTimelineStep } from "./timeline.ts";
import { CERT_IN_SCHEMA, CERT_IN_SYSTEM, buildCertInPrompt, toCertInReport, type RawCertInReport } from "./certIn.ts";
import { ASK_SCHEMA, ASK_SYSTEM, buildAskPrompt, createRateLimiter, toLogAnswer, validateQuestion, type RawLogAnswer } from "./askLogs.ts";
import type { AiIncidentReport } from "../../evidence/src/aiReport.ts";

const PORT = Number(process.env.PORT || process.env.AI_PORT || 4005);
const VERIFIER_URL = process.env.VERIFIER_URL || "http://127.0.0.1:4004";
const CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 60_000);

function requireModel(): void {
  // Checked before fetching evidence so an unconfigured service fails fast and says why.
  if (!isModelConfigured()) throw new AiNotConfiguredError("ANTHROPIC_API_KEY not set — AI features are not configured");
}

/** The whole pipeline: fetch live verdicts -> prompt -> LLM -> citation checker. Throws
 *  (never fabricates) if the model isn't configured, the verifier is unreachable, or the
 *  model call itself fails — callers decide how to surface that. */
export async function generateIncidentReport(): Promise<AiIncidentReport> {
  requireModel();
  const ctx = await fetchEvidenceContext(VERIFIER_URL);
  return cached(evidenceKey("incident-report", ctx), CACHE_TTL_MS, async () => {
    const rawClaims = await callInvestigatorModel(SYSTEM_PROMPT, buildPrompt(ctx));
    return toIncidentReport(rawClaims, ctx.verifiedSeqs);
  });
}

export async function generateAttackTimeline() {
  requireModel();
  const ctx = await fetchEvidenceContext(VERIFIER_URL);
  return cached(evidenceKey("attack-timeline", ctx), CACHE_TTL_MS, async () => {
    const raw = await callStructured<{ steps?: RawTimelineStep[] }>({
      system: TIMELINE_SYSTEM,
      user: buildTimelinePrompt(ctx),
      schema: TIMELINE_SCHEMA,
      effort: "high",
    });
    return toAttackTimeline(raw.steps, ctx);
  });
}

export async function generateCertInReport() {
  requireModel();
  const ctx = await fetchEvidenceContext(VERIFIER_URL);
  return cached(evidenceKey("cert-in", ctx), CACHE_TTL_MS, async () => {
    const raw = await callStructured<RawCertInReport>({
      system: CERT_IN_SYSTEM,
      user: buildCertInPrompt(ctx),
      schema: CERT_IN_SCHEMA,
      effort: "high",
    });
    return toCertInReport(raw, ctx);
  });
}

export async function answerQuestion(question: string) {
  requireModel();
  const ctx = await fetchEvidenceContext(VERIFIER_URL);
  return cached(evidenceKey("ask", ctx, question.toLowerCase()), CACHE_TTL_MS, async () => {
    const raw = await callStructured<RawLogAnswer>({
      system: ASK_SYSTEM,
      user: buildAskPrompt(ctx, question),
      schema: ASK_SCHEMA,
      effort: "medium",
    });
    return toLogAnswer(raw, ctx, question);
  });
}

/** Maps a failure to an honest status + machine-readable code; never a fabricated 200. */
function sendError(res: express.Response, err: unknown): void {
  const message = (err as Error)?.message ?? String(err);
  if (err instanceof AiNotConfiguredError) res.status(503).json({ error: message, code: err.code });
  else if (err instanceof VerifierUnreachableError) res.status(503).json({ error: message, code: err.code });
  else if (err instanceof AiRefusalError || err instanceof AiTruncatedError || err instanceof AiModelError) {
    res.status(502).json({ error: message, code: err.code });
  } else res.status(500).json({ error: message, code: "internal_error" });
}

export function createAiApp() {
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  const askLimiter = createRateLimiter(Number(process.env.AI_ASK_RATE_LIMIT || 10), 60_000);

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
      modelConfigured: isModelConfigured(),
      model: MODEL,
      verifierUrl: VERIFIER_URL,
      features: ["incident-report", "attack-timeline", "cert-in-report", "ask"],
    });
  });

  // Called by evidence/src/aiReport.ts and the dashboard.
  app.get("/api/incident-report", async (req, res) => {
    try {
      res.json(await generateIncidentReport());
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/attack-timeline", async (req, res) => {
    try {
      res.json(await generateAttackTimeline());
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/cert-in-report", async (req, res) => {
    try {
      res.json(await generateCertInReport());
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/ask", async (req, res) => {
    const question = req.body?.question;
    const invalid = validateQuestion(question);
    if (invalid) return res.status(400).json({ error: invalid, code: "bad_request" });
    if (!askLimiter()) return res.status(429).json({ error: "Too many questions — try again in a minute", code: "rate_limited" });
    try {
      res.json(await answerQuestion((question as string).trim()));
    } catch (err) {
      sendError(res, err);
    }
  });

  return { app };
}

if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))) {
  const { app } = createAiApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SakshiLog AI] Listening on http://0.0.0.0:${PORT} (model ${MODEL})`);
    console.log(
      isModelConfigured()
        ? "[SakshiLog AI] Credentials set — incident report, attack timeline, CERT-In report and Ask-the-Logs are live."
        : "[SakshiLog AI] ANTHROPIC_API_KEY not set — every AI route returns 503 not_configured until it is."
    );
  });
}
