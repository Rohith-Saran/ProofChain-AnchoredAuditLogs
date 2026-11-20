import type { LogEntry, Batch, VerificationResult, AttackMetadata, StepDefinition } from "../types";

export const MOCK_LOGS: LogEntry[] = [
  { seq: 101, ts: 1732098000000, host: "victim-server", source: "systemd", level: "info", message: "System slice started session-c1.scope", prevHash: "0x0000000000000000000000000000000000000000000000000000000000000000", hash: "0x3fa94bb10c128ef3194ca810fa2bc91bca72901a1c4b901e4029df49c21e001" },
  { seq: 102, ts: 1732098001000, host: "victim-server", source: "sshd", level: "info", message: "Accepted publickey for ubuntu from 192.168.1.42 port 52310 ssh2", prevHash: "0x3fa94bb10c128ef3194ca810fa2bc91bca72901a1c4b901e4029df49c21e001", hash: "0x89ac347d10fc8324ba51c01e92d8f99014529bfa8721c04901e29df34a1b002" },
  { seq: 103, ts: 1732098002000, host: "victim-server", source: "sudo", level: "notice", message: "ubuntu : TTY=pts/0 ; PWD=/home/ubuntu ; USER=root ; COMMAND=/bin/bash", prevHash: "0x89ac347d10fc8324ba51c01e92d8f99014529bfa8721c04901e29df34a1b002", hash: "0x7c4190ba3290bca142951bc38901dfe931084201be450912cb8491ae024f003" },
  { seq: 104, ts: 1732098003000, host: "victim-server", source: "kernel", level: "warn", message: "audit: type=1400 audit(1732098003.100:42): apparmor=\"ALLOWED\" operation=\"open\"", prevHash: "0x7c4190ba3290bca142951bc38901dfe931084201be450912cb8491ae024f003", hash: "0x401be29f018a38c2014028bfa93481029c4ba29104fa2810ecba90123efc004" },
  { seq: 105, ts: 1732098004000, host: "victim-server", source: "cron", level: "info", message: "(root) CMD (test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily)", prevHash: "0x401be29f018a38c2014028bfa93481029c4ba29104fa2810ecba90123efc004", hash: "0x913b4fa810283ca91029df4091a0384b1029ca912048f0291e9ca40192ea005" },
  { seq: 106, ts: 1732098005000, host: "victim-server", source: "sshd", level: "info", message: "Received disconnect from 192.168.1.42: 11: disconnected by user", prevHash: "0x913b4fa810283ca91029df4091a0384b1029ca912048f0291e9ca40192ea005", hash: "0x12ac4891b0c9428f019482ca019481bc09124ca901248ef90124ca0192fe006" }
];

export const MOCK_BATCHES: Batch[] = [
  {
    batchId: 2,
    startSeq: 101,
    endSeq: 106,
    merkleRoot: "0x5e4b10928ca491029e01948ba2901a8f01249bca01928fa01249ca012948fe02",
    lastChainHash: "0x12ac4891b0c9428f019482ca019481bc09124ca901248ef90124ca0192fe006",
    txHash: "0x4f129a0184b29c4810294b01e924ca81029f401928ca019284ca019284f0029a",
    blockNumber: 42109,
    timestamp: 1732098005000
  },
  {
    batchId: 1,
    startSeq: 51,
    endSeq: 100,
    merkleRoot: "0x9481029ca90128fa019284bca019284fa019284ba019284bca019284fe901201",
    lastChainHash: "0x3fa94bb10c128ef3194ca810fa2bc91bca72901a1c4b901e4029df49c21e001",
    txHash: "0x819ca019284bca019284f901284ca019284fe901284ca019284bca019284f109",
    blockNumber: 42104,
    timestamp: 1732098000000
  }
];

