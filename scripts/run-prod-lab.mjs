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
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// ---------------------------------------------------------------------------
// Clean start (DEV.LAUNCHER.CLEANSTART.1) — before either mode does
// anything else, close any PRE-EXISTING MikAI/OpenReel instance still
// listening on the configured ports, so a stale server from a previous
// launcher run (or a crashed terminal) never causes `dev:all`/`prod:all` to
// fail outright, or to bring up only one of the two apps.
//
// Safety contract: a PID is only ever killed once its command line has been
// read and found to contain this specific project's own resolved root path
// (case-insensitive, slash-normalized) — the exact same directory `spawn()`
// itself would use as `cwd` for that app. A bare process NAME (`node.exe`,
// `node`) is never sufficient evidence on its own; a port occupied by
// anything else is left untouched and the launcher exits with the port,
// PID, and manual-resolution instructions.
//
// REVISE (round 1) — every function below now distinguishes "positively
// confirmed" from "could not be determined", and inability to determine
// is NEVER treated as the safe-looking outcome (no listener / already
// gone / port free). A broken or missing inspection tool, or a socket
// probe that merely times out or errors for a reason OTHER than a local
// connection refusal, aborts the launcher with the real reason instead of
// silently proceeding as if nothing were there. Guessing "probably fine"
// is exactly what this ticket exists to rule out for a script that kills
// processes.
// ---------------------------------------------------------------------------

const CLEAN_START_WAIT_TIMEOUT_MS = 10_000;
const CLEAN_START_POLL_INTERVAL_MS = 200;

function normalizeForContainment(p) {
  return p.replace(/\\/g, "/").toLowerCase();
}

/**
 * PIDs currently LISTENING on `port`, deduplicated — `{ ok: true, pids }`,
 * or `{ ok: false, error }` when the inspection tool itself is missing or
 * failed to run. `pids: []` inside an `ok: true` result is the ONLY way
 * this reports "nothing is listening" — an inspection failure is always
 * `ok: false`, never silently folded into an empty list, so a caller can
 * never mistake "the tool didn't run" for "the port is free".
 *
 * Windows: `netstat -ano` (built into every Windows install, no admin
 * rights required) parsed for `TCP ... LISTENING <pid>` lines. A failure
 * to spawn `netstat` is `ok: false` — netstat existing and running is not
 * optional on Windows.
 * POSIX: `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` (terse mode — one PID per
 * line). `lsof` documents exit code 1 with empty stdout/stderr as its own
 * normal "nothing matched" outcome (not an error) — that specific shape is
 * accepted as `ok: true, pids: []`. A failure to spawn `lsof` at all (e.g.
 * `ENOENT`, not installed) is `ok: false` — a minimal environment without
 * `lsof` cannot safely claim a port is free, per this ticket's own
 * "identification unavailable -> fail clearly" requirement, now applied to
 * detection itself, not only to the kill decision.
 */
function findListeningPids(port, spawnImpl = spawnSync) {
  if (process.platform === "win32") {
    const result = spawnImpl("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8", windowsHide: true });
    if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
      const reason = result.error ? result.error.message : `netstat exited with status ${result.status}`;
      return { ok: false, error: `Could not run netstat to inspect port ${port}: ${reason}` };
    }
    const pids = new Set();
    for (const line of result.stdout.split(/\r?\n/)) {
      // Columns: Proto  Local Address  Foreign Address  State  PID
      const match = line.trim().match(/^TCP\s+\S*?:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (match && Number(match[1]) === port) pids.add(Number(match[2]));
    }
    return { ok: true, pids: [...pids] };
  }

  const result = spawnImpl("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  if (result.error) {
    return { ok: false, error: `Could not run lsof to inspect port ${port}: ${result.error.message}` };
  }
  if (typeof result.stdout !== "string") {
    return { ok: false, error: `lsof produced no readable output while inspecting port ${port} (exit status ${result.status}).` };
  }
  const trimmedOutput = result.stdout.trim();
  const trimmedStderr = typeof result.stderr === "string" ? result.stderr.trim() : null;
  // lsof's own documented contract: exit 0 (matches found) or exit 1 with
  // EMPTY stdout AND EMPTY stderr ("nothing matched") are the only two
  // legitimate outcomes. Any other status — or a nonzero status with any
  // unexpected stdout/stderr diagnostic (e.g. a permission error) — is an
  // inspection failure, never silently folded into "no PIDs".
  const isDocumentedEmptyResult = result.status === 1 && trimmedOutput === "" && trimmedStderr === "";
  if (result.status !== 0 && !isDocumentedEmptyResult) {
    const diagnostic = trimmedStderr || (trimmedStderr === null ? "stderr unreadable" : null);
    return {
      ok: false,
      error: `lsof exited with unexpected status ${result.status} while inspecting port ${port}${diagnostic ? `: ${diagnostic}` : "."}`,
    };
  }
  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && /^\d+$/.test(trimmed)) pids.add(Number(trimmed));
  }
  return { ok: true, pids: [...pids] };
}

