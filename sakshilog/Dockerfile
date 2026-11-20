# Multi-service base image for SakshiLog monorepo (Node.js 24 + curl)
FROM node:24-alpine

RUN apk add --no-cache curl python3 make g++

WORKDIR /app

# Copy root manifest and workspaces
COPY package*.json ./
COPY contracts/package*.json ./contracts/
COPY anchor-service/package*.json ./anchor-service/
COPY agent/package*.json ./agent/
COPY collector/package*.json ./collector/
COPY verifier/package*.json ./verifier/
COPY attacks/package*.json ./attacks/
COPY bench/package*.json ./bench/
COPY evidence/package*.json ./evidence/
COPY dashboard/package*.json ./dashboard/
COPY ai/package*.json ./ai/

# Install dependencies across all workspaces
RUN npm install --prefer-offline || npm install

# Copy application source code
COPY . .

# Compile smart contracts during build
RUN cd contracts && npx hardhat compile

EXPOSE 4001 4002 4003 4004 4005 5173 8545
