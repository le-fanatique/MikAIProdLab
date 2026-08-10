#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Single cross-platform orchestrator for `install`/`update`/`start`
// (DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1). install.bat/.sh, update.bat/.sh, and
// start.bat/.sh are thin wrappers around this module so Windows and Linux
// cannot drift. Every side-effecting command (git/npm/pnpm/backup/migrate)
// goes through the injectable `run(cmd, args, opts)` so the required
// command-order proof can substitute a fake runner without touching a real
// filesystem/process. Every orchestrator function is exported and safe to
// `import` — the CLI entrypoint at the bottom only runs when this file is
// executed directly (same guarded-entrypoint pattern as run-prod-lab.mjs).
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Base class for every refusal this module raises. `.code` is a short, stable, machine-checkable tag for proof scripts. */
export class DeployError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class PinValidationError extends DeployError {
  constructor(message) {
    super("PIN_INVALID", message);
  }
}

export class SidecarPathError extends DeployError {
  constructor(message) {
    super("SIDECAR_PATH_UNSAFE", message);
  }
}

// ---------------------------------------------------------------------------
// Release pin — closed, runtime-validated schema. Never falls back to
// upstream/main, a branch tip, or a guessed sidecar version: every field
// must be present, of the right shape, and (for `repository`) exactly the
// expected identity.
// ---------------------------------------------------------------------------

export const EXPECTED_REPOSITORY = "https://github.com/le-fanatique/mikai-openreel-sidecar.git";
const PIN_ALLOWED_KEYS = ["formatVersion", "repository", "releaseTag", "commit", "upstreamCommit", "defaultPort"];
const SHA1_RE = /^[0-9a-f]{40}$/;
// Conservative safe-git-ref charset: no leading '-', no whitespace, no '..', no control chars.
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Validates the shape of an already-JSON.parsed pin document. Throws PinValidationError on the first violation; never partially applies a bad pin. */
export function validatePinShape(doc) {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new PinValidationError("Release pin must be a JSON object.");
  }
  const keys = Object.keys(doc);
  const unknown = keys.filter((k) => !PIN_ALLOWED_KEYS.includes(k));
  if (unknown.length > 0) {
    throw new PinValidationError(`Release pin has unknown key(s): ${unknown.join(", ")}.`);
  }
  const missing = PIN_ALLOWED_KEYS.filter((k) => !(k in doc));
  if (missing.length > 0) {
    throw new PinValidationError(`Release pin is missing required key(s): ${missing.join(", ")}.`);
  }

  if (doc.formatVersion !== 1) {
    throw new PinValidationError(`Release pin formatVersion must be exactly 1, got ${JSON.stringify(doc.formatVersion)}.`);
  }
  if (typeof doc.repository !== "string") {
    throw new PinValidationError("Release pin repository must be a string.");
  }
  if (doc.repository !== EXPECTED_REPOSITORY) {
    throw new PinValidationError(
      `Release pin repository must be exactly "${EXPECTED_REPOSITORY}", got ${JSON.stringify(doc.repository)}.`
    );
  }
  if (typeof doc.releaseTag !== "string" || doc.releaseTag.length === 0 || !REF_RE.test(doc.releaseTag)) {
    throw new PinValidationError(`Release pin releaseTag is not a valid git tag name: ${JSON.stringify(doc.releaseTag)}.`);
  }
  if (typeof doc.commit !== "string" || !SHA1_RE.test(doc.commit)) {
    throw new PinValidationError(`Release pin commit must be a 40-character lowercase hex SHA, got ${JSON.stringify(doc.commit)}.`);
  }
  if (typeof doc.upstreamCommit !== "string" || !SHA1_RE.test(doc.upstreamCommit)) {
    throw new PinValidationError(
      `Release pin upstreamCommit must be a 40-character lowercase hex SHA, got ${JSON.stringify(doc.upstreamCommit)}.`
    );
  }
  if (!Number.isInteger(doc.defaultPort) || doc.defaultPort < 1 || doc.defaultPort > 65535) {
    throw new PinValidationError(`Release pin defaultPort must be an integer in [1, 65535], got ${JSON.stringify(doc.defaultPort)}.`);
  }

  return {
    formatVersion: doc.formatVersion,
    repository: doc.repository,
    releaseTag: doc.releaseTag,
    commit: doc.commit,
    upstreamCommit: doc.upstreamCommit,
    defaultPort: doc.defaultPort,
  };
}

