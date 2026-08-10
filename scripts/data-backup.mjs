#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Backup / verify / list / restore the complete durable MikAI data set
// (OPS.DATA.BACKUP.RESTORE.1).
//
// Covers the SQLite database (via better-sqlite3's online backup API — never
// a raw copy of a live WAL file) plus the four durable media roots already
// trusted by scripts/storage-audit.mjs and the app's own serving routes:
// public/uploads, public/outputs, storage/uploads, storage/outputs.
//
// `restore` treats --target as an existing installation root (code,
// node_modules, .env.local may live there) and only ever reads or mutates
// the five MANAGED SURFACES below (the DB file + its sidecars, and the four
// media root directories) — never anything else in --target, even under
// --replace.
//
// One local instance, one local disk volume. No cloud target, no scheduler,
// no daemon, no encryption, no incremental format, no auto-prune — all
// deliberately out of scope. Node built-ins + better-sqlite3 (already a
// project dependency) only.
// ---------------------------------------------------------------------------

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  lstatSync,
  copyFileSync,
  rmSync,
  renameSync,
  createReadStream,
} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

export const FORMAT_VERSION = 1;
export const MEDIA_SUBDIR = "media";
export const DB_SNAPSHOT_RELATIVE = "db.sqlite";
export const MANIFEST_FILENAME = "manifest.json";
export const BACKUP_DIR_PREFIX = "mikai-backup-";

// The only four durable media roots this product persists locally, in a
// fixed order that determines manifest/output ordering.
export const MEDIA_ROOT_LABELS = ["public/uploads", "public/outputs", "storage/uploads", "storage/outputs"];

// The exhaustive set of paths restore is ever allowed to read or mutate
// under --target. Nothing else in an existing installation (code,
// node_modules, .env.local, anything else) is ever touched, quarantined,
// or removed — including under --replace.
export const MANAGED_DB_TARGET_SEGMENTS = ["data", "mikailab.db"];
const DB_SIDECAR_SUFFIXES = ["-wal", "-shm"];

// Manifest strictness bounds — a forged/hostile manifest cannot exhaust
// memory or smuggle unbounded structures past validateManifestSchema.
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024; // 64 MB of manifest JSON text
const MAX_FILES_ENTRIES = 500_000;
const MAX_STRING_LENGTH = 4096;
const SHA256_RE = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Deterministic, cross-platform manifest path: always forward-slash. */
function toPosixRelative(baseAbs, targetAbs) {
  return path.relative(baseAbs, targetAbs).split(path.sep).join("/");
}

function isSafeRelativePath(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0 || relPath.length > MAX_STRING_LENGTH) return false;
  if (path.isAbsolute(relPath)) return false;
  if (relPath.includes("\\")) return false; // manifest paths are always posix
  const segments = relPath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return true;
}

/** True only for "db.sqlite" or "media/<one of the 4 known labels>/<safe relative path>". */
function isAllowedFilesEntryPath(relativePath) {
  if (relativePath === DB_SNAPSHOT_RELATIVE) return true;
  if (typeof relativePath !== "string" || !relativePath.startsWith(`${MEDIA_SUBDIR}/`)) return false;
  const rest = relativePath.slice(MEDIA_SUBDIR.length + 1);
  const label = MEDIA_ROOT_LABELS.find((l) => rest === l || rest.startsWith(`${l}/`));
  if (!label) return false;
  const afterLabel = rest.slice(label.length);
  if (!afterLabel.startsWith("/")) return false; // bare label with no file component is not a file entry
  return isSafeRelativePath(afterLabel.slice(1));
}

function isWithinRoot(absPath, rootAbs) {
  const resolved = path.resolve(absPath);
  return resolved === rootAbs || resolved.startsWith(rootAbs + path.sep);
}

/** Best-effort short display path — never leaks anything outside the caller-given root. */
function displayPath(rootAbs, absPath) {
  const rel = path.relative(rootAbs, absPath);
  return rel.startsWith("..") ? path.basename(absPath) : rel.split(path.sep).join("/");
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** Fixed, bounded diagnostic — never echoes a raw driver error (may embed absolute host paths). */
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
    case "EEXIST":
      return "path already exists";
    case "EXDEV":
      return "cross-device operation not supported";
    case "ENOTEMPTY":
      return "directory not empty";
    default:
      return "filesystem error";
  }
}

// ---------------------------------------------------------------------------
// Strict file collection — symlinks, unreadable entries, and unsupported
// entry types are never silently skipped: the caller decides what "fatal"
// means (create: abort the whole backup; verify: report as a finding).
// ---------------------------------------------------------------------------

export class BackupFsError extends Error {
  constructor(code, relativePath) {
    super(`${code}: ${relativePath}`);
    this.code = code; // "SYMLINK" | "UNREADABLE_DIR" | "UNREADABLE_FILE" | "UNSUPPORTED_ENTRY" | "SOURCE_CHANGED"
    this.relativePath = relativePath;
  }
}

/** A managed target surface was found occupied only once restore was already past its initial (pre-staging) occupied-check. */
export class ConcurrentOccupationError extends Error {
  constructor(surfaceId) {
    super(`concurrent occupation: ${surfaceId}`);
    this.surfaceId = surfaceId;
  }
}

export function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(absPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Size + mtime + inode (when available) captured at enumeration time, to detect a same-size mutation before/after copy. */
export function fingerprintFromStat(st) {
  return { size: st.size, mtimeMs: st.mtimeMs, ino: st.ino || null };
}

/** True if two fingerprints describe the same unchanged file. `ino` is skipped when unavailable on either side (e.g. some Windows filesystems report 0). */
export function fingerprintsMatch(a, b) {
  if (a.size !== b.size || a.mtimeMs !== b.mtimeMs) return false;
  if (a.ino !== null && b.ino !== null && a.ino !== b.ino) return false;
  return true;
}

/**
 * Recursively lists regular files under `rootAbs`. Throws BackupFsError on
 * the first symlink, unreadable directory/file, or unsupported entry type
 * (device, FIFO, etc.) — callers must not treat a partial listing as complete.
 *
 * `rootAbs` itself is lstat'd before anything else: a symlinked root (a
 * media root in the source, or `media/` inside a backup being verified) is
 * refused immediately, before any `readdirSync` — so a symlink pointing at
 * an arbitrary external directory is never enumerated, not even partially.
 */
export function collectRegularFilesStrict(rootAbs) {
  const files = [];
  const rootLstat = lstatSync(rootAbs, { throwIfNoEntry: false });
  if (!rootLstat) return files;
  if (rootLstat.isSymbolicLink()) {
    throw new BackupFsError("SYMLINK", ".");
  }

  const stack = [rootAbs];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      throw new BackupFsError("UNREADABLE_DIR", toPosixRelative(rootAbs, dir) || ".");
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = toPosixRelative(rootAbs, full);
      if (entry.isSymbolicLink()) {
        throw new BackupFsError("SYMLINK", rel);
      }
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        let st;
        try {
          st = statSync(full);
        } catch {
          throw new BackupFsError("UNREADABLE_FILE", rel);
        }
        files.push({ absolute: full, relative: rel, size: st.size, fingerprint: fingerprintFromStat(st) });
        continue;
      }
      throw new BackupFsError("UNSUPPORTED_ENTRY", rel);
    }
  }
  files.sort((a, b) => a.relative.localeCompare(b.relative));
  return files;
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

