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
# 10. pnpm (OpenReel sidecar)
# ---------------------------------------------------------------------------
step "pnpm (OpenReel sidecar)"

if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm --version)"
else
  warn "pnpm not found - required by install.sh for the OpenReel sidecar. Install: corepack enable && corepack prepare pnpm --activate"
fi

# ---------------------------------------------------------------------------
# 11. Python / OpenCV (storyboard panel extraction)
# ---------------------------------------------------------------------------
step "Python / OpenCV (storyboard panel extraction)"

PY_BIN="python3"
if [ -f ".env.local" ]; then
  ENV_PY_BIN=$(grep -E "^OPENCV_PYTHON_BIN\s*=" .env.local 2>/dev/null | sed 's/^OPENCV_PYTHON_BIN\s*=\s*//' | tr -d '[:space:]')
  [ -n "$ENV_PY_BIN" ] && PY_BIN="$ENV_PY_BIN"
fi

if command -v "$PY_BIN" &>/dev/null; then
  ok "$PY_BIN found"
  if "$PY_BIN" -c "import cv2, numpy" &>/dev/null; then
    ok "opencv-python-headless and numpy importable by $PY_BIN"
  else
    warn "opencv-python-headless/numpy not importable by $PY_BIN - storyboard panel extraction will fail. Install: pip install opencv-python-headless numpy (use a venv, or --break-system-packages, on Ubuntu 24.04)."
  fi
else
  warn "$PY_BIN not found - storyboard panel extraction will fail. Install python3, or set OPENCV_PYTHON_BIN in .env.local."
fi

# ---------------------------------------------------------------------------
# 12. FFmpeg / FFprobe (bundled binaries)
# ---------------------------------------------------------------------------
step "FFmpeg / FFprobe (bundled binaries)"

if command -v node &>/dev/null; then
  FFMPEG_INFO=$(node -e "
try {
  const p = require('./node_modules/ffmpeg-ffprobe-static');
  console.log((p.ffmpegPath || '') + '|' + (p.ffprobePath || ''));
} catch (e) {
  console.log('|');
}
" 2>/dev/null)
  FFMPEG_BIN="${FFMPEG_INFO%%|*}"
  FFPROBE_BIN="${FFMPEG_INFO##*|}"
  if [ -n "$FFMPEG_BIN" ] && [ -f "$FFMPEG_BIN" ] && [ -x "$FFMPEG_BIN" ] && [ -n "$FFPROBE_BIN" ] && [ -f "$FFPROBE_BIN" ] && [ -x "$FFPROBE_BIN" ]; then
    ok "ffmpeg/ffprobe binaries present and executable"
    info "ffmpeg: $FFMPEG_BIN"
  else
    warn "ffmpeg/ffprobe binaries missing or not executable for this platform - run: npm ci"
  fi
else
  warn "node not found - ffmpeg/ffprobe check skipped."
fi

# ---------------------------------------------------------------------------
# 13. Playwright browser cache (verification passes only)
# ---------------------------------------------------------------------------
step "Playwright browser cache (verification passes only)"

has_chromium_build() {
  [ -d "$1" ] && [ -n "$(find "$1" -maxdepth 1 -type d -name 'chromium*' 2>/dev/null)" ]
}

# PLAYWRIGHT_BROWSERS_PATH always wins when set. Otherwise this doctor also
# runs under Git Bash on Windows, where playwright-core caches browsers
# under %LOCALAPPDATA%\ms-playwright, not ~/.cache/ms-playwright — the Linux
# default alone produced a WARN on every Windows run of this script, which
# is exactly the kind of warning nobody keeps reading. This does not make
# doctor.sh a Windows doctor: doctor.ps1 remains the authoritative check
# there, this is only a second, non-authoritative location to try before
# warning.
if [ -n "$PLAYWRIGHT_BROWSERS_PATH" ]; then
  PW_CACHE="$PLAYWRIGHT_BROWSERS_PATH"
elif has_chromium_build "$HOME/.cache/ms-playwright"; then
  PW_CACHE="$HOME/.cache/ms-playwright"
elif [ -n "$LOCALAPPDATA" ] && has_chromium_build "$LOCALAPPDATA/ms-playwright"; then
  PW_CACHE="$LOCALAPPDATA/ms-playwright"
else
  PW_CACHE="$HOME/.cache/ms-playwright"
fi

if has_chromium_build "$PW_CACHE"; then
  ok "Playwright browser cache found at $PW_CACHE"
else
  warn "Playwright browser cache not found at $PW_CACHE - npm run playwright:verify will fail. Install a Chromium build compatible with playwright-core (see scripts/playwright-harness.mjs)."
fi

# ---------------------------------------------------------------------------
# 14. OpenReel sidecar checkout
# ---------------------------------------------------------------------------
step "OpenReel sidecar checkout"

if [ -f "config/openreel-sidecar-release.json" ] && command -v node &>/dev/null; then
  PIN_COMMIT=$(node -e "
try {
  console.log(JSON.parse(require('fs').readFileSync('config/openreel-sidecar-release.json', 'utf8')).commit || '');
} catch (e) {
  console.log('');
}
" 2>/dev/null)

  SIDECAR_DIR="../mikai-openreel-sidecar"
  if [ -f ".env.local" ]; then
    ENV_SIDECAR_DIR=$(grep -E "^MIKAI_OPENREEL_DIR\s*=" .env.local 2>/dev/null | sed 's/^MIKAI_OPENREEL_DIR\s*=\s*//' | tr -d '[:space:]')
    [ -n "$ENV_SIDECAR_DIR" ] && SIDECAR_DIR="$ENV_SIDECAR_DIR"
  fi

  if [ -d "$SIDECAR_DIR" ]; then
    if command -v git &>/dev/null; then
      SIDECAR_HEAD=$(git -C "$SIDECAR_DIR" rev-parse HEAD 2>/dev/null || echo "")
      if [ -n "$PIN_COMMIT" ] && [ "$SIDECAR_HEAD" = "$PIN_COMMIT" ]; then
        ok "sidecar checkout at $SIDECAR_DIR is at the pinned commit ($PIN_COMMIT)"
      elif [ -n "$SIDECAR_HEAD" ]; then
        warn "sidecar checkout at $SIDECAR_DIR is at $SIDECAR_HEAD, pin expects $PIN_COMMIT - run ./install.sh or ./update.sh"
      else
        warn "sidecar checkout at $SIDECAR_DIR is not a git checkout - run ./install.sh"
      fi
    else
      warn "git not found - sidecar pin check skipped."
    fi
  else
    warn "sidecar checkout not found at $SIDECAR_DIR - run ./install.sh"
  fi
else
  warn "config/openreel-sidecar-release.json or node not available - sidecar pin check skipped."
fi

# ---------------------------------------------------------------------------
# 15. Summary
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
