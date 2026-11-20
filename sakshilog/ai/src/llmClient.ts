/**
 * The one place the AI service talks to the Anthropic API. Every feature asks for JSON
 * matching a schema (structured outputs), so nothing downstream ever parses free text.
 * The model's output is still treated as untrusted: the schema guarantees its shape, not
 * its honesty — each feature runs its own code-side checks afterwards.
 *
 * Forced tool_choice ({type:"tool"}) is not used: current models (Claude Opus 5.5 /
 * Sonnet 5.5) reject it with a 400. output_config.format replaces it.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { RawClaim } from "./investigator.ts";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

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

let client: Anthropic | null = null;

export function isModelConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  if (!isModelConfigured()) {
    throw new AiNotConfiguredError("ANTHROPIC_API_KEY not set — AI features are not configured");
  }
  if (!client) client = new Anthropic();
  return client;
}

export interface StructuredCall {
  system: string;
  user: string;
  /** JSON schema for the reply; must set additionalProperties:false and required. */
  schema: Record<string, unknown>;
  effort: Effort;
  maxTokens?: number;
}

export async function callStructured<T>({ system, user, schema, effort, maxTokens = 16000 }: StructuredCall): Promise<T> {
  const anthropic = getClient();

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      // On a policy decline the API re-runs the request on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { format: { type: "json_schema", schema }, effort },
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AiNotConfiguredError(`Anthropic API rejected the credentials: ${err.message}`);
    }
    if (err instanceof Anthropic.APIError) {
      throw new AiModelError(`Anthropic API error ${err.status ?? ""}: ${err.message}`.trim());
    }
    throw new AiModelError(`Anthropic API unreachable: ${(err as Error).message}`);
  }

  if (response.stop_reason === "refusal") {
    throw new AiRefusalError("The model declined this request");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiTruncatedError("The model's reply was cut off before it finished");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiModelError("The model's reply was not valid JSON");
  }
}

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