/**
 * The running command line for `pid` — one of three distinct outcomes,
 * NEVER conflated:
 *   - `{ status: "not-found" }` — the process itself is confirmed gone
 *     (it exited between detection and this check). Tolerated, never an
 *     error.
 *   - `{ status: "found", commandLine }` — the process exists and its
 *     command line was read successfully.
 *   - `{ status: "inspection-failed", error }` — the lookup tool itself
 *     failed/is unavailable, OR the process exists but its command line
 *     could not be read (e.g. access denied). This is NOT "not-found": a
 *     PID that exists but can't be identified must be treated exactly
 *     like an unrecognized foreign process by the caller, never silently
 *     skipped.
 *
 * Windows: `Get-CimInstance Win32_Process` via PowerShell — the standard,
 * no-extra-install way to read a live process's full command line (WMIC is
 * deprecated/absent on newer Windows builds). Existence and command-line
 * availability are reported as one explicit token pair so "no such
 * process" and "process found but empty CommandLine" are never confused.
 * POSIX: `ps -o command= -p` — exit 1 with EMPTY output is POSIX `ps`'s
 * own documented way of reporting "no such process"; that specific shape
 * is the only case tolerated as `not-found`. A failed spawn, unreadable
 * output, or any other exit status (including a nonzero status with
 * unexpected output) is `inspection-failed`.
 */
function readProcessCommandLine(pid, spawnImpl = spawnSync) {
  if (process.platform === "win32") {
    // -ErrorAction Stop (not SilentlyContinue) on the CIM query itself: a
    // genuine query failure (WMI service down, access denied, etc.) must
    // throw into the catch and surface as MIKAI_INSPECTION_ERROR, never
    // fall through as if the process were simply absent. Get-CimInstance
    // returning $null for a nonexistent PID is NOT an error under Stop —
    // that's still the legitimate, documented "not found" outcome.
    const psCommand = `try { $p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction Stop; if ($null -eq $p) { Write-Output "MIKAI_NOT_FOUND" } else { Write-Output ("MIKAI_FOUND:" + $p.CommandLine) } } catch { Write-Output ("MIKAI_INSPECTION_ERROR:" + $_.Exception.Message) }`;
    const result = spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { encoding: "utf8", windowsHide: true });
    if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
      const reason = result.error ? result.error.message : `powershell exited with status ${result.status}`;
      return { status: "inspection-failed", error: `Could not run PowerShell to inspect PID ${pid}: ${reason}` };
    }
    const output = result.stdout.trim();
    if (output.startsWith("MIKAI_INSPECTION_ERROR:")) {
      return { status: "inspection-failed", error: `CIM query failed while inspecting PID ${pid}: ${output.slice("MIKAI_INSPECTION_ERROR:".length).trim()}` };
    }
    if (output.startsWith("MIKAI_NOT_FOUND")) return { status: "not-found" };
    if (output.startsWith("MIKAI_FOUND:")) {
      const commandLine = output.slice("MIKAI_FOUND:".length).trim();
      if (commandLine.length === 0) {
        return { status: "inspection-failed", error: `PID ${pid} exists but its command line could not be read (empty/inaccessible).` };
      }
      return { status: "found", commandLine };
    }
    return { status: "inspection-failed", error: `Unexpected output while inspecting PID ${pid}: ${JSON.stringify(output)}` };
  }

  const result = spawnImpl("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  if (result.error) {
    return { status: "inspection-failed", error: `Could not run ps to inspect PID ${pid}: ${result.error.message}` };
  }
  if (typeof result.stdout !== "string") {
    return { status: "inspection-failed", error: `ps produced no readable output while inspecting PID ${pid} (exit status ${result.status}).` };
  }
  const commandLine = result.stdout.trim();
  const trimmedStderr = typeof result.stderr === "string" ? result.stderr.trim() : null;
  if (result.status === 0) {
    if (commandLine.length === 0) {
      return { status: "inspection-failed", error: `PID ${pid} was reported found by ps but returned an empty command line.` };
    }
    return { status: "found", commandLine };
  }
  // POSIX ps's own documented contract: exit 1 + EMPTY stdout AND EMPTY
  // stderr == no such process. A diagnostic on stderr (e.g. a permission
  // error) is NOT that contract, even with empty stdout — it must not be
  // folded into "not-found". Any other status is also an inspection
  // failure, never silently folded into "not-found".
  if (result.status === 1 && commandLine.length === 0 && trimmedStderr === "") {
    return { status: "not-found" };
  }
  const diagnostic = trimmedStderr || commandLine || (trimmedStderr === null ? "stderr unreadable" : null);
  return {
    status: "inspection-failed",
    error: `ps exited with unexpected status ${result.status} while inspecting PID ${pid}${diagnostic ? `: ${JSON.stringify(diagnostic)}` : "."}`,
  };
}

