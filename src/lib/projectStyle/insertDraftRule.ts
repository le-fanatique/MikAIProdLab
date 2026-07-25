// ---------------------------------------------------------------------------
// insertDraftRule.ts — STYLE.1.C.CORE retake
//
// The ONE real shared synchronous step for inserting an approved rule row
// into an existing Working Draft and bumping its revision. Extracted so
// `addRuleAction` (manual authoring, STYLE.1.A) and
// `approveResearchCandidateRuleAction` (Research approval, STYLE.1.C.CORE)
// call the exact same code — never two independently-maintained copies that
// can silently diverge in validation/normalization/ordering.
//
// Deliberately does NOT look up or create the Working Draft itself: the two
// callers have genuinely different draft-acquisition contracts (manual
// authoring may create a draft on first write when the caller's
// `expectedRevision` is `null`; Research approval must NEVER create a draft
// — it fails outright when none exists, per
// docs/PROJECT_STYLE_RESEARCH_ARCHITECTURE.md §8 "If the Working Draft does
// not exist, approval fails without creating one"). Each caller resolves
// (or refuses to resolve) the draft row on its own terms, then hands the
// already-validated `{ id, revision }` pair here for the shared insert+bump
// step — the one piece of logic that must never diverge.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projectStyleRules, projectStyleDrafts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { StylePillar, StyleRuleStrength } from "@/lib/projectStyle/styleSnapshot";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type InsertDraftRuleFields = {
  instruction: string;
  pillar: StylePillar | null;
  section: string | null;
  category: string | null;
  strength: StyleRuleStrength | null;
  applicability: string | null;
  provenanceNotes: string | null;
};

export type InsertDraftRuleResult = {
  ruleId: number;
  orderIndex: number;
  newRevision: number;
};

/**
 * Inserts one `approved` rule row at the next order position of `draft.id`
 * and bumps the draft's revision by exactly 1, inside the caller's own
 * transaction. The caller MUST have already verified `draft.revision`
 * against its own expected/CAS value — this function trusts the `draft` it
 * is given and performs no revision check of its own.
 */
export function insertApprovedRuleIntoDraft(
  tx: Tx,
  draft: { id: number; revision: number },
  fields: InsertDraftRuleFields,
  timestamp: string
): InsertDraftRuleResult {
  const siblings = tx
    .select({ maxOrder: sql<number>`COALESCE(MAX(${projectStyleRules.orderIndex}), -1)` })
    .from(projectStyleRules)
    .where(eq(projectStyleRules.draftId, draft.id))
    .all() as unknown as { maxOrder: number }[];
  const nextOrder = (siblings[0]?.maxOrder ?? -1) + 1;

  const inserted = tx
    .insert(projectStyleRules)
    .values({
      draftId: draft.id,
      instruction: fields.instruction,
      pillar: fields.pillar,
      section: fields.section,
      category: fields.category,
      strength: fields.strength,
      applicability: fields.applicability,
      provenanceNotes: fields.provenanceNotes,
      status: "approved",
      orderIndex: nextOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  const newRevision = draft.revision + 1;
  tx.update(projectStyleDrafts)
    .set({ revision: newRevision, updatedAt: timestamp })
    .where(eq(projectStyleDrafts.id, draft.id))
    .run();

  return {
    ruleId: Number(inserted.lastInsertRowid),
    orderIndex: nextOrder,
    newRevision,
  };
}