function resolveDbPath(sourceRootAbs, opts) {
  if (opts.dbPath) return path.resolve(opts.dbPath);
  return path.join(sourceRootAbs, "data", "mikailab.db");
}

async function snapshotDatabase(dbPath, destPath) {
  const src = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    await src.backup(destPath);
  } finally {
    src.close();
  }
  // Force a single-file artifact (no -wal/-shm sidecars) regardless of the
  // source's journal mode, so the snapshot is a self-contained archive item.
  const dest = new Database(destPath);
  let tableCount;
  let journalMode;
  try {
    journalMode = dest.pragma("journal_mode = DELETE", { simple: true });
    tableCount = dest.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'table'").get().c;
  } finally {
    dest.close();
  }
  return { journalMode, tableCount };
}

/**
 * @param {{ sourceRoot?: string, backupRoot?: string, dbPath?: string }} opts
 */
export async function createBackup(opts = {}) {
  const sourceRootAbs = opts.sourceRoot ? path.resolve(opts.sourceRoot) : repoRoot;
  const backupRootAbs = opts.backupRoot ? path.resolve(opts.backupRoot) : path.join(repoRoot, "data", "backups");
  const dbPathAbs = resolveDbPath(sourceRootAbs, opts);

  // --db-path is a CLI-reachable option, not just an internal default: it
  // must stay confined to <sourceRoot>/data/ like everything else this tool
  // reads. Without this, a caller could point it at a DB under an unrelated
  // (or symlinked) tree while sourceRoot/media stay clean, and the backup
  // would silently assemble a DB from one tree with media from another.
  const dataRootAbs = path.join(sourceRootAbs, "data");
  if (!isWithinRoot(dbPathAbs, dataRootAbs)) {
    return { ok: false, reason: "Refusing: the database path must be under <source root>/data/." };
  }

  // Refused before any read: a symlinked ancestor anywhere above sourceRoot,
  // backupRoot, or the DB path (not just the path itself) would silently
  // redirect enumeration/writes outside the tree the caller believes they
  // targeted. Diagnostics never echo the absolute host path a parent
  // symlink was found at — only which named surface was affected — since
  // that symlink can sit outside every root the caller supplied.
  try {
    assertNoSymlinkInPath(sourceRootAbs, "source root");
    assertNoSymlinkInPath(backupRootAbs, "backup root");
    assertNoSymlinkInPath(dbPathAbs, "database path");
  } catch (err) {
    if (err instanceof PathSymlinkError) {
      return { ok: false, reason: `Refusing: symlink found in the ${err.label} path.` };
    }
    throw err;
  }

  if (!existsSync(dbPathAbs)) {
    return { ok: false, reason: `Database not found: ${displayPath(sourceRootAbs, dbPathAbs)}` };
  }

  // Refused before any write: a --backup-root inside a source media root
  // (or equal to one) would have the backup enumerate and copy itself,
  // recursing until it fails partway through an unbounded, self-referential
  // payload.
  for (const label of MEDIA_ROOT_LABELS) {
    const mediaRootAbs = path.join(sourceRootAbs, ...label.split("/"));
    if (isWithinRoot(backupRootAbs, mediaRootAbs)) {
      return { ok: false, reason: `Refusing: --backup-root is inside the source media root "${label}". Choose a backup root outside all four source media roots.` };
    }
  }

  mkdirSync(backupRootAbs, { recursive: true });
  const slug = timestampSlug();
  let backupDirAbs = path.join(backupRootAbs, `${BACKUP_DIR_PREFIX}${slug}`);
  let suffix = 0;
  while (existsSync(backupDirAbs)) {
    suffix += 1;
    backupDirAbs = path.join(backupRootAbs, `${BACKUP_DIR_PREFIX}${slug}-${suffix}`);
  }

  const cleanupOnFailure = () => {
    try {
      rmSync(backupDirAbs, { recursive: true, force: true });
    } catch {
      // best-effort; nothing else to do here
    }
  };

  try {
    mkdirSync(backupDirAbs, { recursive: false });

    const files = [];

    // --- DB snapshot ---
    const dbDest = path.join(backupDirAbs, DB_SNAPSHOT_RELATIVE);
    const dbMeta = await snapshotDatabase(dbPathAbs, dbDest);
    const dbSize = statSync(dbDest).size;
    const dbHash = await sha256File(dbDest);
    files.push({ relativePath: DB_SNAPSHOT_RELATIVE, sizeBytes: dbSize, sha256: dbHash });

    // --- Media roots ---
    // Any symlink, unreadable entry, or source mutation between enumeration
    // and copy aborts the ENTIRE backup — a backup tool must never report
    // ok:true after silently omitting or misrepresenting data (P1 findings).
    const mediaRootsManifest = [];
    for (const label of MEDIA_ROOT_LABELS) {
      const rootAbs = path.join(sourceRootAbs, ...label.split("/"));
      // Full chain from the volume root, not just rootAbs itself: a
      // symlinked intermediate segment (e.g. a symlinked "public/" above
      // "uploads/"), or a symlinked root — even a broken one existsSync
      // would report absent — must be refused outright, never silently
      // treated as absent or read through to whatever it points at.
      if (firstSymlinkFromVolumeRoot(rootAbs) !== null) {
        throw new BackupFsError("SYMLINK", label);
      }
      const present = existsSync(rootAbs);
      if (!present) {
        mediaRootsManifest.push({ label, present: false, fileCount: 0 });
        continue;
      }
      const rootFiles = collectRegularFilesStrict(rootAbs);
      // testHookAfterEnumeration exists solely so proof tooling can
      // deterministically rewrite a just-enumerated file (same size,
      // different content — a real write, so a real new mtime) before the
      // copy loop below reaches it, exercising the fingerprint mismatch
      // path without racing a real concurrent process. Production callers
      // never set it.
      if (typeof opts.testHookAfterEnumeration === "function") {
        opts.testHookAfterEnumeration(label, rootFiles);
      }
      for (const f of rootFiles) {
        const destRel = `${MEDIA_SUBDIR}/${label}/${f.relative}`;
        const destAbs = path.join(backupDirAbs, ...destRel.split("/"));
        mkdirSync(path.dirname(destAbs), { recursive: true });

        // Stability check, immediately before AND after the copy: same
        // size, mtime, and inode (when available) as at enumeration time.
        // This narrows — but, being a filesystem timestamp comparison
        // without locking, cannot fully eliminate — the TOCTOU window; a
        // rewrite that lands between the post-copy check and here with an
        // identical size and a filesystem mtime resolution too coarse to
        // register the change is a residual, undetectable race (documented
        // in README).
        let preCopyStat;
        try {
          preCopyStat = lstatSync(f.absolute);
        } catch {
          throw new BackupFsError("UNREADABLE_FILE", `${label}/${f.relative}`);
        }
        if (preCopyStat.isSymbolicLink()) {
          throw new BackupFsError("SYMLINK", `${label}/${f.relative}`);
        }
        if (!fingerprintsMatch(fingerprintFromStat(preCopyStat), f.fingerprint)) {
          throw new BackupFsError("SOURCE_CHANGED", `${label}/${f.relative}`);
        }
        copyFileSync(f.absolute, destAbs);
        let postCopyStat;
        try {
          postCopyStat = lstatSync(f.absolute);
        } catch {
          throw new BackupFsError("UNREADABLE_FILE", `${label}/${f.relative}`);
        }
        if (postCopyStat.isSymbolicLink() || !fingerprintsMatch(fingerprintFromStat(postCopyStat), f.fingerprint)) {
          throw new BackupFsError("SOURCE_CHANGED", `${label}/${f.relative}`);
        }
        const copiedSize = statSync(destAbs).size;
        if (copiedSize !== f.size) {
          throw new BackupFsError("SOURCE_CHANGED", `${label}/${f.relative}`);
        }
        const hash = await sha256File(destAbs);
        files.push({ relativePath: destRel, sizeBytes: f.size, sha256: hash });
      }
      mediaRootsManifest.push({ label, present: true, fileCount: rootFiles.length });
    }

    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    const manifest = {
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      sourceRoot: sourceRootAbs,
      db: {
        relativePath: DB_SNAPSHOT_RELATIVE,
        sizeBytes: dbSize,
        sha256: dbHash,
        journalMode: dbMeta.journalMode,
        tableCount: dbMeta.tableCount,
      },
      mediaRoots: mediaRootsManifest,
      files,
    };

    writeFileSync(path.join(backupDirAbs, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2) + "\n", "utf8");

    return { ok: true, backupDir: backupDirAbs, manifest };
  } catch (err) {
    cleanupOnFailure();
    if (err instanceof BackupFsError) {
      const reasonByCode = {
        SYMLINK: `Refusing to back up a symlink inside a managed media root: ${err.relativePath}`,
        UNREADABLE_DIR: `Unreadable directory inside a managed media root: ${err.relativePath}`,
        UNREADABLE_FILE: `Unreadable file inside a managed media root: ${err.relativePath}`,
        UNSUPPORTED_ENTRY: `Unsupported filesystem entry inside a managed media root: ${err.relativePath}`,
        SOURCE_CHANGED: `Source file changed while being backed up (concurrent write?): ${err.relativePath}`,
      };
      return { ok: false, reason: `Backup aborted, no partial backup left behind. ${reasonByCode[err.code] ?? err.code}` };
    }
    return { ok: false, reason: `Backup aborted and rolled back: ${classifyFsError(err)}` };
  }
}

