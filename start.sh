#!/usr/bin/env bash
# Launch the pinned MikAI + OpenReel sidecar pair in production mode — thin
# wrapper around scripts/mikai-deploy.mjs (DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec node scripts/mikai-deploy.mjs start
