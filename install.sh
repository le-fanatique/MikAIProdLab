#!/usr/bin/env bash
# First installation / idempotent repair — thin wrapper around
# scripts/mikai-deploy.mjs (DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1). All
# non-trivial behavior lives in that one Node module so Windows and Linux
# cannot drift.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec node scripts/mikai-deploy.mjs install