// ---------------------------------------------------------------------------
// VERIFY
// ---------------------------------------------------------------------------

function pushUnknownKeys(errors, obj, allowed, label) {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) errors.push(`unexpected key ${label}.${k}`);
  }
}

function validateManifestSchema(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return ["manifest is not an object"];

  const allowedTop = new Set(["formatVersion", "createdAt", "sourceRoot", "db", "mediaRoots", "files"]);
  pushUnknownKeys(errors, manifest, allowedTop, "manifest");
  for (const k of allowedTop) if (!(k in manifest)) errors.push(`missing key: manifest.${k}`);

  if (manifest.formatVersion !== FORMAT_VERSION) errors.push(`unsupported formatVersion: ${JSON.stringify(manifest.formatVersion)}`);
  if (typeof manifest.createdAt !== "string" || manifest.createdAt.length > MAX_STRING_LENGTH || Number.isNaN(Date.parse(manifest.createdAt))) {
    errors.push("createdAt is missing or not a valid ISO timestamp");
  }
  if (typeof manifest.sourceRoot !== "string" || manifest.sourceRoot.length === 0 || manifest.sourceRoot.length > MAX_STRING_LENGTH) {
    errors.push("sourceRoot is missing or invalid");
  }

  if (!manifest.db || typeof manifest.db !== "object" || Array.isArray(manifest.db)) {
    errors.push("db metadata is missing or invalid");
  } else {
    const allowedDb = new Set(["relativePath", "sizeBytes", "sha256", "journalMode", "tableCount"]);
    pushUnknownKeys(errors, manifest.db, allowedDb, "db");
    for (const k of allowedDb) if (!(k in manifest.db)) errors.push(`missing key: db.${k}`);
    if (manifest.db.relativePath !== DB_SNAPSHOT_RELATIVE) errors.push("db.relativePath is unexpected");
    if (!Number.isSafeInteger(manifest.db.sizeBytes) || manifest.db.sizeBytes < 0) errors.push("db.sizeBytes is invalid");
    if (typeof manifest.db.sha256 !== "string" || !SHA256_RE.test(manifest.db.sha256)) errors.push("db.sha256 is invalid");
    if (typeof manifest.db.journalMode !== "string" || manifest.db.journalMode.length > MAX_STRING_LENGTH) errors.push("db.journalMode is invalid");
    if (!Number.isSafeInteger(manifest.db.tableCount) || manifest.db.tableCount < 0) errors.push("db.tableCount is invalid");
  }

  if (!Array.isArray(manifest.mediaRoots)) {
    errors.push("mediaRoots is missing");
  } else if (manifest.mediaRoots.length !== MEDIA_ROOT_LABELS.length) {
    errors.push(`mediaRoots must have exactly ${MEDIA_ROOT_LABELS.length} entries`);
  } else {
    const allowedEntry = new Set(["label", "present", "fileCount"]);
    const seenLabels = new Set();
    for (const [i, entry] of manifest.mediaRoots.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`mediaRoots[${i}] is not an object`);
        continue;
      }
      pushUnknownKeys(errors, entry, allowedEntry, `mediaRoots[${i}]`);
      if (!MEDIA_ROOT_LABELS.includes(entry.label)) {
        errors.push(`mediaRoots[${i}].label is not a known media root: ${JSON.stringify(entry.label)}`);
        continue;
      }
      if (seenLabels.has(entry.label)) errors.push(`duplicate mediaRoots label: ${entry.label}`);
      seenLabels.add(entry.label);
      if (typeof entry.present !== "boolean") errors.push(`mediaRoots[${i}].present is invalid`);
      if (!Number.isSafeInteger(entry.fileCount) || entry.fileCount < 0) errors.push(`mediaRoots[${i}].fileCount is invalid`);
      if (entry.present === false && entry.fileCount !== 0) errors.push(`mediaRoots[${i}] absent root must have fileCount 0`);
    }
    for (const label of MEDIA_ROOT_LABELS) {
      if (!seenLabels.has(label)) errors.push(`mediaRoots is missing entry for ${label}`);
    }
  }

  if (!Array.isArray(manifest.files)) {
    errors.push("files is missing");
  } else if (manifest.files.length > MAX_FILES_ENTRIES) {
    errors.push(`files exceeds the maximum of ${MAX_FILES_ENTRIES} entries`);
  } else {
    const allowedFile = new Set(["relativePath", "sizeBytes", "sha256"]);
    const seen = new Set();
    let prevPath = null;
    let dbEntry = null;
    const fileCountByLabel = new Map(MEDIA_ROOT_LABELS.map((l) => [l, 0]));
    for (const [i, f] of manifest.files.entries()) {
      if (!f || typeof f !== "object" || Array.isArray(f)) {
        errors.push(`files[${i}] is not an object`);
        continue;
      }
      pushUnknownKeys(errors, f, allowedFile, `files[${i}]`);
      if (!isAllowedFilesEntryPath(f.relativePath)) {
        errors.push(`files[${i}].relativePath is not within an allowed surface: ${JSON.stringify(f.relativePath)}`);
        continue;
      }
      if (seen.has(f.relativePath)) errors.push(`duplicate manifest entry: ${f.relativePath}`);
      seen.add(f.relativePath);
      if (f.relativePath === DB_SNAPSHOT_RELATIVE) {
        dbEntry = f;
      } else {
        const label = MEDIA_ROOT_LABELS.find((l) => f.relativePath.startsWith(`${MEDIA_SUBDIR}/${l}/`));
        if (label) fileCountByLabel.set(label, fileCountByLabel.get(label) + 1);
      }
      if (prevPath !== null && f.relativePath <= prevPath) errors.push(`files[${i}] breaks deterministic ascending order`);
      prevPath = f.relativePath;
      if (!Number.isSafeInteger(f.sizeBytes) || f.sizeBytes < 0) errors.push(`files[${i}].sizeBytes is invalid`);
      if (typeof f.sha256 !== "string" || !SHA256_RE.test(f.sha256)) errors.push(`files[${i}].sha256 is invalid`);
    }
    if (!dbEntry) {
      errors.push("files is missing the db.sqlite entry");
    } else if (manifest.db && typeof manifest.db === "object") {
      // Semantic consistency: the db summary and the mediaRoots counters
      // must agree with the files list they claim to describe — a manifest
      // can be hash-consistent per file yet still lie about its own totals.
      if (manifest.db.sizeBytes !== dbEntry.sizeBytes) errors.push("db.sizeBytes does not match the files[] db.sqlite entry");
      if (manifest.db.sha256 !== dbEntry.sha256) errors.push("db.sha256 does not match the files[] db.sqlite entry");
    }
    if (Array.isArray(manifest.mediaRoots)) {
      for (const entry of manifest.mediaRoots) {
        if (!entry || typeof entry !== "object" || !MEDIA_ROOT_LABELS.includes(entry.label)) continue;
        const actual = fileCountByLabel.get(entry.label) ?? 0;
        if (entry.fileCount !== actual) {
          errors.push(`mediaRoots fileCount for ${entry.label} (${entry.fileCount}) does not match the ${actual} matching files[] entries`);
        }
      }
    }
  }

  return errors;
}

