/**
 * The one place the AI service talks to a model. Two providers:
 *  - Anthropic (Claude) via the official SDK — set ANTHROPIC_API_KEY.
 *  - Groq via its OpenAI-compatible HTTP API — set GROQ_API_KEY.
 * AI_PROVIDER ("anthropic" | "groq") picks one explicitly; otherwise whichever key is set
 * is used, Anthropic first.
 *
 * Every feature asks for JSON matching a schema, so nothing downstream parses free text.
 * The model's output is still untrusted: the schema guarantees its shape, not its honesty —
 * each feature runs its own code-side checks afterwards, whichever provider answered.
 */
import type { RawClaim } from "./investigator.ts";

export type Provider = "anthropic" | "groq";

export function activeProvider(): Provider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "groq" || explicit === "anthropic") return explicit;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  return "anthropic";
}

export function activeModel(): string {
  return activeProvider() === "groq"
    ? process.env.GROQ_MODEL || "openai/gpt-oss-120b"
    : process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
}

export function isModelConfigured(): boolean {
  return activeProvider() === "groq"
    ? Boolean(process.env.GROQ_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type Effort = "low" | "medium" | "high";

export class AiNotConfiguredError extends Error {
  readonly code = "not_configured";
}
export class AiRefusalError extends Error {
  readonly code = "refusal";
}
export class AiTruncatedError extends Error {
  readonly code = "truncated";
}
export class AiModelError extends Error {
  readonly code = "model_error";
}

export interface StructuredCall {
  system: string;
  user: string;
  /** JSON schema for the reply; must set additionalProperties:false and list every property in required. */
  schema: Record<string, unknown>;
  effort: Effort;
  maxTokens?: number;
}

export async function callStructured<T>(call: StructuredCall): Promise<T> {
  if (!isModelConfigured()) {
    const key = activeProvider() === "groq" ? "GROQ_API_KEY" : "ANTHROPIC_API_KEY";
    throw new AiNotConfiguredError(`${key} not set — AI features are not configured`);
  }
  return activeProvider() === "groq" ? callGroq<T>(call) : callAnthropic<T>(call);
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiModelError("The model's reply was not valid JSON");
  }
}

// ---------------------------------------------------------------- Anthropic

let anthropic: any = null;

async function callAnthropic<T>({ system, user, schema, effort, maxTokens = 16000 }: StructuredCall): Promise<T> {
  let AnthropicModule: any;
  try {
    const mod = await import("@anthropic-ai/sdk");
    AnthropicModule = mod.default || mod;
  } catch {
    throw new AiNotConfiguredError("@anthropic-ai/sdk is not installed. Use GROQ_API_KEY or run npm install.");
  }

  if (!anthropic) anthropic = new AnthropicModule();

  let response: any;
  try {
    // Forced tool_choice isn't used: current Claude models reject it. output_config.format
    // gives the same structured guarantee.
    response = await anthropic.beta.messages.create({
      model: activeModel(),
      max_tokens: maxTokens,
      // On a policy decline the API re-runs the request on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { format: { type: "json_schema", schema }, effort },
      messages: [{ role: "user", content: user }],
    });
  } catch (err: any) {
    if (err?.name === "AuthenticationError" || (AnthropicModule.AuthenticationError && err instanceof AnthropicModule.AuthenticationError)) {
      throw new AiNotConfiguredError(`Anthropic API rejected the credentials: ${err.message}`);
    }
    if (err?.name === "APIError" || (AnthropicModule.APIError && err instanceof AnthropicModule.APIError)) {
      throw new AiModelError(`Anthropic API error ${err.status ?? ""}: ${err.message}`.trim());
    }
    throw new AiModelError(`Anthropic API unreachable: ${(err as Error).message}`);
  }

  if (response.stop_reason === "refusal") throw new AiRefusalError("The model declined this request");
  if (response.stop_reason === "max_tokens") throw new AiTruncatedError("The model's reply was cut off before it finished");

  const text = (response.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  return parseJson<T>(text);
}

// ---------------------------------------------------------------- Groq

const GROQ_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1/chat/completions";

interface GroqResponseBody {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  error?: { message?: string; type?: string };
}

/** Turns a Groq HTTP response into the parsed JSON reply or a typed error. Pure, for testing. */
export function groqResult<T>(status: number, body: GroqResponseBody | null): T {
  if (status === 401 || status === 403) {
    throw new AiNotConfiguredError(`Groq rejected the API key: ${body?.error?.message ?? `HTTP ${status}`}`);
  }
  if (status === 429) throw new AiModelError("Groq rate limit reached — wait a minute and try again");
  if (status === 413) {
    throw new AiModelError(`Request is larger than your Groq tier allows per minute — lower AI_MAX_VERIFIED. ${body?.error?.message ?? ""}`.trim());
  }
  if (status < 200 || status >= 300) {
    throw new AiModelError(`Groq API error ${status}: ${body?.error?.message ?? "no details"}`);
  }

  const choice = body?.choices?.[0];
  if (!choice) throw new AiModelError("Groq returned no answer");
  if (choice.message?.refusal) throw new AiRefusalError("The model declined this request");
  if (choice.finish_reason === "length") throw new AiTruncatedError("The model's reply was cut off before it finished");
  return parseJson<T>(choice.message?.content ?? "");
}

/** Seconds to wait before one automatic retry on a 429, or null if not worth waiting. */
export function groqRetryDelaySeconds(
  status: number,
  retryAfter: string | null,
  maxWait = Number(process.env.GROQ_MAX_RETRY_WAIT_S || 60)
): number | null {
  if (status !== 429 || retryAfter === null) return null;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= maxWait ? seconds : null;
}

// One Groq call at a time: the free tier's limit is per minute, so parallel panels would
// just trip it together. Queued calls wait their turn instead of failing.
let groqQueue: Promise<unknown> = Promise.resolve();

function callGroq<T>(call: StructuredCall): Promise<T> {
  const run = groqQueue.then(() => callGroqNow<T>(call));
  groqQueue = run.catch(() => undefined);
  return run;
}

async function callGroqNow<T>({ system, user, schema, effort, maxTokens }: StructuredCall): Promise<T> {
  // Groq's free tier counts hidden reasoning tokens against the same 8,000 tokens/minute as
  // everything else, so reasoning stays low and answers are capped unless overridden.
  const request = JSON.stringify({
    model: activeModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // Strict mode: constrained decoding against our schema (every property required,
    // additionalProperties:false — which all feature schemas already follow).
    response_format: { type: "json_schema", json_schema: { name: "sakshilog_output", strict: true, schema } },
    reasoning_effort: process.env.GROQ_REASONING_EFFORT || (effort === "high" ? "low" : effort),
    max_completion_tokens: maxTokens ?? Number(process.env.GROQ_MAX_COMPLETION_TOKENS || 3000),
  });

  for (let attempt = 0; ; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: request,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new AiModelError(`Groq API unreachable: ${(err as Error).message}`);
    }
    const delay = attempt < 2 ? groqRetryDelaySeconds(resp.status, resp.headers.get("retry-after")) : null;
    if (delay !== null) {
      await new Promise((r) => setTimeout(r, delay * 1000 + 250));
      continue;
    }
    const body = (await resp.json().catch(() => null)) as GroqResponseBody | null;
    return groqResult<T>(resp.status, body);
  }
}

// ---------------------------------------------------------------- incident report

const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "One factual sentence about the incident." },
          citedEntries: {
            type: "array",
            items: { type: "integer" },
            description: "Log entry seq numbers this sentence is based on. Required, non-empty.",
          },
        },
        required: ["text", "citedEntries"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
};

export async function callInvestigatorModel(systemPrompt: string, userPrompt: string): Promise<RawClaim[]> {
  const out = await callStructured<{ claims?: unknown }>({
    system: systemPrompt,
    user: userPrompt,
    schema: CLAIMS_SCHEMA,
    effort: "high",
  });
  return Array.isArray(out.claims) ? (out.claims as RawClaim[]) : [];
}
