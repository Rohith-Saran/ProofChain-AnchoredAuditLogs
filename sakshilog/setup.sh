#!/bin/bash
# ==============================================================================
# SakshiLog - One-Click Setup Script (Linux / macOS / WSL)
# ==============================================================================
set -e

echo "=== Installing dependencies across all packages ==="
npm install

echo "=== Compiling contracts ==="
cd contracts && npx hardhat compile && cd ..

echo "=== Setup complete! ==="
