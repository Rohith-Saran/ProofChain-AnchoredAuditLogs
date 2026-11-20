#!/bin/bash
# SakshiLog start script (M1 + M2 pipeline)

echo "Starting SakshiLog Collector on :4002..."
cd collector && node --experimental-strip-types src/server.ts &
COLLECTOR_PID=$!

sleep 1

echo "Starting SakshiLog Victim Agent on :4001..."
cd ../agent && node --experimental-strip-types src/server.ts &
AGENT_PID=$!

echo "SakshiLog services running."
echo "Collector PID: $COLLECTOR_PID (http://localhost:4002)"
echo "Agent PID: $AGENT_PID (http://localhost:4001)"

trap "kill $COLLECTOR_PID $AGENT_PID" EXIT
wait
