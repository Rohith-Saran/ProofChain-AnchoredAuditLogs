import type { LogEntry, Batch, VerificationResult, BaselineVerificationResult, SystemStatus } from "../types";
import { MOCK_LOGS, MOCK_BATCHES, MOCK_VERIFICATION } from "../mock/data";

const AGENT_URL = import.meta.env.VITE_AGENT_URL || "http://127.0.0.1:4001";
const COLLECTOR_URL = import.meta.env.VITE_COLLECTOR_URL || "http://127.0.0.1:4002";
const VERIFIER_URL = import.meta.env.VITE_VERIFIER_URL || "http://127.0.0.1:4004";

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

  async getVerification(): Promise<VerificationResult> {
    return safeFetch<VerificationResult>(
      `${VERIFIER_URL}/api/verify`,
      undefined,
      MOCK_VERIFICATION
    );
  },

  async getBaselineVerification(): Promise<BaselineVerificationResult> {
    return safeFetch<BaselineVerificationResult>(
      `${VERIFIER_URL}/api/verify/baseline`,
      undefined,
      { ok: true, brokenLinks: [], totalEntries: MOCK_LOGS.length }
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

  async resetDemo(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: "Demo state reset to clean baseline" };
  }
};
