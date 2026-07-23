"use server";

// ---------------------------------------------------------------------------
// projectStyle.ts — STYLE.1.A
//
// All mutations for the Project Style Working Draft, its sparse sections and
// atomic rules, and explicit publication into an immutable version history.
//
// Optimistic concurrency: every mutating action takes `expectedRevision`
// (the `project_style_drafts.revision` the caller last observed, or `null`
// when the caller believes no draft exists yet). Every transaction below
// re-reads the real current draft row (or its absence) and compares before
// writing anything — a mismatch is refused outright as `{ ok: false, kind:
// "stale", currentRevision }`, never silently merged or overwritten. On
// success, `revision` is bumped by exactly 1 in the SAME transaction as the
// content mutation, so the caller's next `expectedRevision` is always the
// exact value the server just committed.
//
// Every transaction is a single synchronous better-sqlite3
// `db.transaction((tx) => {...})` call (same idiom as
// src/actions/sequenceResults.ts / src/actions/shots.ts) — no `await`
// anywhere inside a transaction body, so two calls that look concurrent at
// the JS/Promise level can never actually interleave inside SQLite: Node's
// single-threaded event loop plus better-sqlite3's synchronous API mean the
// second transaction only ever begins after the first has fully committed
// or rolled back. The DB-level UNIQUE constraints
// (`project_style_drafts_project_id_unique`,
// `project_style_versions_project_version_unique`) are still real defense
// in depth, not the only guarantee.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  projects,
  projectStyleDrafts,
  projectStyleSections,
  projectStyleRules,
  projectStyleVersions,
  projectStyleActivePointers,
  type ProjectStyleDraft,
  type ProjectStyleSection,
  type ProjectStyleRule,
  type ProjectStyleVersion,
  type ProjectStyleActivePointer,
} from "@/db/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import { buildStyleSnapshotFromRows } from "@/lib/projectStyle/buildStyleSnapshot";
import type {
  StyleSnapshot,
  StylePillar,
  StyleRuleStrength,
  StyleRuleStatus,
} from "@/lib/projectStyle/styleSnapshot";
import {
  isValidId,
  isValidNullableExpectedRevision,
  isValidRevision,
  isValidPillar,
  isValidNullablePillar,
  isValidNullableStrength,
  isValidReorderDirection,
  isValidOptionalText,
  isValidRequiredText,
} from "@/lib/projectStyle/validation";

type OwnershipResult = { ok: true } | { ok: false; error: string };

async function assertProjectExists(projectId: number): Promise<OwnershipResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Read helpers (no mutation) — used by the workspace page's Server Component
// and re-usable by any future caller needing the same view.
// ---------------------------------------------------------------------------

export type WorkingDraftView = {
  draft: ProjectStyleDraft;
  sections: ProjectStyleSection[];
  rules: ProjectStyleRule[];
  snapshot: StyleSnapshot;
  compiledPreview: string;
};

export async function getWorkingDraft(projectId: number): Promise<WorkingDraftView | null> {
  const [draft] = await db.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId));
  if (!draft) return null;
  const sections = await db
    .select()
    .from(projectStyleSections)
    .where(eq(projectStyleSections.draftId, draft.id))
    .orderBy(asc(projectStyleSections.orderIndex));
  const rules = await db
    .select()
    .from(projectStyleRules)
    .where(eq(projectStyleRules.draftId, draft.id))
    .orderBy(asc(projectStyleRules.orderIndex));
  const snapshot = buildStyleSnapshotFromRows(draft, sections, rules);
  return { draft, sections, rules, snapshot, compiledPreview: compileStyleSnapshot(snapshot) };
}

export type ActiveVersionView = {
  pointer: ProjectStyleActivePointer | null;
  activeVersion: ProjectStyleVersion | null;
  history: ProjectStyleVersion[];
};

export async function getVersionHistory(projectId: number): Promise<ActiveVersionView> {
  const [pointer] = await db
    .select()
    .from(projectStyleActivePointers)
    .where(eq(projectStyleActivePointers.projectId, projectId));
  const history = await db
    .select()
    .from(projectStyleVersions)
    .where(eq(projectStyleVersions.projectId, projectId))
    .orderBy(desc(projectStyleVersions.versionNumber));
  const activeVersion = pointer?.activeVersionId ? history.find((v) => v.id === pointer.activeVersionId) ?? null : null;
  return { pointer: pointer ?? null, activeVersion, history };
}

