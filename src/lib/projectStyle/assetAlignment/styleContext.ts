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
//
// SHOTPROMPT.STYLE.1 — `rulesPositiveSegment`/`rulesAvoidSegment` split
// `rulesSegment` at the snapshot's own `strength` field (the same polarity
// split `compileStyleSnapshot` already performs internally), never by
// parsing `rulesSegment`'s compiled text. `rulesSegment` itself is kept
// unchanged for its existing callers (Enhance Description/Notes/Bible),
// which still want World + Rules (Avoid included) as one block.
// `rulesPositiveSegment`/`rulesAvoidSegment` themselves keep their own
// `Style Rules:`/`Avoid:` heading — `resolveProjectStyleTextForComposition`'s
// `joinProjectStyleTextForComposition` reconstructs the exact legacy joined
// string from them for the Sequence Storyboard package, which still wants
// those headings (SHOTPROMPT.STYLE.1 §5 left it out of scope).
//
// SHOTPROMPT.RENDER.1 — adds `rulesPositiveBulletsOnly`/`rulesAvoidBulletsOnly`,
// the same asset-applicable rules with **no heading at all**. The Shot
// composer's `Style: `/`Constraints:` labels already name the block
// (`resolveProjectStyleTextForComposition`'s `styleText`/`avoidText`), so
// reusing the headed segments there duplicated it verbatim on the author's
// real payload (`Style: Style Rules:`, `Constraints: Avoid:`). A second
// entry point rather than an in-place edit, precisely because the headed
// segments still have a live, correct consumer (the Sequence package's
// legacy join) that this ticket does not touch.
// ---------------------------------------------------------------------------

import { EMPTY_STYLE_SNAPSHOT, type StyleSnapshot } from "../styleSnapshot";
import {
  compileStyleSnapshot,
  compileStyleRuleBulletsOnly,
  compileAvoidRuleBulletsOnly,
} from "../compileStyleSnapshot";
import { isApplicableToConsumer } from "../generationStyleSource";

export type AssetStyleSegments = {
  /** Compiled "World & Design Language:\n..." block, or "" when the pillar is empty. */
  worldSegment: string;
  /** Compiled "Visual Treatment:\n..." block, or "" when the pillar is empty. */
  visualSegment: string;
  /** Compiled "Style Rules:\n- ..." block over only the rules applicable to the "asset" consumer (Required/Preferred/undeclared AND Avoid together), or "" when none apply. */
  rulesSegment: string;
  /** SHOTPROMPT.STYLE.1 — same asset-applicable rules as `rulesSegment`, `Avoid`-strength rules excluded — compiled "Style Rules:\n- ..." block, or "" when none apply. */
  rulesPositiveSegment: string;
  /** SHOTPROMPT.STYLE.1 — same asset-applicable rules as `rulesSegment`, only the `Avoid`-strength ones — compiled "Avoid:\n- ..." block, or "" when none apply. */
  rulesAvoidSegment: string;
  /**
   * SHOTPROMPT.RENDER.1 — same rules as `rulesPositiveSegment`, **bullet
   * lines only, no leading `Style Rules:` heading**. For a caller that
   * already supplies its own label. `""` when none apply.
   */
  rulesPositiveBulletsOnly: string;
  /**
   * SHOTPROMPT.RENDER.1 — same rules as `rulesAvoidSegment`, **bullet lines
   * only, no leading `Avoid:` heading**. For a caller that already supplies
   * its own label. `""` when none apply.
   */
  rulesAvoidBulletsOnly: string;
};

/** True when every segment is empty — the exact condition under which a Style-aware prompt builder must fall back to its pre-Style, byte-identical output. */
export function isAssetStyleSegmentsEmpty(segments: AssetStyleSegments): boolean {
  return segments.worldSegment === "" && segments.visualSegment === "" && segments.rulesSegment === "";
}

/** Pure. Same snapshot always yields the exact same segments — no DB, no clock, no randomness. */
export function compileAssetStyleSegments(snapshot: StyleSnapshot): AssetStyleSegments {
  const worldSegment = compileStyleSnapshot({ ...EMPTY_STYLE_SNAPSHOT, world: snapshot.world });
  const visualSegment = compileStyleSnapshot({ ...EMPTY_STYLE_SNAPSHOT, visual: snapshot.visual });
  const applicableRules = snapshot.rules.filter((rule) => isApplicableToConsumer(rule.applicability, "asset"));
  const rulesSegment = compileStyleSnapshot({ ...EMPTY_STYLE_SNAPSHOT, rules: applicableRules });
  const rulesPositiveSegment = compileStyleSnapshot({
    ...EMPTY_STYLE_SNAPSHOT,
    rules: applicableRules.filter((rule) => rule.strength !== "Avoid"),
  });
  const rulesAvoidSegment = compileStyleSnapshot({
    ...EMPTY_STYLE_SNAPSHOT,
    rules: applicableRules.filter((rule) => rule.strength === "Avoid"),
  });
  // SHOTPROMPT.RENDER.1 — heading-less variants, same partition, for the
  // Shot composer's `Style: `/`Constraints:` labels.
  const rulesPositiveBulletsOnly = compileStyleRuleBulletsOnly(applicableRules);
  const rulesAvoidBulletsOnly = compileAvoidRuleBulletsOnly(applicableRules);

  return {
    worldSegment,
    visualSegment,
    rulesSegment,
    rulesPositiveSegment,
    rulesAvoidSegment,
    rulesPositiveBulletsOnly,
    rulesAvoidBulletsOnly,
  };
}
