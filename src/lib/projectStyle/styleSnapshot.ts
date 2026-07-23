// ---------------------------------------------------------------------------
// styleSnapshot.ts — STYLE.1.A
//
// The canonical, DB-independent shape of "everything a Project Style
// contains" — shared between the mutable Working Draft (read fresh from
// project_style_drafts/_sections/_rules on every page load) and an
// immutable published version's `contentSnapshot` JSON column. Building
// both from this one type guarantees the compiler (compileStyleSnapshot.ts)
// never has two different input shapes to handle.
// ---------------------------------------------------------------------------

export type StylePillar = "world" | "visual";
export type StyleRuleStrength = "Required" | "Preferred" | "Avoid";
export type StyleRuleStatus = "approved" | "disabled";

export type StyleSectionSnapshot = {
  heading: string;
  content: string;
};

export type StylePillarSnapshot = {
  generalDirection: string | null;
  negativeConstraints: string | null;
  /** Ordered as stored (orderIndex ascending) — the compiler trusts this order verbatim, it never re-sorts. */
  sections: StyleSectionSnapshot[];
};

export type StyleRuleSnapshot = {
  instruction: string;
  pillar: StylePillar | null;
  section: string | null;
  category: string | null;
  strength: StyleRuleStrength | null;
  applicability: string | null;
  provenanceNotes: string | null;
  status: StyleRuleStatus;
};

export type StyleSnapshot = {
  directionBrief: string | null;
  world: StylePillarSnapshot;
  visual: StylePillarSnapshot;
  /** Ordered as stored (orderIndex ascending) — the compiler trusts this order verbatim, it never re-sorts. */
  rules: StyleRuleSnapshot[];
};

export const EMPTY_STYLE_SNAPSHOT: StyleSnapshot = {
  directionBrief: null,
  world: { generalDirection: null, negativeConstraints: null, sections: [] },
  visual: { generalDirection: null, negativeConstraints: null, sections: [] },
  rules: [],
};
