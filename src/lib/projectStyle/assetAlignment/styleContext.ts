// ---------------------------------------------------------------------------
// styleContext.ts — STYLE.1.F.CORE
//
// Pure. The one shared deterministic Asset Style context helper serving
// Enhance Description, Enhance Asset Bible and explicit Alignment — none of
// the three re-implements pillar filtering or compilation. Reuses
// `compileStyleSnapshot` (the sole compiler, STYLE.1.A) and
// `isApplicableToConsumer` (STYLE.1.E.CORE.1) unchanged; this module only
// isolates the two product pillars into two separate compiled segments
// (compileGenerationStyleSegment merges them into one block, which loses
// the "World & Design Language" vs "Visual Treatment" distinction the
// ticket requires be preserved) plus a separate Asset-applicable approved
// rules segment.
// ---------------------------------------------------------------------------

import { EMPTY_STYLE_SNAPSHOT, type StyleSnapshot } from "../styleSnapshot";
import { compileStyleSnapshot } from "../compileStyleSnapshot";
import { isApplicableToConsumer } from "../generationStyleSource";

export type AssetStyleSegments = {
  /** Compiled "World & Design Language:\n..." block, or "" when the pillar is empty. */
  worldSegment: string;
  /** Compiled "Visual Treatment:\n..." block, or "" when the pillar is empty. */
  visualSegment: string;
  /** Compiled "Style Rules:\n- ..." block over only the rules applicable to the "asset" consumer, or "" when none apply. */
  rulesSegment: string;
};

/** True when every segment is empty — the exact condition under which a Style-aware prompt builder must fall back to its pre-Style, byte-identical output. */
export function isAssetStyleSegmentsEmpty(segments: AssetStyleSegments): boolean {
  return segments.worldSegment === "" && segments.visualSegment === "" && segments.rulesSegment === "";
}

/** Pure. Same snapshot always yields the exact same three segments — no DB, no clock, no randomness. */
export function compileAssetStyleSegments(snapshot: StyleSnapshot): AssetStyleSegments {
  const worldSegment = compileStyleSnapshot({ ...EMPTY_STYLE_SNAPSHOT, world: snapshot.world });
  const visualSegment = compileStyleSnapshot({ ...EMPTY_STYLE_SNAPSHOT, visual: snapshot.visual });
  const rulesSegment = compileStyleSnapshot({
    ...EMPTY_STYLE_SNAPSHOT,
    rules: snapshot.rules.filter((rule) => isApplicableToConsumer(rule.applicability, "asset")),
  });

  return { worldSegment, visualSegment, rulesSegment };
}
