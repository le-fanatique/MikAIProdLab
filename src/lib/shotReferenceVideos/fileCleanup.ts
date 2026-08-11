// ---------------------------------------------------------------------------
// fileCleanup.ts — SHOT.VIDEO.REFERENCES.1
//
// Server-only. Small, shared primitives for the quarantine-before-cascade
// discipline `deleteShot`/`deleteSequence`/`deleteProject` each need when
// their own DB cascade (`shot_reference_videos.shotId` is `onDelete:
// "cascade"`) is about to remove Video Reference rows: the FK deletes rows,
// never files, so every caller must quarantine (reversible rename) the real
// files BEFORE the cascade, then only permanently unlink AFTER the DB
// transaction actually commits — exactly the pattern already established by
// `deleteProject`'s `filesToQuarantine`/`quarantined` lists
// (src/actions/projects.ts). This module intentionally does NOT own a
// transaction itself (each caller's cascade shape differs) — it only owns
// the confinement check and the quarantine-path convention so the three
// callers cannot drift into three different naming/confinement rules.
//
// Retake Round 1 (Codex P2) — every thrown/returned value here is now
// sanitized: no absolute path, no raw OS error text. The concrete detail
// (paths, `errno`/`code`, restore attempts) is always logged server-side via
// `console.error` first — a caller composing a user-facing redirect message
// gets only a fixed, honest, sanitized string or boolean, never a path to
// interpolate.
// ---------------------------------------------------------------------------

import path from "node:path";
import { rename, unlink } from "node:fs/promises";
import { isConfinedShotReferenceVideoPathForShot } from "./paths";

export type ShotReferenceVideoFileRef = { id: number; shotId: number; videoPath: string };

/** Throws (never silently skips) when a row's stored path is not confined to that exact Shot's own subfolder — a corrupted/tampered row must abort the whole delete, never be silently ignored while its file leaks. The thrown message is sanitized; the offending path is logged server-side only. */
export function assertConfinedOrThrow(ref: ShotReferenceVideoFileRef, callerLabel: string): void {
  if (!isConfinedShotReferenceVideoPathForShot(ref.videoPath, ref.shotId)) {
    console.error(`${callerLabel}: Video Reference ${ref.id} has a stored path not confined to Shot ${ref.shotId}'s own subfolder: "${ref.videoPath}".`);
    throw new Error(`Refusing to delete — Video Reference ${ref.id} has an unexpected stored path. Fix this row manually before retrying.`);
  }
}

export type QuarantinedReferenceVideo = { id: number; shotId: number; originalAbsolute: string; quarantineAbsolute: string };

/**
 * Quarantines every ref's file (same-directory rename, reversible). On any
 * non-ENOENT failure, restores everything already quarantined in THIS call
 * and throws a sanitized error — mirrors `deleteProject`'s own
 * quarantine-loop discipline. An already-missing file (ENOENT) is treated as
 * "nothing to quarantine or restore", not a failure.
 */
export async function quarantineReferenceVideoFiles(refs: readonly ShotReferenceVideoFileRef[], callerLabel: string): Promise<QuarantinedReferenceVideo[]> {
  const publicRoot = path.join(process.cwd(), "public");
  const quarantined: QuarantinedReferenceVideo[] = [];

  for (const ref of refs) {
    assertConfinedOrThrow(ref, callerLabel);
    const originalAbsolute = path.join(publicRoot, ref.videoPath);
    const quarantineAbsolute = `${originalAbsolute}.trash-${Date.now()}-shot-reference-video-${ref.id}`;
    try {
      await rename(originalAbsolute, quarantineAbsolute);
      quarantined.push({ id: ref.id, shotId: ref.shotId, originalAbsolute, quarantineAbsolute });
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") continue; // already gone — nothing to quarantine or restore

      let allRestored = true;
      for (const q of quarantined) {
        try {
          await rename(q.quarantineAbsolute, q.originalAbsolute);
        } catch (restoreErr) {
          allRestored = false;
          console.error(`${callerLabel}: failed to restore already-quarantined file "${q.quarantineAbsolute}" -> "${q.originalAbsolute}":`, restoreErr);
        }
      }
      console.error(`${callerLabel}: failed to prepare Video Reference ${ref.id}'s file ("${originalAbsolute}") for deletion:`, e);
      throw new Error(
        allRestored
          ? "Failed to prepare one or more Video Reference files for deletion — nothing was changed. Please try again."
          : "Failed to prepare one or more Video Reference files for deletion, and automatic recovery of an already-prepared file was incomplete. Please check this Shot's Video References manually before retrying."
      );
    }
  }

  return quarantined;
}

/** Restores every quarantined file back to its original path (used on a rolled-back transaction — nothing was ever unlinked yet, so restoration is a deterministic rename-back). Returns `true` only if every restore succeeded; logs any failure detail server-side and never returns a path. */
export async function restoreQuarantinedReferenceVideoFiles(quarantined: readonly QuarantinedReferenceVideo[]): Promise<boolean> {
  let allRestored = true;
  for (const q of quarantined) {
    try {
      await rename(q.quarantineAbsolute, q.originalAbsolute);
    } catch (e) {
      allRestored = false;
      console.error(`restoreQuarantinedReferenceVideoFiles: failed to restore "${q.quarantineAbsolute}" -> "${q.originalAbsolute}":`, e);
    }
  }
  return allRestored;
}

/** Permanently removes every quarantined file — only ever called AFTER the owning DB transaction has committed. Returns `true` only if every file was actually removed (or already gone); logs any failure detail server-side so a caller can report an honest, sanitized partial-cleanup warning instead of a false full success. */
export async function finalizeQuarantinedReferenceVideoFiles(quarantined: readonly QuarantinedReferenceVideo[]): Promise<boolean> {
  let allRemoved = true;
  for (const q of quarantined) {
    try {
      await unlink(q.quarantineAbsolute);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      allRemoved = false;
      console.error(`finalizeQuarantinedReferenceVideoFiles: failed to remove leftover file "${q.quarantineAbsolute}":`, e);
    }
  }
  return allRemoved;
}
