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

## M3 log
- Verifier (`verifier/`): pure `verifyLogs()` engine (batch-level Merkle root/lastChainHash check against
  on-chain state, entry-level cross-check against the off-host collector for DELETED/INSERTED/MODIFIED/
  REORDERED/TRUNCATED, silence detection) + `verifyBaseline()` (plain hash-chain-only check, for the
  "obvious fix fails" demo). Express API on :4004 (`/api/verify`, `/api/verify/batch/:id`,
  `/api/verify/baseline`, `/api/silence`). 9 unit tests (`verifier/test-verifier.ts`), all passing,
  covering all 8 attacks against synthetic data with no live chain needed.
- Attacks (`attacks/`): all 8 attack scripts, `node src/run.ts <1-8>`, operating directly on
  `agent/victim.db` (attack 7 kills the agent's process by port; attack 8 uses the anchorer key
  against the live contract). Validated live end-to-end against the real agent + collector +
  local chain + verifier (attack 6 in particular: plain hash chain says "all good", SakshiLog
  correctly names the deleted seq and flags every re-chained entry after it via the batch root
  mismatch).
- Bench (`bench/`): `npm run bench` runs attacks 1-6 20x each at random positions against a fresh
  in-memory scenario (pure functions, no live chain), plus 20 clean runs and a silence-timing
  sweep. Measured results in `bench/results/results.md` / `results.json` match the plan's expected
  attack matrix exactly: attacks 1-4 caught by both baseline and SakshiLog, attacks 5-6 missed by
  baseline but caught by SakshiLog, 0/20 false positives on clean runs, silence alert correctly
  on/off at every tested idle gap.
- Found + fixed two cross-cutting bugs blocking the whole pipeline on Windows, surfaced while
  wiring the verifier to the real chain: (1) agent's dynamic `import()` of anchorClient.ts used a
  bare Windows path instead of a file:// URL (silently swallowed by a try/catch, so anchoring
  never actually reached the chain); (2) anchorClient.ts used a TS constructor parameter property
  and bare `__dirname`, both of which break under `node --experimental-strip-types` / plain ESM.
  Also added heartbeat anchoring to `agent/src/anchorServiceConnector.ts` (triggerBatch()
  previously just returned null when idle instead of posting the empty-range heartbeat the
  contract already supports) — without it, silence detection can't tell "idle" from "dead".

## M4 log
- Dashboard (`dashboard/`): Full implementation of SakshiLog live ops and guided explainer console.
  - Visual design tokens (`tokens.css`): Warm editorial cream paper theme (`--bg: #f4ebe0`, isometric SVG diagrams).
  - Routes (HashRouter): Landing (`#/`), Live Console (`#/live`), Attacks Matrix (`#/attacks`), Guided Step-Through (`#/attacks/:n` with `#/attacks/6` as hero), Evidence Pack (`#/evidence`), Empirical Results (`#/results` with SVG bar charts), and Honest Limits (`#/limits`).
  - Hero Screen (`#/attacks/6`): Interactive dual-lane comparison (Plain Hash Chain vs SakshiLog Architecture) demonstrating how root attackers recomputing SQLite hashes fool plain hash chains but fail against immutable on-chain Merkle roots.
  - Components: `StatusBar`, `Stepper`, `LaneDiagram` (SVG), `LogBlock`, `AnchorBlock`, `VerdictBadge`, `LogTable`, `AnchorTimeline`, `AttackButton`, `DiffView`, `BenchTable`, `BarChart`, `EvidenceCard`, `HashText`.
  - Presentation & Demo Mode: `#/?demo=1` with 18px+ typography, presenter hotkeys (1-8 attack jump, N/P stepper, R reset, V verifier, M mock toggle).
  - Automated tests passing for `Stepper` and `VerdictBadge` (`npm run test`). Full clean production build (`npm run build`).

## Blockers
- None.

