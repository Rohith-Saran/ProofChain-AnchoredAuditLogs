/**
 * Fetches the verifier's live verdicts (GET /api/verify) and reshapes them into the
 * investigator's input — the only data the LLM ever sees. Entries without verdict "OK"
 * (MODIFIED/DELETED/INSERTED/REORDERED/TRUNCATED/UNANCHORED_WINDOW) are never put in
 * verifiedEntries, so even if the model ignores every instruction, there's nothing with
 * their seq number in the "safe to cite" list for checkCitations() to approve.
 */
import type { InvestigatorInput } from "./investigator.ts";

interface RawEntryVerdict {
  seq: number;
  verdict: string;
  detail: string;
  local: { ts: number; source: string; level: string; message: string } | null;
}

interface RawVerificationResult {
  entries: RawEntryVerdict[];
  silence: { triggered: boolean; secondsSinceLastAnchor: number | null };
  summary: { total: number; tamperedCount: number; ok: boolean };
}

export async function fetchInvestigatorInput(verifierUrl: string, timeoutMs = 5000): Promise<InvestigatorInput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result: RawVerificationResult;
  try {
    const resp = await fetch(`${verifierUrl.replace(/\/$/, "")}/api/verify`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`verifier HTTP ${resp.status}`);
    result = (await resp.json()) as RawVerificationResult;
  } finally {
    clearTimeout(timer);
  }

  const verifiedEntries: InvestigatorInput["verifiedEntries"] = [];
  const flaggedEntries: InvestigatorInput["flaggedEntries"] = [];

  for (const e of result.entries ?? []) {
    if (e.verdict === "OK" && e.local) {
      verifiedEntries.push({ seq: e.seq, ts: e.local.ts, source: e.local.source, level: e.local.level, message: e.local.message });
    } else if (e.verdict !== "OK") {
      flaggedEntries.push({ seq: e.seq, verdict: e.verdict, detail: e.detail });
    }
  }

  return {
    verifiedEntries,
    flaggedEntries,
    silence: result.silence ?? { triggered: false, secondsSinceLastAnchor: null },
    summary: result.summary ?? { total: verifiedEntries.length + flaggedEntries.length, tamperedCount: flaggedEntries.length, ok: flaggedEntries.length === 0 },
  };
}
