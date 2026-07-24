"use server";

// ---------------------------------------------------------------------------
// projectStyleReferences.ts — STYLE.1.B.CORE
//
// Server Actions and read helpers for Project Style Reference Board images.
// Every mutation validates ALL untrusted input before touching the DB or the
// filesystem. Upload publication and delete-time filesystem cleanup follow
// the exclusive-temp-write/atomic-publish and
// quarantine/transaction/restore-or-compensate discipline already
// established by src/actions/shotReferenceImages.ts, adapted here without a
// "still needed elsewhere" check: a Project Style reference's file is never
// shared by another row (each upload mints its own UUID filename).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  projectStyleReferenceImages,
  projectStyleReferenceDomains,
  projectStyleReferenceConsumers,
  projectStyleInfluenceReferences,
  type ProjectStyleReferenceImage,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { assertProjectExists } from "@/lib/projectStyle/ownershipB";
import {
  isValidId,
  isValidOptionalShortText,
  isValidOptionalLongText,
  isValidOptionalUrl,
  normalizeOptionalText,
  validateDomainList,
  validateConsumerList,
  type ReferenceConsumer,
} from "@/lib/projectStyle/validationB";
import {
  saveProjectStyleReferenceImage,
  deleteStoredProjectStyleReferenceImage,
  isConfinedReferenceImagePath,
  UploadReferenceImageError,
} from "@/lib/projectStyle/uploadReferenceImage";

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export type ProjectStyleReferenceView = {
  reference: ProjectStyleReferenceImage;
  domains: string[];
  consumers: ReferenceConsumer[];
};

export async function listProjectStyleReferences(projectId: number): Promise<ProjectStyleReferenceView[]> {
  const references = await db
    .select()
    .from(projectStyleReferenceImages)
    .where(eq(projectStyleReferenceImages.projectId, projectId))
    .orderBy(asc(projectStyleReferenceImages.createdAt));

  const views: ProjectStyleReferenceView[] = [];
  for (const reference of references) {
    const domainRows = await db
      .select()
      .from(projectStyleReferenceDomains)
      .where(eq(projectStyleReferenceDomains.referenceId, reference.id));
    const consumerRows = await db
      .select()
      .from(projectStyleReferenceConsumers)
      .where(eq(projectStyleReferenceConsumers.referenceId, reference.id));
    views.push({
      reference,
      domains: domainRows.map((r) => r.domain),
      consumers: consumerRows.map((r) => r.consumer as ReferenceConsumer),
    });
  }
  return views;
}

export async function getProjectStyleReference(
  referenceId: number,
  projectId: number
): Promise<ProjectStyleReferenceView | null> {
  const [reference] = await db.select().from(projectStyleReferenceImages).where(eq(projectStyleReferenceImages.id, referenceId));
  if (!reference || reference.projectId !== projectId) return null;
  const domainRows = await db.select().from(projectStyleReferenceDomains).where(eq(projectStyleReferenceDomains.referenceId, referenceId));
  const consumerRows = await db.select().from(projectStyleReferenceConsumers).where(eq(projectStyleReferenceConsumers.referenceId, referenceId));
  return {
    reference,
    domains: domainRows.map((r) => r.domain),
    consumers: consumerRows.map((r) => r.consumer as ReferenceConsumer),
  };
}

// ---------------------------------------------------------------------------
// Upload (create)
// ---------------------------------------------------------------------------

export type CreateReferenceInput = {
  projectId: number;
  file: unknown;
  label: string | null;
  sourceUrl: string | null;
  provenanceNotes: string | null;
  whatInterestsMe: string | null;
  whatToAvoid: string | null;
  domains: unknown;
  consumers: unknown;
};

export type CreateReferenceResult =
  | { ok: true; view: ProjectStyleReferenceView }
  | { ok: false; error: string };

