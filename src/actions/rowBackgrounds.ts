"use server";

// ---------------------------------------------------------------------------
// rowBackgrounds.ts — UX.MEDIA.PREVIEW.1 (Retake Round 2)
//
// Bounded Server Actions for the Project/Sequence navigation row background
// preference (image + opacity). Ownership: a Project background is scoped
// by `projectId` alone; a Sequence background is scoped by `sequenceId`
// AND must belong to the given `projectId` (Project -> Sequence ownership,
// same pattern as deleteSequence/updateSequenceContext). Every stored path
// is additionally checked against `isConfinedForOwner` — THIS owner's exact
// `project-<id>`/`sequence-<id>` subfolder, never just the shared global
// `uploads/navigation-backgrounds/` root — before any mutation (including
// Opacity, which never touches the filesystem) ever uses it.
//
// Concurrency: every mutation is conditioned on the caller's last-known
// `expectedUpdatedAt` (read at editor-open time). A concurrent
// replace/remove/opacity change updates `updatedAt`, so a stale mutation's
// conditional UPDATE affects zero rows and is refused — it never silently
// overwrites a concurrent value.
//
// Compensation discipline (Retake Round 2 — Codex Round 2 P1 finding):
// every DB write that can affect a stored file is wrapped so no path is ever
// left durably pointing at a missing/quarantined file, and no newly
// published file is ever left unreferenced. `ok:true` is returned ONLY when
// the mutation fully completed, including all filesystem cleanup — ANY
// incomplete cleanup or compensation (final unlink failed, restore failed,
// reversal refused or failed, a secondary delete left unchecked) returns
// `ok:false` naming the exact durable state and every path involved, never
// a "mostly worked" success with a warning attached:
//   - Upload/Replace: the new file is published first; any EXISTING file is
//     quarantined (reversible rename) BEFORE the conditional DB write, never
//     deleted outright. `writeOwnerRow` is always wrapped in try/catch — a
//     thrown DB error and a lost race (0 rows affected) are handled
//     identically: the new file is discarded (never durably referenced) and
//     the quarantined previous file is restored to its exact original path.
//     On success, the quarantined previous file is unlinked with retries; if
//     that still fails, a full conditional reversal is attempted (restore
//     the file, then restore the DB pointer — but ONLY if the row still
//     holds exactly the value this action just wrote, never clobbering a
//     concurrent change) and every one of the three possible outcomes
//     (reversal committed, reversal refused/failed, file unrestorable)
//     returns `ok:false` with the exact state — the row is re-read (never
//     written) purely to report an honest diagnostic when a concurrent
//     change is suspected.
//   - Remove: the file is quarantined BEFORE the conditional DB write.
//     Failure/lost-race restores it exactly. Success unlinks with retries;
//     a persistent failure attempts the same full conditional reversal as
//     Replace, with the same three `ok:false` outcomes.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  saveNavigationBackgroundImage,
  deleteStoredNavigationBackgroundImage,
  isConfinedNavigationBackgroundPathForOwner,
  isValidRowBackgroundOpacity,
  UploadNavigationBackgroundError,
} from "@/lib/navigationBackground/uploadNavigationBackground";
import { DEFAULT_ROW_BACKGROUND_OPACITY } from "@/lib/navigationBackground/rowBackgroundOpacity";

export type RowBackgroundOwner =
  | { kind: "project"; projectId: number }
  | { kind: "sequence"; projectId: number; sequenceId: number };

export type RowBackgroundState = {
  rowBackgroundImagePath: string | null;
  rowBackgroundOpacity: number | null;
  updatedAt: string;
};

export type RowBackgroundMutationResult =
  | ({ ok: true; warning?: string } & RowBackgroundState)
  | { ok: false; error: string };

function isValidOwner(owner: RowBackgroundOwner): boolean {
  if (owner.kind === "project") {
    return Number.isInteger(owner.projectId) && owner.projectId > 0;
  }
  return (
    Number.isInteger(owner.projectId) &&
    owner.projectId > 0 &&
    Number.isInteger(owner.sequenceId) &&
    owner.sequenceId > 0
  );
}

