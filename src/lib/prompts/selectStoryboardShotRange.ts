// ---------------------------------------------------------------------------
// selectStoryboardShotRange.ts — SEQGEN.STORYBOARD.SHOTRANGE.1
//
// Pure function: no DB, no network, no Date.now()/Math.random(). Generic on
// `T extends { id: number }` so it can be called directly on the ordered
// `shotList` at both call sites (the generate page, the generation action)
// without importing the Drizzle shot row type.
//
// Filters an already-ordered Shot list down to an inclusive [fromShotId,
// toShotId] range, by Shot id — never by position, so a bound can never
// designate a Shot that does not exist. Deliberately narrow in scope: this
// function only decides which Shots survive, in the caller's own order. It
// never touches casting (`resolveSequenceCastReferences`/`shotIds` stay on
// the full Sequence — that is the caller's decision, not this helper's).
// ---------------------------------------------------------------------------

export type StoryboardShotRangeResult<T> = {
  /** Sub-list, inclusive, in input order. Never reordered. */
  shots: T[];
  /** What was actually retained after resolution — null when the range is the full sequence. */
  fromShotId: number | null;
  toShotId: number | null;
  /** true when the output is the input list, unchanged. */
  isFullSequence: boolean;
  warnings: string[];
};

function fullSequenceResult<T>(orderedShots: T[], warnings: string[]): StoryboardShotRangeResult<T> {
  return {
    shots: orderedShots,
    fromShotId: null,
    toShotId: null,
    isFullSequence: true,
    warnings,
  };
}

export function selectStoryboardShotRange<T extends { id: number }>(
  orderedShots: T[],
  fromShotId: number | null,
  toShotId: number | null
): StoryboardShotRangeResult<T> {
  // The default: no bounds at all. Must stay byte-for-byte the current
  // behavior of every caller that never passed a range.
  if (fromShotId === null && toShotId === null) {
    return fullSequenceResult(orderedShots, []);
  }

  // An empty Sequence has no Shot to filter against, and the page already
  // shows its own "no Shots yet" warning — no additional one here.
  if (orderedShots.length === 0) {
    return fullSequenceResult(orderedShots, []);
  }

  const warnings: string[] = [];

  let fromIndex: number | null = null;
  if (fromShotId !== null) {
    const idx = orderedShots.findIndex((s) => s.id === fromShotId);
    if (idx === -1) {
      warnings.push(
        `Shot range start (Shot ${fromShotId}) does not exist in this Sequence; using the first Shot instead.`
      );
    } else {
      fromIndex = idx;
    }
  }

  let toIndex: number | null = null;
  if (toShotId !== null) {
    const idx = orderedShots.findIndex((s) => s.id === toShotId);
    if (idx === -1) {
      warnings.push(
        `Shot range end (Shot ${toShotId}) does not exist in this Sequence; using the last Shot instead.`
      );
    } else {
      toIndex = idx;
    }
  }

  // A bound that is absent, or that named an id resolved to nothing above,
  // both fall back to the Sequence's own border — never a guessed neighbor.
  const resolvedFromIndex = fromIndex ?? 0;
  const resolvedToIndex = toIndex ?? orderedShots.length - 1;

  if (resolvedFromIndex > resolvedToIndex) {
    warnings.push(
      `Shot range start (Shot ${orderedShots[resolvedFromIndex].id}) comes after the range end (Shot ${orderedShots[resolvedToIndex].id}) in this Sequence; using the full Sequence instead.`
    );
    return fullSequenceResult(orderedShots, warnings);
  }

  const shots = orderedShots.slice(resolvedFromIndex, resolvedToIndex + 1);
  const isFullSequence = resolvedFromIndex === 0 && resolvedToIndex === orderedShots.length - 1;

  return {
    shots,
    fromShotId: isFullSequence ? null : orderedShots[resolvedFromIndex].id,
    toShotId: isFullSequence ? null : orderedShots[resolvedToIndex].id,
    isFullSequence,
    warnings,
  };
}
