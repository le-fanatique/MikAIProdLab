"use server";

import { db } from "@/db";
import { projects, projectStyleReferenceImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { rename, unlink } from "node:fs/promises";
import path from "node:path";
import { isConfinedReferenceImagePath } from "@/lib/projectStyle/uploadReferenceImage";

export async function createProject(formData: FormData) {
  const name = formData.get("name") as string;
  const pitch = (formData.get("pitch") as string) || null;
  const story = (formData.get("story") as string) || null;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "draft";

  if (!name?.trim()) return;

  const [project] = await db
    .insert(projects)
    .values({ name: name.trim(), pitch, story, description, status: status as "draft" | "active" | "archived" })
    .returning({ id: projects.id });

  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: number, formData: FormData) {
  const name = formData.get("name") as string;
  const pitch = (formData.get("pitch") as string) || null;
  const story = (formData.get("story") as string) || null;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "draft";

  if (!name?.trim()) return;

  await db
    .update(projects)
    .set({
      name: name.trim(),
      pitch,
      story,
      description,
      status: status as "draft" | "active" | "archived",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, id));

  redirect(`/projects/${id}`);
}

/**
 * STYLE.1.B.CORE audit (retake — Codex REVISE) — `db.delete(projects)`
 * cascades every Project Style DB row (references, domains, consumers,
 * influences, influence domains, influence-reference links) automatically
 * under `PRAGMA foreign_keys=ON`, but a cascaded DB delete never touches the
 * filesystem. Without explicit handling, deleting a Project would silently
 * orphan every Reference Board file it owned.
 *
 * `deleteProject` has no user-facing error surface (it only ever redirects
 * to `/projects`), so a real failure at any stage below is a THROWN error
 * (Next.js's own error boundary renders it) rather than a logged-and-
 * ignored problem — this action must never redirect to `/projects` looking
 * like a clean success when it was not:
 *
 *   1. Every stored reference path is checked for confinement BEFORE
 *      anything is touched. An unconfined path (never produced by the real
 *      upload path, but defense in depth against a corrupted/tampered row)
 *      aborts the whole operation instead of being silently skipped.
 *   2. Every confined file is quarantined (same-directory rename) BEFORE
 *      the Project row is deleted — fully reversible up to this point. A
 *      quarantine failure restores everything already quarantined and
 *      aborts; nothing has been written to the DB yet.
 *   3. Only once every file is safely quarantined is the Project deleted
 *      (cascades all Style DB rows in one atomic statement). If this
 *      throws, every quarantined file is restored to its original path and
 *      the error is rethrown — the DB was never actually mutated in that
 *      case (a single `DELETE` either commits fully or not at all).
 *   4. After the DB delete commits, every quarantined file is permanently
 *      removed BEFORE the success redirect — never after it. If any
 *      permanent removal fails, a real error is thrown instead of
 *      redirecting to a false success; the DB rows are irreversibly gone
 *      at that point (compensating a whole Project's rows back is
 *      disproportionate for this ticket), but the leaked file is left
 *      under its durable, greppable `.trash-*` path and reported with its
 *      exact location rather than silently logged.
 *
 * Asset/Shot reference-image file cleanup on Project delete is a
 * pre-existing gap this ticket does not extend to — out of scope per the
 * ticket's explicit "adapter uniquement ce chemin si necessaire".
 */
export async function deleteProject(id: number) {
  const styleReferences = await db
    .select({ id: projectStyleReferenceImages.id, imagePath: projectStyleReferenceImages.imagePath })
    .from(projectStyleReferenceImages)
    .where(eq(projectStyleReferenceImages.projectId, id));

  for (const ref of styleReferences) {
    if (!isConfinedReferenceImagePath(ref.imagePath)) {
      throw new Error(
        `deleteProject(${id}): refusing to delete — Project Style reference ${ref.id} has an unconfined stored path ("${ref.imagePath}"). Fix this row manually before retrying.`
      );
    }
  }

  const publicRoot = path.join(process.cwd(), "public");
  const quarantined: { id: number; originalAbsolute: string; quarantineAbsolute: string }[] = [];

  for (const ref of styleReferences) {
    const originalAbsolute = path.join(publicRoot, ref.imagePath);
    const quarantineAbsolute = `${originalAbsolute}.trash-${Date.now()}-${ref.id}`;
    try {
      await rename(originalAbsolute, quarantineAbsolute);
      quarantined.push({ id: ref.id, originalAbsolute, quarantineAbsolute });
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") continue; // already gone — nothing to quarantine or restore

      const quarantineRestoreResults: { original: string; quarantine: string; restored: boolean; error?: string }[] = [];
      for (const q of quarantined) {
        try {
          await rename(q.quarantineAbsolute, q.originalAbsolute);
          quarantineRestoreResults.push({ original: q.originalAbsolute, quarantine: q.quarantineAbsolute, restored: true });
        } catch (restoreErr) {
          quarantineRestoreResults.push({
            original: q.originalAbsolute,
            quarantine: q.quarantineAbsolute,
            restored: false,
            error: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
          });
        }
      }
      const failedQRestores = quarantineRestoreResults.filter((r) => !r.restored);
      const baseMsg = `deleteProject(${id}): failed to prepare Project Style reference file "${ref.imagePath}" for deletion — nothing was changed in the database: ${e instanceof Error ? e.message : String(e)}`;
      if (failedQRestores.length > 0) {
        const details = failedQRestores
          .map((r) => `"${r.quarantine}" → "${r.original}" (${r.error})`)
          .join("; ");
        throw new Error(
          `${baseMsg}. ${quarantineRestoreResults.length - failedQRestores.length} file(s) restored, ${failedQRestores.length} file(s) still under quarantine: ${details}`
        );
      }
      throw new Error(`${baseMsg}. All ${quarantineRestoreResults.length} already-quarantined file(s) were restored.`);
    }
  }

  try {
    await db.delete(projects).where(eq(projects.id, id));
  } catch (e) {
    const restoreResults: { original: string; quarantine: string; restored: boolean; error?: string }[] = [];
    for (const q of quarantined) {
      try {
        await rename(q.quarantineAbsolute, q.originalAbsolute);
        restoreResults.push({ original: q.originalAbsolute, quarantine: q.quarantineAbsolute, restored: true });
      } catch (restoreErr) {
        restoreResults.push({
          original: q.originalAbsolute,
          quarantine: q.quarantineAbsolute,
          restored: false,
          error: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
        });
      }
    }
    const failedRestores = restoreResults.filter((r) => !r.restored);
    const base = `deleteProject(${id}): DB delete failed — ${e instanceof Error ? e.message : String(e)}`;
    if (failedRestores.length > 0) {
      const details = failedRestores
        .map((r) => `"${r.quarantine}" → "${r.original}" (${r.error})`)
        .join("; ");
      throw new Error(
        `${base}. ${restoreResults.length - failedRestores.length} file(s) restored, ${failedRestores.length} file(s) still under quarantine: ${details}`
      );
    }
    throw new Error(`${base} — nothing was changed (all ${restoreResults.length} file(s) restored).`);
  }

  const failedFinalCleanups: string[] = [];
  for (const q of quarantined) {
    try {
      await unlink(q.quarantineAbsolute);
    } catch (e) {
      failedFinalCleanups.push(`${q.quarantineAbsolute} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  if (failedFinalCleanups.length > 0) {
    throw new Error(
      `deleteProject(${id}): the Project and its Style data were deleted, but ${failedFinalCleanups.length} file(s) could not be finally removed and remain under quarantine: ${failedFinalCleanups.join(
        "; "
      )}`
    );
  }

  redirect("/projects");
}

export async function saveProjectStoryFoundation(
  projectId: number,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const pitch = (formData.get("pitch") as string | null)?.trim() || null;
    const story = (formData.get("story") as string | null)?.trim() || null;
    const description = (formData.get("description") as string | null)?.trim() || null;
    await db
      .update(projects)
      .set({ pitch, story, description, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save. Please try again." };
  }
}

export async function saveProjectOutline(
  projectId: number,
  outline: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const trimmed = outline?.trim() || null;
    await db
      .update(projects)
      .set({ outline: trimmed, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save the outline. Please try again." };
  }
}
