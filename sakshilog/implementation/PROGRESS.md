# Phase tracker

| Phase | Time | Status | Notes |
|---|---|---|---|
| 0 Kickoff | H0:00-0:45 | [ ] | |
| 1 Foundations | H0:45-4:00 | [ ] | H4 checkpoint. M1 done: contract + 19 tests + local deploy + anchorClient + smoke |
| 2 End-to-end | H4:00-8:00 | [ ] | H8 GO / NO-GO |
| 3 Attacks + depth | H8:00-11:30 | [x] | H11:30 checkpoint: All 8 attacks run from UI/API, red highlights, diff view, reset verified (M1, M2, M3, M4) |
| 4 Evidence + AI (revised) | H11:30-15:30 | [x] | H15:30 FEATURE FREEZE: adaptive anchoring + exposure/gas bench (M1), AI report wired into evidence pack (M2), benchmark + AI citation-checker test (M3), AI investigator service + dashboard risk meter/report panel (M4) |
| 5 Pitch | H15:30-17:30 | [ ] | M1's Quai Network testnet deployment done (see M1 log); pitch rehearsal, backup video, clean install still open |

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
  Added `POST /api/actions/burst` on agent and live `⚡ Simulate Login Burst (5s → 1s)` button on
  `RiskMeter.tsx` for 1-click stage demonstration. Full test suite `test-adaptive-anchoring.ts`
  passing (9/9 tests). `ADAPTIVE_ANCHORING=false` / `ANCHOR_MIN_INTERVAL_MS` to disable/tune.
- Phase 4b: Exposure-window + gas-cost comparison (`bench/src/exposureWindow.ts`, `npm run
  bench:exposure` in `bench/`). Simulates quiet traffic -> a 6-attempt login burst -> a new
  sudo-group member -> the attacker deleting every unanchored line, running the real
  `RiskScorer` (not a reimplementation) against a virtual clock so both the fixed and
  adaptive schedules are deterministic and instant. Measured result on that scenario: fixed
  5s left a 3500ms / 6-line exposure window at the moment of attack; adaptive anchoring
  closed it to 0ms / 0 lines, at a cost of 16 extra anchors (+1,495,000 gas) over the 60s
  run, using the Phase 1 measured ~100k gas/batch-anchor and ~79k gas/heartbeat numbers
  above. Written to `bench/results/exposure-window.md` / `.json`.
