import "server-only";

// ---------------------------------------------------------------------------
// deleteLookResult.ts — STYLE.1.G.CORE.1 (Scope E)
//
// Deletes a single durable Look Development result: quarantine-before-
// mutation, synchronous DB transaction, restore-on-failure — the same
// discipline as `deleteShotReferenceImage` (src/actions/shotReferenceImages.ts)
// and `deleteProject`'s own per-file loop, simplified because a Look result
// file is never shared by another row (unlike a reference image path that
// can be reused by a storyboard draft) — no "still needed elsewhere"
// re-check is required.
// ---------------------------------------------------------------------------

import path from "node:path";
import { renameSync, unlinkSync } from "node:fs";
import { db } from "@/db";
import { lookTestResults } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isWithinLookDevelopmentRoot } from "./paths";

export type DeleteLookResultResult = { ok: true } | { ok: false; error: string };

export async function deleteLookResult(projectId: number, resultId: number): Promise<DeleteLookResultResult> {
  const [existing] = await db.select().from(lookTestResults).where(eq(lookTestResults.id, resultId));
  if (!existing || existing.projectId !== projectId) return { ok: false, error: "Result not found." };

  const publicRoot = path.join(process.cwd(), "public");
  const absolute = path.resolve(publicRoot, existing.filePath);

  // Confine check — refuse an unconfined path without ANY mutation.
  if (existing.filePath.includes("..") || path.isAbsolute(existing.filePath) || !isWithinLookDevelopmentRoot(absolute)) {
    return { ok: false, error: "Result file path is not within the expected storage root — refusing to delete. Fix this row manually before retrying." };
  }

  const quarantinePath = `${absolute}.trash-${Date.now()}-${resultId}`;
  let quarantined = false;
  try {
    renameSync(absolute, quarantinePath);
    quarantined = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
      return { ok: false, error: "Failed to prepare the file for deletion — nothing was changed. Please try again." };
    }
    // ENOENT: file already gone — proceed to the row delete, nothing to restore later.
  }

  // Snapshot the row before deleting, for compensation if final cleanup fails.
  const snapshot = { ...existing };

  try {
    db.transaction((tx) => {
      tx.delete(lookTestResults).where(eq(lookTestResults.id, resultId)).run();
    });
  } catch (e) {
    if (quarantined) {
      try {
        renameSync(quarantinePath, absolute);
      } catch (restoreErr) {
        return {
          ok: false,
          error: `Failed to delete this result, and failed to restore its file from quarantine ("${quarantinePath}"): ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
        };
      }
    }
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete this result — nothing was changed. Please try again." };
  }

  if (quarantined) {
    try {
      unlinkSync(quarantinePath);
    } catch (e) {
      const unlinkError = e instanceof Error ? e.message : String(e);
      // Final unlink failed — try to restore the file from quarantine.
      let fileRestored = false;
      let fileRestoreError: string | null = null;
      try {
        renameSync(quarantinePath, absolute);
        fileRestored = true;
      } catch (restoreErr) {
        fileRestoreError = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
      }

      if (!fileRestored) {
        return {
          ok: false,
          error: `Failed to finish deleting this result (unlink: ${unlinkError}) and the file could NOT be restored from quarantine ("${quarantinePath}": ${fileRestoreError}). The database row is deleted, but the file remains under its quarantine path. Please check manually.`,
        };
      }

      // File is back — re-insert the DB row in a transaction.
      try {
        db.transaction((tx) => {
          tx.insert(lookTestResults)
            .values({
              id: snapshot.id,
              lookTestId: snapshot.lookTestId,
              projectId: snapshot.projectId,
              generationJobId: snapshot.generationJobId,
              kind: snapshot.kind,
              filePath: snapshot.filePath,
              notes: snapshot.notes,
              status: snapshot.status,
              createdAt: snapshot.createdAt,
              updatedAt: snapshot.updatedAt,
            })
            .run();
        });
      } catch (dbRestoreErr) {
        return {
          ok: false,
          error: `Failed to finish deleting this result (unlink: ${unlinkError}). The file was restored to "${absolute}", but the database restoration failed: ${dbRestoreErr instanceof Error ? dbRestoreErr.message : String(dbRestoreErr)}. The file is at its original path; the database row was NOT restored. Please check manually.`,
        };
      }

      return {
        ok: false,
        error: `Failed to finish deleting this result (unlink: ${unlinkError}). File and database row were all restored — nothing was changed.`,
      };
    }
  }

  return { ok: true };
}
