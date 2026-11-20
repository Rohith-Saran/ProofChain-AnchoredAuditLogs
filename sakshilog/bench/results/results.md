# SakshiLog benchmark results

Generated 2026-11-20T10:55:45.102Z. 20 runs per attack, random position each run, on a fresh 200-entry / 4-batch scenario. Baseline = plain hash chain only (no blockchain, no off-host collector). SakshiLog = full verifier (on-chain Merkle root + off-host collector cross-check).

## Attack matrix (measured)

| # | Attack (run as root) | Plain hash chain | SakshiLog verdict | Avg detection latency |
|---|---|---|---|---|
| 1 | Edit a line (change attacker's IP) | Caught | 100% (20/20 correct verdict) | 1.207 ms |
| 2 | Delete a line (the sudo entry) | Caught | 100% (20/20 correct verdict) | 0.967 ms |
| 3 | Insert a fake line | Caught | 100% (20/20 correct verdict) | 0.968 ms |
| 4 | Reorder lines | Caught | 100% (20/20 correct verdict) | 0.76 ms |
| 5 | Truncate the tail | Missed | 100% (20/20 correct verdict) | 0.8 ms |
| 6 | Delete a line and recompute every hash after it | Missed | 100% (20/20 correct verdict) | 0.778 ms |
| 7 | Kill the agent | Missed | ANCHOR_SILENCE (validated live — see silence timing below) | n/a here |
| 8 | Steal anchor key, overwrite an old batch | n/a | Rejected by contract (validated live — anchor-service smoke test + attacks/08) | n/a here |

## False positives on clean runs (target 0)

0 / 20 clean runs raised a tamper alert.

## Silence detection timing

Anchor interval 5000 ms, alert threshold 10s (2x interval). 14/14 idle-gap checks matched the expected on/off transition:

| Idle seconds since last anchor | Expected | Got | Pass |
|---|---|---|---|
| 0s | quiet | quiet | ✓ |
| 2s | quiet | quiet | ✓ |
| 4s | quiet | quiet | ✓ |
| 6s | quiet | quiet | ✓ |
| 8s | quiet | quiet | ✓ |
| 9s | quiet | quiet | ✓ |
| 10s | quiet | quiet | ✓ |
| 11s | ANCHOR_SILENCE | ANCHOR_SILENCE | ✓ |
| 12s | ANCHOR_SILENCE | ANCHOR_SILENCE | ✓ |
| 15s | ANCHOR_SILENCE | ANCHOR_SILENCE | ✓ |
| 20s | ANCHOR_SILENCE | ANCHOR_SILENCE | ✓ |
| 30s | ANCHOR_SILENCE | ANCHOR_SILENCE | ✓ |
| 45s | ANCHOR_SILENCE | ANCHOR_SILENCE | ✓ |
| 60s | ANCHOR_SILENCE | ANCHOR_SILENCE | ✓ |

## Detection latency detail

Per-attack average and p95 of `verifyLogs()`'s own compute time (sub-millisecond; this is the verifier's matching cost, not the end-to-end "tamper to red verdict on the dashboard" time, which also includes however often the dashboard polls `/api/verify`):

| Attack | Avg latency | p95 latency |
|---|---|---|
| edit-line | 1.207 ms | 2.99 ms |
| delete-line | 0.967 ms | 1.86 ms |
| insert-fake-line | 0.968 ms | 2.015 ms |
| reorder-lines | 0.76 ms | 1.8 ms |
| truncate-tail | 0.8 ms | 2.728 ms |
| delete-and-recompute | 0.778 ms | 3.217 ms |

## Notes

- Attack 7 (kill the agent) and attack 8 (steal the key, overwrite a batch) are operational / contract-level, not per-entry — validated live by attacks/src/07-kill-agent.ts, attacks/src/08-steal-key-overwrite.ts, and anchor-service's smoke test.
- Latency here is verifyLogs()'s own compute time against an in-memory scenario (sub-millisecond); it does not include the agent's anchor interval or network round trips. Exposure window and real end-to-end throughput are measured against the live pipeline (see implementation/PROGRESS.md, M1 log).

Raw numbers: `bench/results/results.json`. Re-run: `cd bench && npm run bench`.