/**
 * @param {string} backupDirArg
 */
export async function verifyBackup(backupDirArg) {
  const backupDirAbs = path.resolve(backupDirArg);
  const errors = [];

  // Refused before anything else touches the path: a symlinked backup
  // directory — or a symlinked ancestor anywhere above it — must never have
  // its contents read through, even to report a clean "not found" for a
  // missing manifest.
  if (firstSymlinkFromVolumeRoot(backupDirAbs) !== null) {
    return { ok: false, errors: ["symlink found in the backup directory path — refused"] };
  }
  if (!existsSync(backupDirAbs)) {
    return { ok: false, errors: ["backup directory does not exist"] };
  }

  const manifestPath = path.join(backupDirAbs, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    return { ok: false, errors: [`manifest not found: ${MANIFEST_FILENAME}`] };
  }
  if (lstatSync(manifestPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
    return { ok: false, errors: [`${MANIFEST_FILENAME} is a symlink — refused`] };
  }
  if (statSync(manifestPath).size > MAX_MANIFEST_BYTES) {
    return { ok: false, errors: [`manifest exceeds the maximum size of ${MAX_MANIFEST_BYTES} bytes`] };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, errors: ["manifest is not valid JSON"] };
  }

  const schemaErrors = validateManifestSchema(manifest);
  if (schemaErrors.length > 0) {
    return { ok: false, errors: schemaErrors };
  }

  // --- Top-level payload: only manifest.json, db.sqlite, and (optionally) media/ ---
  let topLevelEntries;
  try {
    topLevelEntries = readdirSync(backupDirAbs, { withFileTypes: true });
  } catch {
    return { ok: false, errors: ["backup directory is unreadable"] };
  }
  const allowedTopLevel = new Set([MANIFEST_FILENAME, DB_SNAPSHOT_RELATIVE, MEDIA_SUBDIR]);
  for (const entry of topLevelEntries) {
    if (!allowedTopLevel.has(entry.name)) {
      errors.push(`unexpected top-level entry in backup: ${entry.name}`);
      continue;
    }
    if (entry.isSymbolicLink()) {
      errors.push(`top-level entry is a symlink — refused: ${entry.name}`);
      continue;
    }
    if (entry.name === MEDIA_SUBDIR && !entry.isDirectory()) {
      errors.push(`${MEDIA_SUBDIR} must be a directory`);
    }
    if (entry.name === DB_SNAPSHOT_RELATIVE && !entry.isFile()) {
      errors.push(`${DB_SNAPSHOT_RELATIVE} must be a regular file`);
    }
  }

  // Walk the actual payload on disk (db.sqlite + media/) and require it to
  // match the manifest's file set exactly — no extra files, no symlinks,
  // no unreadable entries.
  const onDiskRelatives = new Set();
  const dbAbs = path.join(backupDirAbs, DB_SNAPSHOT_RELATIVE);
  if (existsSync(dbAbs) && !lstatSync(dbAbs, { throwIfNoEntry: false })?.isSymbolicLink()) {
    onDiskRelatives.add(DB_SNAPSHOT_RELATIVE);
  }

  const mediaAbs = path.join(backupDirAbs, MEDIA_SUBDIR);
  if (existsSync(mediaAbs)) {
    try {
      for (const f of collectRegularFilesStrict(mediaAbs)) {
        onDiskRelatives.add(`${MEDIA_SUBDIR}/${f.relative}`);
      }
    } catch (err) {
      if (err instanceof BackupFsError) {
        errors.push(`${err.code === "SYMLINK" ? "symlink found inside backup payload — refused" : "unreadable entry inside backup payload"}: ${MEDIA_SUBDIR}/${err.relativePath}`);
      } else {
        errors.push("unreadable entry inside backup payload");
      }
    }
  }

  const manifestRelatives = new Set(manifest.files.map((f) => f.relativePath));
  for (const rel of onDiskRelatives) {
    if (!manifestRelatives.has(rel)) errors.push(`unexpected file not in manifest: ${rel}`);
  }
  for (const rel of manifestRelatives) {
    if (!onDiskRelatives.has(rel)) errors.push(`missing file listed in manifest: ${rel}`);
  }

  for (const entry of manifest.files) {
    const abs = path.join(backupDirAbs, ...entry.relativePath.split("/"));
    // lstat, never stat/existsSync: a symlink anywhere along this specific
    // path (most importantly db.sqlite itself, a single file never walked
    // by collectRegularFilesStrict) must never be read through to compute
    // a hash, even to report a mismatch.
    const lst = lstatSync(abs, { throwIfNoEntry: false });
    if (!lst) continue; // already reported as missing above
    if (!isWithinRoot(abs, backupDirAbs)) {
      errors.push(`manifest entry escapes backup directory: ${entry.relativePath}`);
      continue;
    }
    if (lst.isSymbolicLink()) {
      errors.push(`manifest entry is a symlink — refused: ${entry.relativePath}`);
      continue;
    }
    if (lst.size !== entry.sizeBytes) {
      errors.push(`size mismatch for ${entry.relativePath}: manifest=${entry.sizeBytes} actual=${lst.size}`);
      continue;
    }
    const actualHash = await sha256File(abs);
    if (actualHash !== entry.sha256) {
      errors.push(`hash mismatch for ${entry.relativePath}`);
    }
  }

  // DB integrity — open the snapshot in place, read-only, never mutated.
  let dbCheck = null;
  if (existsSync(dbAbs) && onDiskRelatives.has(DB_SNAPSHOT_RELATIVE)) {
    try {
      const db = new Database(dbAbs, { readonly: true, fileMustExist: true });
      try {
        const integrity = db.pragma("integrity_check");
        const fkViolations = db.pragma("foreign_key_check");
        dbCheck = {
          integrityOk: integrity.length === 1 && integrity[0].integrity_check === "ok",
          fkViolationCount: fkViolations.length,
        };
        if (!dbCheck.integrityOk) errors.push("DB snapshot integrity_check did not return ok");
        if (dbCheck.fkViolationCount > 0) errors.push(`DB snapshot has ${dbCheck.fkViolationCount} foreign_key_check violation(s)`);
      } finally {
        db.close();
      }
    } catch {
      errors.push("DB snapshot is malformed or could not be opened");
    }
  }

  return { ok: errors.length === 0, errors, manifest, dbCheck };
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

export function listBackups(backupRootArg) {
  const backupRootAbs = backupRootArg ? path.resolve(backupRootArg) : path.join(repoRoot, "data", "backups");
  if (!existsSync(backupRootAbs)) return [];

  const entries = readdirSync(backupRootAbs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(backupRootAbs, e.name))
    .filter((dir) => existsSync(path.join(dir, MANIFEST_FILENAME)));

  const rows = [];
  for (const dir of entries) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(dir, MANIFEST_FILENAME), "utf8"));
      const totalBytes = Array.isArray(manifest.files) ? manifest.files.reduce((s, f) => s + (f.sizeBytes ?? 0), 0) : 0;
      rows.push({
        dir,
        name: path.basename(dir),
        createdAt: manifest.createdAt ?? "unknown",
        fileCount: Array.isArray(manifest.files) ? manifest.files.length : 0,
        totalBytes,
      });
    } catch {
      rows.push({ dir, name: path.basename(dir), createdAt: "unreadable manifest", fileCount: 0, totalBytes: 0 });
    }
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

