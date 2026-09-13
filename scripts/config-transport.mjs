#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Export / import the *configuration* of a MikAI installation — never its
// projects (DEVOPS.CONFIG.EXPORT.1).
//
// Exactly three tables travel: `app_settings`, `comfy_workflows`,
// `llm_templates` — plus the workflow thumbnail files they reference under
// public/uploads/reference-images/workflow-thumbnails/. Everything else
// (projects, sequences, shots, assets, any project media) is out of scope by
// the author's own decision — see docs/DEVOPS_LINUX_PORT_1_AUDIT.md §4.
//
// This is a neighbour of scripts/data-backup.mjs, not an extension of it:
// that script's contract is "one installation, one disk" (the whole DB plus
// the four media roots); this one is a deliberately partial, config-only
// transport. scripts/data-backup.mjs, scripts/mikai-deploy.mjs,
// scripts/storage-audit.mjs and scripts/run-prod-lab.mjs are read and
// imported from here, never modified.
//
// Reuse note (docs/DEVOPS_LINUX_PORT_1_AUDIT.md / the ticket's §5 and §11):
// `sha256File` and `MANIFEST_FILENAME` are imported from
// scripts/data-backup.mjs (this module has no directory tree to walk the
// way that one's `collectRegularFilesStrict` does — it copies named files
// one at a time — so that export is not needed here). `toPosixRelative`,
// `isSafeRelativePath`, `isWithinRoot` and `classifyFsError` are NOT
// exported by that module (no `export` keyword on any of them) and
// scripts/data-backup.mjs is off-limits for edits under this ticket, so
// minimal equivalents are recreated below — documented here rather than
// silently duplicated.
//
// `requireBackupBeforeMigration` and `resolveDbPath` are imported from
// scripts/mikai-deploy.mjs unchanged: import always requires a backup of an
// existing target DB first, on the exact same gate `mikai:install`/`update`
// already use.
//
// `DEFAULT_WORKFLOW_KEYS` and `PROVIDER_PREFIXES` below are duplicated from
// src/lib/workflowDefaults.ts and src/lib/settings.ts respectively — the
// scripts/ -> src/ import wall (no TypeScript loader, no Next path aliases;
// scripts/playwright-harness.mjs documents the same wall) leaves no other
// option. Each duplication is held solidary with its source by a test that
// imports both and fails the moment they diverge
// (tests/scripts/configTransportDefaultKeys.test.ts,
// tests/scripts/configTransportSecretKeys.test.ts) — the duplication is
// imposed, not casual, and is proved rather than promised.
// ---------------------------------------------------------------------------

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  statSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sha256File, MANIFEST_FILENAME } from "./data-backup.mjs";
import { requireBackupBeforeMigration, resolveDbPath, defaultRun } from "./mikai-deploy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

export const FORMAT_VERSION = 1;
export const EXPORT_DIR_PREFIX = "mikai-config-";
export const THUMBNAILS_SUBDIR = "thumbnails";

// The exhaustive set of `app_settings` keys `default_workflow_*` covers —
// duplicated from src/lib/workflowDefaults.ts's own `DEFAULT_KEYS` because
// scripts/ under Node cannot import from src/ (no TypeScript loader, no Next
// path aliases — the same wall scripts/playwright-harness.mjs documents).
// tests/scripts/configTransportDefaultKeys.test.ts imports both copies and
// fails if they ever diverge — that test is this duplication's proof of
// solidarity, not a comment promising it.
export const DEFAULT_WORKFLOW_KEYS = [
  "default_workflow_asset_image",
  "default_workflow_shot_image",
  "default_workflow_shot_video",
  "default_workflow_gaussian_ply",
  "default_workflow_gaussian_to_image",
  "default_workflow_look_development",
];

// Duplicated from src/lib/settings.ts's own `PROVIDER_PREFIXES` — same
// scripts/ -> src/ import wall as DEFAULT_WORKFLOW_KEYS above.
// tests/scripts/configTransportSecretKeys.test.ts derives
// `${prefix}api_key` for every entry here and requires its presence in
// SECRET_APP_SETTINGS_KEYS below, so a fourth provider added to
// `LLMProvider` tomorrow fails that test until this list — and
// SECRET_APP_SETTINGS_KEYS with it — is updated, rather than silently
// escaping the secret filter.
export const PROVIDER_PREFIXES = {
  ollama: "llm_ollama_",
  openrouter: "llm_openrouter_",
  "openai-compatible": "llm_openai_compatible_",
};

