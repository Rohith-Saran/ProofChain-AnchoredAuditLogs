# SakshiLog: Logs the Attacker Can't Erase

[![The Big Hack 2.0](https://img.shields.io/badge/The_Big_Hack_2.0-Track_02:_Cybersecurity_%26_Blockchain-orange.svg)](#)
[![Problem](https://img.shields.io/badge/Problem-B3:_Tamper--Evident_Audit_Logs-red.svg)](#)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue.svg)](#)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22-yellow.svg)](#)
[![Quai Network](https://img.shields.io/badge/Quai_Network-Orchard_Testnet-green.svg)](#)
[![Node](https://img.shields.io/badge/Node-v22%2B-brightgreen.svg)](#)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](#)

> **Decoupled Cryptographic Audit Logs Anchored to Blockchain Consensus with Continuous Hash Chaining, Real-Time Off-Host Replication, and Grounded AI Forensics.**

---

## 📑 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [The Core Problem: Root Attacker Paradox](#-the-core-problem-the-root-attacker-paradox)
3. [System Architecture & 4-Pillar Pipeline](#-system-architecture--the-4-pillar-pipeline)
4. [The 8 Attack Vectors & Cryptographic Defenses](#-the-8-attack-vectors--cryptographic-defenses)
5. [Smart Contract: AnchorRegistry.sol](#-smart-contract-anchorregistrysol)
6. [Adaptive Anchoring & Silence Detection](#-adaptive-anchoring--silence-detection)
7. [AI Incident Investigator & CERT-In Compliance](#-ai-incident-investigator--cert-in-compliance)
8. [Benchmark Results & Measured Numbers](#-benchmark-results--measured-numbers)
9. [Prerequisites](#-prerequisites)
10. [How to Run the Project (Step-by-Step)](#-how-to-run-the-project-step-by-step)
    - [Option A: One-Command Automated Launch (Recommended)](#option-a-one-command-automated-launch-recommended)
    - [Option B: Manual Step-by-Step Multi-Terminal Launch](#option-b-manual-step-by-step-multi-terminal-launch)
    - [Option C: Docker Compose](#option-c-docker-compose)
11. [Simulating Attacks & Verifying Tampering](#-simulating-attacks--verifying-tampering)
12. [Exporting Forensic Evidence Packs](#-exporting-forensic-evidence-packs)
13. [Deploying to Quai Network (Sponsor Track)](#-deploying-to-quai-network-sponsor-track)
14. [Repository & Workspace Structure](#-repository--workspace-structure)
15. [Troubleshooting & Reset](#-troubleshooting--reset)

---

## 💡 Executive Summary

In contemporary enterprise security, **audit logs are the ground truth** during forensic investigations. However, standard logging systems—including append-only syslog, systemd journal, and local cryptographic hash chains—share a fatal flaw: **an attacker who gains root privileges completely owns the host operating system and can rewrite history at will.**

**SakshiLog** solves this by decoupling tamper verification from the host operating system. It bundles local logs into sequential cryptographic hash chains, replicates them to an independent off-host collector in real time, and periodically anchors binary **Merkle tree roots** to an immutable blockchain smart contract (`AnchorRegistry.sol`). Even with `root`, an attacker cannot alter blockchain consensus. Any retroactive modification, deletion, reordering, or truncation immediately triggers cryptographic mismatch verdicts in sub-millisecond time.

---

## 🚨 The Core Problem: The Root Attacker Paradox

### Why Traditional Hash Chains Fail Against Root
Many systems implement sequential hashing:
$$\text{hash}_i = \text{SHA-256}(\text{seq}_i \parallel \text{timestamp}_i \parallel \text{host}_i \parallel \text{source}_i \parallel \text{message}_i \parallel \text{hash}_{i-1})$$

1. Attacker exploits vulnerability and escalates to `root` (e.g., via `sudo bash` at Sequence #42).
2. The attacker modifies SQLite database or raw log files directly: deletes row #42 or alters the attacker IP.
3. The attacker re-computes $\text{hash}_{42}$ using $\text{hash}_{41}$, then cascades the recomputation through all subsequent rows ($\text{hash}_{43} \dots \text{hash}_N$).
4. Standard log verifiers scan the database, verify that each `prevHash` matches the previous row's `hash`, and declare: **"Log chain 100% valid. No breach detected."**

### How SakshiLog Solves It
```
[ Attacker Compromises Server (Root) ]
               │
               ▼
   Alters Local SQLite Logs
   & Recomputes Hashes Locally
               │
               ▼
   Local Verifier / Auditor Checks:
               │
   ┌───────────┴────────────────────────────────────────┐
   │ Local Recomputed Merkle Root: 0x3f19e4...          │
   │ On-Chain Anchored Root:       0x7a8f19...          │
   └───────────┬────────────────────────────────────────┘
               │
               ▼
   CRITICAL MISMATCH DETECTED!
   Verdict: MODIFIED (Seq #42)
   Action: Alert SOC, Reconstruct via Off-Host Collector
```

Because previous Merkle roots and chain heads were already committed to Ethereum / Quai blockchain consensus:
- Root cannot rewrite past Ethereum blocks without acquiring 51% network hashpower/stake.
- The recomputed local Merkle root fails against the on-chain root.
- The off-host secondary collector provides the diff needed to recover the deleted entry.

---

## 🏗 System Architecture & The 4-Pillar Pipeline

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SAKSHILOG ARCHITECTURE                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘

    [ HOST UNDER AUDIT ] (Port :4001)
    ┌─────────────────────────────────────────────────────────┐
    │  Applications / Syslog / Auditd / Kernel Events         │
    │                           │                             │
    │                           ▼                             │
    │  PILLAR 1: Victim Agent (agent/src/hashChain.ts)        │
    │  - Appends to SQLite (victim.db)                        │
    │  - Continuous SHA-256 chaining                          │
    │  - Adaptive risk scoring (1s-5s intervals)              │
    └───────────────┬─────────────────────────┬───────────────┘
                    │ Real-time Stream        │ Merkle Batch
                    │ (Immediate Push)        │ (Every 1-5s)
                    ▼                         ▼
    ┌─────────────────────────────┐   ┌──────────────────────────────────────────────┐
    │ PILLAR 2: Off-Host Collector│   │ PILLAR 3: Anchor Service (Port :4003)        │
    │ (Port :4002)                │   │ - Queues batches, manages nextBatchId        │
    │ - Independent secondary DB  │   │ - Emits heartbeat empty batches on idle      │
    │ - collector.db              │   │ - Emits realtime Socket.IO push              │
    └───────────────┬─────────────┘   └──────────────────────┬───────────────────────┘
                    │                                        │ Web3 RPC
                    │                                        ▼
                    │                 ┌──────────────────────────────────────────────┐
                    │                 │ EVM Consensus: AnchorRegistry.sol (:8545)    │
                    │                 │ - Append-only: require(batchId==nextBatchId) │
                    │                 │ - stores: merkleRoot, lastChainHash, range   │
                    │                 └──────────────────────┬───────────────────────┘
                    │                                        │
                    ▼                                        ▼
    ┌────────────────────────────────────────────────────────────────────────────────┐
    │ PILLAR 4: Independent Auditor Verifier (Port :4004)                            │
    │ - Fetches remaining local logs + off-host collector logs + on-chain batches    │
    │ - Cross-audits Merkle roots, sequence continuity, and adjacent prevHashes     │
    │ - Emits per-entry verdicts: OK, MODIFIED, DELETED, INSERTED, REORDERED, etc.  │
    └──────────────────────┬─────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
    ┌───────────────────────────┐   ┌────────────────────────────────────────────────┐
    │ Grounded AI Investigator  │   │ React + Vite Presentation Dashboard (:5173)   │
    │ (Port :4005)              │   │ - Live Ops Console & Risk Meter                │
    │ - Strictly citation-bound │   │ - Interactive How It Works architectural guide │
    │ - MITRE ATT&CK mapping    │   │ - Attack Runner & Dual-Lane Diff Inspector     │
    │ - CERT-In 6-hr report     │   │ - Forensic Evidence Pack Exporter              │
    └───────────────────────────┘   └────────────────────────────────────────────────┘
```

### The 4 Pillars in Detail
1. **Pillar 1 — Victim Agent (`agent/`, Port 4001)**:
   Embeds the logging daemon and demo service. Ingests raw events (`sshd`, `sudo`, `auditd`, `kernel`), attaches monotonic sequence numbers (`seq`), timestamps (`ts`), source tags, previous hashes (`prevHash`), and computes row hashes. Implements adaptive interval shortening during high-risk activity.
2. **Pillar 2 — Off-Host Collector (`collector/`, Port 4002)**:
   An isolated secondary service that receives an immediate push copy of every chained log entry over an authenticated API before any local tampering can take place.
3. **Pillar 3 — Blockchain Anchor Service (`anchor-service/`, Port 4003)**:
   HTTP and WebSocket bridge to `AnchorRegistry.sol`. Takes assembled batches, verifies contiguous bounds, calculates binary Merkle trees, and signs on-chain transactions. Emits heartbeat batches when idle to maintain silence detection.
4. **Pillar 4 — Auditor Verifier (`verifier/`, Port 4004)**:
   An independent verification engine that rebuilds local hash chains, queries on-chain Merkle roots, compares entries against the off-host collector, and outputs mathematical per-entry verdicts.

---

## 🎯 The 8 Attack Vectors & Cryptographic Defenses

SakshiLog is tested against 8 distinct root attack scenarios run directly against the live database:

| # | Attack Vector | Attacker Action (as root) | Plain Hash Chain | SakshiLog Verdict | Detection Mechanism |
|---|---|---|---|---|---|
| **1** | **Edit In-Place** | Modifies attacker IP or username in an existing log row | ❌ **Caught** (Hash breaks) | `MODIFIED` | Leaf hash recomputation fails; calculated Merkle root differs from on-chain anchor. |
| **2** | **Delete Row** | Deletes incriminating log row (e.g. `sudo bash`) | ❌ **Caught** (Seq gap) | `DELETED` | Sequence gap identified; missing row recovered from off-host collector for diff proof. |
| **3** | **Insert Rogue Log** | Inserts fabricated log row into history | ❌ **Caught** (Seq clash) | `INSERTED` | Monotonic sequence violation and Merkle tree leaf count mismatch. |
| **4** | **Reorder Logs** | Swaps order of two events to obscure causality | ❌ **Caught** (Hash break) | `REORDERED` | Adjacent `prevHash` link breaks; leaf index order fails on Merkle reconstruction. |
| **5** | **Truncate Tail** | Truncates logs to a prior clean timestamp | ⚠️ **Missed** (Looks clean) | `TRUNCATED` | On-chain batch record proves logs existed up to `endSeq`; missing range flagged. |
| **6** | **Delete & Recompute** *(Headline Attack)* | Deletes row and recomputes all following SHA-256 hashes locally | ⚠️ **MISSED** (Chain is mathematically valid locally!) | `MODIFIED` / `DELETED` | Local hash chain appears 100% valid, but local Merkle root **collides with immutable on-chain root**. |
| **7** | **Kill Agent / Sever Network** | Stops agent or drops network to silence logging | ⚠️ **Missed** (Silent) | `ANCHOR_SILENCE` | Watchdog checks heartbeat anchors; flags `ANCHOR_SILENCE` after $2 \times$ interval ($10\text{ s}$). |
| **8** | **Key Theft / Rogue Overwrite** | Steals anchorer private key to overwrite past batch | N/A | **Contract Reverts** | `AnchorRegistry.sol` strictly enforces `batchId == nextBatchId`; past batches cannot be edited. |

---

## 📜 Smart Contract: AnchorRegistry.sol

The heart of SakshiLog's immutable guarantee is [AnchorRegistry.sol](file:///Users/rohith/Desktop/ProofChain-AnchoredAuditLogs/sakshilog/contracts/contracts/AnchorRegistry.sol), compiled with pinned Solidity compiler `0.8.20` (`evmVersion: "london"`):

```solidity
struct Batch {
    uint256 batchId;
    bytes32 merkleRoot;
    bytes32 lastChainHash;
    uint64 startSeq;
    uint64 endSeq;
    uint64 timestamp;
    uint64 blockNumber;
}
```

### Invariants & Guarantees
- **Monotonic Batch Ordering**: `require(batchId == nextBatchId, BadBatchId(expected, got))` ensures no batch can be overwritten, skipped, or backfilled. Batch 0 must precede Batch 1, which must precede Batch 2.
- **Role Decoupling (`onlyAnchorer`)**: Even if root compromises the victim server, only authorized anchorer accounts can submit batches.
- **Heartbeat Range Rule**:
  - Normal Batch: `startSeq <= endSeq`.
  - Heartbeat Batch (idle period): `startSeq == endSeq + 1` (empty range), `merkleRoot = 0x00...00`, `lastChainHash = previous.lastChainHash`.
  - Any other sequence configuration reverts with `InvalidRange`.

---

## ⏱ Adaptive Anchoring & Silence Detection

1. **Adaptive Interval (Phase 4a)**:
   - Standard anchor interval: **5,000 ms** (5 seconds).
   - High-risk logs (e.g., `sudo`, `auth failed`, `iptables disable`, privilege escalations) increase the risk score ($0.0 \to 1.0$).
   - When risk exceeds threshold, the batch timer dynamically shortens to **1,000 ms**, shrinking the window of exposure by 80%.
2. **Silence Detection Watchdog**:
   - The contract requires regular heartbeats even when no logs occur.
   - If the auditor verifier detects that the elapsed time since the last on-chain batch exceeds $2 \times \text{interval}$ (10 seconds), an immediate `ANCHOR_SILENCE` alarm is triggered.

---

## 🤖 AI Incident Investigator & CERT-In Compliance

Located in `sakshilog/ai/`:
- **Zero-Hallucination Grounding**: The AI model (via Groq `llama-3.3-70b-versatile` or Anthropic Claude) is constrained strictly to mathematically verified diffs provided by the verifier. It is prohibited from generating ungrounded assertions.
- **Automated MITRE ATT&CK Mapping**:
  - `T1070.002` (Indicator Removal on Host: Clear Linux OS Logs)
  - `T1562.001` (Impair Defenses: Disable or Modify Tools)
  - `T1078` (Valid Accounts: Sudo abuse)
- **CERT-In 6-Hour Reporting Compliance**: Automatically formats breach reports to satisfy India's Computer Emergency Response Team (CERT-In) cybersecurity directive, including root cause, timeline of tamper, affected sequence bounds, and on-chain transaction proof hashes.

---

## 📊 Benchmark Results & Measured Numbers

*Measured on 200-entry scenarios across 20 randomized runs per attack vector:*

- **Detection Rate**: **100% (20/20)** across all attack vectors.
- **False Positive Rate**: **0% (0/20)** on clean baseline logs.
- **Verifier Compute Latency**:
  - Edit-Line: **1.207 ms** avg (p95: 2.99 ms)
  - Delete-Line: **0.967 ms** avg (p95: 1.86 ms)
  - Insert-Line: **0.968 ms** avg (p95: 2.01 ms)
  - Delete & Recompute: **0.778 ms** avg (p95: 3.21 ms)
- **Silence Transition Accuracy**: 14/14 checks precisely flipped from quiet to `ANCHOR_SILENCE` at the 10-second mark.
- **Gas Costs**: ~45,000 to ~65,000 gas per anchor transaction.

---

## 💻 Prerequisites

Ensure you have the following installed on your host machine:

- **Node.js**: `v22.0.0` or newer (`v25.x` fully supported with built-in `--experimental-strip-types` and `node:sqlite`)
- **npm**: `v10.x` or newer
- **Git**
- **Operating System**: macOS (Apple Silicon / Intel), Linux, Windows (WSL2 or native `.bat` scripts)

---

## 🚀 How to Run the Project (Step-by-Step)

### Option A: One-Command Automated Launch (Recommended)

From the project root:

```bash
# 1. Enter the sakshilog directory
cd sakshilog

# 2. Run the all-in-one startup script
./start-all.sh
```
*(On Windows Command Prompt, run `start-all.bat`)*

**What this script does automatically:**
1. Starts the Hardhat local blockchain on `http://127.0.0.1:8545`.
2. Deploys the `AnchorRegistry` smart contract and writes `contracts/deployments/localhost.json`.
3. Launches the **Anchor Service** on `http://127.0.0.1:4003`.
4. Launches the **Off-Host Collector** on `http://127.0.0.1:4002`.
5. Launches the **Victim Agent** on `http://127.0.0.1:4001`.
6. Launches the **Auditor Verifier** on `http://127.0.0.1:4004`.
7. Launches the **AI Incident Investigator** on `http://127.0.0.1:4005` (if API key is present).
8. Launches the **React + Vite Dashboard** on **`http://localhost:5173`**.

---

### Option B: Manual Step-by-Step Multi-Terminal Launch

If you prefer to start each service in its own terminal window:

#### Terminal 1: Hardhat Node
```bash
cd sakshilog/contracts
npx hardhat node
```
*Listens on `http://127.0.0.1:8545`.*

#### Terminal 2: Deploy Smart Contract
```bash
cd sakshilog/contracts
npx hardhat run scripts/deploy.ts --network localhost
```
*Deploys `AnchorRegistry` and creates `contracts/deployments/localhost.json`.*

#### Terminal 3: Anchor Service
```bash
cd sakshilog/anchor-service
node --experimental-strip-types src/server.ts
```
*Listens on `http://127.0.0.1:4003`.*

#### Terminal 4: Off-Host Collector
```bash
cd sakshilog/collector
node --experimental-strip-types src/server.ts
```
*Listens on `http://127.0.0.1:4002`.*

#### Terminal 5: Victim Agent
```bash
cd sakshilog/agent
ANCHOR_SERVICE_URL="http://127.0.0.1:4003" node --experimental-strip-types src/server.ts
```
*Listens on `http://127.0.0.1:4001`.*

#### Terminal 6: Auditor Verifier
```bash
cd sakshilog/verifier
node --experimental-strip-types src/server.ts
```
*Listens on `http://127.0.0.1:4004`.*

#### Terminal 7: AI Incident Investigator (Optional)
```bash
cd sakshilog/ai
# Configure GROQ_API_KEY or ANTHROPIC_API_KEY in ai/.env
node --env-file-if-exists=.env --experimental-strip-types src/server.ts
```
*Listens on `http://127.0.0.1:4005`.*

#### Terminal 8: React Dashboard
```bash
cd sakshilog/dashboard
npm run dev
```
*Open **`http://localhost:5173`**.*

---

### Pre-Loading Demo Data

Once services are running, pre-load realistic security audit logs and anchor an initial batch:

```bash
cd sakshilog/agent
npm run seed
```
You will see 25 security logs generated and anchored into on-chain Batch #0.

---

### Option C: Docker Compose

You can also run all services inside Docker containers:

```bash
cd sakshilog
docker compose up --build
```

---

## 🧪 Simulating Attacks & Verifying Tampering

You can trigger the 8 attack scenarios either from the **React UI** (`http://localhost:5173/#/attacks`) or from the **CLI**:

### Executing Attacks via CLI
```bash
cd sakshilog/attacks

# Attack 1: In-place edit of log message
node --experimental-strip-types src/run.ts 1

# Attack 2: Delete a log row (e.g. sudo bash)
node --experimental-strip-types src/run.ts 2

# Attack 3: Insert a forged log entry
node --experimental-strip-types src/run.ts 3

# Attack 4: Reorder log entries
node --experimental-strip-types src/run.ts 4

# Attack 5: Truncate log tail
node --experimental-strip-types src/run.ts 5

# Attack 6: Delete a row & recompute full local hash chain (The Headline Attack)
node --experimental-strip-types src/run.ts 6

# Attack 7: Kill agent daemon to trigger silence alert
node --experimental-strip-types src/run.ts 7

# Attack 8: Attempt to overwrite past anchored batch
node --experimental-strip-types src/run.ts 8
```

### Checking Live Verification Results
```bash
curl http://127.0.0.1:4004/api/verify
```

---

## 📦 Exporting Forensic Evidence Packs

To generate a standalone court-admissible forensic evidence bundle:

```bash
cd sakshilog/evidence
npm run export
```

This generates:
1. `evidence/evidence-pack.json`: Complete forensic bundle containing local logs, off-host collector copies, on-chain Merkle proofs, and transaction receipts.
2. `evidence/evidence-pack-report.md`: Markdown summary suitable for executive review.
3. **Standalone Verification**:
   ```bash
   node verify-standalone.js evidence-pack.json
   ```
   *Runs independently without database or node dependencies, proving log integrity cryptographically.*

---

## 🌐 Deploying to Quai Network (Sponsor Track)

To deploy the same `AnchorRegistry.sol` contract to **Quai Network's Orchard Testnet (Cyprus-1 zone)**:

1. **Generate a dedicated Cyprus-1 wallet**:
   ```bash
   cd sakshilog/contracts
   npm run quai:wallet
   ```
2. **Fund the address** via the Orchard faucet: [https://orchard.faucet.quai.network](https://orchard.faucet.quai.network).
3. **Configure `.env`**:
   ```bash
   cp .env.example .env
   # Add your CYPRUS1_PK private key
   ```
4. **Deploy**:
   ```bash
   npm run deploy:quai
   ```
   *Deploys contract using `quais.js` and `@quai/hardhat-deploy-metadata`, and saves `deployments/cyprus1.json`.*

---

## 📂 Repository & Workspace Structure

```
ProofChain-AnchoredAuditLogs/
│
├── README.md                      # Root documentation and project report
├── package-lock.json
│
└── sakshilog/                     # Monorepo root
    ├── README.md                  # Package overview
    ├── package.json               # Monorepo workspace configuration
    ├── start-all.sh               # One-click startup script (macOS/Linux)
    ├── start-all.bat              # One-click startup script (Windows)
    ├── clean.js / clean.sh        # State reset & database wipe
    ├── Dockerfile / docker-compose.yml
    │
    ├── contracts/                 # Smart contracts & blockchain tooling
    │   ├── contracts/AnchorRegistry.sol  # Core append-only anchor contract
    │   ├── scripts/deploy.ts      # Local deployment script
    │   ├── scripts/deployQuai.ts  # Quai Network Orchard deployment script
    │   └── test/                  # 19 Hardhat unit tests
    │
    ├── anchor-service/            # Blockchain interface service (:4003)
    │   ├── src/anchorClient.ts    # Ethers-v6 contract wrapper
    │   └── src/server.ts          # Batching, queuing, and Socket.IO push
    │
    ├── agent/                     # Victim server agent (:4001)
    │   ├── src/hashChain.ts       # SHA-256 sequential chain implementation
    │   ├── src/db.ts              # SQLite storage layer (node:sqlite)
    │   ├── src/seed.ts            # Demo scenario pre-loader
    │   └── src/server.ts          # Agent HTTP API & real-time log push
    │
    ├── collector/                 # Real-time off-host collector (:4002)
    │   ├── src/db.ts              # Secondary SQLite store
    │   └── src/server.ts          # Ingestion API & cross-check endpoints
    │
    ├── verifier/                  # Independent auditor engine (:4004)
    │   ├── src/verifier.ts        # Hash reconstruction & Merkle validation
    │   └── src/server.ts          # Verification API endpoint (/api/verify)
    │
    ├── attacks/                   # Root attacker exploit suite
    │   ├── src/01-edit-line.ts
    │   ├── src/02-delete-line.ts
    │   ├── src/03-insert-line.ts
    │   ├── src/04-reorder-lines.ts
    │   ├── src/05-truncate-tail.ts
    │   ├── src/06-delete-recompute.ts   # Headline attack vector
    │   ├── src/07-kill-agent.ts
    │   └── src/08-steal-key-overwrite.ts
    │
    ├── ai/                        # Grounded AI Incident Investigator (:4005)
    │   ├── src/investigator.ts    # Citation-grounded analysis
    │   ├── src/certIn.ts          # CERT-In compliance report formatter
    │   └── src/mitre.ts           # MITRE ATT&CK mapping
    │
    ├── evidence/                  # Forensic Evidence Bundler
    │   ├── src/exportPack.ts      # Evidence pack compilation
    │   └── verify-standalone.js   # Zero-dependency auditor CLI
    │
    ├── bench/                     # Benchmark runner
    │   ├── src/runner.ts          # Automated 20-run attack matrix
    │   └── results/results.md     # Measured latencies and metrics
    │
    └── dashboard/                 # React + Vite Frontend (:5173)
        ├── src/pages/LandingPage.tsx      # Overview & 3D particle hero
        ├── src/pages/HowItWorksPage.tsx   # Architectural walkthrough & Merkle tree demo
        ├── src/pages/LiveConsolePage.tsx  # Real-time log inspector & risk meter
        ├── src/pages/AttackConsolePage.tsx# 8-attack test matrix
        ├── src/pages/AttackStepPage.tsx   # Dual-lane architecture comparison
        ├── src/pages/AiAnalystPage.tsx    # AI incident report & MITRE timeline
        ├── src/pages/EvidencePage.tsx     # Evidence pack exporter
        ├── src/pages/ResultsPage.tsx      # Measured benchmark graphs
        └── src/pages/LimitsPage.tsx       # Honest cryptographic boundaries
```

---

## 🧹 Troubleshooting & Reset

### Clean Reset to Baseline
To reset SQLite databases and start from a clean slate:
```bash
cd sakshilog
node clean.js
```
*Deletes `victim.db`, `collector.db`, temporary SQLite WAL files, and cached local deployment addresses.*

### Releasing Blocked Ports
If any service port is in use:
```bash
lsof -ti :8545 -ti :4001 -ti :4002 -ti :4003 -ti :4004 -ti :4005 -ti :5173 | xargs kill -9
```

### Running Test Suites
```bash
# Contracts (19 unit tests)
cd sakshilog/contracts && npx hardhat test

# Verifier (9 unit tests against synthetic tamper data)
cd sakshilog/verifier && npm test

# Dashboard (Vitest unit tests)
cd sakshilog/dashboard && npm test
```

---

## 👥 Contributors & Hackathon Track
- **Event**: The Big Hack 2.0
- **Track**: Track 02 — Cybersecurity and Blockchain
- **Problem Statement**: B3 — Tamper-Evident Security Audit Logs Anchored to Blockchain Consensus
