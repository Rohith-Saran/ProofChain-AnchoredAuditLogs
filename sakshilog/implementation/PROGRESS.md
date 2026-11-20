# Phase tracker

| Phase | Time | Status | Notes |
|---|---|---|---|
| 0 Kickoff | H0:00-0:45 | [ ] | |
| 1 Foundations | H0:45-4:00 | [ ] | H4 checkpoint. M1 done: contract + 19 tests + local deploy + anchorClient + smoke |
| 2 End-to-end | H4:00-8:00 | [ ] | H8 GO / NO-GO |
| 3 Attacks + depth | H8:00-11:30 | [x] | H11:30 checkpoint: All 8 attacks run from UI/API, red highlights, diff view, reset verified (M1, M2, M3, M4) |
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
- Phase 2 done: `anchor-service/src/server.ts` — standalone HTTP + Socket.IO service on :4003.
  POST /api/anchor owns nextBatchId allocation, queues requests, retries up to 3x with backoff on
  failure, resyncs once on a BadBatchId race. GET /api/anchors[/:id] for batch history. Socket.IO
  "anchored" event pushed live via a dedicated read-only AnchorClient watching the Anchored event
  directly, so every anchor is broadcast regardless of which process wrote it.
  `agent/src/anchorServiceConnector.ts` now prefers this service when ANCHOR_SERVICE_URL is set
  (start.sh/start.bat wire it up by default), falling back to its own in-process AnchorClient if
  the service is unreachable. Batch-every-5s and heartbeat loop itself still lives in the agent
  (M2's anchorServiceConnector owns the Merkle batching since it needs direct SQLite access);
  this service is the chain-facing half of that split.
  Retry path exercised live against a real nonce race from concurrent anchor-service instances on
  the same dev chain: attempt 1 failed with NONCE_EXPIRED, retried after 500 ms, succeeded.
- Next (Phase 3): silence-threshold alerting wired into a live alert channel (verifier already
  computes it), gas/latency/throughput numbers from the live pipeline (bench/ has the synthetic
  numbers; this is the measured-on-real-chain version).
- Phase 4a: Adaptive anchoring (`agent/src/riskScorer.ts` + `anchorServiceConnector.ts`). A
  rule-based `RiskScorer` (10s sliding window, no ML/network call) scores every entry
  (`HashChain.onEntries` -> `connector.observeEntries()`); a brute-force login burst, a new
  sudo-group member, or odd-hour activity raises the score and shrinks the anchor interval
  from 5000ms down to 1000ms. `AnchorConnector`'s old fixed `setInterval` is now a
  self-rescheduling loop that reads the current risk-driven interval each time it fires, and
  cuts a long wait short mid-flight if risk spikes (tested live: 5 injected "Failed password"
  lines took the score to 1.0 and the interval to the 1000ms floor within the same tick; it
  decayed back to 5000ms 10s after the burst aged out of the window, matching the plan's "5s
  normal, 1s under risk"). New `GET /api/risk` + Socket.IO `"risk"` event (agent, port 4001).
  `ADAPTIVE_ANCHORING=false` / `ANCHOR_MIN_INTERVAL_MS` to disable/tune.
- Phase 4b: Exposure-window + gas-cost comparison (`bench/src/exposureWindow.ts`, `npm run
  bench:exposure` in `bench/`). Simulates quiet traffic -> a 6-attempt login burst -> a new
  sudo-group member -> the attacker deleting every unanchored line, running the real
  `RiskScorer` (not a reimplementation) against a virtual clock so both the fixed and
  adaptive schedules are deterministic and instant. Measured result on that scenario: fixed
  5s left a 3500ms / 6-line exposure window at the moment of attack; adaptive anchoring
  closed it to 0ms / 0 lines, at a cost of 16 extra anchors (+1,495,000 gas) over the 60s
  run, using the Phase 1 measured ~100k gas/batch-anchor and ~79k gas/heartbeat numbers
  above. Written to `bench/results/exposure-window.md` / `.json`.

## M2 log
- Phase 1 Foundations:
  - Express app in `agent/src/server.ts` with realistic security log simulation (auth, sudo, file access, admin actions).
  - SQLite log store with `node:sqlite` in `agent/src/db.ts`.
  - Hash chaining on every write (`hash = sha256(seq | ts | host | source | message | prevHash)`) in `agent/src/hashChain.ts`.
  - High-throughput load generator (10 to 1,000 logs/sec) with smooth 100ms ticks in `agent/src/loadGenerator.ts`.
- Phase 2 End-to-End Pipeline:
  - Merkle batching every 5 s and AnchorRegistry connection in `agent/src/anchorServiceConnector.ts`;
    now prefers M1's anchor-service over ANCHOR_SERVICE_URL (graceful fallback to direct anchoring).
  - Off-host Collector (`collector/src/server.ts`, `collector/src/db.ts`) with immediate push queue from agent and batch recording; batchId stored against every entry on anchor.
  - Added Socket.IO to the agent (`agent/src/server.ts`, port 4001): `"log"` on every new entry
    (write, simulate, or load generator — one hook in `HashChain`), `"batch"` on every anchor
    (normal or heartbeat — one hook in `AnchorConnector`). This is what dashboard/src/api/socket.ts
    was already built to connect to; without it the live console silently falls back to mock data.
    Validated live with a socket.io-client smoke check — both events land in real time.
  - Found and fixed (see M4 log below): the verifier's actual JSON response shape (M3) didn't
    match what dashboard/src/types.ts expected (M4) — different field names for SilenceAlert,
    EntryVerdict, BatchVerdict, and BaselineVerificationResult, plus `result.ok` vs
    `result.summary.ok`. INTERFACES.md only ever froze the Verdict enum, not the envelope, so
    the two sides diverged independently.
- Phase 3 Attacks & Depth:
  - Baseline mode toggle (`BASELINE_MODE=true` or POST `/api/baseline`) implemented: suppresses blockchain anchoring while maintaining plain SQLite hash chain, enabling the "obvious fix fails" demo.
- Phase 4 Evidence:
  - Evidence Pack exporter (`evidence/src/exportPack.ts`) generating CERT-In compliant JSON pack and markdown report with per-entry Merkle proofs and on-chain batch metadata.
  - Standalone verifier (`evidence/verify-standalone.js`): single-file, zero-dependency auditor verification script checking hash chain continuity, Merkle proofs, and on-chain contract state.
- Phase 5 Packaging & Orchestration:
  - Orchestration scripts provided for clean start and testing.
- Phase 4b (revised plan): wired the AI incident report into the evidence pack
  (`evidence/src/aiReport.ts` + `exportPack.ts`). `EvidencePack.aiIncidentReport` is now
  always present: the real `IncidentReport` (`{ claims, blockedClaims, generatedAt }`) if
  `AI_INVESTIGATOR_URL` is set and answers `GET {url}/api/incident-report` within 2s,
  otherwise `null` with an honest "not configured / didn't respond" line in the generated
  markdown report — never a fabricated one. `verifier/src/server.ts`'s `/api/evidence/export`
  fetches it before calling in; the standalone `npm run export` CLI does the same. Validated
  both ways: with no AI service configured (pack correctly shows `null` + the fallback note)
  and against a mock `/api/incident-report` (claims and blocked claims both render, with
  blocked ones struck through). The AI investigator itself (the LLM call + citation checker)
  is M4's Phase 4a build — this is only the integration point, so M4 can land it without
  touching exportPack.ts again.

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
- Phase 3 Attacks & Depth complete:
  - Created `attacks/src/attackRunner.ts`: reusable programmatic execution engine for all 8 attacks + `resetVictimDatabase` restoring clean baseline from off-host collector.
  - Exposed `/api/attacks`, `/api/attacks/run/:id` and `/api/attacks/reset` on the Verifier Express service (Port 4004), enabling live API-driven attacks from UI and remote callers.
  - Full Phase 3 test suite (`test-phase3-m3-m4.ts`): 13/13 passing tests confirming plain hash chain vs SakshiLog detection across all 8 attack vectors in Section 6.

## M4 log
- Dashboard (`dashboard/`): Full implementation of SakshiLog live ops and guided explainer console.
  - Visual design tokens (`tokens.css`): Warm editorial cream paper theme (`--bg: #f4ebe0`, isometric SVG diagrams).
  - Routes (HashRouter): Landing (`#/`), Live Console (`#/live`), Attacks Matrix (`#/attacks`), Guided Step-Through (`#/attacks/:n` with `#/attacks/6` as hero), Evidence Pack (`#/evidence`), Empirical Results (`#/results` with SVG bar charts), and Honest Limits (`#/limits`).
  - Hero Screen (`#/attacks/6`): Interactive dual-lane comparison (Plain Hash Chain vs SakshiLog Architecture) demonstrating how root attackers recomputing SQLite hashes fool plain hash chains but fail against immutable on-chain Merkle roots.
  - Components: `StatusBar`, `Stepper`, `LaneDiagram` (SVG), `LogBlock`, `AnchorBlock`, `VerdictBadge`, `LogTable`, `AnchorTimeline`, `AttackButton`, `DiffView`, `BenchTable`, `BarChart`, `EvidenceCard`, `HashText`.
  - Presentation & Demo Mode: `#/?demo=1` with 18px+ typography, presenter hotkeys (1-8 attack jump, N/P stepper, R reset, V verifier, M mock toggle).
  - Automated tests passing for `Stepper` and `VerdictBadge` (`npm run test`). Full clean production build (`npm run build`).
- Bug fixes (integration errors found by cross-checking against the real backend, not visible
  in `npm run build`/`npm test` since both passed throughout — the dashboard degrades to mock
  data silently on a shape mismatch instead of crashing):
  - The verifier/dashboard JSON shape mismatch (see M2 log and INTERFACES.md "Fixed") meant
    `isAnchorSilent` was always `false` (`silent` vs. real field `triggered`) and the attack
    console's `DiffView` always showed "[ROW COMPLETELY MISSING]" / "No record in collector"
    with no diagnosis text, regardless of actual data (`reason`/`entry`/`offHostEntry` vs. real
    fields `detail`/`local`/`collector`). Fixed with an adapter, `dashboard/src/api/normalize.ts`,
    used by `apiClient.getVerification()` / `getBaselineVerification()` — not a rewrite of either
    side's own shape, so verifier's 9 unit tests and the dashboard's existing components are
    untouched. Validated live end-to-end with a real attack (edit-line on seq 3): diagnosis text,
    both rows, and `isAnchorSilent` all now reflect the real tamper.
  - `EvidenceCard`'s "Export Evidence Pack" button generated an entirely fake, hardcoded JSON
    blob and downloaded it under the real CERT-In claim — no backend endpoint existed for the
    browser to call. Added `GET /api/evidence/export` to `verifier/src/server.ts` (wraps the
    real `evidence/src/exportPack.ts` against the live victim + collector DBs and on-chain
    state) and wired the button to it via `apiClient.getEvidencePack()`, falling back to a
    clearly-labelled placeholder (never silently-fake data) only if the verifier is unreachable.
    Validated live: real tampered-entry detection shows up in the downloaded pack.
  - Phase 3 Attack Console & Red Highlights complete:
    - Wired `AttackButton` and `useStore.executeAttackLive()` to call `apiClient.executeAttack(attackId)` and `/api/attacks/run/:id` with detailed live results and comprehensive mock simulation for all 8 attacks.
    - Updated `LogTable.tsx` to detect and inject missing/deleted entries (such as sudo seq 103 in Attack 2 and 6) with high-contrast red highlights, strikethrough, and `DELETED`/`TRUNCATED` badges, enabling 1-click inspection of missing entries.
    - Enhanced `DiffView.tsx` with field-level diff styling (green for original collector witness, red for tampered SQLite store), highlighting exact character changes and reason codes.
    - Added "Reset All to Clean Baseline" and live attack result card on `AttackConsolePage.tsx` and `AttackStepPage.tsx`.

## Blockers
- None.

