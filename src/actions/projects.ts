"use server";

import { db } from "@/db";
import { projects, projectStyleReferenceImages, lookTests, lookTestResults, generationJobs } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { rename, unlink } from "node:fs/promises";
import path from "node:path";
import { isConfinedReferenceImagePath } from "@/lib/projectStyle/uploadReferenceImage";
import { isWithinLookDevelopmentRoot } from "@/lib/lookDevelopment/paths";

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
 *
 * STYLE.1.G.CORE.1 — Look Development results (`look_test_results`,
 * file-backed under `uploads/look-development/`) now go through this exact
 * same confine -> quarantine -> delete -> unlink discipline, sharing one
 * combined `filesToQuarantine` list with Project Style references rather
 * than a second independent implementation of the same lifecycle.
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

  // STYLE.1.G.CORE.1 — Look Development results are file-backed exactly
  // like Project Style references, under their own dedicated confined
  // root (uploads/look-development/), and must leave zero orphaned file on
  // Project delete. Same confine-then-quarantine-then-delete-then-unlink
  // discipline as the Style reference block above, sharing the one
  // `quarantined`/`publicRoot` loop below rather than a second copy of it.
  const publicRoot = path.join(process.cwd(), "public");
  const lookResults = await db
    .select({ id: lookTestResults.id, filePath: lookTestResults.filePath })
    .from(lookTestResults)
    .where(eq(lookTestResults.projectId, id));

  for (const result of lookResults) {
    const absolute = path.resolve(publicRoot, result.filePath);
    if (!isWithinLookDevelopmentRoot(absolute)) {
      throw new Error(
        `deleteProject(${id}): refusing to delete — Look Test result ${result.id} has an unconfined stored path ("${result.filePath}"). Fix this row manually before retrying.`
      );
    }
  }

  // STYLE.1.G.CORE.1 Round 6 — the exact initial snapshot of Look-result
  // identities/paths, kept SEPARATE from `quarantined` (the subset of
  // files that were physically found and renamed). A row whose confined
  // file was already missing at collection time (ENOENT during
  // quarantine, see the loop below) never enters `quarantined`, but it
  // MUST still count as "known and expected" for the anti-race recheck —
  // otherwise it is indistinguishable from a brand-new concurrent
  // publication and permanently blocks deletion (Round 5 Finding).
  const initialLookResultPathById = new Map(lookResults.map((r) => [r.id, r.filePath] as const));

  type QuarantineEntry = { source: "style-reference" | "look-result"; id: number; imagePath: string };
  const filesToQuarantine: QuarantineEntry[] = [
    ...styleReferences.map((ref): QuarantineEntry => ({ source: "style-reference", id: ref.id, imagePath: ref.imagePath })),
    ...lookResults.map((r): QuarantineEntry => ({ source: "look-result", id: r.id, imagePath: r.filePath })),
  ];

  const quarantined: { source: "style-reference" | "look-result"; id: number; originalAbsolute: string; quarantineAbsolute: string }[] = [];

  for (const ref of filesToQuarantine) {
    const originalAbsolute = path.join(publicRoot, ref.imagePath);
    const quarantineAbsolute = `${originalAbsolute}.trash-${Date.now()}-${ref.source}-${ref.id}`;
    try {
      await rename(originalAbsolute, quarantineAbsolute);
      quarantined.push({ source: ref.source, id: ref.id, originalAbsolute, quarantineAbsolute });
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
      const baseMsg = `deleteProject(${id}): failed to prepare ${ref.source} file "${ref.imagePath}" for deletion — nothing was changed in the database: ${e instanceof Error ? e.message : String(e)}`;
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

  // STYLE.1.G.CORE.1 Round 5 (Finding 1) — the only recoverable copy of
  // each file (its quarantined, still-renamed-not-deleted form) must never
  // be destroyed before the DB commit is KNOWN to have succeeded. Round 4
  // permanently unlinked files before the transaction, which meant a later
  // failure in that same loop left EARLIER files already gone forever even
  // though the whole operation still reported (or attempted) a rollback —
  // an unrecoverable, incoherent state. The fix: quarantine (reversible
  // rename, already done above) -> DB transaction -> ONLY THEN permanently
  // unlink. Every failure branch before the transaction commits is a
  // simple, deterministic rename-back (never an unlink, so never
  // irreversible); the only irreversible step (permanent unlink) happens
  // strictly after the DB has durably recorded the deletion.
  try {
    // Atomically delete Look jobs and the Project in ONE synchronous
    // transaction, with a race-safe completeness check: before the
    // cascade deletes, re-read the current look_test_results rows for
    // this Project. If a result was published between the initial file
    // collection and now (i.e. it has a filePath not present in our
    // quarantined list), the transaction throws and is rolled back —
    // nothing has been deleted, permanently or otherwise, at this point.
    db.transaction((tx) => {
      const currentLookResults = tx
        .select({ id: lookTestResults.id, filePath: lookTestResults.filePath })
        .from(lookTestResults)
        .where(eq(lookTestResults.projectId, id))
        .all();
      // STYLE.1.G.CORE.1 Round 6 — compare against the INITIAL DB
      // snapshot of Look-result identities/paths (`initialLookResultPathById`),
      // never against `quarantined` (only the subset of files that were
      // physically found on disk). A row that was already known at
      // collection time, even one whose confined file was already
      // missing (a stale-but-expected no-op for cleanup purposes), must
      // never be treated the same as a genuinely new concurrent
      // publication or a concurrent path change on an existing row.
      for (const r of currentLookResults) {
        const initialPath = initialLookResultPathById.get(r.id);
        if (initialPath === undefined) {
          throw new Error(
            `deleteProject(${id}): a new Look result (#${r.id}) was published after file collection began (filePath: "${r.filePath}"). Rollback — quarantine this file and retry.`
          );
        }
        if (initialPath !== r.filePath) {
          throw new Error(
            `deleteProject(${id}): Look result #${r.id}'s file path changed after file collection began (was "${initialPath}", now "${r.filePath}"). Rollback — quarantine the new file and retry.`
          );
        }
      }

      const projectLookTestIds = tx
        .select({ id: lookTests.id })
        .from(lookTests)
        .where(eq(lookTests.projectId, id))
        .all()
        .map((r) => r.id);
      if (projectLookTestIds.length > 0) {
        tx.delete(generationJobs).where(inArray(generationJobs.lookTestId, projectLookTestIds)).run();
      }
      tx.delete(projects).where(eq(projects.id, id)).run();
    });
  } catch (e) {
    // The transaction rolled back — no DB row was touched. Every
    // quarantined file is still a simple rename away from its original
    // path (nothing was ever permanently deleted), so restoration is
    // deterministic: no ENOENT ambiguity, no "was this really restored"
    // question, because no unlink has happened yet at this point.
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
      const details = failedRestores.map((r) => `"${r.quarantine}" → "${r.original}" (${r.error})`).join("; ");
      throw new Error(
        `${base}. ${restoreResults.length - failedRestores.length} file(s) restored, ${failedRestores.length} file(s) still under quarantine: ${details}`
      );
    }
    throw new Error(`${base} — nothing was changed (all ${restoreResults.length} file(s) restored).`);
  }

  // The DB transaction is now committed and durable: the Project and its
  // Look/Style rows are gone. Every quarantined file is now a plain,
  // unreferenced leftover — permanently removing it is pure cleanup, not
  // a step whose failure can put the DB and filesystem out of sync (no DB
  // row points to it anymore either way). A failure here is reported
  // honestly with the EXACT recoverable path — never a claim that some
  // separate durable record (a ledger) captured it, and never silence.
  const finalCleanupFailures: { originalAbsolute: string; quarantineAbsolute: string; error: string }[] = [];
  for (const q of quarantined) {
    let lastError: string | null = null;
    let removed = false;
    for (let attempt = 1; attempt <= 3 && !removed; attempt++) {
      try {
        await unlink(q.quarantineAbsolute);
        removed = true;
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
          removed = true; // already gone — nothing left to do
          break;
        }
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
    if (!removed) {
      finalCleanupFailures.push({ originalAbsolute: q.originalAbsolute, quarantineAbsolute: q.quarantineAbsolute, error: lastError ?? "unknown error" });
    }
  }

  if (finalCleanupFailures.length > 0) {
    console.error(`deleteProject(${id}): Project and DB rows deleted successfully; ${finalCleanupFailures.length} leftover file(s) could not be removed after 3 attempts`, finalCleanupFailures);
    const details = finalCleanupFailures.map((f) => `"${f.quarantineAbsolute}"`).join("; ");
    throw new Error(
      `deleteProject(${id}): the Project and its database rows were deleted successfully. ${finalCleanupFailures.length} leftover file(s) could not be removed after 3 attempts and remain, unreferenced by any data, at exactly these paths: ${details}. This does not affect data integrity — retry removing them manually or via a future cleanup pass.`
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