export async function uploadProjectStyleReferenceAction(input: CreateReferenceInput): Promise<CreateReferenceResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };

  if (!isValidOptionalShortText(input.label)) return { ok: false, error: "Invalid label." };
  if (!isValidOptionalUrl(input.sourceUrl)) return { ok: false, error: "Invalid source URL." };
  if (!isValidOptionalLongText(input.provenanceNotes)) return { ok: false, error: "Invalid provenance notes." };
  if (!isValidOptionalLongText(input.whatInterestsMe)) return { ok: false, error: "Invalid 'What interests me' value." };
  if (!isValidOptionalLongText(input.whatToAvoid)) return { ok: false, error: "Invalid 'What to avoid' value." };

  const domains = validateDomainList(input.domains);
  if (!domains) return { ok: false, error: "Invalid or duplicate analysis domains." };
  const consumers = validateConsumerList(input.consumers);
  if (!consumers) return { ok: false, error: "Invalid or duplicate consumers." };

  let saved;
  try {
    saved = await saveProjectStyleReferenceImage(input.file, input.projectId);
  } catch (err) {
    if (err instanceof UploadReferenceImageError) return { ok: false, error: err.message };
    return { ok: false, error: "Failed to save the uploaded file." };
  }

  const now = new Date().toISOString();
  try {
    const outcome = db.transaction((tx) => {
      const inserted = tx
        .insert(projectStyleReferenceImages)
        .values({
          projectId: input.projectId,
          imagePath: saved.imagePath,
          sourceFilename: saved.sourceFilename,
          label: normalizeOptionalText(input.label),
          sourceUrl: normalizeOptionalText(input.sourceUrl),
          provenanceNotes: normalizeOptionalText(input.provenanceNotes),
          whatInterestsMe: normalizeOptionalText(input.whatInterestsMe),
          whatToAvoid: normalizeOptionalText(input.whatToAvoid),
          approvedForAnalysis: false,
          approvedForGeneration: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const referenceId = Number(inserted.lastInsertRowid);

      for (const domain of domains) {
        tx.insert(projectStyleReferenceDomains).values({ referenceId, domain, createdAt: now }).run();
      }
      for (const consumer of consumers) {
        tx.insert(projectStyleReferenceConsumers).values({ referenceId, consumer, createdAt: now }).run();
      }

      const referenceRows = tx
        .select()
        .from(projectStyleReferenceImages)
        .where(eq(projectStyleReferenceImages.id, referenceId))
        .all() as unknown as ProjectStyleReferenceImage[];
      return referenceRows[0];
    });

    revalidatePath(`/projects/${input.projectId}/style`);
    return {
      ok: true,
      view: { reference: outcome, domains, consumers },
    };
  } catch (err) {
    // Insertion failed after the file was already published — compensate by
    // deleting the orphaned file. The cleanup outcome is checked explicitly:
    // never announce "the uploaded file was cleaned up" unless it actually
    // was — a failed unlink here must be reported as a real leaked file,
    // never masked behind an optimistic message.
    const cleanup = await deleteStoredProjectStyleReferenceImage(saved.imagePath);
    const base = `Failed to save the reference: ${err instanceof Error ? err.message : String(err)}`;
    if (cleanup.outcome === "failed") {
      return {
        ok: false,
        error: `${base} Additionally, the uploaded file could not be cleaned up and is now orphaned: ${cleanup.error}`,
      };
    }
    return { ok: false, error: `${base} (the uploaded file was cleaned up)` };
  }
}

// ---------------------------------------------------------------------------
// Update metadata / domains / consumers / approvals
// ---------------------------------------------------------------------------

export type UpdateReferenceMetadataInput = {
  projectId: number;
  referenceId: number;
  label: string | null;
  sourceUrl: string | null;
  provenanceNotes: string | null;
  whatInterestsMe: string | null;
  whatToAvoid: string | null;
  domains: unknown;
  consumers: unknown;
  approvedForAnalysis: boolean;
  approvedForGeneration: boolean;
};

export type UpdateReferenceResult =
  | { ok: true; view: ProjectStyleReferenceView }
  | { ok: false; error: string };

export async function updateProjectStyleReferenceAction(input: UpdateReferenceMetadataInput): Promise<UpdateReferenceResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(input.referenceId)) return { ok: false, error: "Invalid reference id." };
  if (!isValidOptionalShortText(input.label)) return { ok: false, error: "Invalid label." };
  if (!isValidOptionalUrl(input.sourceUrl)) return { ok: false, error: "Invalid source URL." };
  if (!isValidOptionalLongText(input.provenanceNotes)) return { ok: false, error: "Invalid provenance notes." };
  if (!isValidOptionalLongText(input.whatInterestsMe)) return { ok: false, error: "Invalid 'What interests me' value." };
  if (!isValidOptionalLongText(input.whatToAvoid)) return { ok: false, error: "Invalid 'What to avoid' value." };
  if (typeof input.approvedForAnalysis !== "boolean") return { ok: false, error: "Invalid approval flag." };
  if (typeof input.approvedForGeneration !== "boolean") return { ok: false, error: "Invalid approval flag." };

  const domains = validateDomainList(input.domains);
  if (!domains) return { ok: false, error: "Invalid or duplicate analysis domains." };
  const consumers = validateConsumerList(input.consumers);
  if (!consumers) return { ok: false, error: "Invalid or duplicate consumers." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const rows = tx
      .select()
      .from(projectStyleReferenceImages)
      .where(eq(projectStyleReferenceImages.id, input.referenceId))
      .all() as unknown as ProjectStyleReferenceImage[];
    const reference = rows[0];
    if (!reference || reference.projectId !== input.projectId) return { kind: "not-found" as const };

    tx.update(projectStyleReferenceImages)
      .set({
        label: normalizeOptionalText(input.label),
        sourceUrl: normalizeOptionalText(input.sourceUrl),
        provenanceNotes: normalizeOptionalText(input.provenanceNotes),
        whatInterestsMe: normalizeOptionalText(input.whatInterestsMe),
        whatToAvoid: normalizeOptionalText(input.whatToAvoid),
        approvedForAnalysis: input.approvedForAnalysis,
        approvedForGeneration: input.approvedForGeneration,
        updatedAt: now,
      })
      .where(eq(projectStyleReferenceImages.id, input.referenceId))
      .run();

    tx.delete(projectStyleReferenceDomains).where(eq(projectStyleReferenceDomains.referenceId, input.referenceId)).run();
    for (const domain of domains) {
      tx.insert(projectStyleReferenceDomains).values({ referenceId: input.referenceId, domain, createdAt: now }).run();
    }

    tx.delete(projectStyleReferenceConsumers).where(eq(projectStyleReferenceConsumers.referenceId, input.referenceId)).run();
    for (const consumer of consumers) {
      tx.insert(projectStyleReferenceConsumers).values({ referenceId: input.referenceId, consumer, createdAt: now }).run();
    }

    const updatedRows = tx
      .select()
      .from(projectStyleReferenceImages)
      .where(eq(projectStyleReferenceImages.id, input.referenceId))
      .all() as unknown as ProjectStyleReferenceImage[];
    return { kind: "ok" as const, reference: updatedRows[0] };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Reference not found in this Project." };
  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, view: { reference: outcome.reference, domains, consumers } };
}

