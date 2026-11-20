/**
 * Fetches the verifier's live verdicts (GET /api/verify) and reshapes them into the
 * investigator's input — the only data the LLM ever sees. Entries without verdict "OK"
 * (MODIFIED/DELETED/INSERTED/REORDERED/TRUNCATED/UNANCHORED_WINDOW) are never put in
 * verifiedEntries, so even if the model ignores every instruction, there's nothing with
 * their seq number in the "safe to cite" list for the citation checks to approve.
 */
import type { InvestigatorInput } from "./investigator.ts";

interface RawLogEntry {
  ts: number;
  host?: string;
  source: string;
  level: string;
  message: string;
}

interface RawEntryVerdict {
  seq: number;
  verdict: string;
  detail: string;
  local: RawLogEntry | null;
  collector?: RawLogEntry | null;
}

interface RawVerificationResult {
  generatedAt?: number;
  entries: RawEntryVerdict[];
  silence: { triggered: boolean; secondsSinceLastAnchor: number | null };
  summary: { total: number; tamperedCount: number; ok: boolean };
}

export class VerifierUnreachableError extends Error {
  readonly code = "verifier_unreachable";
}

export interface EvidenceContext extends InvestigatorInput {
  verifiedSeqs: Set<number>;
  flaggedSeqs: Set<number>;
  /** When the verifier produced these verdicts (ms). */
  generatedAt: number;
  /** Newest entries not anchored yet: not tampering, and their content isn't verified. */
  unanchoredCount: number;
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Cap on verified entries sent to the model, so the prompt can't grow without bound. */
  maxVerified?: number;
  maxFlagged?: number;
  /** Verified entries this close to a flagged seq are always kept, for context. */
  neighborhood?: number;
}

/**
 * Keeps every verified entry near a flagged one (the interesting part of the log), then
 * fills the rest of the budget with the most recent verified entries. Pure, for testing.
 */
export function boundEntries<V extends { seq: number }, F extends { seq: number }>(
  verified: V[],
  flagged: F[],
  { maxVerified = 300, maxFlagged = 200, neighborhood = 10 }: FetchOptions = {}
): { verified: V[]; flagged: F[] } {
  const keptFlagged = flagged.length > maxFlagged ? flagged.slice(-maxFlagged) : flagged;
  if (verified.length <= maxVerified) return { verified, flagged: keptFlagged };

  const flaggedSeqs = keptFlagged.map((f) => f.seq);
  const near = (seq: number) => flaggedSeqs.some((f) => Math.abs(f - seq) <= neighborhood);

  const chosen = new Set<number>();
  for (const v of verified) {
    if (chosen.size >= maxVerified) break;
    if (near(v.seq)) chosen.add(v.seq);
  }
  for (let i = verified.length - 1; i >= 0 && chosen.size < maxVerified; i--) {
    chosen.add(verified[i].seq);
  }
  return { verified: verified.filter((v) => chosen.has(v.seq)), flagged: keptFlagged };
}

export async function fetchEvidenceContext(verifierUrl: string, opts: FetchOptions = {}): Promise<EvidenceContext> {
  const { timeoutMs = 5000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result: RawVerificationResult;
  try {
    const resp = await fetch(`${verifierUrl.replace(/\/$/, "")}/api/verify`, { signal: controller.signal });
    if (!resp.ok) throw new VerifierUnreachableError(`verifier HTTP ${resp.status}`);
    result = (await resp.json()) as RawVerificationResult;
  } catch (err) {
    if (err instanceof VerifierUnreachableError) throw err;
    throw new VerifierUnreachableError(`verifier unreachable at ${verifierUrl}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const verifiedAll: InvestigatorInput["verifiedEntries"] = [];
  const flaggedAll: InvestigatorInput["flaggedEntries"] = [];
  let unanchoredCount = 0;

  for (const e of result.entries ?? []) {
    if (e.verdict === "UNANCHORED_WINDOW") {
      unanchoredCount++;
      continue;
    }
    if (e.verdict === "OK" && e.local) {
      verifiedAll.push({
        seq: e.seq,
        ts: e.local.ts,
        host: e.local.host,
        source: e.local.source,
        level: e.local.level,
        message: e.local.message,
      });
    } else if (e.verdict !== "OK") {
      flaggedAll.push({ seq: e.seq, verdict: e.verdict, detail: e.detail, ts: (e.collector ?? e.local)?.ts });
    }
  }

  const { verified, flagged } = boundEntries(verifiedAll, flaggedAll, opts);

  return {
    verifiedEntries: verified,
    flaggedEntries: flagged,
    verifiedSeqs: new Set(verified.map((v) => v.seq)),
    flaggedSeqs: new Set(flagged.map((f) => f.seq)),
    generatedAt: result.generatedAt ?? Date.now(),
    unanchoredCount,
    silence: result.silence ?? { triggered: false, secondsSinceLastAnchor: null },
    summary: result.summary ?? {
      total: verifiedAll.length + flaggedAll.length,
      tamperedCount: flaggedAll.length,
      ok: flaggedAll.length === 0,
    },
  };
}

/** Kept for the incident report pipeline. */
export async function fetchInvestigatorInput(verifierUrl: string, timeoutMs = 5000): Promise<InvestigatorInput> {
  return fetchEvidenceContext(verifierUrl, { timeoutMs });
}
