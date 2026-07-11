#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-command launcher for MikAI ProdLab + the OpenReel sidecar (DEVOPS.RUN.1)
//
// Usage:
//   node scripts/run-prod-lab.mjs dev    (npm run dev:all)
//   node scripts/run-prod-lab.mjs prod   (npm run prod:all)
//
// dev:  runs `npm run dev` (MikAI) and the sidecar's `dev` script side by
//       side, persistent, logs prefixed per app.
// prod: builds MikAI then the sidecar (sequentially — a failed build must
//       never lead to a persistent server starting on stale/missing output),
//       then runs `npm run start` (MikAI) and the sidecar's `preview` script
//       side by side, same as dev.
//
// Only Node built-ins (child_process.spawn, never exec — per this ticket's
// constraint) — no new npm dependency.
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mikaiRoot = path.resolve(__dirname, "..");

const mode = process.argv[2];
if (mode !== "dev" && mode !== "prod") {
  console.error("Usage: node scripts/run-prod-lab.mjs <dev|prod>");
  process.exit(1);
}

const MIKAI_HOST_DEFAULT = "localhost";
const MIKAI_PORT_DEFAULT = "3000";
const OPENREEL_HOST_DEFAULT = "127.0.0.1";
const OPENREEL_PORT_DEFAULT = "5173";

const MIKAI_HOST = process.env.MIKAI_HOST || MIKAI_HOST_DEFAULT;
const MIKAI_PORT = process.env.MIKAI_PORT || MIKAI_PORT_DEFAULT;
const OPENREEL_HOST = process.env.OPENREEL_HOST || OPENREEL_HOST_DEFAULT;
const OPENREEL_PORT = process.env.OPENREEL_PORT || OPENREEL_PORT_DEFAULT;

// ---------------------------------------------------------------------------
// Resolve + validate the OpenReel sidecar directory
// ---------------------------------------------------------------------------

const openreelDir = process.env.MIKAI_OPENREEL_DIR
  ? path.resolve(process.env.MIKAI_OPENREEL_DIR)
  : path.resolve(mikaiRoot, "..", "mikai-openreel-sidecar");

if (!existsSync(openreelDir)) {
  console.error(`[run-prod-lab] OpenReel sidecar directory not found: ${openreelDir}`);
  console.error("[run-prod-lab] Set MIKAI_OPENREEL_DIR to point at the sidecar repo, e.g.:");
  console.error(`  MIKAI_OPENREEL_DIR=/path/to/mikai-openreel-sidecar npm run ${mode}:all`);
  process.exit(1);
}
if (!existsSync(path.join(openreelDir, "package.json"))) {
  console.error(`[run-prod-lab] No package.json found in ${openreelDir}`);
  console.error("[run-prod-lab] This doesn't look like the OpenReel sidecar repo — check MIKAI_OPENREEL_DIR.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Process plumbing — prefixed logs, sequential build steps, persistent
// servers that take each other down on exit, and a clean Ctrl+C handler.
// ---------------------------------------------------------------------------

function pipeWithPrefix(stream, out, prefix) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) out.write(`${prefix}${line}\n`);
  });
  stream.on("end", () => {
    if (buffer) out.write(`${prefix}${buffer}\n`);
  });
}

const activeChildren = new Set();

function spawnLabeled(label, command, args, cwd) {
  console.log(`[run-prod-lab] [${label}] $ ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    // shell: true — needed on Windows to resolve npm/npx (.cmd shims) the
    // same way a user's own terminal would; still spawn(), never exec().
    shell: true,
    env: process.env,
    // POSIX only: makes this child the leader of its own process group,
    // so killTree() below can signal the whole tree (shell -> npm ->
    // next/vite) via a negative pid instead of only the immediate shell.
    // Windows has no equivalent semantics here — see killTree().
    detached: process.platform !== "win32",
  });
  activeChildren.add(child);
  child.on("exit", () => activeChildren.delete(child));
  const prefix = `[${label}] `;
  pipeWithPrefix(child.stdout, process.stdout, prefix);
  pipeWithPrefix(child.stderr, process.stderr, prefix);
  return child;
}

/** Runs a command to completion, rejecting on a non-zero exit code — used for the build steps, which must fully succeed before any persistent server starts. */
function runToCompletion(label, command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawnLabeled(label, command, args, cwd);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}${signal ? ` (signal ${signal})` : ""}`));
    });
  });
}

let shuttingDown = false;

/**
 * Kills a whole process tree, not just the immediate child. Found necessary
 * during real validation: with `shell: true`, `child.kill()` on Windows
 * only signals the cmd.exe shell — the actual npm/next/vite descendants it
 * spawned are left running, orphaned, still bound to their ports. `taskkill
 * /T` kills the shell and everything under it; on POSIX, the negative-pid
 * form of `process.kill` targets the whole process group created by
 * `detached: true` above.
 */