// ---------------------------------------------------------------------------
// RESTORE
// ---------------------------------------------------------------------------

/** Maps a validated manifest relativePath to its segments under a staging/target root. */
function relativePathToManagedSegments(relativePath) {
  if (!isAllowedFilesEntryPath(relativePath)) {
    throw new Error("unrecognized manifest relative path"); // unreachable once manifest is verified
  }
  if (relativePath === DB_SNAPSHOT_RELATIVE) return MANAGED_DB_TARGET_SEGMENTS;
  return relativePath.slice(MEDIA_SUBDIR.length + 1).split("/");
}

/** The five managed surfaces restore may ever touch under a target root. */
function managedSurfaces() {
  return [
    { id: "db", kind: "file", segments: MANAGED_DB_TARGET_SEGMENTS },
    ...MEDIA_ROOT_LABELS.map((label) => ({ id: label, kind: "dir", segments: label.split("/") })),
  ];
}

function surfaceAbs(targetRootAbs, surface) {
  return path.join(targetRootAbs, ...surface.segments);
}

/** A symlink was found somewhere along a path this tool was about to read, write, or walk. */
export class PathSymlinkError extends Error {
  constructor(label, symlinkAbs) {
    super(`symlink in ${label} path: ${symlinkAbs}`);
    this.label = label;
    this.symlinkAbs = symlinkAbs;
  }
}

