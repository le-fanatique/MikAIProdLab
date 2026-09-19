#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Full-stack launcher — MikAI + OpenReel sidecar + InvokeAI (+ Cloudflare
// tunnel for remote use). One orchestrator, three modes, so start-dev.bat,
// start-local.bat and start-remote.bat are two-line wrappers and the Linux
// .sh equivalents will be too (same reason as mikai-deploy.mjs: Windows and
// Linux must not drift).
//
//   node scripts/start-stack.mjs dev      MikAI dev  + OpenReel + InvokeAI
//   node scripts/start-stack.mjs local    MikAI prod + OpenReel + InvokeAI
//   node scripts/start-stack.mjs remote   ... + Cloudflare tunnel
//
// MikAI runs in PRODUCTION for `local` and `remote`, never dev: dev mode opens
// the /_next/webpack-hmr WebSocket that corporate proxies cut, and serves
// hundreds of unminified chunks (docs/REMOTE_ACCESS_SETUP.md section 4).
//
// Every service is probed before it is started, and started only if absent.
// This is not politeness. InvokeAI creates a tensor folder per SERVER START,
// not per render, and both instances share INVOKEAI_ROOT: a second instance
// wipes the first one's folder, and the survivor then fails on the same
// tmpXXXXXXXX at every render until it is restarted. Killing the duplicate
// never fixes it (docs/REMOTE_ACCESS_SETUP.md section 3.1).
//
// The probe treats an INCONCLUSIVE answer as "occupied", never as "probably
// free" — for InvokeAI a wrong guess costs a render, for MikAI it costs a
// build that refuses to start ("Another next build process is already
// running") and then no server at all.
//
// InvokeAI and the tunnel each get their own window; closing one stops that
// service. The MikAI + OpenReel pair runs INLINE in this window, with
// run-prod-lab's prefixed logs, so Ctrl+C here stops the pair.
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { checkPortFree } from "./mikai-deploy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const MODES = ["dev", "local", "remote"];

// ---------------------------------------------------------------------------
// .env.local
//
// Next.js loads .env.local by itself; a plain Node script does not, so the
// four launcher settings documented in .env.local.example would silently do
// nothing here. Read before any setting is resolved.
//
// A real environment variable WINS over the file: `INVOKE_PORT=9090 start-...`
// must stay the way to override for one run. `process.loadEnvFile` is not used
// precisely because that precedence must be explicit.
//
// This only reads the file. It never writes it — install/update guarantee
// .env.local is preserved byte-for-byte, and a launcher must not be the one
// thing that breaks that.
// ---------------------------------------------------------------------------

export function loadEnvLocalWithoutOverriding(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    const value = line.slice(eq + 1).trim();
    const unquoted = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
    process.env[key] = unquoted;
  }
}

loadEnvLocalWithoutOverriding(path.join(repoRoot, ".env.local"));

// --- Settings, all overridable by environment -------------------------------

const INVOKE_DIR = process.env.INVOKE_DIR || "F:\\AI\\Invoke";
const INVOKE_PORT = Number(process.env.INVOKE_PORT || 9090);
const TUNNEL_NAME = process.env.TUNNEL_NAME || "mikai";
const REMOTE_DOMAIN = process.env.REMOTE_DOMAIN || "creativeprodlab.org";
const MIKAI_HOST = process.env.MIKAI_HOST || "localhost";
const MIKAI_PORT = Number(process.env.MIKAI_PORT || 3000);

// Printed by `remote` only. Derived from REMOTE_DOMAIN so this module carries
// no machine-specific address: the predecessor start-remote.bat hardcoded the
// InvokeAI folder, the tunnel name and the domain, which is why it had to be
// gitignored. Every one of those is now an environment override.
const REMOTE_HOSTS = [
  ["MikAI   ", `https://mikai.${REMOTE_DOMAIN}`],
  ["InvokeAI", `https://invoke.${REMOTE_DOMAIN}`],
];

