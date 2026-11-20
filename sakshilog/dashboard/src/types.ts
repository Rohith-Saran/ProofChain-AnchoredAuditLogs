export type LogEntry = {
  seq: number;
  ts: number;
  host: string;
  source: string;
  level: string;
  message: string;
  prevHash: string;
  hash: string;
};

export type Batch = {
  batchId: number;
  startSeq: number;
  endSeq: number;
  merkleRoot: string;
  lastChainHash: string;
  txHash: string;
  blockNumber: number;
  timestamp?: number;
};

export type Verdict =
  | "OK"
  | "MODIFIED"
  | "DELETED"
  | "INSERTED"
  | "REORDERED"
  | "TRUNCATED"
  | "UNANCHORED_WINDOW"
  | "ANCHOR_SILENCE";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected" | "mock";

export interface EntryVerdict {
  seq: number;
  verdict: Verdict;
  reason?: string;
  expectedHash?: string;
  actualHash?: string;
  batchId?: number;
  entry?: LogEntry;
  offHostEntry?: LogEntry;
}

export interface BatchVerdict {
  batchId: number;
  startSeq: number;
  endSeq: number;
  merkleRoot: string;
  calculatedRoot?: string;
  rootMatches: boolean;
  lastChainHash: string;
  txHash: string;
  blockNumber: number;
  isHeartbeat?: boolean;
}

export interface SilenceAlert {
  silent: boolean;
  lastAnchorTs: number;
  elapsedMs: number;
  intervalMs: number;
  thresholdMs: number;
}

export interface VerificationResult {
  ok: boolean;
  entries: EntryVerdict[];
  batches: BatchVerdict[];
  silence: SilenceAlert;
  summary: {
    totalEntries: number;
    tamperedEntries: number;
    verdicts: Record<Verdict, number>;
  };
}

export interface BaselineVerificationResult {
  ok: boolean;
  brokenLinks: {
    seq: number;
    expectedPrevHash: string;
    actualPrevHash: string;
  }[];
  totalEntries: number;
}

export interface SystemStatus {
  agent: { connected: boolean; status?: string; totalLogs?: number; lastSeq?: number; baselineMode?: boolean };
  collector: { connected: boolean; status?: string; totalLogs?: number; totalBatches?: number };
  verifier: { connected: boolean; status?: string };
  chain: { connected: boolean; blockNumber?: number };
}

export interface DiagramBlock {
  seq: number;
  label: string;
  hash: string;
  prevHash: string;
  status: "normal" | "highlighted" | "tampered" | "deleted" | "recomputed" | "inserted";
  verdict?: Verdict;
  details?: string;
}

export interface DiagramLaneState {
  title: string;
  serverState: "normal" | "compromised" | "offline";
  blocks: DiagramBlock[];
  anchor?: {
    batchId: number;
    root: string;
    status: "anchored" | "mismatch" | "silent";
  };
  overallVerdict?: {
    verdict: Verdict;
    label: string;
    color: string;
  };
}

export interface StepDefinition {
  stepNumber: number;
  title: string;
  caption: string;
  plainChainLane: DiagramLaneState;
  sakshiLane: DiagramLaneState;
}

// Adaptive anchoring (M1 Phase 4a): agent/src/riskScorer.ts's live risk score, pushed over
// the agent's "risk" Socket.IO event and available at GET {agentUrl}/api/risk.
export interface RiskState {
  score: number;
  anchorIntervalMs: number;
  reason: string;
  updatedAt: number;
}

// AI incident investigator (M4 Phase 4a): ai/src/server.ts's GET /api/incident-report,
// also embedded in the evidence pack as aiIncidentReport. null means the service wasn't
// configured or didn't respond in time — never a fabricated report.
export interface AiIncidentClaim {
  text: string;
  citedEntries: number[];
}

export interface AiIncidentReport {
  claims: AiIncidentClaim[];
  blockedClaims: AiIncidentClaim[];
  generatedAt: number;
}

export interface AttackMetadata {
  id: number;
  name: string;
  slug: string;
  headline: string;
  description: string;
  baselineVerdict: string;
  sakshiVerdict: string;
  targetSeq?: number;
  steps: StepDefinition[];
}
