/**
 * Shared type for the AI incident investigator's output (M4, Phase 4a — see
 * implementation/SakshiLog_16hr_Implementation_Plan.pdf, section 3 "New for AI features").
 * Lives here, not in exportPack.ts, so both the AI investigator service and the evidence
 * pack exporter import the same shape instead of two hand-written copies drifting apart.
 *
 * The investigator itself (the LLM call + citation checker) is M4's build. This module
 * only defines the wire shape and a small client that fetches a report if that service is
 * configured and reachable — never fabricates one. A missing report is null, visibly, not
 * silently-fake data.
 */

export interface AiIncidentClaim {
  text: string;
  /** Log entry seqs this sentence cites. The investigator's own citation checker is
   *  responsible for only emitting claims whose citedEntries are real, verified, untampered
   *  entries — a claim that failed that check belongs in blockedClaims, not here. */
  citedEntries: number[];
}

export interface AiIncidentReport {
  claims: AiIncidentClaim[];
  /** Claims the citation checker rejected: cited an entry that was tampered with, was
   *  never verified, or doesn't exist. Kept (not discarded) so the report can show,
   *  live, exactly what got blocked and why. */
  blockedClaims: AiIncidentClaim[];
  generatedAt: number;
}

/**
 * Fetches a pre-generated incident report from the AI investigator service, if one is
 * configured (AI_INVESTIGATOR_URL) and responds within timeoutMs. Returns null — never a
 * fabricated report — when the env var isn't set, the service is down, or it times out,
 * so callers always get a real, honestly-labelled value for this field.
 */
export async function fetchAiIncidentReport(timeoutMs = 2000): Promise<AiIncidentReport | null> {
  const url = process.env.AI_INVESTIGATOR_URL;
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${url.replace(/\/$/, "")}/api/incident-report`, { signal: controller.signal });
    if (!resp.ok) return null;
    return (await resp.json()) as AiIncidentReport;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
