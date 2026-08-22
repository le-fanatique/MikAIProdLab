// ---------------------------------------------------------------------------
// resolveExtractionShotRange.ts — SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1
//
// Pure function: no DB, no network, no Date.now()/Math.random(). Decides
// which Shots of a Sequence a Storyboard extraction should map its regions
// against, given an optional inherited Shot range (read from the source
// job's GenerationSnapshot) and an optional explicit override (the user's
// own From/To choice on the extraction page).
//
// The prime constraint, stated by the user on 2026-08-22: a storyboard image
// uploaded by hand has no job, so no inherited range — that path (both
// inputs absent) MUST stay the most silent one of all: full Sequence, zero
// warnings, never a block.
//
// Explicit choice semantics are deliberately NOT reimplemented here — they
// are `selectStoryboardShotRange`'s (`src/lib/prompts/selectStoryboardShotRange.ts`),
// reused verbatim, so this feature and the generation-time Shot range can
// never diverge on what "an inclusive [from, to] range" means.
// ---------------------------------------------------------------------------

import { selectStoryboardShotRange } from "@/lib/prompts/selectStoryboardShotRange";

export type ExtractionShotRangeSource = "inherited" | "explicit" | "full-sequence";

export type ExtractionShotRangeExplicitChoice = {
  fromShotId: number | null;
  toShotId: number | null;
};

export type ResolvedExtractionShotRange = {
  /** The Shots to match, in Sequence order. Empty only when the Sequence itself has no Shot. */
  shotIdsInOrder: number[];
  source: ExtractionShotRangeSource;
  /** Inherited ids that no longer exist in this Sequence — never silently dropped. */
  droppedShotIds: number[];
  warnings: string[];
};

export function resolveExtractionShotRange<T extends { id: number }>(
  orderedShots: T[],
  inheritedShotIds: number[] | null,
  explicit: ExtractionShotRangeExplicitChoice | null
): ResolvedExtractionShotRange {
  // A Sequence with no Shot has nothing to resolve against — the page
  // already surfaces its own "no Shots yet" state, no extra warning here.
  if (orderedShots.length === 0) {
    return { shotIdsInOrder: [], source: "full-sequence", droppedShotIds: [], warnings: [] };
  }

  // The explicit choice always wins. An object with both bounds null (e.g.
  // the range picker's own "First Shot"/"Last Shot" defaults) carries no
  // actual choice and is treated exactly like no explicit input at all.
  const hasExplicitChoice = explicit !== null && (explicit.fromShotId !== null || explicit.toShotId !== null);
  if (hasExplicitChoice) {
    const result = selectStoryboardShotRange(orderedShots, explicit!.fromShotId, explicit!.toShotId);
    return {
      shotIdsInOrder: result.shots.map((s) => s.id),
      source: result.isFullSequence ? "full-sequence" : "explicit",
      droppedShotIds: [],
      warnings: result.warnings,
    };
  }

  // No explicit choice — fall back to the inherited range, if any.
  if (!inheritedShotIds || inheritedShotIds.length === 0) {
    return {
      shotIdsInOrder: orderedShots.map((s) => s.id),
      source: "full-sequence",
      droppedShotIds: [],
      warnings: [],
    };
  }

  const existingIds = new Set(orderedShots.map((s) => s.id));
  const droppedShotIds = inheritedShotIds.filter((id) => !existingIds.has(id));
  const survivingIds = new Set(inheritedShotIds.filter((id) => existingIds.has(id)));

  if (survivingIds.size === 0) {
    // The heritage is entirely dead — never guess what it meant, fall back
    // to the full Sequence instead of an empty (and unusable) mapping.
    return {
      shotIdsInOrder: orderedShots.map((s) => s.id),
      source: "full-sequence",
      droppedShotIds,
      warnings: [
        "Inherited Shot range no longer matches any Shot in this Sequence; using the full Sequence instead.",
      ],
    };
  }

  // Sequence order, not the inherited array's own order — a reorder between
  // generation and extraction must never silently reinterpret the range.
  const shotIdsInOrder = orderedShots.map((s) => s.id).filter((id) => survivingIds.has(id));

  const warnings: string[] = [];
  if (droppedShotIds.length > 0) {
    warnings.push(
      `Inherited Shot range includes ${droppedShotIds.length} Shot id${droppedShotIds.length !== 1 ? "s" : ""} that no longer exist in this Sequence: ${droppedShotIds.join(", ")}.`
    );
  }

  return { shotIdsInOrder, source: "inherited", droppedShotIds, warnings };
}
