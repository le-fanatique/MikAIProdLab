"use server";

// ---------------------------------------------------------------------------
// projectStyleInfluences.ts — STYLE.1.B.CORE
//
// Server Actions and read helpers for Creative Influence dossiers and their
// links to Project Style reference images. No files are owned here — every
// mutation is a plain synchronous better-sqlite3 transaction, same idiom as
// projectStyle.ts (STYLE.1.A).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  projectStyleInfluences,
  projectStyleInfluenceDomains,
  projectStyleInfluenceReferences,
  projectStyleReferenceImages,
  type ProjectStyleInfluence,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertProjectExists } from "@/lib/projectStyle/ownershipB";
import {
  isValidId,
  isValidSubjectType,
  isValidInfluenceStatus,
  isValidRequiredShortText,
  isValidOptionalShortText,
  isValidOptionalLongText,
  normalizeOptionalText,
  validateInfluenceDomainList,
  validateIdList,
  type InfluenceSubjectType,
  type InfluenceStatus,
  type InfluenceDomainWeight,
} from "@/lib/projectStyle/validationB";

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export type ProjectStyleInfluenceView = {
  influence: ProjectStyleInfluence;
  domains: { domain: string; weight: InfluenceDomainWeight }[];
  referenceIds: number[];
};

export async function listProjectStyleInfluences(projectId: number): Promise<ProjectStyleInfluenceView[]> {
  const influences = await db
    .select()
    .from(projectStyleInfluences)
    .where(eq(projectStyleInfluences.projectId, projectId))
    .orderBy(asc(projectStyleInfluences.createdAt));

  const views: ProjectStyleInfluenceView[] = [];
  for (const influence of influences) {
    const domainRows = await db
      .select()
      .from(projectStyleInfluenceDomains)
      .where(eq(projectStyleInfluenceDomains.influenceId, influence.id));
    const linkRows = await db
      .select()
      .from(projectStyleInfluenceReferences)
      .where(eq(projectStyleInfluenceReferences.influenceId, influence.id));
    views.push({
      influence,
      domains: domainRows.map((r) => ({ domain: r.domain, weight: r.weight as InfluenceDomainWeight })),
      referenceIds: linkRows.map((r) => r.referenceId),
    });
  }
  return views;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type InfluenceFields = {
  subjectType: InfluenceSubjectType;
  subjectName: string;
  disambiguation: string | null;
  roleOrDiscipline: string | null;
  periodOrWorks: string | null;
  whatInterestsMe: string | null;
  whatToAvoid: string | null;
  researchNotes: string | null;
  domains: unknown;
};

function validateInfluenceFields(fields: InfluenceFields): string | null {
  if (!isValidSubjectType(fields.subjectType)) return "Invalid subject type.";
  if (!isValidRequiredShortText(fields.subjectName)) return "Subject name is required.";
  if (!isValidOptionalShortText(fields.disambiguation)) return "Invalid disambiguation value.";
  if (!isValidOptionalShortText(fields.roleOrDiscipline)) return "Invalid role/discipline value.";
  if (!isValidOptionalShortText(fields.periodOrWorks)) return "Invalid period/works value.";
  if (!isValidOptionalLongText(fields.whatInterestsMe)) return "Invalid 'What interests me' value.";
  if (!isValidOptionalLongText(fields.whatToAvoid)) return "Invalid 'What to avoid' value.";
  if (!isValidOptionalLongText(fields.researchNotes)) return "Invalid research notes value.";
  return null;
}

export type CreateInfluenceResult =
  | { ok: true; view: ProjectStyleInfluenceView }
  | { ok: false; error: string };

export async function createInfluenceAction(
  input: { projectId: number } & InfluenceFields
): Promise<CreateInfluenceResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };

  const fieldsError = validateInfluenceFields(input);
  if (fieldsError) return { ok: false, error: fieldsError };

  const domains = validateInfluenceDomainList(input.domains);
  if (!domains) return { ok: false, error: "Invalid or duplicate influence domains." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const inserted = tx
      .insert(projectStyleInfluences)
      .values({
        projectId: input.projectId,
        subjectType: input.subjectType,
        subjectName: input.subjectName.trim(),
        disambiguation: normalizeOptionalText(input.disambiguation),
        roleOrDiscipline: normalizeOptionalText(input.roleOrDiscipline),
        periodOrWorks: normalizeOptionalText(input.periodOrWorks),
        whatInterestsMe: normalizeOptionalText(input.whatInterestsMe),
        whatToAvoid: normalizeOptionalText(input.whatToAvoid),
        researchNotes: normalizeOptionalText(input.researchNotes),
        status: "draft",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const influenceId = Number(inserted.lastInsertRowid);

    for (const { domain, weight } of domains) {
      tx.insert(projectStyleInfluenceDomains).values({ influenceId, domain, weight, createdAt: now }).run();
    }

    const rows = tx
      .select()
      .from(projectStyleInfluences)
      .where(eq(projectStyleInfluences.id, influenceId))
      .all() as unknown as ProjectStyleInfluence[];
    return rows[0];
  });

  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, view: { influence: outcome, domains, referenceIds: [] } };
}

