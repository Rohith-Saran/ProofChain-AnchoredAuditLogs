import { create } from "zustand";
import type { LogEntry, Batch, VerificationResult, ConnectionStatus, SystemStatus, AttackMetadata, Verdict } from "../types";
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
  lastAttackResult: {
    attackId: number;
    name: string;
    success: boolean;
    summary: string;
    affectedSeqs?: number[];
    expectedBaseline?: string;
    expectedSakshi?: string;
    details?: Record<string, unknown>;
  } | null;

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
  clearLastAttackResult: () => void;
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
  lastAttackResult: null,

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

  clearLastAttackResult: () => {
    set({ lastAttackResult: null });
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
      currentStepIndex: 0,
      selectedLogSeq: null,
      lastAttackResult: null,
    });
    // If live, re-fetch actual state from reset endpoints
    if (!isMockMode()) {
      await get().fetchLogs();
      await get().fetchBatches();
      await get().runVerification();
    }
  },

  executeAttackLive: async (attackId: number) => {
    set({ attackInProgress: attackId });
    try {
      // 1. Try real live execution against Verifier endpoint first
      let liveResult: any = null;
      let usedLive = false;

      if (!isMockMode()) {
        try {
          liveResult = await apiClient.executeAttack(attackId);
          if (liveResult && liveResult.success !== undefined) {
            usedLive = true;
            set({
              lastAttackResult: {
                attackId,
                name: liveResult.name || `Attack ${attackId}`,
                success: liveResult.success,
                summary: liveResult.summary,
                affectedSeqs: liveResult.affectedSeqs,
                expectedBaseline: liveResult.expectedBaseline,
                expectedSakshi: liveResult.expectedSakshi,
                details: liveResult.details,
              },
            });

            if (attackId === 7) {
              // Agent killed: immediately signal silence alert
              set({ isAnchorSilent: true });
            }

            // Sync with actual disk state
            await get().fetchLogs();
            await get().fetchBatches();
            await get().runVerification();

            if (liveResult.affectedSeqs?.length) {
              set({ selectedLogSeq: liveResult.affectedSeqs[0] });
            }
          }
        } catch {
          usedLive = false;
        }
      }

      // 2. If mock mode or live call degraded, execute precise mock simulation for each attack
      if (!usedLive) {
        await new Promise((r) => setTimeout(r, 450));

        const baseLogs = [...MOCK_LOGS];
        const def = ATTACKS.find((a) => a.id === attackId) || ATTACKS[5];

        switch (attackId) {
          case 1: {
            // Edit a line: IP modified on seq 102, hash left stale
            const tampered = baseLogs.map((l) =>
              l.seq === 102
                ? { ...l, message: "Accepted publickey for ubuntu from 6.6.6.6 port 52310 ssh2" }
                : l
            );
            const mockVerif: VerificationResult = {
              ...MOCK_VERIFICATION,
              ok: false,
              entries: tampered.map((l) => ({
                seq: l.seq,
                verdict: l.seq === 102 ? "MODIFIED" : "OK",
                reason:
                  l.seq === 102
                    ? 'Entry seq 102 stored hash does not match sha256 of its own content (attacker changed IP to 6.6.6.6)'
                    : "Matches batch 2",
                expectedHash: MOCK_LOGS.find((m) => m.seq === l.seq)?.hash,
                actualHash: l.hash,
                batchId: 2,
                entry: l,
                offHostEntry: MOCK_LOGS.find((m) => m.seq === l.seq),
              })),
              summary: {
                totalEntries: 6,
                tamperedEntries: 1,
                verdicts: { ...MOCK_VERIFICATION.summary.verdicts, OK: 5, MODIFIED: 1 },
              },
            };
            set({
              logs: [...tampered].reverse(),
              verification: mockVerif,
              selectedLogSeq: 102,
              lastAttackResult: {
                attackId: 1,
                name: def.name,
                success: true,
                summary: 'seq 102: "192.168.1.42" -> "6.6.6.6" (hash left stale in SQLite)',
                affectedSeqs: [102],
                expectedBaseline: "Caught",
                expectedSakshi: "MODIFIED",
              },
            });
            break;
          }

          case 2: {
            // Delete a line: sudo entry (seq 103) deleted outright
            const tampered = baseLogs.filter((l) => l.seq !== 103);
            const mockVerif: VerificationResult = {
              ...MOCK_VERIFICATION,
              ok: false,
              entries: [
                ...tampered.map((l) => ({
                  seq: l.seq,
                  verdict: (l.seq === 104 ? "MODIFIED" : "OK") as any,
                  reason:
                    l.seq === 104
                      ? "Entry seq 104 prevHash does not match seq 102's hash (broken chain link)"
                      : "Matches batch 2",
                  expectedHash: l.hash,
                  actualHash: l.hash,
                  batchId: 2,
                  entry: l,
                  offHostEntry: l,
                })),
                {
                  seq: 103,
                  verdict: "DELETED" as Verdict,
                  reason: 'Entry seq 103 is missing locally but present in off-host collector copy (message: "ubuntu : TTY=pts/0 ; COMMAND=/bin/bash")',
                  expectedHash: MOCK_LOGS.find((m) => m.seq === 103)?.hash,
                  actualHash: undefined,
                  batchId: 2,
                  entry: undefined,
                  offHostEntry: MOCK_LOGS.find((m) => m.seq === 103),
                },
              ].sort((a, b) => a.seq - b.seq),
              summary: {
                totalEntries: 6,
                tamperedEntries: 2,
                verdicts: { ...MOCK_VERIFICATION.summary.verdicts, OK: 4, DELETED: 1, MODIFIED: 1 },
              },
            };
            set({
              logs: [...tampered].reverse(),
              verification: mockVerif,
              selectedLogSeq: 103,
              lastAttackResult: {
                attackId: 2,
                name: def.name,
                success: true,
                summary: 'seq 103 deleted outright from SQLite: "ubuntu : TTY=pts/0 ... COMMAND=/bin/bash"',
                affectedSeqs: [103],
                expectedBaseline: "Caught",
                expectedSakshi: "DELETED",
              },
            });
            break;
          }

          case 3: {
            // Insert a fake line: injected seq 107
            const fakeLog: LogEntry = {
              seq: 107,
              ts: Date.now(),
              host: "victim-server",
              source: "usermod",
              level: "notice",
              message: "usermod: add 'attacker' to group 'sudo'",
              prevHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
              hash: "0xfa910248ca019284ca019284fa019284fa019284ca019284fe901248ca019284",
            };
            const tampered = [...baseLogs, fakeLog];
            const mockVerif: VerificationResult = {
              ...MOCK_VERIFICATION,
              ok: false,
              entries: [
                ...MOCK_VERIFICATION.entries,
                {
                  seq: 107,
                  verdict: "INSERTED",
                  reason: "Entry seq 107 exists locally but off-host collector never received it (injected line)",
                  expectedHash: undefined,
                  actualHash: fakeLog.hash,
                  batchId: undefined,
                  entry: fakeLog,
                  offHostEntry: undefined,
                },
              ],
              summary: {
                totalEntries: 7,
                tamperedEntries: 1,
                verdicts: { ...MOCK_VERIFICATION.summary.verdicts, OK: 6, INSERTED: 1 },
              },
            };
            set({
              logs: [...tampered].reverse(),
              verification: mockVerif,
              selectedLogSeq: 107,
              lastAttackResult: {
                attackId: 3,
                name: def.name,
                success: true,
                summary: 'seq 107 injected: "usermod: add \'attacker\' to group \'sudo\'"',
                affectedSeqs: [107],
                expectedBaseline: "Caught",
                expectedSakshi: "INSERTED",
              },
            });
            break;
          }

          case 4: {
            // Reorder lines: swap content of seq 104 and 105
            const row104 = baseLogs.find((l) => l.seq === 104)!;
            const row105 = baseLogs.find((l) => l.seq === 105)!;
            const tampered = baseLogs.map((l) => {
              if (l.seq === 104) return { ...l, message: row105.message, hash: row105.hash };
              if (l.seq === 105) return { ...l, message: row104.message, hash: row104.hash };
              return l;
            });
            const mockVerif: VerificationResult = {
              ...MOCK_VERIFICATION,
              ok: false,
              entries: tampered.map((l) => ({
                seq: l.seq,
                verdict: (l.seq === 104 || l.seq === 105 ? "REORDERED" : "OK") as any,
                reason:
                  l.seq === 104 || l.seq === 105
                    ? `Entry seq ${l.seq} carries content that collector recorded for swapped seq`
                    : "Matches batch 2",
                expectedHash: MOCK_LOGS.find((m) => m.seq === l.seq)?.hash,
                actualHash: l.hash,
                batchId: 2,
                entry: l,
                offHostEntry: MOCK_LOGS.find((m) => m.seq === l.seq),
              })),
              summary: {
                totalEntries: 6,
                tamperedEntries: 2,
                verdicts: { ...MOCK_VERIFICATION.summary.verdicts, OK: 4, REORDERED: 2 },
              },
            };
            set({
              logs: [...tampered].reverse(),
              verification: mockVerif,
              selectedLogSeq: 104,
              lastAttackResult: {
                attackId: 4,
                name: def.name,
                success: true,
                summary: "swapped content between seq 104 and seq 105 (chronology corrupted)",
                affectedSeqs: [104, 105],
                expectedBaseline: "Caught",
                expectedSakshi: "REORDERED",
              },
            });
            break;
          }

          case 5: {
            // Truncate tail: delete seq 105 and 106
            const tampered = baseLogs.filter((l) => l.seq < 105);
            const mockVerif: VerificationResult = {
              ...MOCK_VERIFICATION,
              ok: false,
              entries: [
                ...tampered.map((l) => ({
                  seq: l.seq,
                  verdict: "OK" as any,
                  reason: "Matches batch 2",
                  expectedHash: l.hash,
                  actualHash: l.hash,
                  batchId: 2,
                  entry: l,
                  offHostEntry: l,
                })),
                {
                  seq: 105,
                  verdict: "TRUNCATED" as Verdict,
                  reason: "Entry seq 105 is missing locally and local log never continues past seq 104 (tail truncated)",
                  expectedHash: MOCK_LOGS.find((m) => m.seq === 105)?.hash,
                  batchId: 2,
                  offHostEntry: MOCK_LOGS.find((m) => m.seq === 105),
                },
                {
                  seq: 106,
                  verdict: "TRUNCATED" as Verdict,
                  reason: "Entry seq 106 is missing locally (tail truncated)",
                  expectedHash: MOCK_LOGS.find((m) => m.seq === 106)?.hash,
                  batchId: 2,
                  offHostEntry: MOCK_LOGS.find((m) => m.seq === 106),
                },
              ].sort((a, b) => a.seq - b.seq),
              summary: {
                totalEntries: 6,
                tamperedEntries: 2,
                verdicts: { ...MOCK_VERIFICATION.summary.verdicts, OK: 4, TRUNCATED: 2 },
              },
            };
            set({
              logs: [...tampered].reverse(),
              verification: mockVerif,
              selectedLogSeq: 105,
              lastAttackResult: {
                attackId: 5,
                name: def.name,
                success: true,
                summary: "deleted the last 2 rows (seq >= 105) - plain hash chain misses this!",
                affectedSeqs: [105, 106],
                expectedBaseline: "Missed",
                expectedSakshi: "TRUNCATED",
              },
            });
            break;
          }

          case 6: {
            // Attack 6: delete sudo entry (seq 103) and recompute every hash after it!
            const tampered = baseLogs
              .filter((l) => l.seq !== 103)
              .map((l) => {
                if (l.seq > 103) {
                  return {
                    ...l,
                    prevHash: "0xrecomputed" + l.seq + "beef00000000000000000000000000000000000000000000",
                    hash: "0xhash" + l.seq + "c00100000000000000000000000000000000000000000000",
                  };
                }
                return l;
              });

            const mockVerif: VerificationResult = {
              ok: false,
              batches: [
                {
                  batchId: 2,
                  startSeq: 101,
                  endSeq: 106,
                  merkleRoot: MOCK_BATCHES[0].merkleRoot,
                  calculatedRoot: "0xbad_recomputed_merkle_root_9999999999999999999999999999999999999999",
                  rootMatches: false,
                  lastChainHash: MOCK_BATCHES[0].lastChainHash,
                  txHash: MOCK_BATCHES[0].txHash,
                  blockNumber: MOCK_BATCHES[0].blockNumber,
                  isHeartbeat: false,
                },
                MOCK_VERIFICATION.batches[0] || ({} as any),
              ],
              entries: [
                {
                  seq: 101,
                  verdict: "OK",
                  reason: "Matches batch 2",
                  expectedHash: MOCK_LOGS[0].hash,
                  actualHash: MOCK_LOGS[0].hash,
                  batchId: 2,
                  entry: tampered[0],
                  offHostEntry: MOCK_LOGS[0],
                },
                {
                  seq: 102,
                  verdict: "OK",
                  reason: "Matches batch 2",
                  expectedHash: MOCK_LOGS[1].hash,
                  actualHash: MOCK_LOGS[1].hash,
                  batchId: 2,
                  entry: tampered[1],
                  offHostEntry: MOCK_LOGS[1],
                },
                {
                  seq: 103,
                  verdict: "DELETED" as Verdict,
                  reason: 'Entry seq 103 is missing locally but present in off-host collector copy (message: "ubuntu : TTY=pts/0 ; COMMAND=/bin/bash")',
                  expectedHash: MOCK_LOGS[2].hash,
                  batchId: 2,
                  entry: undefined,
                  offHostEntry: MOCK_LOGS[2],
                },
                {
                  seq: 104,
                  verdict: "MODIFIED",
                  reason: "Batch covering seq 101..106 does not match its on-chain Merkle root (downstream re-chained)",
                  expectedHash: MOCK_LOGS[3].hash,
                  actualHash: tampered[2]?.hash,
                  batchId: 2,
                  entry: tampered[2],
                  offHostEntry: MOCK_LOGS[3],
                },
                {
                  seq: 105,
                  verdict: "MODIFIED",
                  reason: "Batch covering seq 101..106 does not match its on-chain Merkle root (downstream re-chained)",
                  expectedHash: MOCK_LOGS[4].hash,
                  actualHash: tampered[3]?.hash,
                  batchId: 2,
                  entry: tampered[3],
                  offHostEntry: MOCK_LOGS[4],
                },
                {
                  seq: 106,
                  verdict: "MODIFIED",
                  reason: "Batch covering seq 101..106 does not match its on-chain Merkle root (downstream re-chained)",
                  expectedHash: MOCK_LOGS[5].hash,
                  actualHash: tampered[4]?.hash,
                  batchId: 2,
                  entry: tampered[4],
                  offHostEntry: MOCK_LOGS[5],
                },
              ],
              silence: MOCK_VERIFICATION.silence,
              summary: {
                totalEntries: 6,
                tamperedEntries: 4,
                verdicts: { ...MOCK_VERIFICATION.summary.verdicts, OK: 2, DELETED: 1, MODIFIED: 3 },
              },
            };

            set({
              logs: [...tampered].reverse(),
              verification: mockVerif,
              selectedLogSeq: 103,
              lastAttackResult: {
                attackId: 6,
                name: def.name,
                success: true,
                summary: 'deleted seq 103 ("sudo bash") and re-chained every entry after it. Plain hash chain says ALL GOOD; SakshiLog catches via on-chain Merkle root mismatch!',
                affectedSeqs: [103, 104, 105, 106],
                expectedBaseline: "Missed",
                expectedSakshi: "Caught (root mismatch + DELETED)",
              },
            });
            break;
          }

          case 7: {
            // Kill agent -> ANCHOR_SILENCE
            const mockVerif: VerificationResult = {
              ...MOCK_VERIFICATION,
              ok: false,
              silence: {
                silent: true,
                lastAnchorTs: Date.now() - 14000,
                elapsedMs: 14000,
                intervalMs: 5000,
                thresholdMs: 10000,
              },
              summary: {
                ...MOCK_VERIFICATION.summary,
                verdicts: { ...MOCK_VERIFICATION.summary.verdicts, ANCHOR_SILENCE: 1 },
              },
            };
            set({
              isAnchorSilent: true,
              verification: mockVerif,
              lastAttackResult: {
                attackId: 7,
                name: def.name,
                success: true,
                summary: "Killed logging agent process on port 4001. Silence alert triggered after 2x interval (10s threshold).",
                affectedSeqs: [],
                expectedBaseline: "Missed",
                expectedSakshi: "ANCHOR_SILENCE",
              },
            });
            break;
          }

          case 8: {
            // Steal anchor key, overwrite old batch -> contract strictly rejects
            set({
              lastAttackResult: {
                attackId: 8,
                name: def.name,
                success: true,
                summary: "PASS — rejected by AnchorRegistry.sol: BadBatchId(expected 3, got 0). The contract is append-only: batch 0 can never be rewritten.",
                affectedSeqs: [],
                expectedBaseline: "n/a",
                expectedSakshi: "Rejected by contract (history byte-for-byte unchanged)",
              },
            });
            break;
          }
        }
      }
    } finally {
      set({ attackInProgress: null });
    }
  }
}));
