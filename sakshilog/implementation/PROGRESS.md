# Phase tracker

| Phase | Time | Status | Notes |
|---|---|---|---|
| 0 Kickoff | H0:00-0:45 | [ ] | |
| 1 Foundations | H0:45-4:00 | [ ] | H4 checkpoint. M1 done: contract + 19 tests + local deploy + anchorClient + smoke |
| 2 End-to-end | H4:00-8:00 | [ ] | H8 GO / NO-GO |
| 3 Attacks + depth | H8:00-11:30 | [ ] | H11:30 checkpoint |
| 4 Evidence | H11:30-14:00 | [ ] | H14 FEATURE FREEZE |
| 5 Pitch | H14:00-16:00 | [ ] | |

## Owners
- M1: blockchain, anchor service
- M2: log pipeline, collector, evidence pack
- M3: verifier, attacks, benchmarks
- M4: dashboard, pitch, cut decisions

## M1 log
- Phase 1 done: AnchorRegistry.sol (onlyAnchorer, strict nextBatchId, heartbeat empty range), 19 unit tests passing,
  deploy script -> contracts/deployments/localhost.json, anchor-service/src/anchorClient.ts, smoke test passing on local node.
- First gas numbers (hardhat, optimizer 200): anchor ~100k gas (first ever batch ~117k), heartbeat ~79k, deploy ~511k.
- Next (Phase 2): anchor service loop every 5 s + heartbeats + retry queue, /anchors endpoint, Socket.IO push.

## M2 log
- Phase 1 Foundations:
  - Express app in `agent/src/server.ts` with realistic security log simulation (auth, sudo, file access, admin actions).
  - SQLite log store with `node:sqlite` in `agent/src/db.ts`.
  - Hash chaining on every write (`hash = sha256(seq | ts | host | source | message | prevHash)`) in `agent/src/hashChain.ts`.
  - High-throughput load generator (10 to 1,000 logs/sec) with smooth 100ms ticks in `agent/src/loadGenerator.ts`.
- Phase 2 End-to-End Pipeline:
  - Merkle batching every 5 s and AnchorRegistry connection in `agent/src/anchorServiceConnector.ts`.
  - Off-host Collector (`collector/src/server.ts`, `collector/src/db.ts`) with immediate push queue from agent and batch recording.
- Phase 3 Attacks & Depth:
  - Baseline mode toggle (`BASELINE_MODE=true` or POST `/api/baseline`) implemented: suppresses blockchain anchoring while maintaining plain SQLite hash chain, enabling the "obvious fix fails" demo.
- Phase 4 Evidence:
  - Evidence Pack exporter (`evidence/src/exportPack.ts`) generating CERT-In compliant JSON pack and markdown report with per-entry Merkle proofs and on-chain batch metadata.
  - Standalone verifier (`evidence/verify-standalone.js`): single-file, zero-dependency auditor verification script checking hash chain continuity, Merkle proofs, and on-chain contract state.
- Phase 5 Packaging & Orchestration:
  - Orchestration scripts provided for clean start and testing.

## Blockers
-
