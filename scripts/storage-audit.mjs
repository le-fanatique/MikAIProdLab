#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Storage audit & safe temp cleanup (STORAGE.CLEANUP.1)
//
// Read-only by default (dry run). Cross-references every real media path
// column in the schema against the physical storage roots this codebase's
// own serving routes already trust, and reports:
//
//  - DB references whose file is present on disk
//  - DB references whose file is missing on disk
//  - files present on disk but not referenced by any DB column (orphans)
//  - the narrow, code-identified subset of those orphans eligible for
//    automatic cleanup: renderer "*.tmp" artifacts (see
//    src/lib/editorial/renderBasicSequenceResult.ts and
//    src/lib/film/renderFilmResult.ts — both write to a ".tmp" sibling and
//    rename on success; an orphaned ".tmp" file means a render crashed
//    mid-write) older than the documented threshold.
//
// --apply deletes ONLY that narrow eligible subset. No other orphaned file
// is ever deleted automatically — see "Out of scope" in this ticket.
//
// Node built-ins + better-sqlite3 (already a project dependency) only.
// Never imports Next.js/React/Drizzle — this runs standalone via `node`,
// outside the app's request lifecycle, and never launches at app startup.
// ---------------------------------------------------------------------------

import { existsSync, statSync, readdirSync, realpathSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

// Documented threshold — 24h by default, matches the ticket's stated
// default (no other temp-file threshold exists anywhere else in the code).
export const TEMP_MAX_AGE_HOURS = 24;

// ---------------------------------------------------------------------------
// Allowed roots — the ONLY directories this script will ever read from or
// delete inside. Mirrors the dual "storage/" + "public/" convention already
// used by src/app/api/uploads/[...path]/route.ts and
// src/app/api/generated-outputs/[jobId]/[filename]/route.ts.
// ---------------------------------------------------------------------------
export const ALLOWED_ROOTS = [
  { label: "storage/uploads", abs: path.resolve(repoRoot, "storage", "uploads") },
  { label: "public/uploads", abs: path.resolve(repoRoot, "public", "uploads") },
  { label: "storage/outputs", abs: path.resolve(repoRoot, "storage", "outputs") },
  { label: "public/outputs", abs: path.resolve(repoRoot, "public", "outputs") },
];

// ---------------------------------------------------------------------------
// Path safety — pure, no I/O. Exercised directly by this ticket's refusal
// validation (a chemin-hors-racine and a chemin DB-reference case).
// ---------------------------------------------------------------------------

/** Rejects a DB-stored relative path before it is ever resolved to disk. */
export function isSafeDbRelativePath(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) return false;
  if (path.isAbsolute(relPath)) return false;
  if (relPath.split(/[\\/]/).includes("..")) return false;
  return true;
}

/** True only if `absPath` is `rootAbs` itself or strictly inside it. */
export function isWithinRoot(absPath, rootAbs) {
  const resolved = path.resolve(absPath);
  return resolved === rootAbs || resolved.startsWith(rootAbs + path.sep);
}

/**
 * Resolves a DB-stored path (e.g. "uploads/shot-videos/shot-1/x.mp4" or
 * "outputs/jobs/42/y.png") against both physical roots that this
 * codebase's own serving routes already check ("storage/" then
 * "public/"). Returns the first existing regular-file candidate, or a
 * refusal reason.
 */
export function resolveDbPath(relPath) {
  if (!isSafeDbRelativePath(relPath)) {
    return { ok: false, reason: "unsafe path (absolute or contains '..')" };
  }
  for (const prefix of ["storage", "public"]) {
    const rootAbs = path.resolve(repoRoot, prefix);
    const candidate = path.resolve(repoRoot, prefix, relPath);
    if (!isWithinRoot(candidate, rootAbs)) continue; // defense in depth
    try {
      const st = statSync(candidate);
      if (st.isFile()) return { ok: true, absolute: candidate };
    } catch {
      // try next prefix
    }
  }
  return { ok: false, reason: "not found under storage/ or public/" };
}

// ---------------------------------------------------------------------------
// DB references — built from the real schema columns (src/db/schema.ts),
// not hardcoded documentation examples.
// ---------------------------------------------------------------------------