/**
 * True only when `commandLine` both (a) contains this project's own
 * resolved root path as a genuine PATH SEGMENT — never a lexical prefix —
 * and (b) looks like one of the expected npm/npx/cmd/node/Next/Vite tree
 * members, as a cheap second guard against an unrelated tool that merely
 * happens to have this path in an argument (e.g. a text editor with the
 * project open). Never matches on a bare process name alone.
 *
 * REVISE (round 3) — `haystack.includes(needle)` alone treated a sibling
 * directory that merely starts with the same characters (e.g.
 * `MikAIProdLab-backup`) as "owned", because nothing stopped `needle` from
 * matching as a lexical prefix of a longer folder name. The root must now
 * be followed immediately by a `/` (a real path separator) or the end of
 * the string, and preceded by the start of the string or a non-path-name
 * character — so it only matches a true path segment, exactly like
 * `<projectRoot>/node_modules/...`, never `<projectRoot>-backup/...`.
 */
function looksOwnedByProject(commandLine, projectRoot) {
  const haystack = normalizeForContainment(commandLine);
  const needle = normalizeForContainment(projectRoot).replace(/\/+$/, "");
  if (needle.length === 0) return false;
  const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rootBoundaryPattern = new RegExp(`(^|[^a-z0-9_.-])${escapedNeedle}(?=/|$)`);
  if (!rootBoundaryPattern.test(haystack)) return false;
  return /node(\.exe)?\b|npm(\.cmd)?\b|npx(\.cmd)?\b|cmd\.exe\b|next(-server)?\b|vite\b/i.test(commandLine);
}

/** Kills a whole process tree by bare PID (no live `child` object available — this PID was discovered via findListeningPids(), not spawned by us). Same platform split as killTree() above, tolerant of the PID already being gone. */
function killPidTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone — nothing to do
    }
  }
}

/**
 * Resolves `{ ok: true }` only once a TCP connect attempt to host:port is
 * met with a LOCAL connection refusal (`ECONNREFUSED` — the OS's own
 * positive proof that nothing is listening there anymore), or
 * `{ ok: false, error }` once `timeoutMs` elapses without ever observing
 * that.
 *
 * REVISE (round 1) — a successful `connect` is (correctly) proof the port
 * is still occupied and keeps polling. But a connection `timeout` proves
 * NOTHING either way (no response is not a refusal) and neither does any
 * OTHER socket error (`ENETUNREACH`, `EACCES`, `EHOSTUNREACH`, etc. — none
 * of those mean "nothing is listening"). Both used to be treated as "port
 * free", which is exactly the false-positive this ticket's review caught.
 * Both now keep polling until the global deadline, then fail with the
 * real, last-observed reason instead of a fabricated success.
 */
function waitForPortFree(host, port, timeoutMs, connectImpl = net.connect) {
  const deadline = Date.now() + timeoutMs;
  let lastInconclusiveReason = `No response observed from ${host}:${port} within the polling window.`;
  return new Promise((resolve) => {
    function giveUpOrRetry() {
      if (Date.now() >= deadline) {
        resolve({ ok: false, error: lastInconclusiveReason });
        return;
      }
      setTimeout(attempt, CLEAN_START_POLL_INTERVAL_MS);
    }
    function attempt() {
      const socket = connectImpl({ host, port, timeout: 1000 });
      socket.once("connect", () => {
        socket.destroy();
        lastInconclusiveReason = `Port ${port} is still accepting connections.`;
        giveUpOrRetry();
      });
      socket.once("timeout", () => {
        socket.destroy();
        lastInconclusiveReason = `Connection attempts to ${host}:${port} keep timing out (inconclusive — not a confirmed refusal).`;
        giveUpOrRetry();
      });
      socket.once("error", (err) => {
        socket.destroy();
        if (err && err.code === "ECONNREFUSED") {
          resolve({ ok: true });
          return;
        }
        lastInconclusiveReason = `Unexpected socket error while checking ${host}:${port}: ${err && err.code ? err.code : String(err)}.`;
        giveUpOrRetry();
      });
    }
    attempt();
  });
}

