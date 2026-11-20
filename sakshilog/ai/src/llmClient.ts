/**
 * Thin wrapper around the Anthropic API: one call, forced into a tool call so the model's
 * output is always structured JSON (claims + citedEntries), never free text we'd have to
 * parse and hope is valid. Everything downstream (investigator.ts's checkCitations) treats
 * the model's output as untrusted input regardless — this just guarantees it's shaped
 * right, not that it's honest.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { RawClaim } from "./investigator.ts";

const TOOL_NAME = "submit_incident_claims";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const CLAIMS_TOOL = {
  name: TOOL_NAME,
  description: "Submit the incident report as a list of claims, each citing the log entry seq numbers it is based on.",
  input_schema: {
    type: "object" as const,
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
        },
      },
    },
    required: ["claims"],
  },
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set — AI incident investigator is not configured");
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export async function callInvestigatorModel(systemPrompt: string, userPrompt: string): Promise<RawClaim[]> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1536,
    system: systemPrompt,
    tools: [CLAIMS_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME
  );
  if (!toolUse) {
    throw new Error("Model did not return a submit_incident_claims tool call");
  }

  const input = toolUse.input as { claims?: unknown };
  return Array.isArray(input.claims) ? (input.claims as RawClaim[]) : [];
}
