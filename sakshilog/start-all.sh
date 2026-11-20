#!/bin/bash
# ==============================================================================
# SakshiLog - Launch All Services (Linux / macOS / WSL)
# ==============================================================================
set -e

echo "=== [1/7] Starting Hardhat Node on :8545 ==="
cd contracts && npx hardhat node > /dev/null 2>&1 &
CHAIN_PID=$!
sleep 4

echo "=== [2/7] Deploying AnchorRegistry contract ==="
npx hardhat run scripts/deploy.ts --network localhost
cd ..

echo "=== [3/7] Starting Anchor Service on :4003 ==="
cd anchor-service && node --experimental-strip-types src/server.ts &
ANCHOR_PID=$!
cd ..

echo "=== [4/7] Starting Collector on :4002 ==="
cd collector && node --experimental-strip-types src/server.ts &
COLLECTOR_PID=$!
cd ..

echo "=== [5/7] Starting Victim Agent on :4001 ==="
cd agent && node --experimental-strip-types src/server.ts &
AGENT_PID=$!
cd ..

AI_PID=""
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "=== [6/7] Starting AI Incident Investigator on :4005 ==="
  cd ai && node --experimental-strip-types src/server.ts &
  AI_PID=$!
  cd ..
  export AI_INVESTIGATOR_URL="http://127.0.0.1:4005"
else
  echo "=== [6/7] Skipping AI Incident Investigator (ANTHROPIC_API_KEY not set) ==="
fi

echo "=== [7/7] Starting Verifier on :4004 ==="
cd verifier && node --experimental-strip-types src/server.ts &
VERIFIER_PID=$!
cd ..

echo "=== Starting Dashboard on :5173 ==="
cd dashboard && npm run dev &
DASHBOARD_PID=$!
cd ..

echo "All services running! Open http://localhost:5173"
echo "Press Ctrl+C to stop all services."

trap "kill $CHAIN_PID $ANCHOR_PID $COLLECTOR_PID $AGENT_PID $AI_PID $VERIFIER_PID $DASHBOARD_PID 2>/dev/null" SIGINT SIGTERM EXIT
wait