// ---------------------------------------------------------------------------
// Update (metadata, domains, status)
// ---------------------------------------------------------------------------

export type UpdateInfluenceResult =
  | { ok: true; view: ProjectStyleInfluenceView }
  | { ok: false; error: string };

export async function updateInfluenceAction(
  input: { projectId: number; influenceId: number; status: InfluenceStatus } & InfluenceFields
): Promise<UpdateInfluenceResult> {
  const ownership = await assertProjectExists(input.projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(input.influenceId)) return { ok: false, error: "Invalid influence id." };
  if (!isValidInfluenceStatus(input.status)) return { ok: false, error: "Invalid status." };

  const fieldsError = validateInfluenceFields(input);
  if (fieldsError) return { ok: false, error: fieldsError };

  const domains = validateInfluenceDomainList(input.domains);
  if (!domains) return { ok: false, error: "Invalid or duplicate influence domains." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const rows = tx
      .select()
      .from(projectStyleInfluences)
      .where(eq(projectStyleInfluences.id, input.influenceId))
      .all() as unknown as ProjectStyleInfluence[];
    const influence = rows[0];
    if (!influence || influence.projectId !== input.projectId) return { kind: "not-found" as const };

    tx.update(projectStyleInfluences)
      .set({
        subjectType: input.subjectType,
        subjectName: input.subjectName.trim(),
        disambiguation: normalizeOptionalText(input.disambiguation),
        roleOrDiscipline: normalizeOptionalText(input.roleOrDiscipline),
        periodOrWorks: normalizeOptionalText(input.periodOrWorks),
        whatInterestsMe: normalizeOptionalText(input.whatInterestsMe),
        whatToAvoid: normalizeOptionalText(input.whatToAvoid),
        researchNotes: normalizeOptionalText(input.researchNotes),
        status: input.status,
        updatedAt: now,
      })
      .where(eq(projectStyleInfluences.id, input.influenceId))
      .run();

    tx.delete(projectStyleInfluenceDomains).where(eq(projectStyleInfluenceDomains.influenceId, input.influenceId)).run();
    for (const { domain, weight } of domains) {
      tx.insert(projectStyleInfluenceDomains).values({ influenceId: input.influenceId, domain, weight, createdAt: now }).run();
    }

    const linkRows = tx
      .select()
      .from(projectStyleInfluenceReferences)
      .where(eq(projectStyleInfluenceReferences.influenceId, input.influenceId))
      .all() as unknown as { referenceId: number }[];

    const updatedRows = tx
      .select()
      .from(projectStyleInfluences)
      .where(eq(projectStyleInfluences.id, input.influenceId))
      .all() as unknown as ProjectStyleInfluence[];
    return { kind: "ok" as const, influence: updatedRows[0], referenceIds: linkRows.map((r) => r.referenceId) };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Influence not found in this Project." };
  revalidatePath(`/projects/${input.projectId}/style`);
  return { ok: true, view: { influence: outcome.influence, domains, referenceIds: outcome.referenceIds } };
}

// ---------------------------------------------------------------------------
// Delete — no files owned by an influence; cascade removes domains/links.
// ---------------------------------------------------------------------------

export type DeleteInfluenceResult = { ok: true } | { ok: false; error: string };

export async function deleteInfluenceAction(projectId: number, influenceId: number): Promise<DeleteInfluenceResult> {
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(influenceId)) return { ok: false, error: "Invalid influence id." };

  const outcome = db.transaction((tx) => {
    const rows = tx
      .select()
      .from(projectStyleInfluences)
      .where(eq(projectStyleInfluences.id, influenceId))
      .all() as unknown as ProjectStyleInfluence[];
    const influence = rows[0];
    if (!influence || influence.projectId !== projectId) return { kind: "not-found" as const };

    tx.delete(projectStyleInfluences).where(eq(projectStyleInfluences.id, influenceId)).run();
    return { kind: "ok" as const };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Influence not found in this Project." };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Link / unlink a supporting reference — both rows must belong to the same
// Project; SQLite cannot express this cross-table equality as a plain FK, so
// it is checked explicitly here before any write.
// ---------------------------------------------------------------------------

export type LinkReferenceResult = { ok: true } | { ok: false; error: string };

export async function linkInfluenceReferenceAction(
  projectId: number,
  influenceId: number,
  referenceId: number
): Promise<LinkReferenceResult> {
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(influenceId)) return { ok: false, error: "Invalid influence id." };
  if (!isValidId(referenceId)) return { ok: false, error: "Invalid reference id." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const influenceRows = tx
      .select({ projectId: projectStyleInfluences.projectId })
      .from(projectStyleInfluences)
      .where(eq(projectStyleInfluences.id, influenceId))
      .all() as unknown as { projectId: number }[];
    if (!influenceRows[0] || influenceRows[0].projectId !== projectId) return { kind: "influence-not-found" as const };

    const referenceRows = tx
      .select({ projectId: projectStyleReferenceImages.projectId })
      .from(projectStyleReferenceImages)
      .where(eq(projectStyleReferenceImages.id, referenceId))
      .all() as unknown as { projectId: number }[];
    if (!referenceRows[0] || referenceRows[0].projectId !== projectId) return { kind: "reference-not-found" as const };

    // `onConflictDoNothing` targets exactly the (influenceId, referenceId)
    // unique index — an already-existing link is a harmless no-op, but any
    // OTHER failure (SQLITE_BUSY, I/O, an unexpected constraint) propagates
    // out of this transaction and out of the action uncaught, instead of a
    // blanket try/catch that would have presented every such failure as a
    // false "already linked" success.
    tx.insert(projectStyleInfluenceReferences)
      .values({ influenceId, referenceId, createdAt: now })
      .onConflictDoNothing({
        target: [projectStyleInfluenceReferences.influenceId, projectStyleInfluenceReferences.referenceId],
      })
      .run();
    return { kind: "ok" as const };
  });

  if (outcome.kind === "influence-not-found") return { ok: false, error: "Influence not found in this Project." };
  if (outcome.kind === "reference-not-found") return { ok: false, error: "Reference not found in this Project." };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true };
}

