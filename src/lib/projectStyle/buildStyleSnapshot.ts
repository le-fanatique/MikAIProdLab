// ---------------------------------------------------------------------------
// buildStyleSnapshot.ts — STYLE.1.A
//
// Pure assembly of a StyleSnapshot from already-fetched draft/section/rule
// rows. Kept out of src/actions/projectStyle.ts ("use server") because
// every export of a Server Actions file must be an async function — this
// helper is neither async nor a mutation, just a synchronous transform.
// ---------------------------------------------------------------------------

import type { ProjectStyleDraft, ProjectStyleSection, ProjectStyleRule } from "@/db/schema";
import type { StyleSnapshot, StylePillar, StyleRuleStrength, StyleRuleStatus } from "./styleSnapshot";

export function buildStyleSnapshotFromRows(
  draft: Pick<
    ProjectStyleDraft,
    "directionBrief" | "worldGeneralDirection" | "worldNegativeConstraints" | "visualGeneralDirection" | "visualNegativeConstraints"
  >,
  sections: ProjectStyleSection[],
  rules: ProjectStyleRule[]
): StyleSnapshot {
  const byPillar = (pillar: StylePillar) =>
    sections
      .filter((s) => s.pillar === pillar)
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => ({ heading: s.heading, content: s.content }));

  const orderedRules = rules
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((r) => ({
      instruction: r.instruction,
      pillar: (r.pillar as StylePillar | null) ?? null,
      section: r.section,
      category: r.category,
      strength: (r.strength as StyleRuleStrength | null) ?? null,
      applicability: r.applicability,
      provenanceNotes: r.provenanceNotes,
      status: r.status as StyleRuleStatus,
    }));

  return {
    directionBrief: draft.directionBrief,
    world: {
      generalDirection: draft.worldGeneralDirection,
      negativeConstraints: draft.worldNegativeConstraints,
      sections: byPillar("world"),
    },
    visual: {
      generalDirection: draft.visualGeneralDirection,
      negativeConstraints: draft.visualNegativeConstraints,
      sections: byPillar("visual"),
    },
    rules: orderedRules,
  };
}
