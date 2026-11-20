@echo off
REM SakshiLog Windows startup script (M1 + M2)

echo Starting SakshiLog Collector on http://127.0.0.1:4002 ...
start "SakshiLog Collector" cmd /k "cd collector && node --experimental-strip-types src/server.ts"

timeout /t 2 >nul

echo Starting SakshiLog Victim Agent on http://127.0.0.1:4001 ...
start "SakshiLog Agent" cmd /k "cd agent && node --experimental-strip-types src/server.ts"

echo SakshiLog pipeline started successfully.