/** Retake Round 2 (Codex P1) — owner-aware confinement, keyed on THIS owner's exact subfolder (`project-<projectId>` or `sequence-<sequenceId>`), never just the shared global root. */
function isConfinedForOwner(imagePath: string, owner: RowBackgroundOwner): boolean {
  return isConfinedNavigationBackgroundPathForOwner(
    imagePath,
    owner.kind,
    owner.kind === "project" ? owner.projectId : owner.sequenceId
  );
}

async function readOwnerRow(owner: RowBackgroundOwner): Promise<RowBackgroundState | null> {
  if (owner.kind === "project") {
    const [row] = await db
      .select({
        rowBackgroundImagePath: projects.rowBackgroundImagePath,
        rowBackgroundOpacity: projects.rowBackgroundOpacity,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.id, owner.projectId));
    return row ?? null;
  }
  const [row] = await db
    .select({
      rowBackgroundImagePath: sequences.rowBackgroundImagePath,
      rowBackgroundOpacity: sequences.rowBackgroundOpacity,
      updatedAt: sequences.updatedAt,
      projectId: sequences.projectId,
    })
    .from(sequences)
    .where(eq(sequences.id, owner.sequenceId));
  if (!row || row.projectId !== owner.projectId) return null;
  return {
    rowBackgroundImagePath: row.rowBackgroundImagePath,
    rowBackgroundOpacity: row.rowBackgroundOpacity,
    updatedAt: row.updatedAt,
  };
}

/** Conditional UPDATE keyed on the owner's identity AND its last-known `updatedAt` — returns the number of affected rows (0 = lost race or not found). Never throws by itself; SQLite errors propagate from `.run()` to the caller. */
function writeOwnerRow(
  owner: RowBackgroundOwner,
  expectedUpdatedAt: string,
  values: { rowBackgroundImagePath: string | null; rowBackgroundOpacity: number | null },
  now: string
): number {
  if (owner.kind === "project") {
    const result = db
      .update(projects)
      .set({ ...values, updatedAt: now })
      .where(and(eq(projects.id, owner.projectId), eq(projects.updatedAt, expectedUpdatedAt)))
      .run();
    return result.changes;
  }
  const result = db
    .update(sequences)
    .set({ ...values, updatedAt: now })
    .where(
      and(
        eq(sequences.id, owner.sequenceId),
        eq(sequences.projectId, owner.projectId),
        eq(sequences.updatedAt, expectedUpdatedAt)
      )
    )
    .run();
  return result.changes;
}

type WriteOutcome = { ok: true; changes: number } | { ok: false; error: string };

