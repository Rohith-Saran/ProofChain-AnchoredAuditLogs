# Exposure window: fixed vs adaptive anchoring

Generated 2026-11-20T20:56:01.731Z. Simulated timeline: quiet traffic from T=0s, a 6-attempt brute-force
login burst starting T=20s, a new sudo-group member at T=23s, and the attacker deleting every
still-unanchored line at T=23.5s. Both schedules run the real
`RiskScorer` (`agent/src/riskScorer.ts`) against the identical event timeline.

## Exposure at the moment of attack

| Policy | Last anchor before attack | Exposure window | Lines exposed |
|---|---|---|---|
| Fixed 5s interval | T=20.0s | 3500 ms | 6 |
| Adaptive (1s–5s, risk-driven) | T=23.5s | 0 ms | 0 |

Adaptive anchoring reduced the exposure window by **3500 ms** and cut the lines
exposed to the attacker from 6 to 0 (**6 fewer**) by reacting
to the login burst instead of waiting out a fixed interval.

## Gas cost of the extra anchors

| Policy | Anchors over 60s | Heartbeats | Total gas |
|---|---|---|---|
| Fixed 5s interval | 12 | 0 | 1,200,000 |
| Adaptive | 28 | 5 | 2,695,000 |

Adaptive anchoring fired **16 extra anchors** over the 60s run to buy
that reduction, costing **1,495,000 extra gas** (using the Phase 1 measured ~100,000 gas/batch-anchor and
~79,000 gas/heartbeat from `implementation/PROGRESS.md`, M1 log).

## Notes

- Simulated timeline, not a live-chain measurement: the RiskScorer and the reschedule rule are the real agent/src/riskScorer.ts and anchorServiceConnector.ts logic, run against a virtual clock so the comparison is deterministic and instant. Gas figures are the Phase 1 Hardhat gas-reporter numbers (see implementation/PROGRESS.md, M1 log), not re-measured on-chain here.
- Both schedules share the same event timeline, so the comparison isolates the scheduling policy — nothing about log volume or attack timing differs between them.

Raw numbers: `bench/results/exposure-window.json`. Re-run: `cd bench && npm run bench:exposure`.