// The exhaustive list of `app_settings` keys this tool treats as secrets.
// Its basis is deliberately "what the code can ever write" — every
// provider's `${prefix}api_key` (derived from PROVIDER_PREFIXES, so a new
// provider is covered automatically) plus the two settings that are not
// provider-shaped at all — never "what one database happened to have filled
// in" (docs/DEVOPS_LINUX_PORT_1_AUDIT.md §2 named only four keys because
// only four had rows the day it was measured; the fifth and sixth,
// `llm_ollama_api_key` and `llm_openai_compatible_api_key`, are real
// read paths in src/lib/settings.ts that simply carried zero rows that day).
// Written out explicitly rather than matched by a `*_api_key` pattern
// (the ticket's §7): a pattern would catch a future non-secret key that
// happens to match it, or miss a secret that does not follow the
// convention.
export const SECRET_APP_SETTINGS_KEYS = [
  "comfyui_api_key", // ComfyUI local/self-hosted API key — not provider-shaped
  "comfyui_cloud_api_key", // ComfyUI cloud API key (legacy alongside the above) — not provider-shaped
  "llm_api_key", // legacy single LLM provider API key, predates PROVIDER_PREFIXES — not provider-shaped
  ...Object.values(PROVIDER_PREFIXES).map((prefix) => `${prefix}api_key`), // one per LLMProvider, derived
];
const SECRET_APP_SETTINGS_KEYS_SET = new Set(SECRET_APP_SETTINGS_KEYS);

const THUMBNAIL_RELATIVE_ROOT = "uploads/reference-images/workflow-thumbnails";
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_STRING_LENGTH = 4096;

// ---------------------------------------------------------------------------
// Minimal path-safety helpers recreated from scripts/data-backup.mjs (see
// header note above: the originals are not exported and that file is not to
// be modified by this ticket).
// ---------------------------------------------------------------------------

function toPosixRelative(baseAbs, targetAbs) {
  return path.relative(baseAbs, targetAbs).split(path.sep).join("/");
}

function isWithinRoot(absPath, rootAbs) {
  const resolved = path.resolve(absPath);
  return resolved === rootAbs || resolved.startsWith(rootAbs + path.sep);
}

function classifyFsError(err) {
  const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
  switch (code) {
    case "ENOENT":
      return "path does not exist";
    case "EACCES":
    case "EPERM":
      return "permission denied";
    case "ENOTDIR":
      return "expected a directory but found a file (or the reverse)";
    case "EISDIR":
      return "expected a file but found a directory";
    default:
      return "filesystem error";
  }
}

/** True only for "uploads/reference-images/workflow-thumbnails/<safe file name>". */
function isSafeThumbnailRelativePath(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0 || relPath.length > MAX_STRING_LENGTH) return false;
  if (path.isAbsolute(relPath)) return false;
  if (relPath.includes("\\") || relPath.includes("\0")) return false;
  if (!relPath.startsWith(`${THUMBNAIL_RELATIVE_ROOT}/`)) return false;
  const rest = relPath.slice(THUMBNAIL_RELATIVE_ROOT.length + 1);
  if (rest.length === 0 || rest.includes("/")) return false; // exactly one file component
  if (rest === "." || rest === "..") return false;
  return true;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** Same semantics as src/lib/workflowDefaults.ts's parseWorkflowDefaultId (a
 * positive integer, else null) — reimplemented here rather than imported
 * across the scripts/ -> src/ wall. Only DEFAULT_WORKFLOW_KEYS itself (the
 * list of six key *names*) is required by the ticket to be held solidary by
 * a test; this is a two-line predicate, not a list that can silently drift
 * in content. */