// ---------------------------------------------------------------------------
// Delete — quarantine file before mutation, transactional row delete
// (children cascade via FK), restore on failure, final unlink after commit.
// ---------------------------------------------------------------------------

export type DeleteReferenceResult = { ok: true } | { ok: false; error: string };

export async function deleteProjectStyleReferenceAction(
  projectId: number,
  referenceId: number
): Promise<DeleteReferenceResult> {
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(referenceId)) return { ok: false, error: "Invalid reference id." };

  // Phase 1 — Validate ownership (no writes yet).
  const [existing] = await db.select().from(projectStyleReferenceImages).where(eq(projectStyleReferenceImages.id, referenceId));
  if (!existing || existing.projectId !== projectId) return { ok: false, error: "Reference not found in this Project." };

  const publicRoot = path.join(process.cwd(), "public");
  const pathIsConfined = isConfinedReferenceImagePath(existing.imagePath);
  const absolute = path.resolve(publicRoot, existing.imagePath);
  const quarantinePath = `${absolute}.trash-${Date.now()}-${referenceId}`;

  // Phase 2 — Quarantine the file (reversible, no DB mutation yet).
  let quarantined = false;
  if (pathIsConfined) {
    try {
      renameSync(absolute, quarantinePath);
      quarantined = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        return { ok: false, error: "Failed to prepare the file for deletion — nothing was changed. Please try again." };
      }
      // ENOENT: file already gone — proceed straight to the row delete.
    }
  }

  // Phase 3 — Snapshot + delete in one synchronous transaction.
  // Captures the reference row and ALL its relations atomically, then
  // deletes. A concurrent mutation between snapshot reads and the
  // DELETE is impossible — same transaction.
  type CompensationSnapshot = {
    existing: ProjectStyleReferenceImage;
    domains: { id: number; referenceId: number; domain: string; createdAt: string }[];
    consumers: { id: number; referenceId: number; consumer: string; createdAt: string }[];
    links: { id: number; influenceId: number; referenceId: number; createdAt: string }[];
  };
  let snapshot: CompensationSnapshot | null = null;

  try {
    snapshot = db.transaction((tx) => {
      const row = tx
        .select()
        .from(projectStyleReferenceImages)
        .where(eq(projectStyleReferenceImages.id, referenceId))
        .all() as unknown as ProjectStyleReferenceImage[];
      if (!row[0]) throw new Error("Reference disappeared before delete.");

      const domains = tx
        .select()
        .from(projectStyleReferenceDomains)
        .where(eq(projectStyleReferenceDomains.referenceId, referenceId))
        .all() as unknown as CompensationSnapshot["domains"];
      const consumers = tx
        .select()
        .from(projectStyleReferenceConsumers)
        .where(eq(projectStyleReferenceConsumers.referenceId, referenceId))
        .all() as unknown as CompensationSnapshot["consumers"];
      const links = tx
        .select()
        .from(projectStyleInfluenceReferences)
        .where(eq(projectStyleInfluenceReferences.referenceId, referenceId))
        .all() as unknown as CompensationSnapshot["links"];

      // Cascade deletes domains, consumers and influence links.
      tx.delete(projectStyleReferenceImages).where(eq(projectStyleReferenceImages.id, referenceId)).run();

      return { existing: row[0], domains, consumers, links };
    });
  } catch (e) {
    // Transaction failed — restore file if quarantined.
    if (quarantined) {
      try {
        renameSync(quarantinePath, absolute);
      } catch (restoreErr) {
        return {
          ok: false,
          error: `Failed to delete this reference (DB error: ${e instanceof Error ? e.message : String(e)}), and the file could not be restored from quarantine ("${quarantinePath}"): ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}. Nothing was changed in the database; the file remains under quarantine.`,
        };
      }
    }
    return {
      ok: false,
      error: `Failed to delete this reference — nothing was changed. ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Phase 4 — Final cleanup of quarantined file (post-commit).
  if (quarantined) {
    let unlinkError: string | null = null;
    try {
      unlinkSync(quarantinePath);
    } catch (e) {
      unlinkError = e instanceof Error ? e.message : String(e);
    }

    if (unlinkError) {
      // Final unlink failed — compensate ONLY after confirming the file
      // has been restored to its original path. Do NOT recreate DB rows
      // that point to a file still locked under .trash-*.
      let fileRestored = false;
      let fileRestoreError: string | null = null;
      try {
        renameSync(quarantinePath, absolute);
        fileRestored = true;
      } catch (e) {
        fileRestoreError = e instanceof Error ? e.message : String(e);
      }

      if (!fileRestored) {
        // File cannot be restored — DO NOT recreate DB rows pointing to
        // a missing/quarantined file. Report the exact state.
        return {
          ok: false,
          error: `Failed to finish deleting this reference (unlink: ${unlinkError}) and the file could NOT be restored from quarantine ("${quarantinePath}": ${fileRestoreError}). The database row is deleted, but the file remains under its quarantine path. Please check manually.`,
        };
      }

      // File is back at its original path. Now restore DB rows in a
      // single transaction — all or nothing.
      const s = snapshot!;
      let dbRestoreError: string | null = null;
      try {
        db.transaction((tx) => {
          // No onConflictDoNothing: any conflict (concurrent insert reusing
          // the same id) must fail the entire transaction and roll back,
          // rather than silently skipping rows and producing an inconsistent
          // partial restoration.
          tx.insert(projectStyleReferenceImages)
            .values({
              id: s.existing.id,
              projectId: s.existing.projectId,
              imagePath: s.existing.imagePath,
              sourceFilename: s.existing.sourceFilename,
              label: s.existing.label,
              sourceUrl: s.existing.sourceUrl,
              provenanceNotes: s.existing.provenanceNotes,
              whatInterestsMe: s.existing.whatInterestsMe,
              whatToAvoid: s.existing.whatToAvoid,
              approvedForAnalysis: s.existing.approvedForAnalysis,
              approvedForGeneration: s.existing.approvedForGeneration,
              createdAt: s.existing.createdAt,
              updatedAt: s.existing.updatedAt,
            })
            .run();

          for (const d of s.domains) {
            tx.insert(projectStyleReferenceDomains)
              .values({ id: d.id, referenceId: d.referenceId, domain: d.domain, createdAt: d.createdAt })
              .run();
          }
          for (const c of s.consumers) {
            tx.insert(projectStyleReferenceConsumers)
              .values({ id: c.id, referenceId: c.referenceId, consumer: c.consumer as ReferenceConsumer, createdAt: c.createdAt })
              .run();
          }
          for (const l of s.links) {
            tx.insert(projectStyleInfluenceReferences)
              .values({ id: l.id, influenceId: l.influenceId, referenceId: l.referenceId, createdAt: l.createdAt })
              .run();
          }
        });
      } catch (e) {
        dbRestoreError = e instanceof Error ? e.message : String(e);
      }

      if (dbRestoreError) {
        return {
          ok: false,
          error: `Failed to finish deleting this reference (unlink: ${unlinkError}). The file was restored to "${absolute}", but the database restoration failed in a transaction that rolled back: ${dbRestoreError}. The file is at its original path; the database rows (reference, ${s.domains.length} domain(s), ${s.consumers.length} consumer(s), ${s.links.length} link(s)) were NOT restored. Please check manually.`,
        };
      }

      return {
        ok: false,
        error: `Failed to finish deleting this reference (unlink: ${unlinkError}). File and database rows (reference, ${s.domains.length} domain(s), ${s.consumers.length} consumer(s), ${s.links.length} link(s)) were all restored — nothing was changed.`,
      };
    }
  }

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true };
}