/**
 * Walks every EXISTING segment from the filesystem/volume root down to
 * `abs` (inclusive), lstat-ing each one individually — never a single
 * `lstat`/`existsSync` on `abs` alone, which would miss a symlinked parent
 * anywhere above it (e.g. `C:\linked-parent\clone`: lstat-ing `clone`
 * alone sees a real directory and misses that `linked-parent` redirects
 * the whole subtree elsewhere). A segment that doesn't exist yet ends the
 * walk there — a not-yet-existing future path is fine; nothing below an
 * absent segment can be reached without creating it first, at which point
 * it is this tool doing the creating, not something already on disk to
 * distrust.
 *
 * Returns the first symlinked segment's absolute path, or null if every
 * existing segment in the chain is clean.
 *
 * This cannot close a TOCTOU race where a parent directory is swapped for
 * a symlink after this walk's last `lstat` — Node has no portable
 * file-locking API to prevent that, the same residual limit already
 * documented for concurrent media mutation. It deterministically blocks
 * every symlink already present at call time.
 */
function firstSymlinkFromVolumeRoot(abs) {
  const resolved = path.resolve(abs);
  const volumeRoot = path.parse(resolved).root;
  const segments = path.relative(volumeRoot, resolved).split(path.sep).filter(Boolean);
  let current = volumeRoot;
  for (const seg of segments) {
    current = path.join(current, seg);
    const lst = lstatSync(current, { throwIfNoEntry: false });
    if (!lst) return null; // doesn't exist yet — nothing further down to check
    if (lst.isSymbolicLink()) return current;
  }
  return null;
}

/** Refuses (PathSymlinkError) if any existing segment from the volume root down to `abs` is a symlink. */
function assertNoSymlinkInPath(abs, label) {
  const found = firstSymlinkFromVolumeRoot(abs);
  if (found !== null) throw new PathSymlinkError(label, found);
}

/**
 * Refuses before any inspection, quarantine, or publication: the target
 * root itself, every managed surface, the DB's sidecar paths, and every
 * parent above the target root must all be free of symlinks along their
 * entire chain from the volume root. This never "fixes" a symlink by
 * renaming it aside — it's a hard, no-mutation refusal, so an external
 * sentinel a symlink points at is guaranteed to stay untouched.
 */
function assertTargetHasNoSymlinks(targetRootAbs, surfaces) {
  assertNoSymlinkInPath(targetRootAbs, "restore target");
  for (const surface of surfaces) {
    const abs = surfaceAbs(targetRootAbs, surface);
    const candidates = surface.id === "db" ? [abs, ...DB_SIDECAR_SUFFIXES.map((s) => `${abs}${s}`)] : [abs];
    for (const candidate of candidates) {
      assertNoSymlinkInPath(candidate, "restore target");
    }
  }
}

/** Existing, non-empty (dir) or existing (file) — freshly re-checked, never cached. */
function isSurfaceOccupied(targetRootAbs, surface) {
  const abs = surfaceAbs(targetRootAbs, surface);
  if (!existsSync(abs)) return false;
  if (surface.kind === "file") return true;
  try {
    return readdirSync(abs).length > 0;
  } catch {
    return true; // unreadable — treat as blocking rather than silently proceeding
  }
}

/**
 * @param {{ backupDir: string, targetRoot: string, replace?: boolean, stagingDirOverride?: string }} opts
 */