// ---------------------------------------------------------------------------
// Mutation result shape shared by every action below.
// ---------------------------------------------------------------------------

export type StyleMutationResult =
  | { ok: true; revision: number }
  | { ok: false; error: string; currentRevision?: number };

function staleError(currentRevision: number): { ok: false; error: string; currentRevision: number } {
  return {
    ok: false,
    error: `This Working Draft was changed elsewhere (current revision ${currentRevision}). Reload and try again.`,
    currentRevision,
  };
}

/** Every mutation validates its full untrusted input BEFORE any DB work — this refusal never reaches a transaction, so zero rows are ever touched for an invalid value. */
function invalidInput(message: string): StyleMutationResult {
  return { ok: false, error: message };
}

// ---------------------------------------------------------------------------
// Draft fields (Direction Brief + both pillars' general/negative text)
// ---------------------------------------------------------------------------

export async function saveDraftFieldsAction(input: {
  projectId: number;
  expectedRevision: number | null;
  directionBrief: string;
  worldGeneralDirection: string;
  worldNegativeConstraints: string;
  visualGeneralDirection: string;
  visualNegativeConstraints: string;
}): Promise<StyleMutationResult> {
  const { projectId, expectedRevision } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidNullableExpectedRevision(expectedRevision)) return invalidInput("Invalid expected revision.");
  if (
    !isValidRequiredText(input.directionBrief) ||
    !isValidRequiredText(input.worldGeneralDirection) ||
    !isValidRequiredText(input.worldNegativeConstraints) ||
    !isValidRequiredText(input.visualGeneralDirection) ||
    !isValidRequiredText(input.visualNegativeConstraints)
  ) {
    return invalidInput("Invalid field value.");
  }

  const now = new Date().toISOString();
  const normalize = (v: string) => {
    const t = v.trim();
    return t.length > 0 ? t : null;
  };

  const outcome = db.transaction((tx) => {
    const rows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = rows[0];

    if (!draft) {
      if (expectedRevision !== null) return { kind: "stale" as const, currentRevision: 0 };
      const inserted = tx
        .insert(projectStyleDrafts)
        .values({
          projectId,
          directionBrief: normalize(input.directionBrief),
          worldGeneralDirection: normalize(input.worldGeneralDirection),
          worldNegativeConstraints: normalize(input.worldNegativeConstraints),
          visualGeneralDirection: normalize(input.visualGeneralDirection),
          visualNegativeConstraints: normalize(input.visualNegativeConstraints),
          revision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      void inserted;
      return { kind: "ok" as const, revision: 1 };
    }

    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    tx.update(projectStyleDrafts)
      .set({
        directionBrief: normalize(input.directionBrief),
        worldGeneralDirection: normalize(input.worldGeneralDirection),
        worldNegativeConstraints: normalize(input.worldNegativeConstraints),
        visualGeneralDirection: normalize(input.visualGeneralDirection),
        visualNegativeConstraints: normalize(input.visualNegativeConstraints),
        revision: draft.revision + 1,
        updatedAt: now,
      })
      .where(eq(projectStyleDrafts.id, draft.id))
      .run();
    return { kind: "ok" as const, revision: draft.revision + 1 };
  });

  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

// ---------------------------------------------------------------------------
// Sections (sparse specialized sections per pillar)
// ---------------------------------------------------------------------------

/** Codex P1 retake — Add/Reorder return the real created/moved row(s) so the
 * client can splice them into local state instead of `window.location.
 * reload()`, which previously discarded any unsaved edit sitting in the
 * Direction Brief / pillar general-direction / negative-constraints fields
 * at the moment of the reload. */
export type AddSectionResult =
  | { ok: true; revision: number; section: { id: number; pillar: StylePillar; heading: string; content: string; orderIndex: number } }
  | { ok: false; error: string; currentRevision?: number };

export type ReorderResult =
  | { ok: true; revision: number; swapped: { id: number; orderIndex: number }[] }
  | { ok: false; error: string; currentRevision?: number };

export async function addSectionAction(input: {
  projectId: number;
  expectedRevision: number | null;
  pillar: StylePillar;
  heading: string;
  content: string;
}): Promise<AddSectionResult> {
  const { projectId, expectedRevision, pillar } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidNullableExpectedRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (!isValidPillar(pillar)) return { ok: false, error: "Invalid pillar." };
  if (!isValidRequiredText(input.heading) || !isValidRequiredText(input.content)) return { ok: false, error: "Invalid field value." };

  const heading = input.heading.trim();
  const content = input.content.trim();
  if (!heading) return { ok: false, error: "Section heading is required." };
  if (!content) return { ok: false, error: "Section content is required." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const rows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    let draft = rows[0];

    if (!draft) {
      if (expectedRevision !== null) return { kind: "stale" as const, currentRevision: 0 };
      const inserted = tx.insert(projectStyleDrafts).values({ projectId, revision: 1, createdAt: now, updatedAt: now }).run();
      draft = {
        id: Number(inserted.lastInsertRowid),
        projectId,
        directionBrief: null,
        worldGeneralDirection: null,
        worldNegativeConstraints: null,
        visualGeneralDirection: null,
        visualNegativeConstraints: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
    } else if (draft.revision !== expectedRevision) {
      return { kind: "stale" as const, currentRevision: draft.revision };
    }

    const siblings = tx
      .select({ maxOrder: sql<number>`COALESCE(MAX(${projectStyleSections.orderIndex}), -1)` })
      .from(projectStyleSections)
      .where(eq(projectStyleSections.draftId, draft.id))
      .all() as unknown as { maxOrder: number }[];
    const nextOrder = (siblings[0]?.maxOrder ?? -1) + 1;

    const inserted = tx
      .insert(projectStyleSections)
      .values({ draftId: draft.id, pillar, heading, content, orderIndex: nextOrder, createdAt: now, updatedAt: now })
      .run();

    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return {
      kind: "ok" as const,
      revision: draft.revision + 1,
      section: { id: Number(inserted.lastInsertRowid), pillar, heading, content, orderIndex: nextOrder },
    };
  });

  if (outcome.kind === "stale") return { ok: false, error: `This Working Draft was changed elsewhere (current revision ${outcome.currentRevision}). Reload and try again.`, currentRevision: outcome.currentRevision };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision, section: outcome.section };
}

export async function updateSectionAction(input: {
  projectId: number;
  sectionId: number;
  expectedRevision: number;
  heading: string;
  content: string;
}): Promise<StyleMutationResult> {
  const { projectId, sectionId, expectedRevision } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(sectionId)) return invalidInput("Invalid section id.");
  if (!isValidRevision(expectedRevision)) return invalidInput("Invalid expected revision.");
  if (!isValidRequiredText(input.heading) || !isValidRequiredText(input.content)) return invalidInput("Invalid field value.");

  const heading = input.heading.trim();
  const content = input.content.trim();
  if (!heading) return { ok: false, error: "Section heading is required." };
  if (!content) return { ok: false, error: "Section content is required." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "stale" as const, currentRevision: 0 };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    const sectionRows = tx
      .select()
      .from(projectStyleSections)
      .where(eq(projectStyleSections.id, sectionId))
      .all() as unknown as ProjectStyleSection[];
    const section = sectionRows[0];
    if (!section || section.draftId !== draft.id) return { kind: "not-found" as const };

    tx.update(projectStyleSections).set({ heading, content, updatedAt: now }).where(eq(projectStyleSections.id, sectionId)).run();
    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return { kind: "ok" as const, revision: draft.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Section not found in this draft." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

export async function deleteSectionAction(input: {
  projectId: number;
  sectionId: number;
  expectedRevision: number;
}): Promise<StyleMutationResult> {
  const { projectId, sectionId, expectedRevision } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(sectionId)) return invalidInput("Invalid section id.");
  if (!isValidRevision(expectedRevision)) return invalidInput("Invalid expected revision.");

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "stale" as const, currentRevision: 0 };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    const sectionRows = tx
      .select()
      .from(projectStyleSections)
      .where(eq(projectStyleSections.id, sectionId))
      .all() as unknown as ProjectStyleSection[];
    const section = sectionRows[0];
    if (!section || section.draftId !== draft.id) return { kind: "not-found" as const };

    tx.delete(projectStyleSections).where(eq(projectStyleSections.id, sectionId)).run();
    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return { kind: "ok" as const, revision: draft.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Section not found in this draft." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

export async function reorderSectionAction(input: {
  projectId: number;
  sectionId: number;
  expectedRevision: number;
  direction: "up" | "down";
}): Promise<ReorderResult> {
  const { projectId, sectionId, expectedRevision, direction } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(sectionId)) return { ok: false, error: "Invalid section id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (!isValidReorderDirection(direction)) return { ok: false, error: "Invalid direction." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "stale" as const, currentRevision: 0 };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    const sectionRows = tx
      .select()
      .from(projectStyleSections)
      .where(eq(projectStyleSections.id, sectionId))
      .all() as unknown as ProjectStyleSection[];
    const section = sectionRows[0];
    if (!section || section.draftId !== draft.id) return { kind: "not-found" as const };

    const siblingRows = tx
      .select()
      .from(projectStyleSections)
      .where(eq(projectStyleSections.draftId, draft.id))
      .orderBy(asc(projectStyleSections.orderIndex))
      .all() as unknown as ProjectStyleSection[];
    const pillarSiblings = siblingRows.filter((s) => s.pillar === section.pillar);
    const idx = pillarSiblings.findIndex((s) => s.id === sectionId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= pillarSiblings.length) return { kind: "no-op" as const };

    const other = pillarSiblings[swapIdx];
    tx.update(projectStyleSections).set({ orderIndex: other.orderIndex, updatedAt: now }).where(eq(projectStyleSections.id, section.id)).run();
    tx.update(projectStyleSections).set({ orderIndex: section.orderIndex, updatedAt: now }).where(eq(projectStyleSections.id, other.id)).run();
    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return {
      kind: "ok" as const,
      revision: draft.revision + 1,
      swapped: [
        { id: section.id, orderIndex: other.orderIndex },
        { id: other.id, orderIndex: section.orderIndex },
      ],
    };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Section not found in this draft." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  if (outcome.kind === "no-op") return { ok: true, revision: expectedRevision, swapped: [] };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision, swapped: outcome.swapped };
}

// ---------------------------------------------------------------------------
// Rules (atomic manual rules)
// ---------------------------------------------------------------------------

type RuleFields = {
  instruction: string;
  pillar: StylePillar | null;
  section: string | null;
  category: string | null;
  strength: StyleRuleStrength | null;
  applicability: string | null;
  provenanceNotes: string | null;
};

function normalizeOptional(v: string | null | undefined): string | null {
  const t = v?.trim() ?? "";
  return t.length > 0 ? t : null;
}

/** Validates every RuleFields member at runtime — pillar/strength are enums a forged request can set to any string; the others are just typed as strings-or-null. */
function validateRuleFields(fields: RuleFields): string | null {
  if (!isValidRequiredText(fields.instruction)) return "Invalid instruction value.";
  if (!isValidNullablePillar(fields.pillar)) return "Invalid pillar.";
  if (!isValidNullableStrength(fields.strength)) return "Invalid strength.";
  if (!isValidOptionalText(fields.section)) return "Invalid section value.";
  if (!isValidOptionalText(fields.category)) return "Invalid category value.";
  if (!isValidOptionalText(fields.applicability)) return "Invalid applicability value.";
  if (!isValidOptionalText(fields.provenanceNotes)) return "Invalid provenance/notes value.";
  return null;
}

export type AddRuleResult =
  | {
      ok: true;
      revision: number;
      rule: {
        id: number;
        instruction: string;
        pillar: StylePillar | null;
        section: string | null;
        category: string | null;
        strength: StyleRuleStrength | null;
        applicability: string | null;
        provenanceNotes: string | null;
        status: StyleRuleStatus;
        orderIndex: number;
      };
    }
  | { ok: false; error: string; currentRevision?: number };

export async function addRuleAction(input: { projectId: number; expectedRevision: number | null } & RuleFields): Promise<AddRuleResult> {
  const { projectId, expectedRevision } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidNullableExpectedRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  const fieldsError = validateRuleFields(input);
  if (fieldsError) return { ok: false, error: fieldsError };

  const instruction = input.instruction.trim();
  if (!instruction) return { ok: false, error: "Rule instruction is required." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const rows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    let draft = rows[0];

    if (!draft) {
      if (expectedRevision !== null) return { kind: "stale" as const, currentRevision: 0 };
      const inserted = tx.insert(projectStyleDrafts).values({ projectId, revision: 1, createdAt: now, updatedAt: now }).run();
      draft = {
        id: Number(inserted.lastInsertRowid),
        projectId,
        directionBrief: null,
        worldGeneralDirection: null,
        worldNegativeConstraints: null,
        visualGeneralDirection: null,
        visualNegativeConstraints: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
    } else if (draft.revision !== expectedRevision) {
      return { kind: "stale" as const, currentRevision: draft.revision };
    }

    const siblings = tx
      .select({ maxOrder: sql<number>`COALESCE(MAX(${projectStyleRules.orderIndex}), -1)` })
      .from(projectStyleRules)
      .where(eq(projectStyleRules.draftId, draft.id))
      .all() as unknown as { maxOrder: number }[];
    const nextOrder = (siblings[0]?.maxOrder ?? -1) + 1;

    const section = normalizeOptional(input.section);
    const category = normalizeOptional(input.category);
    const applicability = normalizeOptional(input.applicability);
    const provenanceNotes = normalizeOptional(input.provenanceNotes);

    const inserted = tx
      .insert(projectStyleRules)
      .values({
        draftId: draft.id,
        instruction,
        pillar: input.pillar,
        section,
        category,
        strength: input.strength,
        applicability,
        provenanceNotes,
        status: "approved",
        orderIndex: nextOrder,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return {
      kind: "ok" as const,
      revision: draft.revision + 1,
      rule: {
        id: Number(inserted.lastInsertRowid),
        instruction,
        pillar: input.pillar,
        section,
        category,
        strength: input.strength,
        applicability,
        provenanceNotes,
        status: "approved" as StyleRuleStatus,
        orderIndex: nextOrder,
      },
    };
  });

  if (outcome.kind === "stale") return { ok: false, error: `This Working Draft was changed elsewhere (current revision ${outcome.currentRevision}). Reload and try again.`, currentRevision: outcome.currentRevision };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision, rule: outcome.rule };
}

export async function updateRuleAction(
  input: { projectId: number; ruleId: number; expectedRevision: number } & RuleFields
): Promise<StyleMutationResult> {
  const { projectId, ruleId, expectedRevision } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(ruleId)) return invalidInput("Invalid rule id.");
  if (!isValidRevision(expectedRevision)) return invalidInput("Invalid expected revision.");
  const fieldsError = validateRuleFields(input);
  if (fieldsError) return invalidInput(fieldsError);

  const instruction = input.instruction.trim();
  if (!instruction) return { ok: false, error: "Rule instruction is required." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "stale" as const, currentRevision: 0 };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    const ruleRows = tx.select().from(projectStyleRules).where(eq(projectStyleRules.id, ruleId)).all() as unknown as ProjectStyleRule[];
    const rule = ruleRows[0];
    if (!rule || rule.draftId !== draft.id) return { kind: "not-found" as const };

    tx.update(projectStyleRules)
      .set({
        instruction,
        pillar: input.pillar,
        section: normalizeOptional(input.section),
        category: normalizeOptional(input.category),
        strength: input.strength,
        applicability: normalizeOptional(input.applicability),
        provenanceNotes: normalizeOptional(input.provenanceNotes),
        updatedAt: now,
      })
      .where(eq(projectStyleRules.id, ruleId))
      .run();

    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return { kind: "ok" as const, revision: draft.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Rule not found in this draft." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

export async function toggleRuleStatusAction(input: {
  projectId: number;
  ruleId: number;
  expectedRevision: number;
}): Promise<StyleMutationResult> {
  const { projectId, ruleId, expectedRevision } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(ruleId)) return invalidInput("Invalid rule id.");
  if (!isValidRevision(expectedRevision)) return invalidInput("Invalid expected revision.");

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "stale" as const, currentRevision: 0 };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    const ruleRows = tx.select().from(projectStyleRules).where(eq(projectStyleRules.id, ruleId)).all() as unknown as ProjectStyleRule[];
    const rule = ruleRows[0];
    if (!rule || rule.draftId !== draft.id) return { kind: "not-found" as const };

    const nextStatus: StyleRuleStatus = rule.status === "approved" ? "disabled" : "approved";
    tx.update(projectStyleRules).set({ status: nextStatus, updatedAt: now }).where(eq(projectStyleRules.id, ruleId)).run();
    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return { kind: "ok" as const, revision: draft.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Rule not found in this draft." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

export async function deleteRuleAction(input: {
  projectId: number;
  ruleId: number;
  expectedRevision: number;
}): Promise<StyleMutationResult> {
  const { projectId, ruleId, expectedRevision } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(ruleId)) return invalidInput("Invalid rule id.");
  if (!isValidRevision(expectedRevision)) return invalidInput("Invalid expected revision.");

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "stale" as const, currentRevision: 0 };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    const ruleRows = tx.select().from(projectStyleRules).where(eq(projectStyleRules.id, ruleId)).all() as unknown as ProjectStyleRule[];
    const rule = ruleRows[0];
    if (!rule || rule.draftId !== draft.id) return { kind: "not-found" as const };

    tx.delete(projectStyleRules).where(eq(projectStyleRules.id, ruleId)).run();
    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return { kind: "ok" as const, revision: draft.revision + 1 };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Rule not found in this draft." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

export async function reorderRuleAction(input: {
  projectId: number;
  ruleId: number;
  expectedRevision: number;
  direction: "up" | "down";
}): Promise<ReorderResult> {
  const { projectId, ruleId, expectedRevision, direction } = input;
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidId(ruleId)) return { ok: false, error: "Invalid rule id." };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (!isValidReorderDirection(direction)) return { ok: false, error: "Invalid direction." };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "stale" as const, currentRevision: 0 };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    const ruleRows = tx.select().from(projectStyleRules).where(eq(projectStyleRules.id, ruleId)).all() as unknown as ProjectStyleRule[];
    const rule = ruleRows[0];
    if (!rule || rule.draftId !== draft.id) return { kind: "not-found" as const };

    const allRules = tx
      .select()
      .from(projectStyleRules)
      .where(eq(projectStyleRules.draftId, draft.id))
      .orderBy(asc(projectStyleRules.orderIndex))
      .all() as unknown as ProjectStyleRule[];
    const idx = allRules.findIndex((r) => r.id === ruleId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= allRules.length) return { kind: "no-op" as const };

    const other = allRules[swapIdx];
    tx.update(projectStyleRules).set({ orderIndex: other.orderIndex, updatedAt: now }).where(eq(projectStyleRules.id, rule.id)).run();
    tx.update(projectStyleRules).set({ orderIndex: rule.orderIndex, updatedAt: now }).where(eq(projectStyleRules.id, other.id)).run();
    tx.update(projectStyleDrafts).set({ revision: draft.revision + 1, updatedAt: now }).where(eq(projectStyleDrafts.id, draft.id)).run();
    return {
      kind: "ok" as const,
      revision: draft.revision + 1,
      swapped: [
        { id: rule.id, orderIndex: other.orderIndex },
        { id: other.id, orderIndex: rule.orderIndex },
      ],
    };
  });

  if (outcome.kind === "not-found") return { ok: false, error: "Rule not found in this draft." };
  if (outcome.kind === "stale") return staleError(outcome.currentRevision);
  if (outcome.kind === "no-op") return { ok: true, revision: expectedRevision, swapped: [] };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision, swapped: outcome.swapped };
}