function killTree(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // already gone — nothing to do
      }
    }
  }
}

function killAll(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of activeChildren) killTree(child, signal);
}

/** Launches a long-running server. If it exits (crash or otherwise), the other persistent process is stopped too — one app dying alone and silently is worse than both going down together. */
function launchPersistent(label, command, args, cwd) {
  const child = spawnLabeled(label, command, args, cwd);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`[run-prod-lab] [${label}] exited (code ${code}${signal ? `, signal ${signal}` : ""}) — stopping the other process.`);
    process.exitCode = code ?? 1;
    killAll("SIGTERM");
  });
  return child;
}

process.on("SIGINT", () => {
  console.log("\n[run-prod-lab] Caught Ctrl+C — stopping MikAI and OpenReel...");
  killAll("SIGINT");
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
});
process.on("SIGTERM", () => {
  killAll("SIGTERM");
  process.exit(process.exitCode ?? 0);
});

// ---------------------------------------------------------------------------
// Command argument builders — only append explicit -H/-p / --host/--port
// flags when an env var actually overrides the default, so the common
// case runs the exact plain commands this ticket specifies.
// ---------------------------------------------------------------------------

function mikaiDevArgs() {
  if (MIKAI_HOST === MIKAI_HOST_DEFAULT && MIKAI_PORT === MIKAI_PORT_DEFAULT) return ["run", "dev"];
  return ["run", "dev", "--", "-H", MIKAI_HOST, "-p", MIKAI_PORT];
}

function mikaiStartArgs() {
  if (MIKAI_HOST === MIKAI_HOST_DEFAULT && MIKAI_PORT === MIKAI_PORT_DEFAULT) return ["run", "start"];
  return ["run", "start", "--", "-H", MIKAI_HOST, "-p", MIKAI_PORT];
}

function openreelDevArgs() {
  // Always explicit, unlike mikaiDevArgs()/mikaiStartArgs(): plain `vite`
  // (no --host) was found, during real validation, to bind only the IPv6
  // loopback — http://127.0.0.1:5173 (the documented, literal URL this
  // ticket requires, and the same value the OpenReel Sidecar URL setting
  // defaults to) never responds unless --host is passed explicitly. Next's
  // dev server doesn't have this problem, hence the asymmetry.
  return ["-y", "pnpm@9.0.0", "dev", "--host", OPENREEL_HOST, "--port", OPENREEL_PORT];
}

function openreelPreviewArgs() {
  // Prod default: bind wide (0.0.0.0) so a server/Tailscale box is reachable
  // off-box out of the box, unless the user explicitly pinned OPENREEL_HOST.
  const bindHost = process.env.OPENREEL_HOST || "0.0.0.0";
  return ["-y", "pnpm@9.0.0", "preview", "--host", bindHost, "--port", OPENREEL_PORT];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[run-prod-lab] Mode: ${mode}`);
  console.log(`[run-prod-lab] OpenReel sidecar dir: ${openreelDir}`);
  console.log(`[run-prod-lab] MikAI ProdLab:    http://${MIKAI_HOST}:${MIKAI_PORT}`);
  // Display host stays user-facing (127.0.0.1 by default) even when the
  // prod preview server itself binds to 0.0.0.0 — see openreelPreviewArgs().
  console.log(`[run-prod-lab] OpenReel Sidecar: http://${OPENREEL_HOST}:${OPENREEL_PORT}`);

  if (mode === "dev") {
    launchPersistent("MikAI", "npm", mikaiDevArgs(), mikaiRoot);
    launchPersistent("OpenReel", "npx", openreelDevArgs(), openreelDir);
    return;
  }

  // mode === "prod": build both, sequentially, before starting anything
  // persistent — a failed build must never lead to a server serving stale
  // or missing output.
  try {
    await runToCompletion("MikAI:build", "npm", ["run", "build"], mikaiRoot);
    await runToCompletion("OpenReel:build", "npx", ["-y", "pnpm@9.0.0", "build"], openreelDir);
  } catch (err) {
    console.error(`[run-prod-lab] Build failed: ${err.message}`);
    console.error("[run-prod-lab] Not starting any server.");
    process.exit(1);
  }

  console.log("[run-prod-lab] Builds complete — starting servers.");
  launchPersistent("MikAI", "npm", mikaiStartArgs(), mikaiRoot);
  launchPersistent("OpenReel", "npx", openreelPreviewArgs(), openreelDir);
}

main();
