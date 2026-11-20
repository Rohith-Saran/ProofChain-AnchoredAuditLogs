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

/** Two kinds of citation used by the timeline, CERT-In report and Ask-the-Logs:
 *  citedEntries are verified (OK) log entries; citedFindings are entries the verifier
 *  flagged, cited for the fact that they were tampered with. */
export interface Cited {
  citedEntries: number[];
  citedFindings: number[];
}

export interface MitreTechnique {
  id: string;
  name: string;
  tactic: string;
  url: string;
}

export interface TimelineStep extends Cited {
  title: string;
  description: string;
  technique: MitreTechnique | null;
  /** Earliest timestamp among the cited entries/findings, computed in code. */
  firstTs: number | null;
  /** "verifier" when the step comes from the verifier itself (e.g. a silence alert). */
  source: "model" | "verifier";
}

export interface AttackTimeline {
  steps: TimelineStep[];
  blockedSteps: TimelineStep[];
  generatedAt: number;
}

export interface CitedValue extends Cited {
  value: string;
}

export interface CitedSentence extends Cited {
  text: string;
}

export interface CertInReport {
  incidentType: string;
  affectedHosts: CitedValue[];
  affectedAccounts: CitedValue[];
  indicators: CitedValue[];
  description: CitedSentence[];
  /** Everything the checker rejected, with the field it came from. */
  blocked: { field: string; text: string; citedEntries: number[]; citedFindings: number[] }[];
  occurredAt: number | null;
  detectedAt: number;
  /** detectedAt + 6 hours (CERT-In Directions No. 20(3)/2022-CERT-In). */
  reportingDeadline: number;
  tampering: { tamperedCount: number; silenceTriggered: boolean };
  reportTo: string;
  generatedAt: number;
}

/**
 * Fetches a result from the AI service, if one is configured (AI_INVESTIGATOR_URL) and
 * responds within timeoutMs. Returns null — never a fabricated result — when the env var
 * isn't set, the service is down or unconfigured, or it times out. The AI service caches
 * by evidence state, so a repeat export is fast; the first one waits for the model.
 */
async function fetchAiJson<T>(path: string, timeoutMs: number): Promise<T | null> {
  const url = process.env.AI_INVESTIGATOR_URL;
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${url.replace(/\/$/, "")}${path}`, { signal: controller.signal });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchAiIncidentReport(timeoutMs = 20_000): Promise<AiIncidentReport | null> {
  return fetchAiJson<AiIncidentReport>("/api/incident-report", timeoutMs);
}

export function fetchAiAttackTimeline(timeoutMs = 20_000): Promise<AttackTimeline | null> {
  return fetchAiJson<AttackTimeline>("/api/attack-timeline", timeoutMs);
}

export function fetchAiCertInReport(timeoutMs = 20_000): Promise<CertInReport | null> {
  return fetchAiJson<CertInReport>("/api/cert-in-report", timeoutMs);
}