/** `writeOwnerRow`, but never throws — every caller in this file must be able to compensate a DB failure exactly like a lost race, so both are funneled through this. */
function tryWriteOwnerRow(
  owner: RowBackgroundOwner,
  expectedUpdatedAt: string,
  values: { rowBackgroundImagePath: string | null; rowBackgroundOpacity: number | null },
  now: string
): WriteOutcome {
  try {
    return { ok: true, changes: writeOwnerRow(owner, expectedUpdatedAt, values, now) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function tryRestoreFile(quarantineAbsolute: string, originalAbsolute: string): { restored: boolean; error?: string } {
  try {
    renameSync(quarantineAbsolute, originalAbsolute);
    return { restored: true };
  } catch (e) {
    return { restored: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const FINAL_CLEANUP_ATTEMPTS = 3;

/** Permanently removes a quarantined file with a few retries (mirrors deleteProject's final-cleanup discipline) — never throws. */
async function finalUnlinkWithRetry(absolutePath: string): Promise<{ removed: boolean; error?: string }> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= FINAL_CLEANUP_ATTEMPTS; attempt++) {
    try {
      unlinkSync(absolutePath);
      return { removed: true };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return { removed: true };
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < FINAL_CLEANUP_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
  }
  return { removed: false, error: lastError ?? "unknown error" };
}

function ownerRevalidatePaths(owner: RowBackgroundOwner): string[] {
  if (owner.kind === "project") {
    return ["/projects", `/projects/${owner.projectId}`];
  }
  return [`/projects/${owner.projectId}`, `/projects/${owner.projectId}/sequences/${owner.sequenceId}`];
}

const CONFLICT_ERROR =
  "This row's background changed since you opened the editor. Reload and try again.";

// ---------------------------------------------------------------------------
// Upload / Replace
// ---------------------------------------------------------------------------

export async function uploadRowBackgroundImageAction(
  owner: RowBackgroundOwner,
  file: unknown,
  expectedUpdatedAt: string
): Promise<RowBackgroundMutationResult> {
  if (!isValidOwner(owner)) return { ok: false, error: "Invalid owner." };
  if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) {
    return { ok: false, error: "Invalid request." };
  }

  const current = await readOwnerRow(owner);
  if (!current) {
    return { ok: false, error: owner.kind === "project" ? "Project not found." : "Sequence not found in this Project." };
  }

  const oldPath = current.rowBackgroundImagePath;
  // Retake Round 3 (Codex P1) — validate any EXISTING stored path BEFORE
  // ever publishing the new file. Checking this only after
  // `saveNavigationBackgroundImage` (as an earlier round did) is not
  // fail-closed: a cross-owner/corrupted `oldPath` would still cause a real
  // publish into this owner's own subfolder first, and a refusal that
  // follows would depend on `deleteStoredNavigationBackgroundImage`
  // succeeding to avoid leaving that new file orphaned. Refusing here means
  // a cross-owner pointer is rejected with ZERO filesystem operations of
  // any kind — no publish, no rename, no unlink.
  if (oldPath && !isConfinedForOwner(oldPath, owner)) {
    return {
      ok: false,
      error: `Refusing to replace — the current stored path is not confined to this row's own subfolder ("${oldPath}"). Fix this row manually.`,
    };
  }

  let saved;
  try {
    saved = await saveNavigationBackgroundImage(
      file,
      owner.kind,
      owner.kind === "project" ? owner.projectId : owner.sequenceId
    );
  } catch (err) {
    if (err instanceof UploadNavigationBackgroundError) return { ok: false, error: err.message };
    return { ok: false, error: "Failed to save the uploaded file." };
  }

  const now = new Date().toISOString();
  // Preserve the current opacity if one is already set (Upload after a
  // prior Remove starts fresh at the default); a straight Replace of an
  // existing image keeps whatever opacity the user already chose.
  const nextOpacity = current.rowBackgroundOpacity ?? DEFAULT_ROW_BACKGROUND_OPACITY;

  // Quarantine any existing file BEFORE the DB write (reversible rename,
  // never a delete) — a DB failure or lost race can then restore it to its
  // exact original path, and a successful write can still fully compensate
  // if the final cleanup below fails. `oldPath`'s confinement was already
  // validated above, before `saved` even existed.
  let oldQuarantineAbsolute: string | null = null;
  let oldOriginalAbsolute: string | null = null;
  if (oldPath) {
    oldOriginalAbsolute = path.join(process.cwd(), "public", oldPath);
    oldQuarantineAbsolute = `${oldOriginalAbsolute}.trash-${Date.now()}`;
    try {
      renameSync(oldOriginalAbsolute, oldQuarantineAbsolute);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        // Nothing durable changed yet — discard the newly published file and abort cleanly.
        const cleanup = await deleteStoredNavigationBackgroundImage(saved.imagePath);
        return {
          ok: false,
          error: `Failed to prepare the current image for replacement — nothing was changed.${
            cleanup.outcome === "failed" ? ` Additionally, the uploaded file could not be cleaned up and is now orphaned: ${cleanup.error}` : ""
          }`,
        };
      }
      // ENOENT: old file already missing on disk — nothing to quarantine/restore.
      oldQuarantineAbsolute = null;
      oldOriginalAbsolute = null;
    }
  }

  const write = tryWriteOwnerRow(
    owner,
    expectedUpdatedAt,
    { rowBackgroundImagePath: saved.imagePath, rowBackgroundOpacity: nextOpacity },
    now
  );

  if (!write.ok || write.changes === 0) {
    // DB write failed, or lost the race — nothing durable points to the new
    // file: discard it, and restore the previous file to its exact path.
    const deleteNew = await deleteStoredNavigationBackgroundImage(saved.imagePath);
    let restoreDetail = "";
    if (oldQuarantineAbsolute && oldOriginalAbsolute) {
      const restore = tryRestoreFile(oldQuarantineAbsolute, oldOriginalAbsolute);
      if (!restore.restored) {
        restoreDetail = ` Additionally, the previous image could not be restored from quarantine ("${oldQuarantineAbsolute}"): ${restore.error}. It remains under quarantine.`;
      }
    }
    const base = !write.ok ? `Failed to save the background: ${write.error}.` : CONFLICT_ERROR;
    const newFileDetail =
      deleteNew.outcome === "failed" ? ` Additionally, the uploaded file could not be cleaned up and is now orphaned: ${deleteNew.error}.` : "";
    return { ok: false, error: `${base}${newFileDetail}${restoreDetail}` };
  }

  // Success — the row durably points to the new file.
  for (const p of ownerRevalidatePaths(owner)) revalidatePath(p);

  if (oldQuarantineAbsolute && oldOriginalAbsolute) {
    const finalCleanup = await finalUnlinkWithRetry(oldQuarantineAbsolute);
    if (!finalCleanup.removed) {
      // Retake Round 2 (Codex P1) — a cleanup/compensation shortfall is
      // ALWAYS reported as `ok:false` with the exact durable state, never a
      // "mostly worked" `ok:true` + warning. Three distinct outcomes from
      // here, each named precisely:
      const restore = tryRestoreFile(oldQuarantineAbsolute, oldOriginalAbsolute);
      if (restore.restored) {
        const reversal = tryWriteOwnerRow(
          owner,
          now,
          { rowBackgroundImagePath: oldPath!, rowBackgroundOpacity: current.rowBackgroundOpacity },
          new Date().toISOString()
        );
        if (reversal.ok && reversal.changes > 0) {
          // Full reversal succeeded (previous file back, DB pointer back) —
          // the new file is no longer referenced by anything and must be
          // deleted; its outcome is checked and reported, never assumed.
          const deleteNew = await deleteStoredNavigationBackgroundImage(saved.imagePath);
          const deleteNewDetail =
            deleteNew.outcome === "failed"
              ? ` Additionally, the new file could not be cleaned up and is now orphaned at "${saved.imagePath}": ${deleteNew.error}.`
              : "";
          return {
            ok: false,
            error: `Failed to finish replacing the background (cleanup error: ${finalCleanup.error}). The previous image was restored and the database points back to it — nothing durable changed.${deleteNewDetail}`,
          };
        }
        // Reversal was refused or failed — the file IS back at its original
        // path, but the row may no longer (or never did, if this was a DB
        // error) point to it. Re-read the row for an honest diagnostic
        // WITHOUT writing anything further — a stale local snapshot
        // (`saved.imagePath`/`now`) must never be reported as current.
        const freshRow = await readOwnerRow(owner);
        const reversalDetail = !reversal.ok
          ? `the database could not be updated (${reversal.error})`
          : "a concurrent change won the row instead";
        return {
          ok: false,
          error: `Failed to finish replacing the background (cleanup error: ${finalCleanup.error}). The previous file was restored to "${oldPath}", but ${reversalDetail}, so this row may not reference it. Current row: path=${
            freshRow?.rowBackgroundImagePath ?? "unknown"
          }, opacity=${freshRow?.rowBackgroundOpacity ?? "unknown"}. Please check manually.`,
        };
      }
      // Could not even restore the previous file — it remains stuck under
      // quarantine. The new file is still the one durably referenced by the
      // row (the main write already committed), so the row itself is
      // correct; only the old file's cleanup failed, and that alone is
      // still reported as a failure per the ticket's own contract.
      return {
        ok: false,
        error: `Failed to finish replacing the background: the previous file could not be fully deleted (${finalCleanup.error}) and could also not be restored to its original path ("${oldOriginalAbsolute}": ${restore.error}) — it remains under quarantine at "${oldQuarantineAbsolute}". The new image itself was saved and is what this row currently references; only cleanup of the old file failed.`,
      };
    }
  }

  return {
    ok: true,
    rowBackgroundImagePath: saved.imagePath,
    rowBackgroundOpacity: nextOpacity,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Opacity
// ---------------------------------------------------------------------------

export async function setRowBackgroundOpacityAction(
  owner: RowBackgroundOwner,
  opacity: unknown,
  expectedUpdatedAt: string
): Promise<RowBackgroundMutationResult> {
  if (!isValidOwner(owner)) return { ok: false, error: "Invalid owner." };
  if (!isValidRowBackgroundOpacity(opacity)) {
    return { ok: false, error: "Opacity must be between 0.05 and 0.50." };
  }
  if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) {
    return { ok: false, error: "Invalid request." };
  }

  const current = await readOwnerRow(owner);
  if (!current) {
    return { ok: false, error: owner.kind === "project" ? "Project not found." : "Sequence not found in this Project." };
  }
  if (!current.rowBackgroundImagePath) {
    return { ok: false, error: "No background image is set." };
  }
  // Retake Round 2 (Codex P1) — even though opacity never touches the
  // filesystem, refuse to durably re-persist an unconfined/cross-owner
  // path rather than silently legitimizing it.
  if (!isConfinedForOwner(current.rowBackgroundImagePath, owner)) {
    return {
      ok: false,
      error: `Refusing to update opacity — the stored background path is not confined to this row's own subfolder ("${current.rowBackgroundImagePath}"). Fix this row manually.`,
    };
  }

  const now = new Date().toISOString();
  const write = tryWriteOwnerRow(
    owner,
    expectedUpdatedAt,
    { rowBackgroundImagePath: current.rowBackgroundImagePath, rowBackgroundOpacity: opacity },
    now
  );
  if (!write.ok) return { ok: false, error: `Failed to update opacity: ${write.error}` };
  if (write.changes === 0) return { ok: false, error: CONFLICT_ERROR };

  for (const p of ownerRevalidatePaths(owner)) revalidatePath(p);

  return {
    ok: true,
    rowBackgroundImagePath: current.rowBackgroundImagePath,
    rowBackgroundOpacity: opacity,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Remove — quarantine before mutation, conditional update (try/catch), full
// conditional reversal attempted before ever reporting a bare leftover.
// ---------------------------------------------------------------------------

export async function removeRowBackgroundImageAction(
  owner: RowBackgroundOwner,
  expectedUpdatedAt: string
): Promise<RowBackgroundMutationResult> {
  if (!isValidOwner(owner)) return { ok: false, error: "Invalid owner." };
  if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) {
    return { ok: false, error: "Invalid request." };
  }

  const current = await readOwnerRow(owner);
  if (!current) {
    return { ok: false, error: owner.kind === "project" ? "Project not found." : "Sequence not found in this Project." };
  }
  if (!current.rowBackgroundImagePath) {
    // Already absent — idempotent success.
    return {
      ok: true,
      rowBackgroundImagePath: null,
      rowBackgroundOpacity: null,
      updatedAt: current.updatedAt,
    };
  }

  const imagePath = current.rowBackgroundImagePath;
  if (!isConfinedForOwner(imagePath, owner)) {
    return { ok: false, error: `Refusing to remove — the stored path is not confined to this row's own subfolder ("${imagePath}"). Fix this row manually.` };
  }

  const publicRoot = path.join(process.cwd(), "public");
  const absolute = path.join(publicRoot, imagePath);
  const quarantineAbsolute = `${absolute}.trash-${Date.now()}`;

  let quarantined = false;
  try {
    renameSync(absolute, quarantineAbsolute);
    quarantined = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
      return { ok: false, error: "Failed to prepare the file for removal — nothing was changed. Please try again." };
    }
    // ENOENT: file already gone on disk — proceed straight to the DB update.
  }

  const now = new Date().toISOString();
  const write = tryWriteOwnerRow(owner, expectedUpdatedAt, { rowBackgroundImagePath: null, rowBackgroundOpacity: null }, now);

  if (!write.ok || write.changes === 0) {
    // DB write failed, or lost the race — restore the file exactly as it was.
    let restoreDetail = "";
    if (quarantined) {
      const restore = tryRestoreFile(quarantineAbsolute, absolute);
      if (!restore.restored) {
        restoreDetail = ` Additionally, the file could not be restored from quarantine ("${quarantineAbsolute}"): ${restore.error}. It remains under quarantine.`;
      }
    }
    const base = !write.ok ? `Failed to remove the background: ${write.error}.` : CONFLICT_ERROR;
    return { ok: false, error: `${base}${restoreDetail}` };
  }

  for (const p of ownerRevalidatePaths(owner)) revalidatePath(p);

  if (!quarantined) {
    return { ok: true, rowBackgroundImagePath: null, rowBackgroundOpacity: null, updatedAt: now };
  }

  const finalCleanup = await finalUnlinkWithRetry(quarantineAbsolute);
  if (finalCleanup.removed) {
    return { ok: true, rowBackgroundImagePath: null, rowBackgroundOpacity: null, updatedAt: now };
  }

  // Final cleanup failed — attempt full conditional reversal: restore the
  // file, then restore the DB pointer, but ONLY if the row still holds
  // exactly the value this action just wrote (never clobbering a concurrent
  // change).
  const restore = tryRestoreFile(quarantineAbsolute, absolute);
  if (restore.restored) {
    const reversal = tryWriteOwnerRow(
      owner,
      now,
      { rowBackgroundImagePath: imagePath, rowBackgroundOpacity: current.rowBackgroundOpacity },
      new Date().toISOString()
    );
    if (reversal.ok && reversal.changes > 0) {
      return {
        ok: false,
        error: `Failed to finish removing the background (cleanup error: ${finalCleanup.error}). Nothing was changed — the image is back in place. Please retry.`,
      };
    }
    // Retake Round 2 (Codex P1) — reversal was refused or failed: the file
    // IS back at its original path, but the row may no longer (or never
    // did, if this was a DB error) point to it. Re-read for an honest
    // diagnostic without writing anything further, rather than reporting
    // the stale local `null`/`now` snapshot as if it were still current.
    const freshRow = await readOwnerRow(owner);
    const reversalDetail = !reversal.ok
      ? `the database could not be updated (${reversal.error})`
      : "a concurrent change won the row instead";
    return {
      ok: false,
      error: `Failed to finish removing the background (cleanup error: ${finalCleanup.error}). The file was restored to "${imagePath}", but ${reversalDetail}, so this row may not reference it. Current row: path=${
        freshRow?.rowBackgroundImagePath ?? "unknown"
      }, opacity=${freshRow?.rowBackgroundOpacity ?? "unknown"}. Please check manually.`,
    };
  }

  // Could not even restore the file — it remains stuck under quarantine.
  // The row's DB state IS correctly null (the main write already
  // committed), but the ticket's contract still treats an incomplete
  // cleanup as a failure to report, never a silent/partial `ok:true`.
  return {
    ok: false,
    error: `Failed to finish removing the background: the underlying file could not be fully deleted and remains at "${quarantineAbsolute}": ${finalCleanup.error}. The database row itself is correctly cleared; only the file cleanup failed.`,
  };
}