export async function restoreBackup(opts) {
  const backupDirAbs = path.resolve(opts.backupDir);
  const targetRootAbs = path.resolve(opts.targetRoot);

  const verification = await verifyBackup(backupDirAbs);
  if (!verification.ok) {
    return { ok: false, reason: "Refusing to restore an unverified backup.", errors: verification.errors };
  }
  const manifest = verification.manifest;
  const surfaces = managedSurfaces();

  // Refused before isSurfaceOccupied() (or anything else) ever inspects the
  // target: existsSync/readdirSync follow symlinks transparently, so a
  // symlinked target root, a symlinked ancestor above it (e.g.
  // C:\linked-parent\clone), a symlinked parent within it (e.g. public/), a
  // symlinked managed surface, or a symlinked DB sidecar must all be caught
  // here first — with or without --replace.
  try {
    assertTargetHasNoSymlinks(targetRootAbs, surfaces);
  } catch (err) {
    if (err instanceof PathSymlinkError) {
      return {
        ok: false,
        reason: `Refusing: symlink found in the restore target path. Restore never follows or renames a symlink; nothing was inspected or touched.`,
      };
    }
    throw err;
  }

  const occupied = surfaces.filter((s) => isSurfaceOccupied(targetRootAbs, s));
  if (occupied.length > 0 && !opts.replace) {
    return {
      ok: false,
      reason: `Managed target surface(s) already present: ${occupied.map((s) => s.id).join(", ")}. Re-run with an explicit replace acknowledgement to overwrite them. Nothing else under --target is inspected or touched.`,
    };
  }

  // stagingDirOverride exists solely so proof tooling can force a
  // deterministic staging-location collision (simulating an interrupted
  // copy) without guessing the default pid/timestamp path. Production
  // callers never set it.
  const stagingAbs = opts.stagingDirOverride
    ? path.resolve(opts.stagingDirOverride)
    : path.join(path.dirname(targetRootAbs), `${path.basename(targetRootAbs)}.restore-staging-${process.pid}-${Date.now()}`);

  // Staging normally sits beside targetRootAbs, whose full chain was just
  // verified above — but stagingDirOverride is test-only and this check is
  // cheap, so verify its own chain explicitly too rather than relying on
  // that being true by construction.
  try {
    assertNoSymlinkInPath(stagingAbs, "staging");
  } catch (err) {
    if (err instanceof PathSymlinkError) {
      return {
        ok: false,
        reason: `Refusing: symlink found in the staging path. Nothing was staged, inspected, or touched.`,
      };
    }
    throw err;
  }

  let stagingOwnedByThisRun = false;
  const cleanupStaging = () => {
    if (!stagingOwnedByThisRun) return true; // never remove something we didn't create
    try {
      rmSync(stagingAbs, { recursive: true, force: true });
    } catch {
      return false;
    }
    return true;
  };
  // Every call site must surface a failed cleanup honestly — never claim a
  // clean outcome (success or otherwise) while a staging directory survives.
  const cleanupNote = () => (cleanupStaging() ? "" : ` Temporary staging directory could not be removed: ${stagingAbs} — remove it by hand.`);

  try {
    // The target's parent may not exist yet (a genuinely fresh target root
    // is an expected, supported case) — create that chain first, then the
    // staging dir itself with recursive:false so a colliding file/dir there
    // still fails loudly instead of being silently accepted.
    mkdirSync(path.dirname(stagingAbs), { recursive: true });
    mkdirSync(stagingAbs, { recursive: false });
    stagingOwnedByThisRun = true;

    for (const entry of manifest.files) {
      const srcAbs = path.join(backupDirAbs, ...entry.relativePath.split("/"));
      const destSegments = relativePathToManagedSegments(entry.relativePath);
      const destAbs = path.join(stagingAbs, ...destSegments);
      mkdirSync(path.dirname(destAbs), { recursive: true });
      copyFileSync(srcAbs, destAbs);
    }

    // Post-copy verification of the staged tree against the manifest.
    for (const entry of manifest.files) {
      const destSegments = relativePathToManagedSegments(entry.relativePath);
      const destAbs = path.join(stagingAbs, ...destSegments);
      const st = statSync(destAbs);
      if (st.size !== entry.sizeBytes) throw new Error(`staged size mismatch for ${entry.relativePath}`);
      const hash = await sha256File(destAbs);
      if (hash !== entry.sha256) throw new Error(`staged hash mismatch for ${entry.relativePath}`);
    }

    const stagedDbAbs = path.join(stagingAbs, ...MANAGED_DB_TARGET_SEGMENTS);
    const db = new Database(stagedDbAbs, { readonly: true, fileMustExist: true });
    let integrityOk = false;
    let fkViolationCount = -1;
    try {
      const integrity = db.pragma("integrity_check");
      integrityOk = integrity.length === 1 && integrity[0].integrity_check === "ok";
      fkViolationCount = db.pragma("foreign_key_check").length;
    } finally {
      db.close();
    }
    if (!integrityOk || fkViolationCount > 0) {
      throw new Error("staged DB failed integrity_check/foreign_key_check");
    }
  } catch (err) {
    const reasonBase = `Staging failed; existing target left untouched. ${err instanceof Error && err.message.startsWith("staged") ? err.message : classifyFsError(err)}`;
    return { ok: false, reason: reasonBase + cleanupNote() };
  }

  // --- Publish: quarantine each occupied managed surface (rename aside,
  // never delete), then publish the staged replacement into place. Nothing
  // outside these five surfaces is ever read, renamed, or removed — a whole
  // installation (code, node_modules, .env.local, anything unmanaged) is
  // provably untouched, including under --replace. ---
  const quarantined = []; // { surface, originalAbs, quarantineAbs }[]
  const published = []; // surface[]
  const slug = timestampSlug();

  function quarantineSurface(surface) {
    const abs = surfaceAbs(targetRootAbs, surface);
    const candidates = surface.id === "db" ? [abs, ...DB_SIDECAR_SUFFIXES.map((s) => `${abs}${s}`)] : [abs];
    for (const c of candidates) {
      if (!existsSync(c)) continue;
      if (!opts.replace) {
        // Something now occupies this surface that the initial occupied-
        // check (taken before staging) didn't see — a write that landed
        // during staging. Without an explicit replace acknowledgement we
        // must not move it aside or publish over it, even though quarantine
        // itself never deletes: the user never consented to touching it.
        throw new ConcurrentOccupationError(surface.id);
      }
      const q = `${c}.replaced-${slug}`;
      renameSync(c, q); // rename, never delete — preserves whatever is there right now, even if it changed since the occupied-check above
      quarantined.push({ surface, originalAbs: c, quarantineAbs: q });
    }
  }

  function publishSurface(surface) {
    // forcePublishFailureForSurface exists solely so proof tooling can
    // deterministically exercise the mid-publish rollback path (simulating
    // a real filesystem failure partway through publish) without racing a
    // real disk error. Production callers never set it.
    if (opts.forcePublishFailureForSurface === surface.id) {
      throw Object.assign(new Error("simulated publish failure"), { code: "EIO" });
    }
    const stagedAbs = path.join(stagingAbs, ...surface.segments);
    if (!existsSync(stagedAbs)) return; // nothing backed up for this surface (absent/empty media root) — leave it absent at target too
    const abs = surfaceAbs(targetRootAbs, surface);
    mkdirSync(path.dirname(abs), { recursive: true });
    renameSync(stagedAbs, abs);
    published.push(surface);
  }

  function unpublishSurface(surface) {
    const abs = surfaceAbs(targetRootAbs, surface);
    try {
      rmSync(abs, { recursive: true, force: true });
    } catch {
      // best-effort; the subsequent quarantine restore is the real safety net
    }
  }

  function restoreAllQuarantined() {
    let allOk = true;
    for (const q of quarantined.slice().reverse()) {
      try {
        renameSync(q.quarantineAbs, q.originalAbs);
      } catch {
        allOk = false;
      }
    }
    return allOk;
  }

  // testHookBeforeQuarantine exists solely so proof tooling can simulate a
  // concurrent write landing on a managed target surface in the window
  // between the occupied-check above and quarantine below. Production
  // callers never set it; quarantineSurface() re-checks existence live
  // regardless, so this window is safe by construction — the hook only
  // makes that property provable on demand.
  if (typeof opts.testHookBeforeQuarantine === "function") {
    opts.testHookBeforeQuarantine();
  }

  try {
    for (const surface of surfaces) quarantineSurface(surface);
  } catch (err) {
    const rolledBack = restoreAllQuarantined();
    const note = cleanupNote();
    if (err instanceof ConcurrentOccupationError) {
      return {
        ok: false,
        reason:
          (rolledBack
            ? `Managed target surface became occupied during staging: ${err.surfaceId}. Re-run with an explicit replace acknowledgement to overwrite it. Nothing was published; target left exactly as found.`
            : "Managed target surface became occupied during staging AND rollback was incomplete; original content remains at *.replaced-<timestamp> paths next to --target for manual recovery.") + note,
      };
    }
    return {
      ok: false,
      reason:
        (rolledBack
          ? `Could not move existing data aside (${classifyFsError(err)}); existing target fully restored to its original state.`
          : "Could not move existing data aside AND rollback was incomplete; original content remains at *.replaced-<timestamp> paths next to --target for manual recovery.") + note,
    };
  }

  try {
    for (const surface of surfaces) publishSurface(surface);
  } catch (err) {
    for (const surface of published.slice().reverse()) unpublishSurface(surface);
    const rolledBack = restoreAllQuarantined();
    const note = cleanupNote();
    return {
      ok: false,
      reason:
        (rolledBack
          ? `Publish failed (${classifyFsError(err)}); existing target fully restored to its original state.`
          : "Publish failed AND rollback was incomplete; original content remains at *.replaced-<timestamp> paths next to --target for manual recovery.") + note,
    };
  }

  const stagingCleanedUp = cleanupStaging(); // only empty parent shells remain once every surface has been renamed out

  return {
    ok: true,
    targetRoot: targetRootAbs,
    fileCount: manifest.files.length,
    warnings: stagingCleanedUp ? [] : [`Restore completed successfully, but the temporary staging directory could not be removed: ${stagingAbs} — remove it by hand.`],
    quarantinedSurfaces: [...new Set(quarantined.map((q) => q.surface.id))],
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--replace") {
      out.replace = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      out[key] = value;
      i++;
    } else {
      out._.push(arg);
    }
  }
  return out;
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

