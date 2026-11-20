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

## Blockers
-
