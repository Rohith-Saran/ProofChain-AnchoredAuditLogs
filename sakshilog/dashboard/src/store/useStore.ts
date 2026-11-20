import { create } from "zustand";
import type { LogEntry, Batch, VerificationResult, ConnectionStatus, SystemStatus, AttackMetadata } from "../types";
import { apiClient, isMockMode, setMockMode } from "../api/client";
import { realtime } from "../api/socket";
import { MOCK_LOGS, MOCK_BATCHES, MOCK_VERIFICATION, ATTACKS } from "../mock/data";

interface AppState {
  logs: LogEntry[];
  batches: Batch[];
  verification: VerificationResult | null;
  systemStatus: SystemStatus | null;
  connectionStatus: ConnectionStatus;
  isAnchorSilent: boolean;
  isDemoMode: boolean;
  selectedAttack: AttackMetadata;
  currentStepIndex: number;
  selectedLogSeq: number | null;
  selectedBatchId: number | null;
  isVerifying: boolean;
  attackInProgress: number | null;

  // Actions
  init: () => void;
  setDemoMode: (enabled: boolean) => void;
  toggleDemoMode: () => void;
  toggleMockMode: () => void;
  setSelectedAttack: (attack: AttackMetadata) => void;
  setStepIndex: (index: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setSelectedLogSeq: (seq: number | null) => void;
  setSelectedBatchId: (id: number | null) => void;
  fetchLogs: () => Promise<void>;
  fetchBatches: () => Promise<void>;
  runVerification: () => Promise<void>;
  resetDemo: () => Promise<void>;
  executeAttackLive: (attackId: number) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  logs: [...MOCK_LOGS].reverse(),
  batches: MOCK_BATCHES,
  verification: MOCK_VERIFICATION,
  systemStatus: null,
  connectionStatus: isMockMode() ? "mock" : "connected",
  isAnchorSilent: false,
  isDemoMode: window.location.hash.includes("demo=1") || window.location.search.includes("demo=1"),
  selectedAttack: ATTACKS[5], // Attack 6 default (Hero screen)
  currentStepIndex: 0,
  selectedLogSeq: null,
  selectedBatchId: null,
  isVerifying: false,
  attackInProgress: null,

  init: () => {
    // Listen to realtime socket
    realtime.onStatusChange((status) => {
      set({ connectionStatus: status });
    });

    realtime.onLog((newLog) => {
      set((state) => {
        // Prepend new log, cap at 200
        const updated = [newLog, ...state.logs.filter((l) => l.seq !== newLog.seq)].slice(0, 200);
        return { logs: updated };
      });
    });

    realtime.onBatch((newBatch) => {
      set((state) => {
        const updated = [newBatch, ...state.batches.filter((b) => b.batchId !== newBatch.batchId)];
        return { batches: updated };
      });
    });

    realtime.onVerdict((verif) => {
      set({ verification: verif });
    });

    realtime.onSilence((silent) => {
      set({ isAnchorSilent: silent });
    });

    // Initial fetch
    get().fetchLogs();
    get().fetchBatches();
    get().runVerification();

    apiClient.getSystemStatus().then((status) => {
      set({ systemStatus: status });
    });
  },

  setDemoMode: (enabled: boolean) => {
    set({ isDemoMode: enabled });
    if (enabled) {
      document.body.classList.add("demo-mode");
    } else {
      document.body.classList.remove("demo-mode");
    }
  },

  toggleDemoMode: () => {
    const next = !get().isDemoMode;
    get().setDemoMode(next);
  },

  toggleMockMode: () => {
    const nextMock = !isMockMode();
    setMockMode(nextMock);
    set({ connectionStatus: nextMock ? "mock" : "connected" });
    if (nextMock) {
      realtime.startMockSimulation();
    }
  },

  setSelectedAttack: (attack: AttackMetadata) => {
    set({ selectedAttack: attack, currentStepIndex: 0 });
  },

  setStepIndex: (index: number) => {
    const maxSteps = get().selectedAttack.steps.length;
    if (index >= 0 && index < maxSteps) {
      set({ currentStepIndex: index });
    }
  },

  nextStep: () => {
    const { currentStepIndex, selectedAttack } = get();
    if (currentStepIndex < selectedAttack.steps.length - 1) {
      set({ currentStepIndex: currentStepIndex + 1 });
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex > 0) {
      set({ currentStepIndex: currentStepIndex - 1 });
    }
  },

  setSelectedLogSeq: (seq: number | null) => {
    set({ selectedLogSeq: seq });
  },

  setSelectedBatchId: (id: number | null) => {
    set({ selectedBatchId: id });
  },

  fetchLogs: async () => {
    try {
      const data = await apiClient.getLogs(100, 0);
      if (data && data.logs) {
        set({ logs: [...data.logs].reverse() });
      }
    } catch {
      // Fallback in client
    }
  },

  fetchBatches: async () => {
    try {
      const data = await apiClient.getBatches();
      if (data && data.batches) {
        set({ batches: data.batches });
      }
    } catch {
      // Fallback
    }
  },

  runVerification: async () => {
    set({ isVerifying: true });
    try {
      const result = await apiClient.getVerification();
      set({
        verification: result,
        isAnchorSilent: result?.silence?.silent || false,
        isVerifying: false
      });
    } catch {
      set({ isVerifying: false });
    }
  },

  resetDemo: async () => {
    await apiClient.resetDemo();
    set({
      logs: [...MOCK_LOGS].reverse(),
      batches: MOCK_BATCHES,
      verification: MOCK_VERIFICATION,
      isAnchorSilent: false,
      currentStepIndex: 0
    });
  },

  executeAttackLive: async (attackId: number) => {
    set({ attackInProgress: attackId });
    try {
      // Small simulated latency for visible progress
      await new Promise((r) => setTimeout(r, 600));

      if (attackId === 6) {
        // Tamper state
        set((state) => {
          const tamperedLogs = state.logs.filter((l) => l.seq !== 103).map((l) => {
            if (l.seq > 103) {
              return { ...l, prevHash: "0xrecomputed" + l.seq, hash: "0xhash" + l.seq };
            }
            return l;
          });
          return { logs: tamperedLogs };
        });
      }

      await get().runVerification();
    } finally {
      set({ attackInProgress: null });
    }
  }
}));