const DB_MEDIA_COLUMNS = [
  { label: "shots.approved_video_path", table: "shots", column: "approved_video_path" },
  { label: "shot_reference_images.image_path", table: "shot_reference_images", column: "image_path" },
  { label: "asset_reference_images.image_path", table: "asset_reference_images", column: "image_path" },
  { label: "sequence_results.video_path", table: "sequence_results", column: "video_path" },
  { label: "film_results.video_path", table: "film_results", column: "video_path" },
  { label: "generation_jobs.output_path", table: "generation_jobs", column: "output_path" },
];

export function defaultDbPath() {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(repoRoot, "data", "mikailab.db");
}

/** Opens the DB read-only — this script must never write to it. */
export function loadDbReferences(dbPath = defaultDbPath()) {
  if (!existsSync(dbPath)) {
    return { ok: false, reason: `Database not found at ${dbPath}` };
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const refs = [];
    for (const { label, table, column } of DB_MEDIA_COLUMNS) {
      const rows = db
        .prepare(`SELECT "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL`)
        .all();
      for (const row of rows) {
        if (typeof row.value === "string" && row.value.trim()) {
          refs.push({ label, dbPath: row.value.trim() });
        }
      }
    }
    return { ok: true, refs };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Directory walking — symlinks are followed only if their resolved target
// stays inside the same allowed root; a symlink pointing outside is skipped
// entirely rather than trusted.
// ---------------------------------------------------------------------------

export function walkFiles(rootAbs) {
  const out = [];
  if (!existsSync(rootAbs)) return out;

  const stack = [rootAbs];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === ".gitkeep") continue;
      const full = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        let real;
        try {
          real = realpathSync(full);
        } catch {
          continue; // broken symlink
        }
        if (!isWithinRoot(real, rootAbs)) continue; // never follow outside root
        let st;
        try {
          st = statSync(real);
        } catch {
          continue;
        }
        if (st.isDirectory()) stack.push(full);
        else if (st.isFile()) out.push({ absolute: full, size: st.size, mtimeMs: st.mtimeMs });
        continue;
      }

      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const st = statSync(full);
        out.push({ absolute: full, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  }
  return out;
}

export function formatBytes(n) {
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

// ---------------------------------------------------------------------------
// Main — only runs when this file is the process entry point, so the
// exports above stay importable for validation without side effects.
// ---------------------------------------------------------------------------

function isMainModule() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}

function printHelp() {
  console.log(`
Storage audit & safe temp cleanup (STORAGE.CLEANUP.1)

Usage:
  node scripts/storage-audit.mjs [--apply]
  npm run storage:audit -- [--apply]

  (no flags)   Dry run — reports only, deletes nothing.
  --apply      Deletes ONLY renderer "*.tmp" artifacts older than ${TEMP_MAX_AGE_HOURS}h,
               found inside the allowed storage roots, never referenced by
               the DB. All other unreferenced files are reported only,
               never deleted automatically.

Roots inspected:
${ALLOWED_ROOTS.map((r) => `  ${r.label}`).join("\n")}

DB columns inspected:
${DB_MEDIA_COLUMNS.map((c) => `  ${c.label}`).join("\n")}
`);
}

function runAudit({ apply }) {
  console.log("=== Storage Audit — MikAI Production Lab ===\n");

  console.log("Roots inspected:");
  for (const root of ALLOWED_ROOTS) {
    console.log(`  ${root.label.padEnd(16)} ${existsSync(root.abs) ? "OK" : "missing (skipped)"}`);
  }

  const dbResult = loadDbReferences();
  if (!dbResult.ok) {
    console.error(`\n[storage-audit] ${dbResult.reason} — cannot cross-reference. Aborting.`);
    process.exit(1);
  }

  const resolvedDbAbsolutes = new Set();
  const presentRefs = [];
  const missingRefs = [];

  for (const ref of dbResult.refs) {
    const res = resolveDbPath(ref.dbPath);
    if (res.ok) {
      resolvedDbAbsolutes.add(res.absolute);
      presentRefs.push({ ...ref, absolute: res.absolute });
    } else {
      missingRefs.push({ ...ref, reason: res.reason });
    }
  }

  const allFiles = [];
  for (const root of ALLOWED_ROOTS) {
    for (const f of walkFiles(root.abs)) {
      allFiles.push({ ...f, rootLabel: root.label, rootAbs: root.abs });
    }
  }

  const nowMs = Date.now();
  const tempMaxAgeMs = TEMP_MAX_AGE_HOURS * 60 * 60 * 1000;

  const orphanTemp = [];
  const orphanOther = [];

  for (const f of allFiles) {
    if (resolvedDbAbsolutes.has(f.absolute)) continue; // referenced — not an orphan
    if (f.absolute.endsWith(".tmp")) {
      const ageMs = nowMs - f.mtimeMs;
      orphanTemp.push({ ...f, ageHours: ageMs / 3600000, eligible: ageMs >= tempMaxAgeMs });
    } else {
      orphanOther.push(f);
    }
  }

  const presentBytes = presentRefs.reduce((sum, r) => sum + (statSync(r.absolute).size ?? 0), 0);
  const orphanTempBytes = orphanTemp.reduce((sum, f) => sum + f.size, 0);
  const orphanOtherBytes = orphanOther.reduce((sum, f) => sum + f.size, 0);
  const eligibleNow = orphanTemp.filter((f) => f.eligible);
  const eligibleBytes = eligibleNow.reduce((sum, f) => sum + f.size, 0);

  console.log(`\n--- DB references present on disk: ${presentRefs.length} (${formatBytes(presentBytes)})`);

  console.log(`\n--- DB references MISSING on disk: ${missingRefs.length}`);
  for (const ref of missingRefs) {
    console.log(`  [${ref.label}] ${ref.dbPath} — ${ref.reason}`);
  }

  console.log(`\n--- Files present but NOT referenced by DB: ${orphanTemp.length + orphanOther.length} (${formatBytes(orphanTempBytes + orphanOtherBytes)})`);
  console.log(`  temp-eligible (renderer "*.tmp" artifacts): ${orphanTemp.length} (${formatBytes(orphanTempBytes)})`);
  console.log(`    eligible now (older than ${TEMP_MAX_AGE_HOURS}h): ${eligibleNow.length} (${formatBytes(eligibleBytes)})`);
  console.log(`    not yet eligible (younger than ${TEMP_MAX_AGE_HOURS}h): ${orphanTemp.length - eligibleNow.length}`);
  console.log(`  other orphans (reported only, never auto-deleted): ${orphanOther.length} (${formatBytes(orphanOtherBytes)})`);
  for (const f of orphanOther) {
    console.log(`    [${f.rootLabel}] ${path.relative(repoRoot, f.absolute)} (${formatBytes(f.size)})`);
  }

  if (!apply) {
    console.log("\nDRY RUN — no files deleted");
    if (eligibleNow.length > 0) {
      console.log(`Run with --apply to delete ${eligibleNow.length} eligible temp file(s) (${formatBytes(eligibleBytes)}).`);
    }
    return 0;
  }

  console.log("\n--- Applying cleanup (--apply) ---");
  let deletedCount = 0;
  let deletedBytes = 0;
  const errors = [];

  for (const f of eligibleNow) {
    // Final safety gate immediately before every unlink — belt-and-suspenders
    // re-checks, independent of how the candidate was collected above.
    if (!isWithinRoot(f.absolute, f.rootAbs)) {
      errors.push(`Refused (outside allowed root): ${f.absolute}`);
      continue;
    }
    if (resolvedDbAbsolutes.has(f.absolute)) {
      errors.push(`Refused (matches a DB reference): ${f.absolute}`);
      continue;
    }
    if (!f.absolute.endsWith(".tmp")) {
      errors.push(`Refused (not a recognized temp artifact): ${f.absolute}`);
      continue;
    }
    try {
      unlinkSync(f.absolute);
      console.log(`  Deleted: ${path.relative(repoRoot, f.absolute)} (${f.ageHours.toFixed(1)}h old, ${formatBytes(f.size)})`);
      deletedCount++;
      deletedBytes += f.size;
    } catch (err) {
      errors.push(`Failed to delete ${f.absolute}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nDeleted ${deletedCount} file(s), freed ${formatBytes(deletedBytes)}.`);
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  return errors.length > 0 ? 1 : 0;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const exitCode = runAudit({ apply: args.includes("--apply") });
  process.exit(exitCode);
}