export async function unlinkInfluenceReferenceAction(
  projectId: number,
  influenceId: number,
  referenceId: number
): Promise<LinkReferenceResult> {
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(influenceId)) return { ok: false, error: "Invalid influence id." };
  if (!isValidId(referenceId)) return { ok: false, error: "Invalid reference id." };

  const outcome = db.transaction((tx) => {
    const influenceRows = tx
      .select({ projectId: projectStyleInfluences.projectId })
      .from(projectStyleInfluences)
      .where(eq(projectStyleInfluences.id, influenceId))
      .all() as unknown as { projectId: number }[];
    if (!influenceRows[0] || influenceRows[0].projectId !== projectId) return { kind: "not-found" as const };

    const linkRows = tx
      .select()
      .from(projectStyleInfluenceReferences)
      .where(eq(projectStyleInfluenceReferences.influenceId, influenceId))
      .all() as unknown as { id: number; referenceId: number }[];
    const link = linkRows.find((r) => r.referenceId === referenceId);
    if (!link) return { kind: "not-found" as const };

    tx.delete(projectStyleInfluenceReferences).where(eq(projectStyleInfluenceReferences.id, link.id)).run();
    return { kind: "ok" as const };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Link not found." };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true };
}

export type { InfluenceSubjectType, InfluenceStatus, InfluenceDomainWeight };
