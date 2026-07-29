import "server-only";

// ---------------------------------------------------------------------------
// resolveLookReferences.ts — STYLE.1.G.CORE.1
//
// Validates and orders a caller-supplied list of Project Style reference
// image ids: deduplicated, confined to the Project, and returned in the
// exact caller-given order (never re-sorted). This is the ONE place a Look
// Test's reference selection is resolved from ids to real rows — both
// creation and duplication go through it, so a stale/foreign/duplicate id
// is refused identically either way.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projectStyleReferenceImages } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { MAX_REFERENCES_PER_TEST, isValidId } from "./contracts";
import { isConfinedReferenceImagePath } from "@/lib/projectStyle/uploadReferenceImage";

export type ResolvedLookReference = {
  id: number;
  imagePath: string;
  label: string | null;
  whatInterestsMe: string | null;
  whatToAvoid: string | null;
  provenanceNotes: string | null;
};

export type ResolveLookReferencesResult = { ok: true; references: ResolvedLookReference[] } | { ok: false; error: string };

export async function resolveLookReferences(projectId: number, referenceImageIds: unknown): Promise<ResolveLookReferencesResult> {
  if (referenceImageIds === undefined) return { ok: true, references: [] };
  if (!Array.isArray(referenceImageIds)) return { ok: false, error: "Invalid reference selection." };
  if (referenceImageIds.length > MAX_REFERENCES_PER_TEST) {
    return { ok: false, error: `Select at most ${MAX_REFERENCES_PER_TEST} references.` };
  }

  const orderedIds: number[] = [];
  const seen = new Set<number>();
  for (const raw of referenceImageIds) {
    if (!isValidId(raw)) return { ok: false, error: "Invalid reference id." };
    if (seen.has(raw)) return { ok: false, error: "Duplicate reference selected." };
    seen.add(raw);
    orderedIds.push(raw);
  }
  if (orderedIds.length === 0) return { ok: true, references: [] };

  const rows = await db
    .select({
      id: projectStyleReferenceImages.id,
      projectId: projectStyleReferenceImages.projectId,
      imagePath: projectStyleReferenceImages.imagePath,
      label: projectStyleReferenceImages.label,
      whatInterestsMe: projectStyleReferenceImages.whatInterestsMe,
      whatToAvoid: projectStyleReferenceImages.whatToAvoid,
      provenanceNotes: projectStyleReferenceImages.provenanceNotes,
    })
    .from(projectStyleReferenceImages)
    .where(inArray(projectStyleReferenceImages.id, orderedIds));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const references: ResolvedLookReference[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (!row) return { ok: false, error: "One or more selected references were not found." };
    if (row.projectId !== projectId) return { ok: false, error: "One or more selected references belong to a different Project." };
    // Confine check — reuses the canonical `isConfinedReferenceImagePath`
    // contract from the real upload path (uploads/project-style/references/,
    // see uploadReferenceImage.ts) instead of maintaining a second,
    // divergent path policy. A corrupted/tampered row could store an
    // arbitrary path; refuse before the test/job rows are ever created.
    if (!isConfinedReferenceImagePath(row.imagePath)) {
      return { ok: false, error: `Reference ${row.id} has a path outside the expected storage root — refusing to use it.` };
    }
    references.push({ id: row.id, imagePath: row.imagePath, label: row.label, whatInterestsMe: row.whatInterestsMe, whatToAvoid: row.whatToAvoid, provenanceNotes: row.provenanceNotes });
  }
  return { ok: true, references };
}
