@echo off
REM ==============================================================================
REM SakshiLog - Launch All Services (Windows)
REM ==============================================================================
echo ==============================================================================
echo                  Starting SakshiLog System Services
echo ==============================================================================

echo [1/6] Starting Hardhat Local Blockchain on http://127.0.0.1:8545 ...
start "Hardhat Chain (:8545)" cmd /k "cd contracts && npx hardhat node"

echo Waiting 5 seconds for chain to boot...
timeout /t 5 >nul

echo [2/6] Deploying AnchorRegistry smart contract...
cd contracts && call npx hardhat run scripts/deploy.ts --network localhost && cd ..

echo [3/6] Starting Anchor Service on http://127.0.0.1:4003 ...
start "Anchor Service (:4003)" cmd /k "cd anchor-service && node --experimental-strip-types src/server.ts"

echo [4/6] Starting Off-Host Collector on http://127.0.0.1:4002 ...
start "Collector (:4002)" cmd /k "cd collector && node --experimental-strip-types src/server.ts"

echo [5/6] Starting Victim Agent on http://127.0.0.1:4001 ...
start "Victim Agent (:4001)" cmd /k "cd agent && node --experimental-strip-types src/server.ts"

echo [6/6] Starting Verifier Service on http://127.0.0.1:4004 ...
start "Verifier (:4004)" cmd /k "cd verifier && node --experimental-strip-types src/server.ts"

echo Starting React Dashboard on http://localhost:5173 ...
start "Dashboard (:5173)" cmd /k "cd dashboard && npm run dev"

echo ==============================================================================
echo All services launched!
echo Open your browser at http://localhost:5173
echo To seed demo logs, run: cd agent ^&^& npm run seed
echo ==============================================================================