export const MOCK_VERIFICATION: VerificationResult = {
  ok: true,
  entries: MOCK_LOGS.map((e) => ({
    seq: e.seq,
    verdict: "OK",
    reason: "Matches hash-chain and on-chain Merkle root",
    expectedHash: e.hash,
    actualHash: e.hash,
    batchId: 2,
    entry: e,
    offHostEntry: e
  })),
  batches: [
    {
      batchId: 2,
      startSeq: 101,
      endSeq: 106,
      merkleRoot: "0x5e4b10928ca491029e01948ba2901a8f01249bca01928fa01249ca012948fe02",
      calculatedRoot: "0x5e4b10928ca491029e01948ba2901a8f01249bca01928fa01249ca012948fe02",
      rootMatches: true,
      lastChainHash: "0x12ac4891b0c9428f019482ca019481bc09124ca901248ef90124ca0192fe006",
      txHash: "0x4f129a0184b29c4810294b01e924ca81029f401928ca019284ca019284f0029a",
      blockNumber: 42109,
      isHeartbeat: false
    }
  ],
  silence: {
    silent: false,
    lastAnchorTs: Date.now() - 2500,
    elapsedMs: 2500,
    intervalMs: 5000,
    thresholdMs: 10000
  },
  summary: {
    totalEntries: 6,
    tamperedEntries: 0,
    verdicts: {
      OK: 6,
      MODIFIED: 0,
      DELETED: 0,
      INSERTED: 0,
      REORDERED: 0,
      TRUNCATED: 0,
      UNANCHORED_WINDOW: 0,
      ANCHOR_SILENCE: 0
    }
  }
};