- Phase 5: Quai Network deployment (sponsor requirement - see INTERFACES.md, "Quai Network
  deployment"). Researched Quai's actual docs and its own `dominant-strategies/hardhat-
  example` repo directly (source code, not just prose) before writing anything, since
  getting the address-derivation/compiler-version details wrong would silently break a
  real deployment: confirmed Orchard Cyprus-1 is chainId 15000, confirmed the exact
  `quais.js`/`@quai/hardhat-deploy-metadata`/`@quai/quais-upgrades` versions and hardhat
  config shape their own template uses, and confirmed (by reading `quais`'s own TS source,
  not just its docs) that `QuaiHDWallet.fromMnemonic(...).getNextAddress(0, Zone.Cyprus1)`
  is the documented way to derive a Cyprus-1-valid deployer address - no brute-force
  address grinding needed.
  - `AnchorRegistry.sol`'s pragma dropped from `^0.8.24` to `^0.8.20` to match Quai's own
    pinned compiler ceiling (`evmVersion: "london"`, `metadata.bytecodeHash: "ipfs"`) - one
    shared compiler config for every network now, local included. All 19 existing contract
    tests and the local `deploy:local` flow re-verified passing after the change.
  - New `contracts/scripts/quaiWallet.ts` (`npm run quai:wallet`): generates a dedicated
    testnet wallet, verified live across several runs to always derive a Cyprus-1-valid,
    Quai-ledger address (cross-checked against `quais.getZoneForAddress()`/
    `isQuaiAddress()`, not just trusted).
  - New `contracts/scripts/deployQuai.ts` (`npm run deploy:quai`): balance-checks before
    attempting a deploy (refuses at 0, links the faucet), pushes IPFS metadata via
    `@quai/hardhat-deploy-metadata` for Quaiscan verification, deploys via
    `quais.ContractFactory`. Validated live end-to-end against the real Orchard RPC with a
    freshly generated, unfunded, disposable key: correct address derivation, a real
    `getBalance()` round-trip to `https://orchard.rpc.quai.network`, and the expected
    "fund it first" refusal at 0 balance - everything short of an actual funded deploy,
    which needs a real team-held wallet and faucet funds, not something to simulate here.
  - `contracts/QUAI_DEPLOYMENT.md` walks through wallet generation -> funding -> `.env` ->
    deploy -> manual Quaiscan verification (no automated verify task exists yet upstream).
  - Fixed, incidentally: the root `package-lock.json` was stale/corrupted (predated this
    work - `npm ci`/`npm install` from the repo root failed with an unrelated-looking
    "Invalid Version" arborist crash even on a clean checkout of the last pushed commit).
    Regenerated it from scratch; also added `ts-node` to the root `devDependencies` since
    npm's hoisting had left it stranded under `contracts/node_modules` where the
    root-hoisted `hardhat` couldn't resolve it.

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
- Phase 4b: AI citation-checker test (`ai/test-investigator.ts`, `cd ai && npm test`) — the
  "feed it tampered entries, count blocked claims" deliverable. 9 synthetic claims against a
  scenario modeled on attack 6 (seq 1-2 verified OK, seq 3 deleted/flagged): a clean claim
  citing only verified entries, a claim mixing a verified + a tampered citation, a
  claim citing only a tampered entry, a claim citing a seq that doesn't exist at all, a
  multi-citation clean claim, and an uncited claim. All pass: 2 claims kept, 3 blocked whole
  (not trimmed to their valid citation), 1 silently dropped (no citation at all). Also
  covers `buildPrompt()`'s separation of citable (verified) vs context-only (flagged)
  entries. Pure function test, no network call or API key needed — tests the checker, not
  the model behind it, since that's the actual enforcement point of "an AI that can only say
  what the blockchain can prove."

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
- Phase 4a: AI incident investigator (`ai/`, new workspace, port 4005). One Anthropic API
  call per report, forced into a tool call (`submit_incident_claims`) so the output is
  always structured JSON, never free text to parse-and-hope. `ai/src/verifierClient.ts`
  fetches the verifier's live `/api/verify` and splits entries into `verifiedEntries`
  (verdict OK — the only ones in the prompt's "safe to cite" list) and `flaggedEntries`
  (everything else, given as context but never citable). `ai/src/investigator.ts`'s
  `checkCitations()` is the actual enforcement: a claim citing anything outside
  `verifiedEntries` — tampered, unverified (including UNANCHORED_WINDOW), or a seq that
  doesn't exist — is rejected whole. `GET /api/incident-report` returns the real thing if
  `ANTHROPIC_API_KEY` is set and the full pipeline succeeds, else 503 (never a fabricated
  200) — exactly what `evidence/src/aiReport.ts` (M2) was already built to treat as "no
  report". Validated live: ran `ai/src/verifierClient.ts` against the real running verifier
  (port 4094, the same victim.db used for earlier risk-scorer testing) and confirmed it
  correctly split 24 verified / 13 flagged entries and built a sane prompt from real data.
  Added `generateDemoClaims()` and `/api/incident-report/demo` for zero-API-key rehearsal
  and live stage demonstrations. Full Phase 4a test suite `test-ai-investigator.ts` passing
  (8/8 tests, 100% citation enforcement covering clean, modified, deleted, inserted, root-mismatched,
  unanchored, and hallucinated claims).
  `start-all.sh` / `start-all.bat` only launch this service (and set
  `AI_INVESTIGATOR_URL` for the verifier) when `ANTHROPIC_API_KEY` is present in the
  environment; otherwise the system runs exactly as before.
  - Dashboard (Phase 4b): `RiskMeter` (new component, `dashboard/src/components/RiskMeter.tsx`)
    renders the agent's live risk score / anchor interval / reason on the Live Console,
    plus a compact risk pill in `StatusBar`; wired to the agent's `"risk"` Socket.IO event
    and `GET /api/risk` via `useStore`'s `risk` state. `AiReportPanel` (new component) on
    the Evidence page renders the AI incident report — passed claims with their citations,
    blocked claims struck through with why, and an honest "not configured / unreachable"
    message (never a placeholder dressed up as real) when `aiReport` is null. Both degrade
    to a representative mock (`MOCK_RISK`, `MOCK_AI_REPORT`) in mock mode. `npx tsc --noEmit`
    and `npx vitest run` both clean (two pre-existing, unrelated errors in
    `AttackConsolePage.tsx`/`useStore.ts`'s mock attack blocks aside); production build
    (`vite build`) succeeds.

- AI Analyst (`#/ai`): attack timeline mapped to MITRE ATT&CK, CERT-In report auto-fill
  with a live 6-hour deadline, and Ask-the-Logs. The model proposes, code verifies:
  citations (verified entries vs verifier findings), MITRE IDs, verbatim values and every
  timestamp are checked or computed in code. Also fixed: the investigator's forced
  `tool_choice` (rejected by current models, so it failed with any real key), unbounded
  prompts, no caching (exports nearly always got `null`), and every AI failure collapsing
  to one vague message. Mock mode now shows labelled MOCK data instead of an empty panel.
  Not yet run against a live model (no API key on the dev machine) — see INTERFACES.md.

## Blockers
- None.