function parsePositiveIntId(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

/**
 * Reads the three tables from a consistent snapshot (better-sqlite3's
 * `db.backup()` into a throwaway temp file — never the live `.db`, which
 * without its WAL is a stale view). Never writes to the source installation.
 */
async function readConfigFromSnapshot(dbPathAbs) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mikai-config-export-"));
  const snapshotPath = path.join(tmpDir, "config-snapshot.sqlite");
  try {
    const src = new Database(dbPathAbs, { readonly: true, fileMustExist: true });
    try {
      await src.backup(snapshotPath);
    } finally {
      src.close();
    }
    const snap = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    try {
      return {
        appSettings: snap.prepare("SELECT key, value FROM app_settings ORDER BY key").all(),
        comfyWorkflows: snap.prepare("SELECT * FROM comfy_workflows ORDER BY id").all(),
        llmTemplates: snap.prepare("SELECT * FROM llm_templates ORDER BY id").all(),
      };
    } finally {
      snap.close();
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * @param {{ sourceRoot?: string, dbPath?: string, outputRoot?: string, withSecrets?: boolean }} opts
 * @returns {Promise<
 *   | { ok: true, exportDir: string, manifest: Record<string, any>, missingThumbnails: Array<Record<string, any>> }
 *   | { ok: false, reason: string }
 * >}
 */
export async function exportConfig(opts = {}) {
  const sourceRootAbs = opts.sourceRoot ? path.resolve(opts.sourceRoot) : repoRoot;
  const dbPathAbs = opts.dbPath ? path.resolve(opts.dbPath) : path.join(sourceRootAbs, "data", "mikailab.db");
  const outputRootAbs = opts.outputRoot ? path.resolve(opts.outputRoot) : path.join(repoRoot, "data", "config-exports");
  const withSecrets = Boolean(opts.withSecrets);

  if (!existsSync(dbPathAbs)) {
    return { ok: false, reason: `Database not found: ${dbPathAbs}` };
  }

  let rows;
  try {
    rows = await readConfigFromSnapshot(dbPathAbs);
  } catch (err) {
    return { ok: false, reason: `Could not read a consistent snapshot of the database: ${classifyFsError(err)}` };
  }

  const omittedSecretKeys = [];
  const appSettings = [];
  for (const row of rows.appSettings) {
    if (!withSecrets && SECRET_APP_SETTINGS_KEYS_SET.has(row.key)) {
      omittedSecretKeys.push(row.key);
      continue;
    }
    appSettings.push({ key: row.key, value: row.value });
  }

  mkdirSync(outputRootAbs, { recursive: true });
  const slug = timestampSlug();
  let exportDirAbs = path.join(outputRootAbs, `${EXPORT_DIR_PREFIX}${slug}`);
  let suffix = 0;
  while (existsSync(exportDirAbs)) {
    suffix += 1;
    exportDirAbs = path.join(outputRootAbs, `${EXPORT_DIR_PREFIX}${slug}-${suffix}`);
  }
  mkdirSync(exportDirAbs, { recursive: false });

  const cleanupOnFailure = () => {
    try {
      rmSync(exportDirAbs, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  };

  try {
    const thumbnails = [];
    const missingThumbnails = [];
    let thumbsDirAbs = null;
    for (const wf of rows.comfyWorkflows) {
      if (!wf.thumbnail_path) continue;
      if (!isSafeThumbnailRelativePath(wf.thumbnail_path)) {
        missingThumbnails.push({ workflowId: wf.id, relativePath: wf.thumbnail_path, reason: "unsafe path — skipped" });
        continue;
      }
      const srcAbs = path.join(sourceRootAbs, "public", ...wf.thumbnail_path.split("/"));
      if (!isWithinRoot(srcAbs, path.join(sourceRootAbs, "public", ...THUMBNAIL_RELATIVE_ROOT.split("/")))) {
        missingThumbnails.push({ workflowId: wf.id, relativePath: wf.thumbnail_path, reason: "escapes thumbnail root — skipped" });
        continue;
      }
      if (!existsSync(srcAbs)) {
        missingThumbnails.push({ workflowId: wf.id, relativePath: wf.thumbnail_path, reason: "file not found — skipped" });
        continue;
      }
      if (!thumbsDirAbs) {
        thumbsDirAbs = path.join(exportDirAbs, THUMBNAILS_SUBDIR);
        mkdirSync(thumbsDirAbs, { recursive: true });
      }
      const basename = path.basename(wf.thumbnail_path);
      const destAbs = path.join(thumbsDirAbs, basename);
      if (existsSync(destAbs)) {
        // UUID-named files (src/lib/uploadImage.ts): a real collision here
        // would mean two different source files share a name, which this
        // tool must not silently merge.
        throw new Error(`thumbnail filename collision while exporting: ${basename}`);
      }
      copyFileSync(srcAbs, destAbs);
      const sizeBytes = statSync(destAbs).size;
      const sha256 = await sha256File(destAbs);
      thumbnails.push({
        relativePath: wf.thumbnail_path,
        workflowId: wf.id,
        exportFile: `${THUMBNAILS_SUBDIR}/${basename}`,
        sizeBytes,
        sha256,
      });
    }

    const manifest = {
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      // Identifies the source without divulging it (no absolute filesystem
      // path, which can embed a username or an installation layout).
      source: { hostname: os.hostname(), platform: process.platform },
      appSettings,
      omittedSecretKeys,
      comfyWorkflows: rows.comfyWorkflows,
      llmTemplates: rows.llmTemplates,
      thumbnails,
    };

    writeFileSync(path.join(exportDirAbs, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2) + "\n", "utf8");

    return { ok: true, exportDir: exportDirAbs, manifest, missingThumbnails };
  } catch (err) {
    cleanupOnFailure();
    return { ok: false, reason: `Export aborted, no partial export left behind: ${err instanceof Error ? err.message : classifyFsError(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function validateConfigManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return ["manifest is not an object"];

  if (manifest.formatVersion !== FORMAT_VERSION) {
    errors.push(`unsupported formatVersion: ${JSON.stringify(manifest.formatVersion)}`);
  }
  if (typeof manifest.createdAt !== "string" || Number.isNaN(Date.parse(manifest.createdAt))) {
    errors.push("createdAt is missing or not a valid ISO timestamp");
  }
  if (!Array.isArray(manifest.appSettings)) {
    errors.push("appSettings is missing");
  } else {
    for (const [i, row] of manifest.appSettings.entries()) {
      if (!isPlainObject(row) || typeof row.key !== "string" || row.key.length === 0 || typeof row.value !== "string") {
        errors.push(`appSettings[${i}] is invalid`);
      }
    }
  }
  if (!Array.isArray(manifest.omittedSecretKeys)) {
    errors.push("omittedSecretKeys is missing");
  } else if (manifest.omittedSecretKeys.some((k) => typeof k !== "string" || k.length === 0)) {
    errors.push("omittedSecretKeys contains a non-string entry");
  }
  if (!Array.isArray(manifest.comfyWorkflows)) {
    errors.push("comfyWorkflows is missing");
  } else {
    for (const [i, wf] of manifest.comfyWorkflows.entries()) {
      if (
        !isPlainObject(wf) ||
        !Number.isInteger(wf.id) ||
        wf.id <= 0 ||
        typeof wf.name !== "string" ||
        wf.name.length === 0 ||
        (wf.kind !== "image" && wf.kind !== "video") ||
        typeof wf.workflow_json !== "string" ||
        (wf.status !== "active" && wf.status !== "archived")
      ) {
        errors.push(`comfyWorkflows[${i}] is invalid`);
      }
    }
  }
  if (!Array.isArray(manifest.llmTemplates)) {
    errors.push("llmTemplates is missing");
  } else {
    const allowedAnchors = new Set(["project", "sequence", "shot", "asset", "lookResult"]);
    for (const [i, t] of manifest.llmTemplates.entries()) {
      if (
        !isPlainObject(t) ||
        !Number.isInteger(t.id) ||
        t.id <= 0 ||
        typeof t.name !== "string" ||
        t.name.length === 0 ||
        !allowedAnchors.has(t.anchor_kind) ||
        typeof t.template_json !== "string"
      ) {
        errors.push(`llmTemplates[${i}] is invalid`);
      }
    }
  }
  if (!Array.isArray(manifest.thumbnails)) {
    errors.push("thumbnails is missing");
  } else {
    for (const [i, th] of manifest.thumbnails.entries()) {
      if (
        !isPlainObject(th) ||
        !isSafeThumbnailRelativePath(th.relativePath) ||
        !Number.isInteger(th.workflowId) ||
        th.workflowId <= 0 ||
        typeof th.exportFile !== "string" ||
        !th.exportFile.startsWith(`${THUMBNAILS_SUBDIR}/`) ||
        th.exportFile.includes("..") ||
        th.exportFile.includes("\\") ||
        !Number.isSafeInteger(th.sizeBytes) ||
        th.sizeBytes < 0 ||
        typeof th.sha256 !== "string" ||
        !SHA256_RE.test(th.sha256)
      ) {
        errors.push(`thumbnails[${i}] is invalid`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Loopback host detection (DEVOPS.CONFIG.LOOPBACK.1)
//
// `config:import` recopies every app_settings value verbatim, including a
// service URL like `comfyui_base_url = http://127.0.0.1:8188`. On the target
// machine, `127.0.0.1`/`localhost` name the target machine, not whatever
// service ran there on the source — the import looks complete and silently
// points at nothing. This never rewrites or guesses a replacement value (the
// tool cannot know the right address) and never makes a network request (an
// import must not depend on any service being reachable at import time): it
// only names, in the CLI output, which imported values need the author's own
// look — docs/DEVOPS_LINUX_PORT_1.md §5 already describes that look.
// ---------------------------------------------------------------------------

/** True when `hostname` — as returned by `new URL(...).hostname` (already
 * lowercased; an IPv6 host keeps its brackets, e.g. "[::1]") — denotes "this
 * machine" rather than a reachable service: `localhost`, any address in
 * `127.0.0.0/8` (not only `127.0.0.1`), `::1` bracketed or not, or
 * `0.0.0.0`. Deliberately not widened to private ranges (`192.168.x`,
 * `10.x`, `172.16-31.x`) or to Tailscale (`100.64.0.0/10`): those addresses
 * depend on the host too but can still be reachable from the target machine,
 * and flagging them would put a real warning next to routine noise — see
 * the ticket's §2. */
export function isLoopbackHost(hostname) {
  if (typeof hostname !== "string" || hostname.length === 0) return false;
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  const ipv4 = /^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (ipv4) return Number(ipv4[1]) === 127;
  return false;
}

/**
 * Scans `appSettings` (an array of `{ key, value }`, the shape both the
 * manifest and the DB rows share) and returns the entries whose value parses
 * as an absolute `http:`/`https:` URL with a loopback host. Not restricted to
 * a fixed list of keys (ticket §5) — a value that does not parse as such a
 * URL is ignored silently, which is not an error: most app_settings values
 * are not URLs at all. Parsing uses `URL`, never a substring search, so a
 * hostname that merely contains "localhost" is never mistaken for one.
 * @param {Array<{ key: string, value: string }>} appSettings
 * @returns {Array<{ key: string, value: string }>}
 */
export function findLoopbackAppSettings(appSettings) {
  const flagged = [];
  for (const row of appSettings ?? []) {
    if (!row || typeof row.key !== "string" || typeof row.value !== "string") continue;
    let url;
    try {
      url = new URL(row.value);
    } catch {
      continue; // not an absolute URL — silently out of scope, not an error
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (isLoopbackHost(url.hostname)) {
      flagged.push({ key: row.key, value: row.value });
    }
  }
  return flagged;
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   importDir: string,
 *   targetRoot: string,
 *   dbPath?: string,
 *   overwriteAppSettings?: boolean,
 *   env?: Record<string, string | undefined>,
 *   run?: typeof defaultRun,
 * }} opts
 * @returns {Promise<
 *   | {
 *       ok: true,
 *       targetRoot: string,
 *       preserveWorkflowIds: boolean,
 *       importedWorkflowCount: number,
 *       importedTemplateCount: number,
 *       templatesUnlinked: number,
 *       writtenThumbnailCount: number,
 *       droppedThumbnails: Array<Record<string, any>>,
 *       skippedExistingAppSettingsKeys: string[],
 *       omittedDefaultWorkflowKeys: string[],
 *       loopbackAppSettings: Array<{ key: string, value: string }>,
 *       backup: Record<string, any>,
 *     }
 *   | { ok: false, reason: string, errors?: string[] }
 * >}
 */
export async function importConfig(opts) {
  const importDirAbs = path.resolve(opts.importDir);
  const targetRootAbs = path.resolve(opts.targetRoot);
  const overwriteAppSettings = Boolean(opts.overwriteAppSettings);
  const run = opts.run ?? defaultRun;
  let env = opts.env ?? process.env;
  const dbPathAbs = opts.dbPath ? path.resolve(opts.dbPath) : resolveDbPath(targetRootAbs, env);
  if (opts.dbPath) {
    // Keep requireBackupBeforeMigration's own resolveDbPath(mikaiRoot, env)
    // call (it recomputes the path itself, it does not take dbPathAbs as a
    // parameter) in agreement with the path this function actually reads
    // and writes below.
    env = { ...env, DB_PATH: dbPathAbs };
  }

  const manifestPath = path.join(importDirAbs, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    return { ok: false, reason: `manifest not found: ${manifestPath}` };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, reason: "manifest is not valid JSON" };
  }
  const manifestErrors = validateConfigManifest(manifest);
  if (manifestErrors.length > 0) {
    return { ok: false, reason: "Invalid manifest", errors: manifestErrors };
  }

  if (!existsSync(dbPathAbs)) {
    return {
      ok: false,
      reason: `Database not found at target: ${dbPathAbs}. Run "npm run db:migrate" on the target installation before importing.`,
    };
  }

  // Pre-verify every referenced thumbnail file against the manifest's own
  // sha256 BEFORE any DB write, so the decision of which workflow keeps its
  // thumbnail_path is made up front rather than discovered mid-transaction.
  const verifiedThumbnailByRelativePath = new Map();
  const droppedThumbnails = [];
  for (const th of manifest.thumbnails) {
    const srcAbs = path.join(importDirAbs, ...th.exportFile.split("/"));
    if (!isWithinRoot(srcAbs, path.join(importDirAbs, THUMBNAILS_SUBDIR))) {
      droppedThumbnails.push({ workflowId: th.workflowId, relativePath: th.relativePath, reason: "escapes thumbnails/ — refused" });
      continue;
    }
    if (!existsSync(srcAbs)) {
      droppedThumbnails.push({ workflowId: th.workflowId, relativePath: th.relativePath, reason: "file missing from import directory" });
      continue;
    }
    const st = statSync(srcAbs);
    if (st.size !== th.sizeBytes) {
      droppedThumbnails.push({ workflowId: th.workflowId, relativePath: th.relativePath, reason: "size mismatch" });
      continue;
    }
    const actualHash = await sha256File(srcAbs);
    if (actualHash !== th.sha256) {
      droppedThumbnails.push({ workflowId: th.workflowId, relativePath: th.relativePath, reason: "sha256 mismatch" });
      continue;
    }
    verifiedThumbnailByRelativePath.set(th.relativePath, { srcAbs, exportFile: th.exportFile });
  }

  // Backup gate — the same one scripts/mikai-deploy.mjs's install/update use.
  // A fresh (not-yet-existing) target DB never requires one; an existing one
  // always does, before any write below.
  let backup;
  try {
    backup = requireBackupBeforeMigration({ mikaiRoot: targetRootAbs, env, run });
  } catch (err) {
    return { ok: false, reason: `Backup gate refused: ${err instanceof Error ? err.message : String(err)}` };
  }

  const db = new Database(dbPathAbs);
  const idMap = new Map(); // source comfy_workflows.id -> target id
  const filesToWrite = []; // { destAbs, srcAbs }
  let preserveWorkflowIds;
  let skippedExistingAppSettingsKeys = [];
  let omittedDefaultWorkflowKeys = [];
  let templatesUnlinked = 0;

  try {
    db.pragma("foreign_keys = ON");

    const txn = db.transaction(() => {
      const existingWorkflowCount = db.prepare("SELECT COUNT(*) c FROM comfy_workflows").get().c;
      preserveWorkflowIds = existingWorkflowCount === 0;

      const existingAppSettingsKeys = new Set(db.prepare("SELECT key FROM app_settings").all().map((r) => r.key));

      // --- comfy_workflows: decide the thumbnail_path each row actually
      // gets (only a verified-and-about-to-be-written file may be named),
      // then insert. ---
      const insertWithId = db.prepare(
        `INSERT INTO comfy_workflows (id, name, kind, description, workflow_json, source_filename, created_at, updated_at, category, tags, contexts, thumbnail_path, thumbnail_source_filename, status, is_favorite)
         VALUES (@id, @name, @kind, @description, @workflow_json, @source_filename, @created_at, @updated_at, @category, @tags, @contexts, @thumbnail_path, @thumbnail_source_filename, @status, @is_favorite)`
      );
      const insertNewId = db.prepare(
        `INSERT INTO comfy_workflows (name, kind, description, workflow_json, source_filename, created_at, updated_at, category, tags, contexts, thumbnail_path, thumbnail_source_filename, status, is_favorite)
         VALUES (@name, @kind, @description, @workflow_json, @source_filename, @created_at, @updated_at, @category, @tags, @contexts, @thumbnail_path, @thumbnail_source_filename, @status, @is_favorite)`
      );

      for (const wf of manifest.comfyWorkflows) {
        let thumbnailPath = null;
        let thumbnailSourceFilename = null;
        if (wf.thumbnail_path) {
          const verified = verifiedThumbnailByRelativePath.get(wf.thumbnail_path);
          if (verified) {
            thumbnailPath = wf.thumbnail_path;
            thumbnailSourceFilename = wf.thumbnail_source_filename ?? null;
            filesToWrite.push({ srcAbs: verified.srcAbs, destAbs: path.join(targetRootAbs, "public", ...wf.thumbnail_path.split("/")) });
          }
          // else: dropped above and already recorded in droppedThumbnails —
          // thumbnail_path/thumbnail_source_filename stay null on this row.
        }

        const row = {
          id: wf.id,
          name: wf.name,
          kind: wf.kind,
          description: wf.description ?? null,
          workflow_json: wf.workflow_json,
          source_filename: wf.source_filename ?? null,
          created_at: wf.created_at,
          updated_at: wf.updated_at,
          category: wf.category ?? null,
          tags: wf.tags ?? null,
          contexts: wf.contexts ?? null,
          thumbnail_path: thumbnailPath,
          thumbnail_source_filename: thumbnailSourceFilename,
          status: wf.status,
          is_favorite: wf.is_favorite ? 1 : 0,
        };

        if (preserveWorkflowIds) {
          insertWithId.run(row);
          idMap.set(wf.id, wf.id);
        } else {
          const info = insertNewId.run(row);
          idMap.set(wf.id, Number(info.lastInsertRowid));
        }
      }

      // --- app_settings: default_workflow_* keys are deferred until the
      // id map above is complete; every other key is upserted (or skipped)
      // immediately. ---
      const upsert = db.prepare(
        `INSERT INTO app_settings (key, value) VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      );
      const byKey = new Map(manifest.appSettings.map((r) => [r.key, r.value]));

      for (const row of manifest.appSettings) {
        if (DEFAULT_WORKFLOW_KEYS.includes(row.key)) continue; // deferred
        const isExisting = existingAppSettingsKeys.has(row.key);
        if (isExisting && !overwriteAppSettings) {
          skippedExistingAppSettingsKeys.push(row.key);
          continue;
        }
        upsert.run(row);
      }

      for (const key of DEFAULT_WORKFLOW_KEYS) {
        if (!byKey.has(key)) continue; // not present in the export at all
        const isExisting = existingAppSettingsKeys.has(key);
        if (isExisting && !overwriteAppSettings) {
          skippedExistingAppSettingsKeys.push(key);
          continue;
        }
        const oldId = parsePositiveIntId(byKey.get(key));
        const newId = oldId !== null && idMap.has(oldId) ? idMap.get(oldId) : null;
        if (newId === null) {
          // The default's source workflow was not imported (or the stored
          // value was never a valid id): never invent a value, omit the key
          // entirely rather than write something wrong.
          omittedDefaultWorkflowKeys.push(key);
          continue;
        }
        upsert.run({ key, value: String(newId) });
      }

      // --- llm_templates: projectId always NULL on the target — it has no
      // projects. ---
      const insertTemplate = db.prepare(
        `INSERT INTO llm_templates (name, description, anchor_kind, project_id, template_json, source_filename, created_at, updated_at)
         VALUES (@name, @description, @anchor_kind, NULL, @template_json, @source_filename, @created_at, @updated_at)`
      );
      for (const t of manifest.llmTemplates) {
        insertTemplate.run({
          name: t.name,
          description: t.description ?? null,
          anchor_kind: t.anchor_kind,
          template_json: t.template_json,
          source_filename: t.source_filename ?? null,
          created_at: t.created_at,
          updated_at: t.updated_at,
        });
        if (t.project_id !== null && t.project_id !== undefined) templatesUnlinked += 1;
      }
    });

    txn();
  } catch (err) {
    return { ok: false, reason: `Import aborted, no row written: ${err instanceof Error ? err.message : classifyFsError(err)}` };
  } finally {
    db.close();
  }

  // Files are written only after the DB transaction committed successfully
  // — every thumbnail_path now in the DB names a file this step is about to
  // write, and nothing else.
  const writtenThumbnails = [];
  for (const { srcAbs, destAbs } of filesToWrite) {
    mkdirSync(path.dirname(destAbs), { recursive: true });
    copyFileSync(srcAbs, destAbs);
    writtenThumbnails.push(toPosixRelative(path.join(targetRootAbs, "public"), destAbs));
  }

  return {
    ok: true,
    targetRoot: targetRootAbs,
    preserveWorkflowIds,
    importedWorkflowCount: manifest.comfyWorkflows.length,
    importedTemplateCount: manifest.llmTemplates.length,
    templatesUnlinked,
    writtenThumbnailCount: writtenThumbnails.length,
    droppedThumbnails,
    skippedExistingAppSettingsKeys,
    omittedDefaultWorkflowKeys,
    // Named, never rewritten, never network-checked — see the section above.
    // Only over keys actually written to the target: a key skipped above
    // (already present on the target, --overwrite-app-settings not passed)
    // keeps the target's own value, so flagging its imported-but-unwritten
    // value would warn about a write that never happened.
    loopbackAppSettings: findLoopbackAppSettings(
      manifest.appSettings.filter((row) => !skippedExistingAppSettingsKeys.includes(row.key))
    ),
    backup,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--with-secrets") {
      out.withSecrets = true;
    } else if (arg === "--overwrite-app-settings") {
      out.overwriteAppSettings = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      out[key] = argv[i + 1];
      i++;
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function printHelp() {
  console.log(`
MikAI configuration export / import (DEVOPS.CONFIG.EXPORT.1)

Moves app_settings, comfy_workflows and llm_templates (plus workflow
thumbnails) between installations, WITHOUT projects, sequences, shots,
assets, or any project media.

Usage:
  node scripts/config-transport.mjs export [--source-root <dir>] [--db-path <file>] [--output <dir>] [--with-secrets]
  node scripts/config-transport.mjs import <config-dir> --target <dir> [--db-path <file>] [--overwrite-app-settings]

  export   Reads a consistent snapshot (better-sqlite3 online backup) of the
           source database, never the live .db file. Secrets
           (${SECRET_APP_SETTINGS_KEYS.join(", ")})
           are omitted by default; pass --with-secrets to include them.
           Writes a timestamped directory under --output (default:
           data/config-exports/).
  import   Requires a backup of an existing target DB first (the same gate
           "npm run mikai:install"/"update" use). If the target's
           comfy_workflows table is empty, workflow ids are preserved and the
           six default_workflow_* keys need no rewriting. Otherwise, new ids
           are assigned and default_workflow_* is rewritten through the
           id map — a default whose source workflow was not imported is
           omitted, never invented. llm_templates.project_id is always set to
           NULL. An app_settings key already present on the target is kept
           as-is unless --overwrite-app-settings is passed.

Never touches projects, sequences, shots, assets, or their media.
`);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }
  const args = parseArgs(rest);

  if (cmd === "export") {
    const result = await exportConfig({
      sourceRoot: args["source-root"],
      dbPath: args["db-path"],
      outputRoot: args["output"],
      withSecrets: args.withSecrets,
    });
    if (!result.ok) {
      console.error(`[config-transport] export failed: ${result.reason}`);
      process.exit(1);
    }
    console.log(`Config export created: ${result.exportDir}`);
    console.log(`  app_settings: ${result.manifest.appSettings.length} row(s) (${result.manifest.omittedSecretKeys.length} secret key(s) omitted)`);
    if (result.manifest.omittedSecretKeys.length > 0) {
      console.log(`    omitted: ${result.manifest.omittedSecretKeys.join(", ")}`);
    }
    console.log(`  comfy_workflows: ${result.manifest.comfyWorkflows.length} row(s), ${result.manifest.thumbnails.length} thumbnail(s)`);
    console.log(`  llm_templates: ${result.manifest.llmTemplates.length} row(s)`);
    const totalThumbBytes = result.manifest.thumbnails.reduce((s, t) => s + t.sizeBytes, 0);
    if (totalThumbBytes > 0) console.log(`  thumbnails total size: ${formatBytes(totalThumbBytes)}`);
    if (result.missingThumbnails.length > 0) {
      console.log(`  ${result.missingThumbnails.length} thumbnail(s) skipped:`);
      for (const m of result.missingThumbnails) console.log(`    - workflow #${m.workflowId}: ${m.reason}`);
    }
    process.exit(0);
  }

  if (cmd === "import") {
    const importDir = args._[0];
    const target = args.target;
    if (!importDir || !target) {
      console.error("[config-transport] import requires <config-dir> and --target <dir>");
      process.exit(1);
    }
    const result = await importConfig({
      importDir,
      targetRoot: target,
      dbPath: args["db-path"],
      overwriteAppSettings: args.overwriteAppSettings,
    });
    if (!result.ok) {
      console.error(`[config-transport] import failed: ${result.reason}`);
      if (result.errors) for (const e of result.errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    console.log(`Config imported into ${result.targetRoot}`);
    console.log(`  backup: ${result.backup.ran ? "created before writing" : "skipped (fresh target DB)"}`);
    console.log(`  comfy_workflows: ${result.importedWorkflowCount} row(s), ids ${result.preserveWorkflowIds ? "preserved" : "remapped"}`);
    console.log(`  llm_templates: ${result.importedTemplateCount} row(s), ${result.templatesUnlinked} unlinked from their source project`);
    console.log(`  thumbnails written: ${result.writtenThumbnailCount}`);
    if (result.droppedThumbnails.length > 0) {
      console.log(`  ${result.droppedThumbnails.length} thumbnail(s) dropped (thumbnail_path left NULL):`);
      for (const d of result.droppedThumbnails) console.log(`    - workflow #${d.workflowId}: ${d.reason}`);
    }
    if (result.skippedExistingAppSettingsKeys.length > 0) {
      console.log(`  ${result.skippedExistingAppSettingsKeys.length} app_settings key(s) already present on target — kept as-is:`);
      console.log(`    ${result.skippedExistingAppSettingsKeys.join(", ")}`);
    }
    if (result.omittedDefaultWorkflowKeys.length > 0) {
      console.log(`  ${result.omittedDefaultWorkflowKeys.length} default_workflow_* key(s) omitted (source workflow not imported):`);
      console.log(`    ${result.omittedDefaultWorkflowKeys.join(", ")}`);
    }
    if (result.loopbackAppSettings.length > 0) {
      console.log(`  ${result.loopbackAppSettings.length} app_settings value(s) now point at this machine, not the source machine:`);
      for (const { key, value } of result.loopbackAppSettings) {
        console.log(`    - ${key} = ${value} (this address now means the target machine, not wherever it meant on the source)`);
      }
      console.log(`  See docs/DEVOPS_LINUX_PORT_1.md §5 for what to do about it.`);
    }
    process.exit(0);
  }

  console.error(`[config-transport] unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

function isMainModule() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main();
}
