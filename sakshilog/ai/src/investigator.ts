/**
 * AI incident investigator core (M4, Phase 4a): pure functions only, no network calls, so
 * M3's citation-checker test (test-investigator.ts) and the HTTP server (server.ts) share
 * the exact same logic. The server fetches the verifier's live verdicts, builds the prompt
 * here, sends it to the LLM (llmClient.ts), then runs the model's raw claims back through
 * checkCitations() before anything reaches a caller.
 */
import type { AiIncidentClaim, AiIncidentReport } from "../../evidence/src/aiReport.ts";

export interface VerifiedEntryContext {
  seq: number;
  ts: number;
  host?: string;
  source: string;
  level: string;
  message: string;
}

export interface FlaggedEntryContext {
  seq: number;
  verdict: string;
  /** The verifier's own diagnosis — never attacker-written log text. */
  detail: string;
  /** Timestamp of the off-host collector copy (or the local row if there is none). */
  ts?: number;
}

export interface InvestigatorInput {
  /** Entries the verifier confirmed as OK — the only ones a claim may cite. */
  verifiedEntries: VerifiedEntryContext[];
  /** Entries the verifier flagged (MODIFIED/DELETED/INSERTED/REORDERED/TRUNCATED/
   *  UNANCHORED_WINDOW) — given as context so the model can describe the incident, but
   *  citing any of these numbers gets the whole claim blocked. */
  flaggedEntries: FlaggedEntryContext[];
  silence: { triggered: boolean; secondsSinceLastAnchor: number | null };
  summary: { total: number; tamperedCount: number; ok: boolean };
}

/** What the model returns before the citation checker has looked at it. */
export interface RawClaim {
  text: string;
  citedEntries: number[];
}

export const SYSTEM_PROMPT = `You are SakshiLog's incident investigator. You write short, factual
CERT-In-style incident report claims from a security log audit. Rules, no exceptions:
1. Every claim must cite the seq numbers of the log entries it is based on, in citedEntries.
2. A claim with no citedEntries will be discarded — never state something without a citation.
3. Only state what the given entries actually say. Do not speculate, infer motive, or
   invent detail beyond what is written in the message text or verdict you were given.
4. You may describe flagged/tampered entries (what the verifier found wrong with them) and
   cite their seq numbers when doing so — a separate citation checker, not you, decides
   whether that citation is trustworthy enough to keep. Write what you believe is true; do
   not pre-censor yourself.
5. Keep each claim to one sentence. Produce 3 to 8 claims covering: what happened, when,
   which accounts/hosts were involved, and what the verifier flagged as tampered or silent.`;

export function buildPrompt(input: InvestigatorInput): string {
  const verifiedLines = input.verifiedEntries
    .map((e) => `  [seq ${e.seq}] ${new Date(e.ts).toISOString()} ${e.host ? `${e.host} ` : ""}${e.source}/${e.level}: ${e.message}`)
    .join("\n");

  const flaggedLines = input.flaggedEntries.length > 0
    ? input.flaggedEntries
        .map((e) => `  [seq ${e.seq}] verdict=${e.verdict}: ${e.detail}`)
        .join("\n")
    : "  (none)";

  const silenceLine = input.silence.triggered
    ? `ANCHOR_SILENCE is currently triggered (${input.silence.secondsSinceLastAnchor ?? "?"}s since the last anchor) — the agent may be down or killed.`
    : "No silence alert is active.";

  return `Verified log entries (verdict OK — safe to cite as fact):
${verifiedLines || "  (none)"}

Flagged entries (the verifier found a problem with these — you may describe and cite them,
but any claim citing one of these seqs will be held back by the citation checker):
${flaggedLines}

Silence status: ${silenceLine}

Summary: ${input.summary.total} entries audited, ${input.summary.tamperedCount} flagged as tampered, overall ok=${input.summary.ok}.

Write the incident report claims now.`;
}

/**
 * The citation checker (M3's Phase 4b test target): keeps a claim only if every seq it
 * cites is one the verifier confirmed as verified (OK). A claim citing a tampered,
 * unverified, or nonexistent entry is rejected whole — partial trust isn't trust, so one
 * bad citation blocks the entire sentence, not just the bad number.
 */
export function checkCitations(
  rawClaims: RawClaim[],
  verifiedSeqs: ReadonlySet<number>
): { claims: AiIncidentClaim[]; blockedClaims: AiIncidentClaim[] } {
  const claims: AiIncidentClaim[] = [];
  const blockedClaims: AiIncidentClaim[] = [];

  for (const raw of rawClaims ?? []) {
    const text = String(raw?.text ?? "").trim();
    const cited = Array.isArray(raw?.citedEntries)
      ? raw.citedEntries.map(Number).filter((n) => Number.isFinite(n))
      : [];

    // No text, or no citation at all: not a claim (rule 2 in the system prompt already
    // tells the model to never emit these, but don't trust that alone).
    if (!text || cited.length === 0) continue;

    const claim: AiIncidentClaim = { text, citedEntries: cited };
    const allVerified = cited.every((seq) => verifiedSeqs.has(seq));
    if (allVerified) claims.push(claim);
    else blockedClaims.push(claim);
  }

  return { claims, blockedClaims };
}

export function toIncidentReport(
  rawClaims: RawClaim[],
  verifiedSeqs: ReadonlySet<number>,
  generatedAt = Date.now()
): AiIncidentReport {
  const { claims, blockedClaims } = checkCitations(rawClaims, verifiedSeqs);
  return { claims, blockedClaims, generatedAt };
}

/**
 * Synthesizes demonstration claims from real verifier context for live testing, rehearsals,
 * or offline presentation mode: generates truthful claims from verified entries, plus one
 * deliberately unverified/tampered claim (citing a flagged or nonexistent seq) so the
 * citation checker's rejection can be visibly demonstrated live.
 */
export function generateDemoClaims(input: InvestigatorInput): RawClaim[] {
  const claims: RawClaim[] = [];

  // Generate 1-3 claims from real verified entries
  for (const v of input.verifiedEntries.slice(0, 3)) {
    claims.push({
      text: `Verified security event: ${v.source}/${v.level} - "${v.message.slice(0, 75)}"`,
      citedEntries: [v.seq],
    });
  }

  if (input.verifiedEntries.length >= 2) {
    claims.push({
      text: `Sequence of verified operations confirmed between seq ${input.verifiedEntries[0].seq} and ${input.verifiedEntries[1].seq}.`,
      citedEntries: [input.verifiedEntries[0].seq, input.verifiedEntries[1].seq],
    });
  }

  // Inject 1 ungrounded or tampered claim to demonstrate citation checker enforcement
  if (input.flaggedEntries.length > 0) {
    const flagged = input.flaggedEntries[0];
    claims.push({
      text: `Attacker action was recorded modifying the system state (${flagged.detail || "tampered"}).`,
      citedEntries: [flagged.seq],
    });
  } else {
    claims.push({
      text: `An undocumented administrative action was detected in unanchored memory.`,
      citedEntries: [99999], // nonexistent seq
    });
  }

  return claims;
}