// ---------------------------------------------------------------------------
// Edit Active Style — opens a new Working Draft seeded from the current
// active published version's exact content snapshot. Refuses if a draft
// already exists (never silently overwrites an in-progress draft) or if
// there is no active version to copy from.
// ---------------------------------------------------------------------------

export async function openDraftFromActiveVersionAction(
  projectId: number
): Promise<{ ok: true; revision: number } | { ok: false; error: string }> {
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const existingDraftRows = tx
      .select({ id: projectStyleDrafts.id })
      .from(projectStyleDrafts)
      .where(eq(projectStyleDrafts.projectId, projectId))
      .all() as unknown as { id: number }[];
    if (existingDraftRows[0]) return { kind: "already-exists" as const };

    const pointerRows = tx
      .select()
      .from(projectStyleActivePointers)
      .where(eq(projectStyleActivePointers.projectId, projectId))
      .all() as unknown as ProjectStyleActivePointer[];
    const pointer = pointerRows[0];
    if (!pointer || !pointer.activeVersionId) return { kind: "no-active" as const };

    const versionRows = tx
      .select()
      .from(projectStyleVersions)
      .where(eq(projectStyleVersions.id, pointer.activeVersionId))
      .all() as unknown as ProjectStyleVersion[];
    const version = versionRows[0];
    if (!version || version.projectId !== projectId) return { kind: "no-active" as const };

    const snapshot = JSON.parse(version.contentSnapshot) as StyleSnapshot;

    const inserted = tx
      .insert(projectStyleDrafts)
      .values({
        projectId,
        directionBrief: snapshot.directionBrief,
        worldGeneralDirection: snapshot.world.generalDirection,
        worldNegativeConstraints: snapshot.world.negativeConstraints,
        visualGeneralDirection: snapshot.visual.generalDirection,
        visualNegativeConstraints: snapshot.visual.negativeConstraints,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const draftId = Number(inserted.lastInsertRowid);

    let sectionOrder = 0;
    for (const pillar of ["world", "visual"] as const) {
      for (const section of snapshot[pillar].sections) {
        tx.insert(projectStyleSections)
          .values({
            draftId,
            pillar,
            heading: section.heading,
            content: section.content,
            orderIndex: sectionOrder++,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }

    let ruleOrder = 0;
    for (const rule of snapshot.rules) {
      tx.insert(projectStyleRules)
        .values({
          draftId,
          instruction: rule.instruction,
          pillar: rule.pillar,
          section: rule.section,
          category: rule.category,
          strength: rule.strength,
          applicability: rule.applicability,
          provenanceNotes: rule.provenanceNotes,
          status: rule.status,
          orderIndex: ruleOrder++,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { kind: "ok" as const, revision: 1 };
  });

  if (outcome.kind === "already-exists") return { ok: false, error: "A Working Draft already exists — open it instead of starting a new one." };
  if (outcome.kind === "no-active") return { ok: false, error: "There is no active published Style to edit." };
  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, revision: outcome.revision };
}

// ---------------------------------------------------------------------------
// Publish Style — the one transaction that creates an immutable version and
// moves the active pointer. Never UPDATEs or DELETEs any existing version
// row. Retires (deletes) the Working Draft on success — STYLE.1.A's chosen
// contract for "retirer ou clore le Working Draft" (see claude_report.md):
// after publish there is no draft until the user explicitly starts a new
// one (Save Draft, or Edit Active Style).
//
// Codex P1 retake — `currentFields` is the caller's LIVE, possibly-unsaved
// Direction Brief / pillar general-direction / negative-constraints text
// (the exact same values the client's compiled preview was computed from).
// Publishing builds its snapshot from these values, never from a stale DB
// read of `project_style_drafts` — this is what makes "the published
// version always matches exactly what the compiled preview showed" a
// structural guarantee instead of a "remember to Save Draft first"
// convention. Sections/rules need no such payload: every section/rule
// mutation already commits immediately (see addSectionAction etc.), so the
// DB copy is always current — there is no client-only, unsaved section/rule
// state to lose.
// ---------------------------------------------------------------------------

export type PublishStyleResult =
  | { ok: true; versionNumber: number }
  | { ok: false; error: string; currentRevision?: number };

export async function publishStyleAction(
  projectId: number,
  expectedRevision: number,
  currentFields: {
    directionBrief: string;
    worldGeneralDirection: string;
    worldNegativeConstraints: string;
    visualGeneralDirection: string;
    visualNegativeConstraints: string;
  }
): Promise<PublishStyleResult> {
  const ownership = await assertProjectExists(projectId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  if (!isValidRevision(expectedRevision)) return { ok: false, error: "Invalid expected revision." };
  if (
    !isValidRequiredText(currentFields.directionBrief) ||
    !isValidRequiredText(currentFields.worldGeneralDirection) ||
    !isValidRequiredText(currentFields.worldNegativeConstraints) ||
    !isValidRequiredText(currentFields.visualGeneralDirection) ||
    !isValidRequiredText(currentFields.visualNegativeConstraints)
  ) {
    return { ok: false, error: "Invalid field value." };
  }

  const normalize = (v: string) => {
    const t = v.trim();
    return t.length > 0 ? t : null;
  };

  const now = new Date().toISOString();
  const outcome = db.transaction((tx) => {
    const draftRows = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all() as unknown as ProjectStyleDraft[];
    const draft = draftRows[0];
    if (!draft) return { kind: "no-draft" as const };
    if (draft.revision !== expectedRevision) return { kind: "stale" as const, currentRevision: draft.revision };

    // The draft ROW is only used for id/ownership/revision above — its
    // text fields are superseded here by the caller's live values, which
    // is the actual fix for "preview shows unsaved edits, Publish
    // published the old DB text".
    const effectiveDraft = {
      directionBrief: normalize(currentFields.directionBrief),
      worldGeneralDirection: normalize(currentFields.worldGeneralDirection),
      worldNegativeConstraints: normalize(currentFields.worldNegativeConstraints),
      visualGeneralDirection: normalize(currentFields.visualGeneralDirection),
      visualNegativeConstraints: normalize(currentFields.visualNegativeConstraints),
    };

    const sections = tx
      .select()
      .from(projectStyleSections)
      .where(eq(projectStyleSections.draftId, draft.id))
      .orderBy(asc(projectStyleSections.orderIndex))
      .all() as unknown as ProjectStyleSection[];
    const rules = tx
      .select()
      .from(projectStyleRules)
      .where(eq(projectStyleRules.draftId, draft.id))
      .orderBy(asc(projectStyleRules.orderIndex))
      .all() as unknown as ProjectStyleRule[];

    const snapshot = buildStyleSnapshotFromRows(effectiveDraft, sections, rules);
    const compiledText = compileStyleSnapshot(snapshot);
    if (compiledText.length === 0) return { kind: "empty" as const };

    const maxRows = tx
      .select({ maxVersion: sql<number>`COALESCE(MAX(${projectStyleVersions.versionNumber}), 0)` })
      .from(projectStyleVersions)
      .where(eq(projectStyleVersions.projectId, projectId))
      .all() as unknown as { maxVersion: number }[];
    const nextVersionNumber = (maxRows[0]?.maxVersion ?? 0) + 1;

    const insertedVersion = tx
      .insert(projectStyleVersions)
      .values({
        projectId,
        versionNumber: nextVersionNumber,
        contentSnapshot: JSON.stringify(snapshot),
        compiledText,
        publishedAt: now,
        createdAt: now,
      })
      .run();
    const newVersionId = Number(insertedVersion.lastInsertRowid);

    const pointerRows = tx
      .select()
      .from(projectStyleActivePointers)
      .where(eq(projectStyleActivePointers.projectId, projectId))
      .all() as unknown as ProjectStyleActivePointer[];
    if (pointerRows[0]) {
      tx.update(projectStyleActivePointers)
        .set({ activeVersionId: newVersionId, updatedAt: now })
        .where(eq(projectStyleActivePointers.id, pointerRows[0].id))
        .run();
    } else {
      tx.insert(projectStyleActivePointers).values({ projectId, activeVersionId: newVersionId, updatedAt: now }).run();
    }

    // Retire the Working Draft — cascades its sections/rules.
    tx.delete(projectStyleDrafts).where(eq(projectStyleDrafts.id, draft.id)).run();

    return { kind: "ok" as const, versionNumber: nextVersionNumber };
  });

  if (outcome.kind === "no-draft") return { ok: false, error: "There is no Working Draft to publish." };
  if (outcome.kind === "stale") return { ok: false, error: `This draft was changed elsewhere (current revision ${outcome.currentRevision}). Reload and try again.`, currentRevision: outcome.currentRevision };
  if (outcome.kind === "empty") return { ok: false, error: "Cannot publish an entirely empty Style. Add at least one field or rule." };

  revalidatePath(`/projects/${projectId}/style`);
  return { ok: true, versionNumber: outcome.versionNumber };
}
