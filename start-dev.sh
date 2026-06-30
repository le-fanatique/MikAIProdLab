#!/usr/bin/env bash
# MikAI Production Lab - Linux dev server launcher
# Usage: ./start-dev.sh
#
# Starts the Next.js dev server on all network interfaces (0.0.0.0:3000)
# so it is reachable from other devices on the local network.

set -e
cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
# Source nvm if available
# ---------------------------------------------------------------------------
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi

# ---------------------------------------------------------------------------
# Select Node version (uses .nvmrc if present, otherwise 22)
# ---------------------------------------------------------------------------
if command -v nvm &>/dev/null; then
  if [ -f ".nvmrc" ]; then
    nvm use --silent 2>/dev/null || nvm use 22 --silent 2>/dev/null || true
  else
    nvm use 22 --silent 2>/dev/null || true
  fi
fi

# ---------------------------------------------------------------------------
# Verify node is available
# ---------------------------------------------------------------------------
if ! command -v node &>/dev/null; then
  echo "[start-dev] ERROR: node not found."
  echo "[start-dev] Install Node 22 LTS via nvm:"
  echo "[start-dev]   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
  echo "[start-dev]   source ~/.bashrc"
  echo "[start-dev]   nvm install 22 && nvm use 22"
  exit 1
fi

NODE_VERSION=$(node --version)
echo "[start-dev] node $NODE_VERSION"

if ! command -v npm &>/dev/null; then
  echo "[start-dev] ERROR: npm not found. Check your Node installation."
  exit 1
fi

NPM_VERSION=$(npm --version)
echo "[start-dev] npm $NPM_VERSION"

# ---------------------------------------------------------------------------
# Start dev server
# ---------------------------------------------------------------------------
echo "[start-dev] Starting MikAI on http://0.0.0.0:3000 ..."
npm run dev:host