/**
 * Clean-start pass for a single app's port: detect -> identify -> kill only
 * what's confidently ours -> wait for the port to actually clear. Exits the
 * whole launcher (never returns) if port state or a PID's identity can't be
 * confirmed, if a foreign process holds the port, or if the port fails to
 * clear after killing what was recognized.
 *
 * The optional `deps` object lets tests substitute the three collaborator
 * functions with deterministic fakes; every default is the real production
 * implementation, so the real call sites (`cleanStart()`) are unaffected.
 */
async function cleanStartTarget(
  label,
  host,
  port,
  projectRoot,
  {
    findListeningPidsImpl = findListeningPids,
    readProcessCommandLineImpl = readProcessCommandLine,
    waitForPortFreeImpl = waitForPortFree,
  } = {}
) {
  const detection = findListeningPidsImpl(port);
  if (!detection.ok) {
    console.error(`[run-prod-lab] [clean-start] Could not determine whether port ${port} (${label}) is in use: ${detection.error}`);
    console.error(`[run-prod-lab] [clean-start] Refusing to proceed without confirming port state. Fix the inspection tool, or free the port manually and re-run.`);
    process.exit(1);
  }
  const pids = detection.pids;
  const toKill = [];
  for (const pid of pids) {
    const identity = readProcessCommandLineImpl(pid);
    if (identity.status === "not-found") {
      // Gone between detection and identification — tolerated, not an error.
      continue;
    }
    if (identity.status === "inspection-failed") {
      console.error(`[run-prod-lab] [clean-start] Port ${port} (${label}) is in use by PID ${pid}, but its identity could not be confirmed: ${identity.error}`);
      console.error(`[run-prod-lab] [clean-start] Refusing to kill it without positive identification. Stop it manually, or set an alternate port for ${label}, then re-run.`);
      process.exit(1);
    }
    if (looksOwnedByProject(identity.commandLine, projectRoot)) {
      toKill.push(pid);
    } else {
      console.error(`[run-prod-lab] [clean-start] Port ${port} (${label}) is in use by PID ${pid}, which could not be confidently identified as a previous ${label} instance.`);
      console.error(`[run-prod-lab] [clean-start] Refusing to kill it. Stop it manually, or set an alternate port for ${label}, then re-run.`);
      process.exit(1);
    }
  }

  if (pids.length === 0) {
    // No PID reported at all — still routed through the same positive TCP
    // probe below rather than trusted as "free" on its own (REVISE round 2):
    // a nonzero-but-tolerated detection quirk, a race, or a listener the
    // tool simply didn't report must not be able to skip confirmation.
    console.log(`[run-prod-lab] [clean-start] ${label} port ${port} reported no listening PID — confirming via TCP probe...`);
  } else if (toKill.length === 0) {
    // Every listener that was there at detection time is already gone.
    console.log(`[run-prod-lab] [clean-start] ${label} port ${port}'s previous listener(s) already exited.`);
  } else {
    for (const pid of toKill) {
      console.log(`[run-prod-lab] [clean-start] Stopping previous ${label} instance (PID ${pid}) on port ${port}...`);
      killPidTree(pid);
    }
  }

  const freed = await waitForPortFreeImpl(host, port, CLEAN_START_WAIT_TIMEOUT_MS);
  if (!freed.ok) {
    console.error(`[run-prod-lab] [clean-start] Port ${port} (${label}) did not confirm as free within ${CLEAN_START_WAIT_TIMEOUT_MS}ms: ${freed.error}`);
    console.error(`[run-prod-lab] [clean-start] Aborting.`);
    process.exit(1);
  }
  console.log(`[run-prod-lab] [clean-start] ${label} port ${port} is free.`);
}

/** Runs before ANYTHING else in either mode — including `prod`'s builds, which don't themselves bind a port but must not run only to have the subsequent server start fail on a stale listener discovered afterward. */
async function cleanStart() {
  await cleanStartTarget("MikAI", MIKAI_HOST, Number(MIKAI_PORT), mikaiRoot);
  await cleanStartTarget("OpenReel", OPENREEL_HOST, Number(OPENREEL_PORT), openreelDir);
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

  await cleanStart();

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

// Guarded entrypoint (DEV.LAUNCHER.CLEANSTART.1) — only auto-runs `main()`
// when this file is executed directly (`node scripts/run-prod-lab.mjs ...`),
// never when it's `import`ed as a module. This lets a test script exercise
// the pure clean-start helpers below (exported for exactly that purpose)
// against real OS tools/sockets without accidentally launching real dev/
// prod servers as a side effect of importing the file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { findListeningPids, readProcessCommandLine, looksOwnedByProject, killPidTree, waitForPortFree, cleanStartTarget, cleanStart };
