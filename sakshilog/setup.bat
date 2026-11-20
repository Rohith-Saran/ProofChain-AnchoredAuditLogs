@echo off
REM ==============================================================================
REM SakshiLog - One-Click Setup Script (Windows)
REM ==============================================================================
echo ==============================================================================
echo                      SakshiLog Environment Setup
echo ==============================================================================

echo [1/8] Installing contracts dependencies...
cd contracts && call npm install && cd ..

echo [2/8] Compiling Solidity smart contracts...
cd contracts && call npx hardhat compile && cd ..

echo [3/8] Installing anchor-service dependencies...
cd anchor-service && call npm install && cd ..

echo [4/8] Installing victim agent dependencies...
cd agent && call npm install && cd ..

echo [5/8] Installing collector dependencies...
cd collector && call npm install && cd ..

echo [6/8] Installing verifier dependencies...
cd verifier && call npm install && cd ..

echo [7/8] Installing attack simulator and bench dependencies...
cd attacks && call npm install && cd ..
cd bench && call npm install && cd ..

echo [8/8] Installing React dashboard dependencies...
cd dashboard && call npm install && cd ..

echo ==============================================================================
echo Setup Complete! Run 'start-all.bat' to launch the entire system.
echo ==============================================================================
