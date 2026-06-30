#!/usr/bin/env bash
# MikAI Production Lab - Linux setup script
# Prepares a fresh clone for development on Linux (Ubuntu, WSL, RunPod).
# Usage: ./setup-linux.sh

set -e
cd "$(dirname "$0")"

OK_COUNT=0
WARN_COUNT=0
ERR_COUNT=0

ok()   { echo "  OK    $1"; OK_COUNT=$((OK_COUNT + 1)); }
warn() { echo "  WARN  $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
err()  { echo "  ERROR $1"; ERR_COUNT=$((ERR_COUNT + 1)); }
step() { echo ""; echo "[setup] $1"; }

# ---------------------------------------------------------------------------
# 1. Source nvm if available
# ---------------------------------------------------------------------------
step "nvm"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  ok "nvm sourced from $HOME/.nvm/nvm.sh"
else
  warn "nvm not found at $HOME/.nvm/nvm.sh - skipping nvm source."
  warn "If node is not in PATH, install nvm:"
  warn "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
  warn "  source ~/.bashrc && nvm install 22 && nvm use 22"
fi

if command -v nvm &>/dev/null; then
  if [ -f ".nvmrc" ]; then
    nvm use --silent 2>/dev/null || nvm use 22 --silent 2>/dev/null || true
  else
    nvm use 22 --silent 2>/dev/null || true
  fi
fi

# ---------------------------------------------------------------------------
# 2. Verify Node version
# ---------------------------------------------------------------------------
step "Node version check"

if ! command -v node &>/dev/null; then
  echo ""
  echo "  ERROR: node not found."
  echo "  MikAI requires Node 22 LTS. Install it with:"
  echo "    nvm install 22 && nvm use 22"
  echo ""
  echo "Aborting setup."
  exit 1
fi

NODE_VERSION_RAW=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION_RAW" | sed 's/v\([0-9]*\)\..*/\1/')

if [ "$NODE_MAJOR" -eq 22 ]; then
  ok "node $NODE_VERSION_RAW (Node 22 LTS - required)"
else
  echo ""
  echo "  ERROR: node $NODE_VERSION_RAW - MikAI requires Node 22 LTS."
  echo "  Node 24 is not supported (better-sqlite3 native bindings unavailable)."
  echo "  Fix: nvm install 22 && nvm use 22"
  echo ""
  echo "Aborting setup."
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Verify npm
# ---------------------------------------------------------------------------
step "npm"

if ! command -v npm &>/dev/null; then
  echo "  ERROR: npm not found. Check your Node installation."
  exit 1
fi

NPM_VERSION=$(npm --version)
ok "npm $NPM_VERSION"

# ---------------------------------------------------------------------------
# 4. Copy .env.local from example if missing
# ---------------------------------------------------------------------------
step ".env.local"

if [ -f ".env.local" ]; then
  ok ".env.local already exists - not overwritten."
elif [ -f ".env.local.example" ]; then
  cp ".env.local.example" ".env.local"
  ok ".env.local created from .env.local.example."
  warn "Review .env.local and set your API keys / paths as needed."
else
  warn ".env.local.example not found - could not create .env.local."
fi

# ---------------------------------------------------------------------------
# 5. Create runtime directories if absent
# ---------------------------------------------------------------------------
step "Runtime directories"

for dir in data public/uploads public/outputs storage storage/outputs; do
  if [ -d "$dir" ]; then
    ok "$dir already exists"
  else
    mkdir -p "$dir"
    ok "$dir created"
  fi
done

# ---------------------------------------------------------------------------
# 6. npm ci
# ---------------------------------------------------------------------------
step "npm ci (install dependencies)"

if npm ci; then
  ok "Dependencies installed."
else
  echo ""
  echo "  ERROR: npm ci failed."
  echo "  If better-sqlite3 fails to build, install build tools:"
  echo "    sudo apt-get install -y build-essential python3"
  echo ""
  exit 1
fi

# ---------------------------------------------------------------------------
# 7. npm run db:migrate
# ---------------------------------------------------------------------------
step "Database migrations"

if npm run db:migrate; then
  ok "Migrations applied."
else
  echo "  ERROR: db:migrate failed."
  exit 1
fi

# ---------------------------------------------------------------------------
# 8. Summary
# ---------------------------------------------------------------------------
echo ""
echo "======================================"
echo "  MikAI Setup Summary"
echo "======================================"
echo "  OK:      $OK_COUNT"
echo "  WARNING: $WARN_COUNT"
echo "  ERROR:   $ERR_COUNT"
echo ""
echo "  Setup complete. Start the dev server:"
echo ""
echo "    ./start-dev.sh"
echo "    # or"
echo "    npm run dev:host"
echo ""
