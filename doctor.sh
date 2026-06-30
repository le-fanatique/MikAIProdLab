#!/usr/bin/env bash
# MikAI Production Lab - Linux environment diagnostic script
# Read-only: does not modify files, install packages, or run migrations.
# Usage: ./doctor.sh

cd "$(dirname "$0")"

OK_COUNT=0
WARN_COUNT=0
ERR_COUNT=0

ok()   { echo "  [OK]   $1"; OK_COUNT=$((OK_COUNT + 1)); }
warn() { echo "  [WARN] $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
err()  { echo "  [ERR]  $1"; ERR_COUNT=$((ERR_COUNT + 1)); }
info() { echo "         $1"; }
step() { echo ""; echo "--- $1 ---"; }

# ---------------------------------------------------------------------------
# 1. Repo / working directory
# ---------------------------------------------------------------------------
step "Repo"

if [ -f "package.json" ]; then
  ok "package.json found"
  info "Path: $(pwd)"
else
  err "package.json not found - run this script from the project root."
fi

if command -v git &>/dev/null; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  HEAD_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  ok "git: branch=$BRANCH  HEAD=$HEAD_HASH"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    warn "Working tree has uncommitted changes."
  else
    info "Working tree clean."
  fi
else
  warn "git not found - branch/status check skipped."
fi

# ---------------------------------------------------------------------------
# 2. Node version
# ---------------------------------------------------------------------------
step "Node"

# Source nvm if available (non-interactive shells may not have it)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
fi

if command -v node &>/dev/null; then
  NODE_VERSION_RAW=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION_RAW" | sed 's/v\([0-9]*\)\..*/\1/')
  if [ "$NODE_MAJOR" -eq 22 ]; then
    ok "node $NODE_VERSION_RAW (Node 22 LTS - required)"
  elif [ "$NODE_MAJOR" -gt 22 ]; then
    err "node $NODE_VERSION_RAW - Node 22 required. Node 24+ breaks better-sqlite3."
    info "Fix: nvm install 22 && nvm use 22"
  else
    warn "node $NODE_VERSION_RAW - Node 22 LTS recommended."
    info "Fix: nvm install 22 && nvm use 22"
  fi
else
  err "node not found. Install Node 22 LTS: nvm install 22 && nvm use 22"
fi

# ---------------------------------------------------------------------------
# 3. npm
# ---------------------------------------------------------------------------
step "npm"

if command -v npm &>/dev/null; then
  NPM_VERSION=$(npm --version)
  ok "npm $NPM_VERSION"
else
  err "npm not found - check Node installation."
fi

# ---------------------------------------------------------------------------
# 4. Dependencies
# ---------------------------------------------------------------------------
step "Dependencies"

if [ -d "node_modules" ]; then
  ok "node_modules present"
else
  warn "node_modules missing - run ./setup-linux.sh or: npm ci"
fi

# ---------------------------------------------------------------------------
# 5. Environment file
# ---------------------------------------------------------------------------
step "Environment"

if [ -f ".env.local" ]; then
  ok ".env.local present"
else
  warn ".env.local missing - copy .env.local.example to .env.local"
fi

if [ -f ".env.local.example" ]; then
  ok ".env.local.example present"
else
  warn ".env.local.example missing"
fi

# ---------------------------------------------------------------------------
# 6. Database
# ---------------------------------------------------------------------------
step "Database"

if [ -d "data" ]; then
  ok "data/ directory exists"
  DB_FILES=$(find data -maxdepth 1 -name "*.db" 2>/dev/null)
  if [ -n "$DB_FILES" ]; then
    while IFS= read -r f; do
      SIZE=$(du -k "$f" 2>/dev/null | awk '{print $1}')
      ok "DB file: $(basename "$f") (${SIZE} KB)"
    done <<< "$DB_FILES"
  else
    warn "No .db file in data/ - run: npm run db:migrate"
  fi
else
  warn "data/ directory missing - run: npm run db:migrate"
fi

# ---------------------------------------------------------------------------
# 7. Runtime folders
# ---------------------------------------------------------------------------
step "Runtime folders"

for dir in public/uploads public/outputs storage storage/outputs; do
  if [ -d "$dir" ]; then
    ok "$dir exists"
  else
    warn "$dir missing - run ./setup-linux.sh or create it manually."
  fi
done

# ---------------------------------------------------------------------------
# 8. Git safety - verify .env.local and data/ are not tracked
# ---------------------------------------------------------------------------
step "Git safety"

if command -v git &>/dev/null; then
  if git ls-files --error-unmatch ".env.local" &>/dev/null 2>&1; then
    err ".env.local IS tracked by git - remove it: git rm --cached .env.local"
  else
    ok ".env.local is NOT tracked by git (correct)"
  fi

  if git ls-files --error-unmatch "data" &>/dev/null 2>&1; then
    err "data/ IS tracked by git - contains local DB. Add data/ to .gitignore."
  else
    ok "data/ is NOT tracked by git (correct)"
  fi
else
  warn "git not found - git safety checks skipped."
fi

# ---------------------------------------------------------------------------
# 9. Optional local services
# ---------------------------------------------------------------------------
step "Local services (optional)"

COMFY_URL="http://127.0.0.1:8188"
OLLAMA_URL="http://127.0.0.1:11434"

if [ -f ".env.local" ]; then
  COMFY_ENV=$(grep -E "^COMFY_BASE_URL\s*=" .env.local 2>/dev/null | sed 's/^COMFY_BASE_URL\s*=\s*//' | tr -d '[:space:]')
  OLLAMA_ENV=$(grep -E "^OLLAMA_BASE_URL\s*=" .env.local 2>/dev/null | sed 's/^OLLAMA_BASE_URL\s*=\s*//' | tr -d '[:space:]')
  [ -n "$COMFY_ENV" ]  && COMFY_URL="$COMFY_ENV"
  [ -n "$OLLAMA_ENV" ] && OLLAMA_URL="$OLLAMA_ENV"
fi

info "ComfyUI: $COMFY_URL"
if command -v curl &>/dev/null; then
  if curl -sf --max-time 3 "$COMFY_URL/system_stats" &>/dev/null; then
    ok "ComfyUI reachable at $COMFY_URL"
  else
    warn "ComfyUI not reachable at $COMFY_URL - start ComfyUI for image/video generation."
  fi
else
  warn "curl not found - ComfyUI check skipped."
fi

info "Ollama: $OLLAMA_URL"
if command -v curl &>/dev/null; then
  if curl -sf --max-time 3 "$OLLAMA_URL/api/tags" &>/dev/null; then
    ok "Ollama reachable at $OLLAMA_URL"
  else
    warn "Ollama not reachable at $OLLAMA_URL - start Ollama for local LLM."
  fi
else
  warn "curl not found - Ollama check skipped."
fi

# ---------------------------------------------------------------------------
# 10. Summary
# ---------------------------------------------------------------------------
echo ""
echo "======================================"
echo "  MikAI Doctor Summary"
echo "======================================"
echo "  OK:      $OK_COUNT"
echo "  WARNING: $WARN_COUNT"
echo "  ERROR:   $ERR_COUNT"
echo ""

if [ "$ERR_COUNT" -gt 0 ]; then
  echo "  Errors found - fix them before starting the app."
  exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
  echo "  Warnings found - app may not work fully until resolved."
  exit 0
else
  echo "  All checks passed."
  exit 0
fi
