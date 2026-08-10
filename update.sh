#!/usr/bin/env bash
# Deliberate update of MikAI plus its pinned compatible sidecar — thin
# wrapper around scripts/mikai-deploy.mjs (DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec node scripts/mikai-deploy.mjs update