/** Reads + parses + validates the pin at `pinPath`. Throws PinValidationError before any other side effect on a missing file, invalid JSON, or a shape violation. */
export function loadReleasePin(pinPath) {
  let raw;
  try {
    raw = fs.readFileSync(pinPath, "utf8");
  } catch (err) {
    throw new PinValidationError(`Could not read release pin at ${pinPath}: ${err.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new PinValidationError(`Release pin at ${pinPath} is not valid JSON: ${err.message}`);
  }
  return validatePinShape(doc);
}

// ---------------------------------------------------------------------------
// Symlink-safety walk (same algorithm as scripts/data-backup.mjs's private
// assertNoSymlinkInPath — duplicated rather than imported since that helper
// isn't exported and this module must not widen data-backup.mjs's own
// public surface just to reuse a dozen lines).
// ---------------------------------------------------------------------------

function firstSymlinkFromVolumeRoot(abs) {
  const resolved = path.resolve(abs);
  const volumeRoot = path.parse(resolved).root;
  const segments = path.relative(volumeRoot, resolved).split(path.sep).filter(Boolean);
  let current = volumeRoot;
  for (const seg of segments) {
    current = path.join(current, seg);
    const lst = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!lst) return null;
    if (lst.isSymbolicLink()) return current;
  }
  return null;
}

function assertNoSymlinkInPath(abs, label) {
  const found = firstSymlinkFromVolumeRoot(abs);
  if (found !== null) {
    throw new SidecarPathError(`Refusing to follow a symlink in the ${label} path: ${found}`);
  }
}

// ---------------------------------------------------------------------------
// Sidecar directory resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the sidecar directory: `env.MIKAI_OPENREEL_DIR` when explicitly
 * set, otherwise the sibling `<parent-of-mikaiRoot>/mikai-openreel-sidecar`.
 * Refuses (SidecarPathError) rather than silently following a symlinked
 * path, and refuses to treat an existing directory that isn't plausibly a
 * sidecar checkout (no `package.json`, or a `package.json` whose `name`
 * doesn't look like this sidecar) as one to modify.
 */
export function resolveSidecarDir({ mikaiRoot, env = process.env } = {}) {
  const explicit = env.MIKAI_OPENREEL_DIR;
  const dir = explicit ? path.resolve(explicit) : path.resolve(mikaiRoot, "..", "mikai-openreel-sidecar");
  const source = explicit ? "MIKAI_OPENREEL_DIR" : "default sibling directory";

  assertNoSymlinkInPath(dir, source);

  if (fs.existsSync(dir)) {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) {
      throw new SidecarPathError(
        `${dir} (${source}) already exists but has no package.json — refusing to treat an unrelated folder as the OpenReel sidecar.`
      );
    }
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch (err) {
      throw new SidecarPathError(`${dir} (${source}) has an unreadable package.json: ${err.message}`);
    }
    const looksLikeSidecar =
      typeof pkg.name === "string" && (pkg.name === "openreel" || pkg.name.toLowerCase().includes("openreel"));
    if (!looksLikeSidecar) {
      throw new SidecarPathError(
        `${dir} (${source}) does not look like the OpenReel sidecar (package.json name is ${JSON.stringify(pkg.name)}) — refusing to modify an unrelated folder.`
      );
    }
  }

  return { dir, source };
}

// ---------------------------------------------------------------------------
// Injectable process runner. Production default uses spawnSync exactly like
// scripts/run-prod-lab.mjs (shell:true only where needed for npm/npx/corepack
// shims on Windows). Every orchestrator step below calls commands ONLY
// through this, so a test can substitute a fake that records call order and
// engineers failures at any step.
// ---------------------------------------------------------------------------

/**
 * @returns {{status:number|null,stdout:string,stderr:string,error?:Error}}
 *
 * `shell` is only enabled on Windows for `npm`/`npx` (needed to resolve
 * their `.cmd` shims) — NEVER for `git`. cmd.exe's own escape character is
 * `^`, and git revision syntax uses `^{}`/`^{commit}` routinely (e.g. this
 * module's own tag-peel check, `<tag>^{}`) — shell:true silently strips
 * that `^` before git ever sees the argument, turning a real tag/commit
 * reference into a different, usually-invalid one. git.exe itself needs no
 * shell to be found on PATH on either platform.
 */
export function defaultRun(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32" && cmd !== "git",
    ...opts,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error,
  };
}

/** Throws DeployError(code) if `result` failed to spawn or exited non-zero. */
function requireSuccess(code, label, result) {
  if (result.error) {
    throw new DeployError(code, `${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const tail = (result.stderr || result.stdout || "").trim().slice(-2000);
    throw new DeployError(code, `${label} exited with status ${result.status}.${tail ? `\n${tail}` : ""}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Preflight — required executables
// ---------------------------------------------------------------------------

export function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!(major >= 22 && major < 23)) {
    throw new DeployError(
      "NODE_VERSION",
      `Node ${process.versions.node} is not supported — this project requires Node >=22 <23 (better-sqlite3 native bindings). Use nvm/.nvmrc to switch.`
    );
  }
}

export function checkGitAvailable(run) {
  const result = run("git", ["--version"], {});
  requireSuccess("GIT_MISSING", "git --version", result);
}

export function checkNpmVersion(run) {
  const result = run("npm", ["--version"], {});
  requireSuccess("NPM_MISSING", "npm --version", result);
  const major = Number(String(result.stdout).trim().split(".")[0]);
  if (!(major >= 10)) {
    throw new DeployError("NPM_VERSION", `npm ${result.stdout.trim()} is too old — this project requires npm >=10.`);
  }
}

/** Acquires the pinned pnpm 9 contract deterministically through corepack — same mechanism run-prod-lab.mjs already relies on via `npx -y pnpm@9.0.0`, just verified reachable up front instead of failing mid-install. */
export function checkPnpmAvailable(run) {
  const result = run("npx", ["-y", "pnpm@9.0.0", "--version"], {});
  requireSuccess("PNPM_MISSING", "npx -y pnpm@9.0.0 --version", result);
}

// ---------------------------------------------------------------------------
// .env.local preservation
// ---------------------------------------------------------------------------

/** Leaves an existing `.env.local` byte-for-byte untouched. Creates it from `.env.local.example` only when absent. Never touches either file otherwise. */
export function ensureEnvLocal(mikaiRoot) {
  const envLocal = path.join(mikaiRoot, ".env.local");
  const envExample = path.join(mikaiRoot, ".env.local.example");
  if (fs.existsSync(envLocal)) {
    return { created: false, path: envLocal };
  }
  if (!fs.existsSync(envExample)) {
    throw new DeployError("ENV_EXAMPLE_MISSING", `Neither .env.local nor .env.local.example exists under ${mikaiRoot}.`);
  }
  fs.copyFileSync(envExample, envLocal);
  return { created: true, path: envLocal };
}

// ---------------------------------------------------------------------------
// Runtime directories — create only the existing known ones when absent.
// Never delete/reset/rename anything.
// ---------------------------------------------------------------------------

export const KNOWN_RUNTIME_DIRS = ["data", "public/uploads", "public/outputs", "storage/uploads", "storage/outputs"];

export function ensureRuntimeDirs(mikaiRoot) {
  const created = [];
  for (const rel of KNOWN_RUNTIME_DIRS) {
    const abs = path.join(mikaiRoot, rel);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs, { recursive: true });
      created.push(rel);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Git checkout helpers (used against BOTH MikAIProdLab and the sidecar)
// ---------------------------------------------------------------------------

/** True only when `git status --porcelain --untracked-files=no` is empty — i.e. no tracked modification/staged/deleted file. Untracked scratch files never block install/update. */
export function isTrackedCheckoutClean(dir, run) {
  const result = run("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: dir });
  requireSuccess("GIT_STATUS_FAILED", `git status in ${dir}`, result);
  return result.stdout.trim().length === 0;
}

export function gitRemoteUrl(dir, run) {
  const result = run("git", ["remote", "get-url", "origin"], { cwd: dir });
  requireSuccess("GIT_REMOTE_FAILED", `git remote get-url origin in ${dir}`, result);
  return result.stdout.trim();
}

export function gitRevParse(dir, ref, run) {
  const result = run("git", ["rev-parse", ref], { cwd: dir });
  requireSuccess("GIT_REVPARSE_FAILED", `git rev-parse ${ref} in ${dir}`, result);
  return result.stdout.trim();
}

export function gitFetchTags(dir, run) {
  const result = run("git", ["fetch", "origin", "--tags", "--force"], { cwd: dir });
  requireSuccess("GIT_FETCH_FAILED", `git fetch origin --tags in ${dir}`, result);
}

/** Verifies `tag` (already fetched) peels to exactly `commit`. Throws DeployError before any checkout on mismatch or a missing tag. */
export function assertTagPeelsToCommit(dir, tag, commit, run) {
  const result = run("git", ["rev-parse", `${tag}^{}`], { cwd: dir });
  if (result.error || result.status !== 0) {
    throw new DeployError("PIN_TAG_MISSING", `Sidecar tag "${tag}" was not found in ${dir} after fetch.`);
  }
  const peeled = result.stdout.trim();
  if (peeled !== commit) {
    throw new DeployError(
      "PIN_TAG_MISMATCH",
      `Sidecar tag "${tag}" peels to ${peeled}, not the pinned commit ${commit}. Refusing to check out an unverified commit.`
    );
  }
}

export function gitCheckoutDetached(dir, commit, run) {
  const result = run("git", ["checkout", "--detach", commit], { cwd: dir });
  requireSuccess("GIT_CHECKOUT_FAILED", `git checkout --detach ${commit} in ${dir}`, result);
}

/** Clones `pin.repository` into `dir` (must not yet exist), fetches tags, verifies the tag peels to the pinned commit, then checks out that exact commit detached. */
export function cloneSidecarAtPin(dir, pin, run) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const cloneResult = run("git", ["clone", pin.repository, dir], {});
  requireSuccess("GIT_CLONE_FAILED", `git clone ${pin.repository}`, cloneResult);
  gitFetchTags(dir, run);
  assertTagPeelsToCommit(dir, pin.releaseTag, pin.commit, run);
  gitCheckoutDetached(dir, pin.commit, run);
}

/** For an EXISTING sidecar checkout: refuses on tracked changes or an origin mismatch, then fetches/verifies/moves to exactly the pinned commit. Never resets/cleans user work; never moves if the checkout is already at the pinned commit. */
export function updateExistingSidecarToPin(dir, pin, run) {
  if (!isTrackedCheckoutClean(dir, run)) {
    throw new DeployError("SIDECAR_DIRTY", `Sidecar checkout at ${dir} has tracked changes — refusing to move it to the pinned commit.`);
  }
  const origin = gitRemoteUrl(dir, run);
  if (origin !== pin.repository) {
    throw new DeployError(
      "SIDECAR_ORIGIN_MISMATCH",
      `Sidecar checkout at ${dir} has origin ${JSON.stringify(origin)}, expected ${JSON.stringify(pin.repository)}.`
    );
  }
  gitFetchTags(dir, run);
  assertTagPeelsToCommit(dir, pin.releaseTag, pin.commit, run);
  const currentHead = gitRevParse(dir, "HEAD", run);
  if (currentHead === pin.commit) {
    return { moved: false };
  }
  gitCheckoutDetached(dir, pin.commit, run);
  return { moved: true };
}

/** Ensures the sidecar checkout at `dir` is exactly at `pin.commit` — clones if absent, verifies+moves if present. */
export function ensureSidecarAtPin(dir, pin, run) {
  if (!fs.existsSync(dir)) {
    cloneSidecarAtPin(dir, pin, run);
    return { cloned: true, moved: true };
  }
  const { moved } = updateExistingSidecarToPin(dir, pin, run);
  return { cloned: false, moved };
}

/**
 * Codex Retake P1 — a preflight-only origin check for `update()`, deliberately
 * separate from `updateExistingSidecarToPin()`: that function also fetches
 * and checks out, which must never happen before MikAI itself has fast-
 * forwarded and the (possibly new) pin has been re-read. This one reads
 * `origin` off the CURRENT on-disk sidecar against the CURRENTLY tracked
 * pin — no network call, no checkout — so a wrong sidecar is caught before
 * backup or any MikAI fetch/merge, not after. A missing sidecar directory
 * is not a mismatch here (nothing to check yet; `ensureSidecarAtPin` clones
 * it later, after the real pin is known).
 */
export function assertExistingSidecarOriginMatchesPin(dir, pin, run) {
  if (!fs.existsSync(dir)) return;
  const origin = gitRemoteUrl(dir, run);
  if (origin !== pin.repository) {
    throw new DeployError(
      "SIDECAR_ORIGIN_MISMATCH",
      `Sidecar checkout at ${dir} has origin ${JSON.stringify(origin)}, expected ${JSON.stringify(pin.repository)}. Refusing before any backup or MikAI update.`
    );
  }
}

// ---------------------------------------------------------------------------
// Port-free check — a single positive-refusal probe (not a wait loop, unlike
// run-prod-lab.mjs's clean-start): install/update/backup must refuse
// immediately when a listener is confirmed present or when presence cannot
// be confirmed either way, never guess "probably free".
// ---------------------------------------------------------------------------

export function checkPortFree(host, port, connectImpl = net.connect, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = connectImpl({ host, port, timeout: timeoutMs });
    const finish = (ok, reason) => {
      socket.destroy();
      resolve({ ok, reason });
    };
    socket.once("connect", () => finish(false, `Something is already listening on ${host}:${port}.`));
    socket.once("timeout", () => finish(false, `Connection attempt to ${host}:${port} timed out (inconclusive — treated as occupied).`));
    socket.once("error", (err) => {
      if (err && err.code === "ECONNREFUSED") {
        finish(true, null);
        return;
      }
      finish(false, `Could not confirm ${host}:${port} is free (${err && err.code ? err.code : String(err)}).`);
    });
  });
}

/** Refuses (DeployError) unless BOTH the MikAI and sidecar ports are confirmed free. */
export async function requireBothPortsFree({ mikaiHost, mikaiPort, sidecarHost, sidecarPort }) {
  const [mikai, sidecar] = await Promise.all([
    checkPortFree(mikaiHost, mikaiPort),
    checkPortFree(sidecarHost, sidecarPort),
  ]);
  if (!mikai.ok) {
    throw new DeployError("MIKAI_PORT_BUSY", `MikAI port ${mikaiPort} on ${mikaiHost} must be stopped first: ${mikai.reason}`);
  }
  if (!sidecar.ok) {
    throw new DeployError("SIDECAR_PORT_BUSY", `OpenReel sidecar port ${sidecarPort} on ${sidecarHost} must be stopped first: ${sidecar.reason}`);
  }
}

// ---------------------------------------------------------------------------
// Backup-before-migration gate
// ---------------------------------------------------------------------------

const SUPPORTED_DB_CONTRACT_REL = path.join("data", "mikailab.db");

/** Resolves the effective DB path the same way src/db/index.ts and drizzle.config.ts do. */
export function resolveDbPath(mikaiRoot, env = process.env) {
  return env.DB_PATH ? path.resolve(env.DB_PATH) : path.join(mikaiRoot, "data", "mikailab.db");
}

function isWithinSupportedDataContract(mikaiRoot, dbPathAbs) {
  const expected = path.join(mikaiRoot, SUPPORTED_DB_CONTRACT_REL);
  return path.resolve(dbPathAbs) === path.resolve(expected);
}

/**
 * Requires a backup before touching an EXISTING DB. A missing/fresh DB never
 * requires one. A `DB_PATH` outside the supported `<repo>/data/mikailab.db`
 * contract refuses outright (before migrations) rather than silently
 * skipping or claiming protection it cannot actually provide.
 */
export function requireBackupBeforeMigration({ mikaiRoot, env, run }) {
  const dbPathAbs = resolveDbPath(mikaiRoot, env);
  if (!fs.existsSync(dbPathAbs)) {
    return { ran: false, reason: "fresh-db" };
  }
  if (!isWithinSupportedDataContract(mikaiRoot, dbPathAbs)) {
    throw new DeployError(
      "DB_PATH_UNSUPPORTED",
      `DB_PATH (${dbPathAbs}) is outside the supported ${SUPPORTED_DB_CONTRACT_REL} contract — this tool cannot safely automate a backup for it. Back it up manually before continuing, then re-run.`
    );
  }
  const result = run("npm", ["run", "backup:create"], { cwd: mikaiRoot });
  requireSuccess("BACKUP_FAILED", "npm run backup:create", result);
  return { ran: true, reason: "existing-db-backed-up" };
}

// ---------------------------------------------------------------------------
// Install/build/migrate steps
// ---------------------------------------------------------------------------

export function npmCiMikai(mikaiRoot, run) {
  const result = run("npm", ["ci"], { cwd: mikaiRoot });
  requireSuccess("NPM_CI_FAILED", "npm ci (MikAI)", result);
}

export function pnpmInstallSidecar(sidecarDir, run) {
  const result = run("npx", ["-y", "pnpm@9.0.0", "install", "--frozen-lockfile"], { cwd: sidecarDir });
  requireSuccess("PNPM_INSTALL_FAILED", "pnpm install --frozen-lockfile (sidecar)", result);
}

export function buildMikai(mikaiRoot, run) {
  const result = run("npm", ["run", "build"], { cwd: mikaiRoot });
  requireSuccess("BUILD_FAILED", "npm run build (MikAI)", result);
}

export function buildSidecar(sidecarDir, run) {
  const result = run("npx", ["-y", "pnpm@9.0.0", "build"], { cwd: sidecarDir });
  requireSuccess("BUILD_FAILED", "pnpm build (sidecar)", result);
}

export function runMigrations(mikaiRoot, run) {
  const result = run("npm", ["run", "db:migrate"], { cwd: mikaiRoot });
  requireSuccess("MIGRATE_FAILED", "npm run db:migrate", result);
}

/** Opens the DB read-only and runs PRAGMA integrity_check / foreign_key_check. Throws DeployError on the first problem found. */
export async function checkDbHealth(dbPathAbs) {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPathAbs, { readonly: true });
  try {
    const integrity = db.pragma("integrity_check");
    const integrityOk = Array.isArray(integrity) && integrity.length === 1 && integrity[0].integrity_check === "ok";
    if (!integrityOk) {
      throw new DeployError("DB_INTEGRITY_FAILED", `DB integrity_check did not report ok: ${JSON.stringify(integrity)}`);
    }
    const fk = db.pragma("foreign_key_check");
    if (Array.isArray(fk) && fk.length > 0) {
      throw new DeployError("DB_FK_VIOLATIONS", `DB foreign_key_check reported ${fk.length} violation(s).`);
    }
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {string} o.mikaiRoot
 * @param {string} [o.pinPath]
 * @param {typeof defaultRun} [o.run]
 * @param {NodeJS.ProcessEnv} [o.env]
 */
export async function install({ mikaiRoot, pinPath, run = defaultRun, env = process.env } = {}) {
  const resolvedPinPath = pinPath ?? path.join(mikaiRoot, "config", "openreel-sidecar-release.json");
  const steps = [];

  checkNodeVersion();
  checkGitAvailable(run);
  checkNpmVersion(run);
  checkPnpmAvailable(run);
  steps.push("preflight");

  const pin = loadReleasePin(resolvedPinPath);
  steps.push("pin-validated");

  const { dir: sidecarDir } = resolveSidecarDir({ mikaiRoot, env });
  steps.push("sidecar-dir-resolved");

  const envResult = ensureEnvLocal(mikaiRoot);
  steps.push("env-local-ensured");

  const createdDirs = ensureRuntimeDirs(mikaiRoot);
  steps.push("runtime-dirs-ensured");

  const sidecarState = ensureSidecarAtPin(sidecarDir, pin, run);
  steps.push("sidecar-at-pin");

  npmCiMikai(mikaiRoot, run);
  steps.push("npm-ci");

  pnpmInstallSidecar(sidecarDir, run);
  steps.push("pnpm-install");

  // Codex Retake P1 — the pair must be confirmed stopped before ANY
  // DB-facing operation (backup or migration), not just before migration
  // itself: backing up or migrating the DB served by an active MikAI
  // process is exactly the unsafe live-schema transition this ticket
  // exists to prevent. A fresh install with no DB yet still runs this
  // check (harmless — nothing is listening on a genuinely fresh machine)
  // so the guard is never silently weaker for one install path than the
  // other; only the backup itself stays conditional on an existing DB.
  const mikaiPort = Number(env.MIKAI_PORT || 3000);
  const mikaiHost = env.MIKAI_HOST || "localhost";
  const sidecarPort = Number(env.OPENREEL_PORT || pin.defaultPort);
  const sidecarHost = env.OPENREEL_HOST || "127.0.0.1";
  await requireBothPortsFree({ mikaiHost, mikaiPort, sidecarHost, sidecarPort });
  steps.push("ports-free");

  // Migrate BEFORE building MikAI, not after: `next build` prerenders
  // static routes (e.g. the not-found page's root layout) that query the DB
  // through drizzle — against a brand-new DB file with no schema yet, that
  // prerender fails outright and the whole build fails. The backup gate
  // still runs first, so this never migrates an existing DB unbacked up;
  // it only moves the (already-gated) migration ahead of the build step.
  const backup = requireBackupBeforeMigration({ mikaiRoot, env, run });
  steps.push("backup-gate");

  runMigrations(mikaiRoot, run);
  steps.push("migrate");

  const dbPathAbs = resolveDbPath(mikaiRoot, env);
  if (fs.existsSync(dbPathAbs)) {
    await checkDbHealth(dbPathAbs);
    steps.push("db-health");
  }

  buildMikai(mikaiRoot, run);
  steps.push("build-mikai");

  buildSidecar(sidecarDir, run);
  steps.push("build-sidecar");

  return { pin, sidecarDir, envLocal: envResult, createdDirs, sidecarState, backup, steps };
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

export async function update({ mikaiRoot, pinPath, run = defaultRun, env = process.env } = {}) {
  const resolvedPinPath = pinPath ?? path.join(mikaiRoot, "config", "openreel-sidecar-release.json");
  const steps = [];

  checkNodeVersion();
  checkGitAvailable(run);
  checkNpmVersion(run);
  checkPnpmAvailable(run);
  steps.push("preflight");

  const previousPin = loadReleasePin(resolvedPinPath);
  const { dir: sidecarDir } = resolveSidecarDir({ mikaiRoot, env });

  if (!isTrackedCheckoutClean(mikaiRoot, run)) {
    throw new DeployError("MIKAI_DIRTY", `MikAI checkout at ${mikaiRoot} has tracked changes — refusing to update.`);
  }
  if (fs.existsSync(sidecarDir) && !isTrackedCheckoutClean(sidecarDir, run)) {
    throw new DeployError("SIDECAR_DIRTY", `Sidecar checkout at ${sidecarDir} has tracked changes — refusing to update.`);
  }
  steps.push("clean-checkouts");

  // Codex Retake P1 — checked against the CURRENTLY tracked pin, before any
  // backup or MikAI fetch/merge (not just before the sidecar's own
  // clone/checkout inside ensureSidecarAtPin, which only runs later once
  // MikAI has already moved). No fetch, no checkout — origin is read
  // straight off the existing on-disk remote config.
  assertExistingSidecarOriginMatchesPin(sidecarDir, previousPin, run);
  steps.push("sidecar-origin-preflight");

  const mikaiPort = Number(env.MIKAI_PORT || 3000);
  const mikaiHost = env.MIKAI_HOST || "localhost";
  const sidecarPort = Number(env.OPENREEL_PORT || previousPin.defaultPort);
  const sidecarHost = env.OPENREEL_HOST || "127.0.0.1";
  await requireBothPortsFree({ mikaiHost, mikaiPort, sidecarHost, sidecarPort });
  steps.push("ports-free");

  const backup = requireBackupBeforeMigration({ mikaiRoot, env, run });
  steps.push("backup-gate");

  const beforeSha = gitRevParse(mikaiRoot, "HEAD", run);
  const fetchResult = run("git", ["fetch", "origin", "main"], { cwd: mikaiRoot });
  requireSuccess("GIT_FETCH_FAILED", "git fetch origin main (MikAI)", fetchResult);
  const ffResult = run("git", ["merge", "--ff-only", "origin/main"], { cwd: mikaiRoot });
  requireSuccess("MIKAI_FF_FAILED", "git merge --ff-only origin/main (MikAI) — history has diverged", ffResult);
  const afterSha = gitRevParse(mikaiRoot, "HEAD", run);
  steps.push("mikai-fast-forwarded");

  // Re-read the pin — main may have moved it.
  const pin = loadReleasePin(resolvedPinPath);
  steps.push("pin-reread");

  npmCiMikai(mikaiRoot, run);
  steps.push("npm-ci");

  const sidecarState = ensureSidecarAtPin(sidecarDir, pin, run);
  steps.push("sidecar-at-pin");

  pnpmInstallSidecar(sidecarDir, run);
  steps.push("pnpm-install");

  // Migrate before building MikAI — see install()'s own comment on this:
  // `next build` prerenders routes that query the DB, so the schema must
  // already be current. The backup above already covers this migration.
  runMigrations(mikaiRoot, run);
  steps.push("migrate");

  const dbPathAbs = resolveDbPath(mikaiRoot, env);
  if (fs.existsSync(dbPathAbs)) {
    await checkDbHealth(dbPathAbs);
    steps.push("db-health");
  }

  buildMikai(mikaiRoot, run);
  steps.push("build-mikai");

  buildSidecar(sidecarDir, run);
  steps.push("build-sidecar");

  return { previousPin, pin, mikaiSha: { before: beforeSha, after: afterSha }, sidecarDir, sidecarState, backup, steps };
}

// ---------------------------------------------------------------------------
// start — validates then delegates to the existing prod:all launcher.
// Never a second process manager.
// ---------------------------------------------------------------------------

export function start({ mikaiRoot, pinPath, run = defaultRun, env = process.env, spawnImpl } = {}) {
  const resolvedPinPath = pinPath ?? path.join(mikaiRoot, "config", "openreel-sidecar-release.json");

  checkNodeVersion();
  const pin = loadReleasePin(resolvedPinPath);
  const { dir: sidecarDir } = resolveSidecarDir({ mikaiRoot, env });

  if (!fs.existsSync(sidecarDir)) {
    throw new DeployError("SIDECAR_MISSING", `Sidecar directory ${sidecarDir} does not exist. Run install first.`);
  }
  const head = gitRevParse(sidecarDir, "HEAD", run);
  if (head !== pin.commit) {
    throw new DeployError(
      "SIDECAR_NOT_AT_PIN",
      `Sidecar checkout at ${sidecarDir} is at ${head}, not the pinned commit ${pin.commit}. Run install/update first.`
    );
  }

  const spawnFn = spawnImpl || spawn;

  const childEnv = {
    ...env,
    MIKAI_OPENREEL_DIR: sidecarDir,
  };
  const child = spawnFn("npm", ["run", "prod:all"], {
    cwd: mikaiRoot,
    env: childEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return { pin, sidecarDir, child };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — only runs when this file is executed directly.
// ---------------------------------------------------------------------------

function printResultSummary(mode, result) {
  console.log(`[mikai-deploy] ${mode} completed.`);
  if (result && result.pin) {
    console.log(`[mikai-deploy] sidecar pinned at ${result.pin.commit} (tag ${result.pin.releaseTag})`);
  }
  if (result && result.sidecarDir) {
    console.log(`[mikai-deploy] sidecar dir: ${result.sidecarDir}`);
  }
  if (result && result.steps) {
    console.log(`[mikai-deploy] steps: ${result.steps.join(" -> ")}`);
  }
}

async function main() {
  const mode = process.argv[2];
  if (!["install", "update", "start"].includes(mode)) {
    console.error("Usage: node scripts/mikai-deploy.mjs <install|update|start>");
    process.exit(1);
  }
  try {
    if (mode === "install") {
      const result = await install({ mikaiRoot: repoRoot });
      printResultSummary("install", result);
    } else if (mode === "update") {
      const result = await update({ mikaiRoot: repoRoot });
      printResultSummary("update", result);
    } else {
      start({ mikaiRoot: repoRoot });
      // start delegates to a persistent child (stdio inherited) — do not exit here.
      return;
    }
  } catch (err) {
    const code = err && err.code ? err.code : "UNKNOWN";
    console.error(`[mikai-deploy] ${mode} failed [${code}]: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
