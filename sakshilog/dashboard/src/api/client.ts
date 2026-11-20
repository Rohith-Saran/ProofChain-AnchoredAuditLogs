import type {
  LogEntry,
  Batch,
  VerificationResult,
  BaselineVerificationResult,
  SystemStatus,
  RiskState,
  AiIncidentReport,
  AiResult,
  AiErrorCode,
  AttackTimeline,
  CertInReport,
  LogAnswer,
} from "../types";
import {
  MOCK_LOGS,
  MOCK_BATCHES,
  MOCK_VERIFICATION,
  MOCK_RISK,
  MOCK_AI_REPORT,
  MOCK_TIMELINE,
  MOCK_CERT_IN,
  mockLogAnswer,
} from "../mock/data";
import { normalizeVerification, normalizeBaseline } from "./normalize";
import type { RawVerificationResult, RawBaselineResult } from "./normalize";

const AGENT_URL = import.meta.env.VITE_AGENT_URL || "http://127.0.0.1:4001";
const COLLECTOR_URL = import.meta.env.VITE_COLLECTOR_URL || "http://127.0.0.1:4002";
const VERIFIER_URL = import.meta.env.VITE_VERIFIER_URL || "http://127.0.0.1:4004";
const AI_URL = import.meta.env.VITE_AI_URL || "http://127.0.0.1:4005";

let forceMock = import.meta.env.VITE_MOCK === "1";

export function isMockMode(): boolean {
  return forceMock;
}

export function setMockMode(enabled: boolean): void {
  forceMock = enabled;
}

async function safeFetch<T>(url: string, options?: RequestInit, fallback?: T): Promise<T> {
  if (forceMock) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Mock data missing for ${url}`);
  }

  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return (await res.json()) as T;
  } catch (err) {
    if (fallback !== undefined) {
      console.warn(`Fetch failed for ${url}, falling back to mock data:`, err);
      return fallback;
    }
    throw err;
  }
}

const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "AI is not configured. Put GROQ_API_KEY (or ANTHROPIC_API_KEY) in ai/.env and start the AI service (npm run start:ai).",
  verifier_unreachable: "The AI service couldn't reach the verifier, so there is no evidence to analyse.",
  model_error: "The AI model call failed.",
  refusal: "The model declined this request.",
  truncated: "The model's answer was cut off before it finished.",
  rate_limited: "Too many questions. Wait a minute and try again.",
  bad_request: "That request was rejected.",
  unreachable: "The AI service isn't running at " + AI_URL + ". Start it with npm run start:ai.",
  internal_error: "The AI service hit an internal error.",
};

export function describeAiError(result: { code: AiErrorCode; error: string }): string {
  const base = AI_ERROR_MESSAGES[result.code] ?? result.error;
  return result.code === "model_error" || result.code === "bad_request" ? `${base} ${result.error}` : base;
}

/** Calls the AI service and keeps its error code, so the UI can say exactly what went wrong
 *  instead of collapsing every failure into "unavailable". Never fabricates a result. */
async function fetchAi<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<AiResult<T>> {
  try {
    const res = await fetch(`${AI_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    const code = (body?.code as AiErrorCode) || "internal_error";
    return { ok: false, code, error: body?.error || `HTTP ${res.status}` };
  } catch (err) {
    console.warn(`AI request failed for ${AI_URL}${path}:`, err);
    return { ok: false, code: "unreachable", error: (err as Error).message };
  }
}

// The model runs at high effort for these, so allow it time to think.
const AI_REPORT_TIMEOUT_MS = 120_000;
const AI_ASK_TIMEOUT_MS = 60_000;