function log(step, message) {
  console.log(`[start-stack] ${step} ${message}`);
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/** True when something is listening, OR when the probe could not tell. Both mean "do not start a second one". */
async function portOccupied(host, port) {
  const { ok } = await checkPortFree(host, port);
  return !ok;
}

/**
 * True when a running process's name or command line matches `pattern`.
 *
 * Deliberately not `tasklist | find`: on a machine with Git in the PATH, `find`
 * resolves to the Unix one, the detection fails in silence, and a second
 * service starts. Observed 2026-09-19 while testing start-remote.bat itself
 * (docs/REMOTE_ACCESS_SETUP.md section 3.2).
 */
function processRunning(pattern) {
  if (process.platform === "win32") {
    const script =
      "if (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | " +
      `Where-Object { $_.Name -match ${quoteForPowerShell(pattern)} -or ` +
      `$_.CommandLine -match ${quoteForPowerShell(pattern)} }) { exit 0 } else { exit 1 }`;
    return spawnSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" }).status === 0;
  }
  return spawnSync("pgrep", ["-f", pattern], { stdio: "ignore" }).status === 0;
}

/** Single-quoted PowerShell literal; the only escape inside one is a doubled quote. */
function quoteForPowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Launching
// ---------------------------------------------------------------------------

/** Opens `command` in its own console window, detached from this one. */
function launchInOwnWindow(title, command, args, cwd) {
  const child = spawn("cmd", ["/c", "start", title, "cmd", "/k", command, ...args], {
    cwd,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/** Runs the MikAI + OpenReel pair in THIS window; resolves with its exit code. */
function runPairInline(scriptRelPath, mode) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptRelPath, mode], { cwd: repoRoot, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

// ---------------------------------------------------------------------------
// Preflight — refuse before anything starts, never halfway through
// ---------------------------------------------------------------------------

function preflight(mode) {
  const invokeEntry = path.join(INVOKE_DIR, "invoke.bat");
  if (!fs.existsSync(invokeEntry)) {
    throw new Error(`invoke.bat not found in "${INVOKE_DIR}". Set INVOKE_DIR if InvokeAI lives elsewhere.`);
  }
  if (mode === "remote" && spawnSync("where", ["cloudflared"], { stdio: "ignore" }).status !== 0) {
    throw new Error("cloudflared not found in PATH.");
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function startInvoke(step) {
  if (await portOccupied("127.0.0.1", INVOKE_PORT)) {
    log(step, `InvokeAI already answers on ${INVOKE_PORT} — no second instance.`);
    return;
  }
  log(step, "InvokeAI ...");
  launchInOwnWindow("InvokeAI", "invoke.bat", [], INVOKE_DIR);
}

function startTunnel(step) {
  if (processRunning("cloudflared")) {
    log(step, "Tunnel already active — nothing to restart.");
    return;
  }
  log(step, `Cloudflare tunnel "${TUNNEL_NAME}" ...`);
  launchInOwnWindow("Cloudflare Tunnel", "cloudflared", ["tunnel", "run", TUNNEL_NAME], repoRoot);
}

async function startPair(step, mode) {
  if (await portOccupied(MIKAI_HOST, MIKAI_PORT)) {
    log(step, `MikAI already listens on ${MIKAI_PORT} — nothing to restart.`);
    return 0;
  }
  // Two simultaneous `next build` block each other ("Another next build
  // process is already running") and then NO server starts at all.
  if (processRunning("mikai-deploy|run-prod-lab|next build")) {
    log(step, "A MikAI sequence is already running (building) — nothing to restart.");
    log(step, "Let it finish: MikAI first, OpenReel second.");
    return 0;
  }

  if (mode === "dev") {
    log(step, "MikAI (dev) + OpenReel sidecar ...");
    return runPairInline(path.join("scripts", "run-prod-lab.mjs"), "dev");
  }
  log(step, "MikAI (production) + OpenReel sidecar ...");
  return runPairInline(path.join("scripts", "mikai-deploy.mjs"), "start");
}

function printBanner(mode) {
  console.log("");
  console.log("---------------------------------------------------------------------");
  if (mode === "dev") {
    console.log(" Dev mode: MikAI and OpenReel recompile on change. LOCAL ONLY — dev");
    console.log(" must never be what a remote browser reaches.");
  } else {
    console.log(" ORDER AND DELAYS — the MikAI sequence is long, and that is normal:");
    console.log("   1. MikAI build        (~1 to 3 min)");
    console.log("   2. sidecar build      (~1 to 3 min)");
    console.log("   3. both servers start: 3000 (MikAI) then 5173 (OpenReel)");
    console.log(" Nothing listens until both builds finish: a failed build must never");
    console.log(" let a stale server start.");
  }
  if (mode === "remote") {
    console.log("");
    console.log(" Remote access, after Cloudflare Access authentication");
    console.log(" (six-digit code sent to the authorised mailbox):");
    console.log("");
    for (const [label, url] of REMOTE_HOSTS) console.log(`   ${label} ${url}`);
  }
  console.log("---------------------------------------------------------------------");
  console.log("");
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const mode = process.argv[2];
  if (!MODES.includes(mode)) {
    console.error(`Usage: node scripts/start-stack.mjs <${MODES.join("|")}>`);
    process.exit(1);
  }
  if (process.platform !== "win32") {
    console.error("[start-stack] Windows only for now — the Linux wrappers are not written yet.");
    process.exit(1);
  }

  try {
    preflight(mode);
  } catch (err) {
    console.error(`[start-stack] ${err.message}`);
    process.exit(1);
  }

  const total = mode === "remote" ? 3 : 2;
  await startInvoke(`[1/${total}]`);
  if (mode === "remote") startTunnel(`[2/${total}]`);

  printBanner(mode);

  process.exit(await startPair(`[${total}/${total}]`, mode));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
