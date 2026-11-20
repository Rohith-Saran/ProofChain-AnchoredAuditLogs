@echo off
REM ==============================================================================
REM SakshiLog - Launch All Services (Windows)
REM ==============================================================================
echo ==============================================================================
echo                  Starting SakshiLog System Services
echo ==============================================================================

echo [1/7] Starting Hardhat Local Blockchain on http://127.0.0.1:8545 ...
start "Hardhat Chain (:8545)" cmd /k "cd contracts && npx hardhat node"

echo Waiting 5 seconds for chain to boot...
timeout /t 5 >nul

echo [2/7] Deploying AnchorRegistry smart contract...
cd contracts && call npx hardhat run scripts/deploy.ts --network localhost && cd ..

echo [3/7] Starting Anchor Service on http://127.0.0.1:4003 ...
start "Anchor Service (:4003)" cmd /k "cd anchor-service && node --experimental-strip-types src/server.ts"

echo [4/7] Starting Off-Host Collector on http://127.0.0.1:4002 ...
start "Collector (:4002)" cmd /k "cd collector && node --experimental-strip-types src/server.ts"

echo [5/7] Starting Victim Agent on http://127.0.0.1:4001 ...
start "Victim Agent (:4001)" cmd /k "cd agent && node --experimental-strip-types src/server.ts"

if defined ANTHROPIC_API_KEY (
  echo [6/7] Starting AI Incident Investigator on http://127.0.0.1:4005 ...
  start "AI Investigator (:4005)" cmd /k "cd ai && node --experimental-strip-types src/server.ts"
  set "AI_INVESTIGATOR_URL=http://127.0.0.1:4005"
) else (
  echo [6/7] Skipping AI Incident Investigator ^(ANTHROPIC_API_KEY not set^) ...
)

echo [7/7] Starting Verifier Service on http://127.0.0.1:4004 ...
start "Verifier (:4004)" cmd /k "cd verifier && node --experimental-strip-types src/server.ts"

echo Starting React Dashboard on http://localhost:5173 ...
start "Dashboard (:5173)" cmd /k "cd dashboard && npm run dev"

echo ==============================================================================
echo All services launched!
echo Open your browser at http://localhost:5173
echo To seed demo logs, run: cd agent ^&^& npm run seed
echo ==============================================================================