function printHelp() {
  console.log(`
MikAI data backup / verify / list / restore (OPS.DATA.BACKUP.RESTORE.1)

Usage:
  node scripts/data-backup.mjs create  [--source-root <dir>] [--backup-root <dir>] [--db-path <file>]
  node scripts/data-backup.mjs verify  <backup-dir>
  node scripts/data-backup.mjs list    [--backup-root <dir>]
  node scripts/data-backup.mjs restore <backup-dir> --target <dir> [--replace]

  create   Snapshots the SQLite DB (better-sqlite3 online backup) plus
           ${MEDIA_ROOT_LABELS.join(", ")}
           into a new timestamped directory under --backup-root
           (default: data/backups/). --source-root defaults to the repo root.
           Aborts with no partial backup left behind if any media file is
           unreadable, is a symlink, or changes while being copied.
  verify   Validates a backup's manifest and payload without touching the
           source installation: exact/closed schema, exact file set (including
           the backup's own top level), per-file SHA-256, and DB
           integrity_check/foreign_key_check.
  list     Lists backup directories under --backup-root with timestamp,
           file count, and total size. Read-only.
  restore  Re-verifies the backup, then stages every file in a sibling temp
           directory, re-verifies the stage, and publishes.
           --target is treated as an existing installation root — restore
           only ever reads or mutates 5 managed surfaces: data/mikailab.db
           (+ any -wal/-shm sidecars) and the four media roots. Everything
           else under --target (code, node_modules, .env.local, anything
           unmanaged) is never inspected or touched, even under --replace.
           Refuses an occupied managed surface unless --replace is given;
           each replaced surface is renamed aside (never deleted) and rolled
           back automatically if any later step fails.

Never touches data/mikailab.db, live media, existing data/backups/ entries,
or the app's running servers.
`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  const args = parseArgs(rest);

  if (cmd === "create") {
    const result = await createBackup({ sourceRoot: args["source-root"], backupRoot: args["backup-root"], dbPath: args["db-path"] });
    if (!result.ok) {
      console.error(`[data-backup] create failed: ${result.reason}`);
      process.exit(1);
    }
    console.log(`Backup created: ${result.backupDir}`);
    console.log(`  DB snapshot: ${formatBytes(result.manifest.db.sizeBytes)}, ${result.manifest.db.tableCount} tables`);
    for (const root of result.manifest.mediaRoots) {
      console.log(`  ${root.label.padEnd(16)} ${root.present ? `${root.fileCount} file(s)` : "absent"}`);
    }
    process.exit(0);
  }

  if (cmd === "verify") {
    const target = args._[0];
    if (!target) {
      console.error("[data-backup] verify requires a <backup-dir> argument");
      process.exit(1);
    }
    const result = await verifyBackup(target);
    if (result.ok) {
      console.log(`Backup OK: ${target}`);
      console.log(`  ${result.manifest.files.length} file(s), DB integrity_check=ok, foreign_key_check=0`);
    } else {
      console.log(`Backup INVALID: ${target}`);
      for (const e of result.errors) console.log(`  - ${e}`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === "list") {
    const rows = listBackups(args["backup-root"]);
    if (rows.length === 0) {
      console.log("No backups found.");
      process.exit(0);
    }
    for (const r of rows) {
      console.log(`${r.createdAt}  ${r.name.padEnd(40)} ${String(r.fileCount).padStart(5)} file(s)  ${formatBytes(r.totalBytes)}`);
    }
    process.exit(0);
  }

  if (cmd === "restore") {
    const backupDir = args._[0];
    const target = args.target;
    if (!backupDir || !target) {
      console.error("[data-backup] restore requires <backup-dir> and --target <dir>");
      process.exit(1);
    }
    const result = await restoreBackup({ backupDir, targetRoot: target, replace: Boolean(args.replace) });
    if (!result.ok) {
      console.error(`[data-backup] restore failed: ${result.reason}`);
      if (result.errors) for (const e of result.errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    console.log(`Restored ${result.fileCount} file(s) to ${result.targetRoot}`);
    if (result.quarantinedSurfaces.length > 0) {
      console.log(`  previous content for [${result.quarantinedSurfaces.join(", ")}] preserved next to --target as *.replaced-<timestamp>`);
    }
    for (const w of result.warnings) console.log(`  warning: ${w}`);
    process.exit(0);
  }

  console.error(`[data-backup] unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

function isMainModule() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main();
}