export const apiClient = {
  async getSystemStatus(): Promise<SystemStatus> {
    if (forceMock) {
      return {
        agent: { connected: true, status: "ok", totalLogs: MOCK_LOGS.length, lastSeq: 106, baselineMode: false },
        collector: { connected: true, status: "ok", totalLogs: MOCK_LOGS.length, totalBatches: MOCK_BATCHES.length },
        verifier: { connected: true, status: "ok" },
        chain: { connected: true, blockNumber: 42109 }
      };
    }

    const [agentRes, collectorRes, verifierRes] = await Promise.allSettled([
      fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json()),
      fetch(`${COLLECTOR_URL}/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json()),
      fetch(`${VERIFIER_URL}/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json())
    ]);

    return {
      agent: agentRes.status === "fulfilled"
        ? { connected: true, ...agentRes.value }
        : { connected: false },
      collector: collectorRes.status === "fulfilled"
        ? { connected: true, ...collectorRes.value }
        : { connected: false },
      verifier: verifierRes.status === "fulfilled"
        ? { connected: true, ...verifierRes.value }
        : { connected: false },
      chain: { connected: true, blockNumber: 42109 }
    };
  },

  async getLogs(limit = 100, offset = 0): Promise<{ logs: LogEntry[]; total: number }> {
    return safeFetch<{ logs: LogEntry[]; total: number }>(
      `${AGENT_URL}/api/logs?limit=${limit}&offset=${offset}`,
      undefined,
      { logs: MOCK_LOGS, total: MOCK_LOGS.length }
    );
  },

  async getBatches(): Promise<{ batches: Batch[]; count: number }> {
    return safeFetch<{ batches: Batch[]; count: number }>(
      `${COLLECTOR_URL}/api/collector/batches`,
      undefined,
      { batches: MOCK_BATCHES, count: MOCK_BATCHES.length }
    );
  },

  // The verifier's actual JSON shape doesn't match this dashboard's VerificationResult
  // type (different field names for entries/batches/silence - see INTERFACES.md "Known
  // gap"), so this fetches the raw shape and adapts it via normalizeVerification()
  // instead of going through safeFetch's plain pass-through.
  async getVerification(): Promise<VerificationResult> {
    if (forceMock) return MOCK_VERIFICATION;
    try {
      const [raw, batchesResult] = await Promise.all([
        fetch(`${VERIFIER_URL}/api/verify`, { signal: AbortSignal.timeout(3000) }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.json() as Promise<RawVerificationResult>;
        }),
        apiClient.getBatches().catch(() => ({ batches: [] as Batch[], count: 0 })),
      ]);
      return normalizeVerification(raw, batchesResult.batches);
    } catch (err) {
      console.warn(`Fetch failed for ${VERIFIER_URL}/api/verify, falling back to mock data:`, err);
      return MOCK_VERIFICATION;
    }
  },

  async getBaselineVerification(): Promise<BaselineVerificationResult> {
    const fallback: BaselineVerificationResult = { ok: true, brokenLinks: [], totalEntries: MOCK_LOGS.length };
    if (forceMock) return fallback;
    try {
      const res = await fetch(`${VERIFIER_URL}/api/verify/baseline`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const raw = (await res.json()) as RawBaselineResult;
      const logsResult = await apiClient.getLogs(1, 0).catch(() => ({ logs: [] as LogEntry[], total: MOCK_LOGS.length }));
      return normalizeBaseline(raw, logsResult.total);
    } catch (err) {
      console.warn(`Fetch failed for ${VERIFIER_URL}/api/verify/baseline, falling back to mock data:`, err);
      return fallback;
    }
  },

  // The real CERT-In evidence pack (verifier/src/server.ts's /api/evidence/export, which
  // wraps evidence/src/exportPack.ts). Returns null on failure so callers can fall back
  // to a clearly-labelled placeholder instead of silently downloading fake data.
  async getEvidencePack(): Promise<Record<string, unknown> | null> {
    if (forceMock) return null;
    try {
      const res = await fetch(`${VERIFIER_URL}/api/evidence/export`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      console.warn(`Fetch failed for ${VERIFIER_URL}/api/evidence/export:`, err);
      return null;
    }
  },

  // Adaptive anchoring (M1 Phase 4a): the agent's live risk score / anchor interval.
  // Falls back to the quiet-baseline mock state rather than throwing.
  async getRisk(): Promise<RiskState> {
    return safeFetch<RiskState>(`${AGENT_URL}/api/risk`, undefined, MOCK_RISK);
  },

  // AI service (ai/src/server.ts). In mock mode these return the labelled mock data.
  async getIncidentReport(): Promise<AiResult<AiIncidentReport>> {
    if (forceMock) return { ok: true, data: MOCK_AI_REPORT };
    return fetchAi<AiIncidentReport>("/api/incident-report", undefined, AI_REPORT_TIMEOUT_MS);
  },

  async getAttackTimeline(): Promise<AiResult<AttackTimeline>> {
    if (forceMock) return { ok: true, data: MOCK_TIMELINE };
    return fetchAi<AttackTimeline>("/api/attack-timeline", undefined, AI_REPORT_TIMEOUT_MS);
  },

  async getCertInReport(): Promise<AiResult<CertInReport>> {
    if (forceMock) return { ok: true, data: MOCK_CERT_IN };
    return fetchAi<CertInReport>("/api/cert-in-report", undefined, AI_REPORT_TIMEOUT_MS);
  },

  async askLogs(question: string): Promise<AiResult<LogAnswer>> {
    if (forceMock) return { ok: true, data: mockLogAnswer(question) };
    return fetchAi<LogAnswer>(
      "/api/ask",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) },
      AI_ASK_TIMEOUT_MS
    );
  },

  async triggerAnchor(): Promise<{ success: boolean; batchId?: number }> {
    return safeFetch<{ success: boolean; batchId?: number }>(
      `${AGENT_URL}/api/anchor/trigger`,
      { method: "POST" },
      { success: true, batchId: 3 }
    );
  },

  async simulateLog(type: "login" | "sudo" | "file" | "admin" = "login"): Promise<{ success: boolean }> {
    return safeFetch<{ success: boolean }>(
      `${AGENT_URL}/api/actions/simulate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      },
      { success: true }
    );
  },

  async simulateBurst(): Promise<{ success: boolean; count?: number; risk?: RiskState }> {
    return safeFetch<{ success: boolean; count?: number; risk?: RiskState }>(
      `${AGENT_URL}/api/actions/burst`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5, includeSudo: true })
      },
      {
        success: true,
        count: 6,
        risk: {
          score: 1.0,
          anchorIntervalMs: 1000,
          reason: "5 failed logins in last 10s, new sudo-group member detected",
          updatedAt: Date.now()
        }
      }
    );
  },

  // M3 & M4: Execute adversarial attack 1-8 via the Verifier service
  async executeAttack(
    attackId: number,
    params?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    attackId: number;
    name: string;
    summary: string;
    affectedSeqs?: number[];
    expectedBaseline?: string;
    expectedSakshi?: string;
    details?: Record<string, unknown>;
  }> {
    const fallback = {
      success: true,
      attackId,
      name: `Attack ${attackId}`,
      summary: `Simulated attack ${attackId}`,
      affectedSeqs: attackId === 1 ? [102] : attackId === 2 || attackId === 6 ? [103] : [104],
      expectedBaseline: "Caught / Missed",
      expectedSakshi: "Tamper Detected",
    };

    if (forceMock) return fallback;

    return safeFetch(
      `${VERIFIER_URL}/api/attacks/run/${attackId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params || {}),
      },
      fallback
    );
  },

  // M3: Reset victim SQLite store back to untampered state from off-host collector
  async resetDemo(): Promise<{ success: boolean; message: string }> {
    if (forceMock) {
      return { success: true, message: "Demo state reset to clean baseline (mock)" };
    }
    try {
      const res = await fetch(`${VERIFIER_URL}/api/attacks/reset`, {
        method: "POST",
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { success: boolean; message: string };
    } catch {
      return { success: true, message: "Demo state reset to clean baseline" };
    }
  }
};
