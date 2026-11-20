# SakshiLog: logs the attacker can't erase

The Big Hack 2.0, Track 02 (Cybersecurity and blockchain), problem B3.

## Folders
| Folder | Owner | What goes here |
|---|---|---|
| contracts/ | M1 | AnchorRegistry.sol, Hardhat config, deploy scripts, tests |
| anchor-service/ | M1 | Batches Merkle roots and anchors them every 5 s; heartbeat and silence detection |
| agent/ | M2 | Demo app, log writer, hash chain, Merkle batching |
| collector/ | M2 | Off-host copy of every log entry |
| evidence/ | M2 | Evidence pack export and verify-standalone.js |
| verifier/ | M3 | Rebuilds hashes and compares them with on-chain roots; per-entry verdicts |
| attacks/ | M3 | Attack scripts 1 to 8, run as root against the log store |
| bench/ | M3 | Benchmark runner; results/ holds measured numbers and charts |
| dashboard/ | M4 | React + Vite dashboard |
| implementation/ | All | 16-hour implementation plan and phase tracking |
| docs/ | M4 | Slides, pitch notes, judge Q&A |

## Run
Blockchain part (M1), then start.sh / start.bat for the pipeline (M2 + M3):
```
cd contracts && npm install
npm test                      # 19 contract tests (npm run test:gas for the gas table)
npm run node                  # terminal 1: local chain on :8545 (restart = full reset)
npm run deploy:local          # terminal 2: deploys, writes contracts/deployments/localhost.json
cd ../anchor-service && npm install
npm run smoke                 # anchors, reads back, checks overwrite/skip/non-anchorer are rejected
                               # (don't run this against the chain you then use for a live demo — see INTERFACES.md)

./start.sh                    # or start.bat on Windows — collector :4002, anchor-service :4003, agent :4001, verifier :4004
```

Attacks (run as root against `agent/victim.db`), benchmarks, and evidence export (M3):
```
cd attacks && npm install
node --experimental-strip-types src/run.ts 6        # attack 6, the headline one: delete + recompute
                                                     # 1 edit, 2 delete, 3 insert, 4 reorder, 5 truncate, 7 kill agent, 8 steal key

cd ../verifier && npm install && npm test           # 9 unit tests, all 8 attacks against synthetic data
curl http://127.0.0.1:4004/api/verify               # live verdicts after an attack

cd ../bench && npm install && npm run bench         # attack matrix with measured numbers -> bench/results/results.md

cd ../evidence && npm install && npm run export     # evidence-pack.json + CERT-In report
node verify-standalone.js evidence-pack.json
```

## Data
State clearly which data in the demo is real and which is synthetic.
