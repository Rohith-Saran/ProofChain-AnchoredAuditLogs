#!/bin/bash
# ==============================================================================
# SakshiLog - Launch All Services (Linux / macOS / WSL)
# ==============================================================================
set -e

echo "=== [1/6] Starting Hardhat Node on :8545 ==="
cd contracts && npx hardhat node > /dev/null 2>&1 &
CHAIN_PID=$!
sleep 4

echo "=== [2/6] Deploying AnchorRegistry contract ==="
npx hardhat run scripts/deploy.ts --network localhost
cd ..

echo "=== [3/6] Starting Anchor Service on :4003 ==="
cd anchor-service && node --experimental-strip-types src/server.ts &
ANCHOR_PID=$!
cd ..

echo "=== [4/6] Starting Collector on :4002 ==="
cd collector && node --experimental-strip-types src/server.ts &
COLLECTOR_PID=$!
cd ..

echo "=== [5/6] Starting Victim Agent on :4001 ==="
cd agent && node --experimental-strip-types src/server.ts &
AGENT_PID=$!
cd ..

echo "=== [6/6] Starting Verifier on :4004 ==="
cd verifier && node --experimental-strip-types src/server.ts &
VERIFIER_PID=$!
cd ..

echo "=== Starting Dashboard on :5173 ==="
cd dashboard && npm run dev &
DASHBOARD_PID=$!
cd ..

echo "All services running! Open http://localhost:5173"
echo "Press Ctrl+C to stop all services."

trap "kill $CHAIN_PID $ANCHOR_PID $COLLECTOR_PID $AGENT_PID $VERIFIER_PID $DASHBOARD_PID" SIGINT SIGTERM EXIT
wait
