#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Launcher that makes Node read the OS certificate store (DEVOPS.TLS.SYSTEMCA.1)
//
// Node compiles its own CA bundle and ignores the OS trust store. When a
// local interceptor (observed here: Kaspersky) resigns HTTPS traffic with
// its own root CA — installed in the Windows certificate store, trusted by
// curl and the browser — Node's `fetch` rejects the chain with
// SELF_SIGNED_CERT_IN_CHAIN, and src/lib/llm/openaiCompatible.ts reports
// this as "Cannot connect to LLM server", which is misleading (that file is
// out of scope for this ticket — see its own header/the ticket's §3).
//
// The author asked for a fix that "travels with the repo" so a fresh clone
// on another machine works without manual per-machine setup (ticket §3): a
// hand-set environment variable or an exported .pem outside the repo does
// not survive a clone, so neither was used. Instead, the npm scripts that
// start the app (`dev`, `dev:host`, `start`) run through this launcher,
// which adds `--use-system-ca` to NODE_OPTIONS before spawning `next`.
// NODE_OPTIONS is inherited by child processes, which matters here: `next
// dev` launches the actual server in a child, and that child is what makes
// the outbound fetch to OpenRouter.
//
// Only Node built-ins (child_process.spawn, never exec — same constraint as
// scripts/run-prod-lab.mjs, see its own header) — no new npm dependency.
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pure. Returns the NODE_OPTIONS string to set, given the current value and
 * whether `--use-system-ca` is supported by this Node build.
 *
 * - if `supported` is false, `existing` is returned unchanged, including
 *   `undefined` — never coerced to an empty string;
 * - if `supported` is true and `existing` is empty or absent, returns
 *   "--use-system-ca";
 * - if `supported` is true and `existing` already has content, that content
 *   is preserved and the flag is appended, space-separated — overwriting a
 *   value set by the author or by another tool would be a regression;
 * - if `existing` already contains "--use-system-ca", it is not duplicated.
 *
 * @param {string | undefined} existing
 * @param {boolean} supported
 * @returns {string | undefined}
 */
export function buildNodeOptions(existing, supported) {
  if (!supported) return existing;
  if (!existing) return "--use-system-ca";
  if (existing.split(/\s+/).includes("--use-system-ca")) return existing;
  return `${existing} --use-system-ca`;
}

/**
 * Detected by trying to actually start Node with the flag, never by
 * comparing a version number: a Node build that doesn't know the flag would
 * refuse to start if it were simply passed to it, so detection must happen
 * first, out of band.
 */
function supportsUseSystemCa() {
  const result = spawnSync(process.execPath, ["--use-system-ca", "-e", ""], { stdio: "ignore" });
  return result.status === 0;
}

function main() {
  const supported = supportsUseSystemCa();
  if (!supported) {
    console.warn(
      "[with-system-ca] This Node build does not support --use-system-ca — starting without it. " +
        "TLS interception by a local tool (e.g. an antivirus) may cause outbound HTTPS calls to fail."
    );
  }

  const nodeOptions = buildNodeOptions(process.env.NODE_OPTIONS, supported);
  const env = { ...process.env };
  if (nodeOptions === undefined) {
    delete env.NODE_OPTIONS;
  } else {
    env.NODE_OPTIONS = nodeOptions;
  }

  const args = process.argv.slice(2);
  // npx resolves the locally installed `next` binary without any extra PATH
  // manipulation — same approach scripts/run-prod-lab.mjs uses for the
  // OpenReel sidecar's own package manager.
  const child = spawn("npx", ["next", ...args], {
    env,
    stdio: "inherit",
    // shell: true — needed on Windows to resolve `npx` (a node_modules .cmd
    // shim) the same way a user's own terminal would; still spawn(), never
    // exec() — same constraint as scripts/run-prod-lab.mjs.
    shell: process.platform === "win32",
  });

  child.on("error", (err) => {
    console.error(`[with-system-ca] Could not start next: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}

// Guarded entrypoint — only auto-runs main() when this file is executed
// directly, never when imported as a module (e.g. by a test). Same pattern
// as scripts/config-transport.mjs:918 and scripts/playwright-harness.mjs:216.
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
