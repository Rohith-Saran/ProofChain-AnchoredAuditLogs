@echo off
REM SakshiLog Windows startup script (M1 + M2 + M3)
REM Prereq: contracts chain + deploy already running (contracts: npm run node / npm run deploy:local)

echo Starting SakshiLog Collector on http://127.0.0.1:4002 ...
start "SakshiLog Collector" cmd /k "cd collector && node --experimental-strip-types src/server.ts"

timeout /t 2 >nul

echo Starting SakshiLog Anchor Service on http://127.0.0.1:4003 ...
start "SakshiLog Anchor Service" cmd /k "cd anchor-service && node --experimental-strip-types src/server.ts"

timeout /t 2 >nul

echo Starting SakshiLog Victim Agent on http://127.0.0.1:4001 ...
start "SakshiLog Agent" cmd /k "cd agent && set ANCHOR_SERVICE_URL=http://127.0.0.1:4003 && node --experimental-strip-types src/server.ts"

timeout /t 2 >nul

echo Starting SakshiLog Verifier on http://127.0.0.1:4004 ...
start "SakshiLog Verifier" cmd /k "cd verifier && node --experimental-strip-types src/server.ts"

echo SakshiLog pipeline started successfully.
