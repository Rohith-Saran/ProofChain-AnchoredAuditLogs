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
Full start script to come (start.sh or docker compose). Blockchain part (M1):
```
cd contracts && npm install
npm test                      # 19 contract tests (npm run test:gas for the gas table)
npm run node                  # terminal 1: local chain on :8545 (restart = full reset)
npm run deploy:local          # terminal 2: deploys, writes contracts/deployments/localhost.json
cd ../anchor-service && npm install
npm run smoke                 # anchors, reads back, checks overwrite/skip/non-anchorer are rejected
```

## Data
State clearly which data in the demo is real and which is synthetic.