const attack6Steps: StepDefinition[] = [
  {
    stepNumber: 1,
    title: "Normal State",
    caption: "Logs 101-106 are hash-chained in victim SQLite. Batch #2 is anchored on Hardhat blockchain.",
    plainChainLane: {
      title: "Plain Hash Chain (Baseline)",
      serverState: "normal",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 103, label: "sudo bash (root)", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "normal" },
        { seq: 104, label: "apparmor open", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal" },
        { seq: 105, label: "cron daily", hash: "0x913b…92ea", prevHash: "0x401b…efc0", status: "normal" },
        { seq: 106, label: "sshd disconnect", hash: "0x12ac…92fe", prevHash: "0x913b…92ea", status: "normal" }
      ],
      overallVerdict: { verdict: "OK", label: "OK (Chain valid)", color: "var(--ok)" }
    },
    sakshiLane: {
      title: "SakshiLog Architecture",
      serverState: "normal",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 103, label: "sudo bash (root)", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "normal" },
        { seq: 104, label: "apparmor open", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal" },
        { seq: 105, label: "cron daily", hash: "0x913b…92ea", prevHash: "0x401b…efc0", status: "normal" },
        { seq: 106, label: "sshd disconnect", hash: "0x12ac…92fe", prevHash: "0x913b…92ea", status: "normal" }
      ],
      anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" },
      overallVerdict: { verdict: "OK", label: "Anchored on Blockchain", color: "var(--ok)" }
    }
  },
  {
    stepNumber: 2,
    title: "Attacker Gains Root",
    caption: "Attacker gets root privileges on the victim server. Off-host Collector and Blockchain remain untouchable.",
    plainChainLane: {
      title: "Plain Hash Chain (Baseline)",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 103, label: "sudo bash (root)", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "highlighted" },
        { seq: 104, label: "apparmor open", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal" },
        { seq: 105, label: "cron daily", hash: "0x913b…92ea", prevHash: "0x401b…efc0", status: "normal" },
        { seq: 106, label: "sshd disconnect", hash: "0x12ac…92fe", prevHash: "0x913b…92ea", status: "normal" }
      ]
    },
    sakshiLane: {
      title: "SakshiLog Architecture",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 103, label: "sudo bash (root)", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "highlighted" },
        { seq: 104, label: "apparmor open", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal" },
        { seq: 105, label: "cron daily", hash: "0x913b…92ea", prevHash: "0x401b…efc0", status: "normal" },
        { seq: 106, label: "sshd disconnect", hash: "0x12ac…92fe", prevHash: "0x913b…92ea", status: "normal" }
      ],
      anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" }
    }
  },
  {
    stepNumber: 3,
    title: "Attacker Deletes Sudo Entry",
    caption: "Attacker deletes row seq 103 from SQLite victim.db to erase evidence of unauthorized root shell.",
    plainChainLane: {
      title: "Plain Hash Chain (Baseline)",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 103, label: "[DELETED] sudo bash", hash: "EMPTY", prevHash: "N/A", status: "deleted" },
        { seq: 104, label: "apparmor open", hash: "0x401b…efc0", prevHash: "0x7c41…024f (broken)", status: "tampered" },
        { seq: 105, label: "cron daily", hash: "0x913b…92ea", prevHash: "0x401b…efc0", status: "normal" },
        { seq: 106, label: "sshd disconnect", hash: "0x12ac…92fe", prevHash: "0x913b…92ea", status: "normal" }
      ]
    },
    sakshiLane: {
      title: "SakshiLog Architecture",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 103, label: "[DELETED] sudo bash", hash: "EMPTY", prevHash: "N/A", status: "deleted" },
        { seq: 104, label: "apparmor open", hash: "0x401b…efc0", prevHash: "0x7c41…024f (broken)", status: "tampered" },
        { seq: 105, label: "cron daily", hash: "0x913b…92ea", prevHash: "0x401b…efc0", status: "normal" },
        { seq: 106, label: "sshd disconnect", hash: "0x12ac…92fe", prevHash: "0x913b…92ea", status: "normal" }
      ],
      anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" }
    }
  },
  {
    stepNumber: 4,
    title: "Attacker Recomputes Every Hash",
    caption: "Attacker points 104's prevHash to 102 and recomputes all subsequent hashes. Local chain is mathematically seamless!",
    plainChainLane: {
      title: "Plain Hash Chain (Baseline)",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 104, label: "apparmor open", hash: "0xaa11…44bb (NEW)", prevHash: "0x89ac…a1b0", status: "recomputed" },
        { seq: 105, label: "cron daily", hash: "0xbb22…55cc (NEW)", prevHash: "0xaa11…44bb", status: "recomputed" },
        { seq: 106, label: "sshd disconnect", hash: "0xcc33…66dd (NEW)", prevHash: "0xbb22…55cc", status: "recomputed" }
      ]
    },
    sakshiLane: {
      title: "SakshiLog Architecture",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
        { seq: 104, label: "apparmor open", hash: "0xaa11…44bb (NEW)", prevHash: "0x89ac…a1b0", status: "recomputed" },
        { seq: 105, label: "cron daily", hash: "0xbb22…55cc (NEW)", prevHash: "0xaa11…44bb", status: "recomputed" },
        { seq: 106, label: "sshd disconnect", hash: "0xcc33…66dd (NEW)", prevHash: "0xbb22…55cc", status: "recomputed" }
      ],
      anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" }
    }
  },
  {
    stepNumber: 5,
    title: "Verifier Runs",
    caption: "Baseline sees a valid chain: OK (wrong!). SakshiLog rebuilds the Merkle tree: Root mismatch, DELETED seq 103 caught!",
    plainChainLane: {
      title: "Plain Hash Chain (Baseline)",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal", verdict: "OK" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal", verdict: "OK" },
        { seq: 104, label: "apparmor open", hash: "0xaa11…44bb", prevHash: "0x89ac…a1b0", status: "normal", verdict: "OK" },
        { seq: 105, label: "cron daily", hash: "0xbb22…55cc", prevHash: "0xaa11…44bb", status: "normal", verdict: "OK" },
        { seq: 106, label: "sshd disconnect", hash: "0xcc33…66dd", prevHash: "0xbb22…55cc", status: "normal", verdict: "OK" }
      ],
      overallVerdict: { verdict: "OK", label: "VERDICT: OK (Attacker Evaded!)", color: "var(--bad)" }
    },
    sakshiLane: {
      title: "SakshiLog Architecture",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal", verdict: "OK" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal", verdict: "OK" },
        { seq: 103, label: "[CAUGHT MISSING] sudo bash", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "deleted", verdict: "DELETED", details: "Present in off-host collector" },
        { seq: 104, label: "apparmor open", hash: "0xaa11…44bb", prevHash: "0x89ac…a1b0", status: "tampered", verdict: "MODIFIED", details: "Hash mismatch vs anchor" },
        { seq: 105, label: "cron daily", hash: "0xbb22…55cc", prevHash: "0xaa11…44bb", status: "tampered", verdict: "MODIFIED", details: "Hash mismatch vs anchor" },
        { seq: 106, label: "sshd disconnect", hash: "0xcc33…66dd", prevHash: "0xbb22…55cc", status: "tampered", verdict: "MODIFIED", details: "Hash mismatch vs anchor" }
      ],
      anchor: { batchId: 2, root: "0x5e4b…fe02 != 0xd92a…110b", status: "mismatch" },
      overallVerdict: { verdict: "DELETED", label: "VERDICT: DELETED seq 103 (Caught)", color: "var(--bad)" }
    }
  },
  {
    stepNumber: 6,
    title: "Proof Immutability",
    caption: "The blockchain still holds the original root. Root access on the server cannot alter past Ethereum blocks.",
    plainChainLane: {
      title: "Plain Hash Chain (Baseline)",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal", verdict: "OK" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal", verdict: "OK" },
        { seq: 104, label: "apparmor open", hash: "0xaa11…44bb", prevHash: "0x89ac…a1b0", status: "normal", verdict: "OK" },
        { seq: 105, label: "cron daily", hash: "0xbb22…55cc", prevHash: "0xaa11…44bb", status: "normal", verdict: "OK" },
        { seq: 106, label: "sshd disconnect", hash: "0xcc33…66dd", prevHash: "0xbb22…55cc", status: "normal", verdict: "OK" }
      ],
      overallVerdict: { verdict: "OK", label: "Silent Failure: Forensics Blindsided", color: "var(--bad)" }
    },
    sakshiLane: {
      title: "SakshiLog Architecture",
      serverState: "compromised",
      blocks: [
        { seq: 101, label: "session start", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal", verdict: "OK" },
        { seq: 102, label: "sshd login", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal", verdict: "OK" },
        { seq: 103, label: "sudo bash (RECOVERED)", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "normal", verdict: "DELETED", details: "Exported in CERT-In evidence pack" },
        { seq: 104, label: "apparmor open", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal", verdict: "MODIFIED" },
        { seq: 105, label: "cron daily", hash: "0x913b…92ea", prevHash: "0x401b…efc0", status: "normal", verdict: "MODIFIED" },
        { seq: 106, label: "sshd disconnect", hash: "0x12ac…92fe", prevHash: "0x913b…92ea", status: "normal", verdict: "MODIFIED" }
      ],
      anchor: { batchId: 2, root: "0x5e4b…fe02 (Anchored on Chain)", status: "anchored" },
      overallVerdict: { verdict: "OK", label: "Full Forensic Recovery", color: "var(--ok)" }
    }
  }
];

function createGenericSteps(_id: number, _name: string, headline: string, _desc: string, badVerdict: any, caughtByBaseline: boolean): StepDefinition[] {
  return [
    {
      stepNumber: 1,
      title: "Clean Baseline",
      caption: `Normal state: Log stream active and anchored every 5 s. Clean hash chain.`,
      plainChainLane: {
        title: "Plain Hash Chain",
        serverState: "normal",
        blocks: [
          { seq: 101, label: "event #101", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
          { seq: 102, label: "event #102", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
          { seq: 103, label: "target event", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "normal" },
          { seq: 104, label: "event #104", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal" }
        ],
        overallVerdict: { verdict: "OK", label: "Valid", color: "var(--ok)" }
      },
      sakshiLane: {
        title: "SakshiLog Architecture",
        serverState: "normal",
        blocks: [
          { seq: 101, label: "event #101", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
          { seq: 102, label: "event #102", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
          { seq: 103, label: "target event", hash: "0x7c41…024f", prevHash: "0x89ac…a1b0", status: "normal" },
          { seq: 104, label: "event #104", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal" }
        ],
        anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" },
        overallVerdict: { verdict: "OK", label: "Anchored", color: "var(--ok)" }
      }
    },
    {
      stepNumber: 2,
      title: "Attack Executed",
      caption: `Attacker performs: ${headline}. Target seq 103 is altered.`,
      plainChainLane: {
        title: "Plain Hash Chain",
        serverState: "compromised",
        blocks: [
          { seq: 101, label: "event #101", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
          { seq: 102, label: "event #102", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
          { seq: 103, label: "tampered payload", hash: "0xdead…beef", prevHash: "0x89ac…a1b0", status: "tampered" },
          { seq: 104, label: "event #104", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "tampered" }
        ]
      },
      sakshiLane: {
        title: "SakshiLog Architecture",
        serverState: "compromised",
        blocks: [
          { seq: 101, label: "event #101", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" },
          { seq: 102, label: "event #102", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal" },
          { seq: 103, label: "tampered payload", hash: "0xdead…beef", prevHash: "0x89ac…a1b0", status: "tampered" },
          { seq: 104, label: "event #104", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal" }
        ],
        anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" }
      }
    },
    {
      stepNumber: 3,
      title: "Verification Verdict",
      caption: caughtByBaseline
        ? `Both plain hash chain and SakshiLog catch the local inconsistency. SakshiLog also attributes the exact diff via collector.`
        : `Plain hash chain FAILS (cannot detect truncation or full recomputes). SakshiLog catches it via on-chain Merkle root!`,
      plainChainLane: {
        title: "Plain Hash Chain",
        serverState: "compromised",
        blocks: [
          { seq: 101, label: "event #101", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal", verdict: "OK" },
          { seq: 102, label: "event #102", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal", verdict: "OK" },
          { seq: 103, label: "tampered", hash: "0xdead…beef", prevHash: "0x89ac…a1b0", status: "tampered", verdict: caughtByBaseline ? badVerdict : "OK" },
          { seq: 104, label: "event #104", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "tampered", verdict: caughtByBaseline ? "MODIFIED" : "OK" }
        ],
        overallVerdict: caughtByBaseline
          ? { verdict: badVerdict, label: `Caught: broken chain link`, color: "var(--bad)" }
          : { verdict: "OK", label: "OK (False Negative)", color: "var(--bad)" }
      },
      sakshiLane: {
        title: "SakshiLog Architecture",
        serverState: "compromised",
        blocks: [
          { seq: 101, label: "event #101", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal", verdict: "OK" },
          { seq: 102, label: "event #102", hash: "0x89ac…a1b0", prevHash: "0x3fa9…c21e", status: "normal", verdict: "OK" },
          { seq: 103, label: "tampered", hash: "0xdead…beef", prevHash: "0x89ac…a1b0", status: "tampered", verdict: badVerdict, details: "Cross-checked with collector" },
          { seq: 104, label: "event #104", hash: "0x401b…efc0", prevHash: "0x7c41…024f", status: "normal", verdict: "OK" }
        ],
        anchor: { batchId: 2, root: "0x5e4b…fe02 (Root Mismatch)", status: "mismatch" },
        overallVerdict: { verdict: badVerdict, label: `VERDICT: ${badVerdict}`, color: "var(--bad)" }
      }
    }
  ];
}

export const ATTACKS: AttackMetadata[] = [
  {
    id: 1,
    name: "Edit Line",
    slug: "edit-line",
    headline: "Edit existing log entry in place",
    description: "Attacker modifies a log message (e.g., changes an IP or admin action) without recomputing hashes.",
    baselineVerdict: "MODIFIED",
    sakshiVerdict: "MODIFIED",
    targetSeq: 103,
    steps: createGenericSteps(1, "Edit Line", "Attacker modifies SQL message for seq 103", "MODIFIED", "MODIFIED", true)
  },
  {
    id: 2,
    name: "Delete Line",
    slug: "delete-line",
    headline: "Delete a log line without recomputing hashes",
    description: "Attacker removes a row from SQLite. The subsequent row's prevHash now points to a missing entry.",
    baselineVerdict: "DELETED",
    sakshiVerdict: "DELETED",
    targetSeq: 103,
    steps: createGenericSteps(2, "Delete Line", "Attacker deletes seq 103", "DELETED", "DELETED", true)
  },
  {
    id: 3,
    name: "Insert Fake Line",
    slug: "insert-line",
    headline: "Inject unauthorized log entry",
    description: "Attacker inserts a fabricated log entry into the middle of the database table.",
    baselineVerdict: "INSERTED",
    sakshiVerdict: "INSERTED",
    targetSeq: 103,
    steps: createGenericSteps(3, "Insert Fake Line", "Attacker inserts bogus log line at seq 103", "INSERTED", "INSERTED", true)
  },
  {
    id: 4,
    name: "Reorder Lines",
    slug: "reorder-lines",
    headline: "Swap order of log lines",
    description: "Attacker swaps two lines in SQLite to hide the causal sequence of an intrusion.",
    baselineVerdict: "REORDERED",
    sakshiVerdict: "REORDERED",
    targetSeq: 103,
    steps: createGenericSteps(4, "Reorder Lines", "Attacker swaps order of seq 102 and seq 103", "REORDERED", "REORDERED", true)
  },
  {
    id: 5,
    name: "Truncate Tail",
    slug: "truncate-tail",
    headline: "Drop recent logs from table",
    description: "Attacker drops the newest entries. Baseline hash chain sees remaining entries as self-consistent and fails (0% detection rate). SakshiLog detects endSeq mismatch against anchored batch.",
    baselineVerdict: "OK (Missed)",
    sakshiVerdict: "TRUNCATED",
    targetSeq: 105,
    steps: createGenericSteps(5, "Truncate Tail", "Attacker deletes all logs from seq 104 onwards", "TRUNCATED", "TRUNCATED", false)
  },
  {
    id: 6,
    name: "Delete & Recompute (Hero)",
    slug: "delete-recompute",
    headline: "Delete sensitive log line and recompute all following hashes",
    description: "Attacker with root deletes sudo log and re-hashes all following entries. Local hash chain is 100% valid! SakshiLog detects root mismatch against on-chain Ethereum anchor.",
    baselineVerdict: "OK (0% Detection)",
    sakshiVerdict: "MODIFIED / DELETED (100%)",
    targetSeq: 103,
    steps: attack6Steps
  },
  {
    id: 7,
    name: "Kill Agent (Silence)",
    slug: "kill-agent",
    headline: "Kill logging agent process",
    description: "Attacker executes SIGKILL on the agent daemon to silence further audit records. SakshiLog detects ANCHOR_SILENCE at 2x interval (10s).",
    baselineVerdict: "Silent / No Alert",
    sakshiVerdict: "ANCHOR_SILENCE",
    steps: [
      {
        stepNumber: 1,
        title: "Agent Active",
        caption: "Logging agent runs daemonized, generating heartbeats every 5 seconds.",
        plainChainLane: {
          title: "Plain Hash Chain",
          serverState: "normal",
          blocks: [{ seq: 101, label: "Agent daemon running", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" }]
        },
        sakshiLane: {
          title: "SakshiLog Architecture",
          serverState: "normal",
          blocks: [{ seq: 101, label: "Agent daemon running", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" }],
          anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" }
        }
      },
      {
        stepNumber: 2,
        title: "Attacker Kills Daemon",
        caption: "Attacker kills agent process on port 4001. No local logs or plain hash chain can detect that its own generator died.",
        plainChainLane: {
          title: "Plain Hash Chain",
          serverState: "offline",
          blocks: [{ seq: 101, label: "Agent dead", hash: "STOPPED", prevHash: "N/A", status: "tampered" }],
          overallVerdict: { verdict: "OK", label: "No Alert Generated", color: "var(--ink-muted)" }
        },
        sakshiLane: {
          title: "SakshiLog Architecture",
          serverState: "offline",
          blocks: [{ seq: 101, label: "Agent dead", hash: "STOPPED", prevHash: "N/A", status: "tampered" }],
          anchor: { batchId: 2, root: "No new heartbeat received", status: "silent" },
          overallVerdict: { verdict: "ANCHOR_SILENCE", label: "ANCHOR_SILENCE Alert Triggered (>10s)", color: "var(--bad)" }
        }
      }
    ]
  },
  {
    id: 8,
    name: "Steal Key & Overwrite",
    slug: "steal-key-overwrite",
    headline: "Steal anchorer private key to overwrite past batch",
    description: "Attacker steals anchorer wallet key and attempts to call anchor() with an old batchId. AnchorRegistry smart contract strictly enforces nextBatchId and reverts.",
    baselineVerdict: "N/A",
    sakshiVerdict: "REVERT: BadBatchId",
    steps: [
      {
        stepNumber: 1,
        title: "Key Extracted",
        caption: "Attacker extracts anchorer key from memory. Blockchain holds batch 0, 1, 2.",
        plainChainLane: {
          title: "Plain Hash Chain",
          serverState: "compromised",
          blocks: [{ seq: 101, label: "No smart contract", hash: "N/A", prevHash: "N/A", status: "normal" }]
        },
        sakshiLane: {
          title: "SakshiLog Architecture",
          serverState: "compromised",
          blocks: [{ seq: 101, label: "Key leaked", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "highlighted" }],
          anchor: { batchId: 2, root: "0x5e4b…fe02", status: "anchored" }
        }
      },
      {
        stepNumber: 2,
        title: "Transaction Reverted",
        caption: "Contract executes: require(batchId == nextBatchId). Reverts BadBatchId(expected 3, got 2). Attack blocked by EVM consensus!",
        plainChainLane: {
          title: "Plain Hash Chain",
          serverState: "compromised",
          blocks: [{ seq: 101, label: "Unprotected", hash: "N/A", prevHash: "N/A", status: "tampered" }],
          overallVerdict: { verdict: "MODIFIED", label: "No On-Chain Protection", color: "var(--bad)" }
        },
        sakshiLane: {
          title: "SakshiLog Architecture",
          serverState: "compromised",
          blocks: [{ seq: 101, label: "Batch 2 unchanged", hash: "0x3fa9…c21e", prevHash: "0x0000…0000", status: "normal" }],
          anchor: { batchId: 2, root: "0x5e4b…fe02 (IMMUTABLE)", status: "anchored" },
          overallVerdict: { verdict: "OK", label: "Smart Contract Blocked Overwrite", color: "var(--ok)" }
        }
      }
    ]
  }
];
