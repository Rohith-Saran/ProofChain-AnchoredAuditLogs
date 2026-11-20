#!/bin/bash
# SakshiLog start script (M1 + M2 + M3 pipeline)
# Prereq: contracts chain + deploy already running (contracts: npm run node / npm run deploy:local)

echo "Starting SakshiLog Collector on :4002..."
cd collector && node --experimental-strip-types src/server.ts &
COLLECTOR_PID=$!

sleep 1

echo "Starting SakshiLog Anchor Service on :4003..."
cd ../anchor-service && node --experimental-strip-types src/server.ts &
ANCHOR_SERVICE_PID=$!

sleep 1

echo "Starting SakshiLog Victim Agent on :4001..."
cd ../agent && ANCHOR_SERVICE_URL="http://127.0.0.1:4003" node --experimental-strip-types src/server.ts &
AGENT_PID=$!

sleep 1

echo "Starting SakshiLog Verifier on :4004..."
cd ../verifier && node --experimental-strip-types src/server.ts &
VERIFIER_PID=$!

echo "SakshiLog services running."
echo "Collector PID: $COLLECTOR_PID (http://localhost:4002)"
echo "Anchor Service PID: $ANCHOR_SERVICE_PID (http://localhost:4003)"
echo "Agent PID: $AGENT_PID (http://localhost:4001)"
echo "Verifier PID: $VERIFIER_PID (http://localhost:4004)"

trap "kill $COLLECTOR_PID $ANCHOR_SERVICE_PID $AGENT_PID $VERIFIER_PID" EXIT
wait
