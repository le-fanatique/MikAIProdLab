// ---------------------------------------------------------------------------
// generationTarget.ts — SEQGEN.STORYBOARD.3
//
// Pure validator: a generation_jobs row must target exactly one of
// shotId/assetId/sequenceId. Application-level rule, not a DB CHECK
// constraint (consistent with every other applicative-only rule in this
// schema — e.g. "at most one approved draft" on storyboardImages). Kept in
// a plain module (not a "use server" actions file) since every export of a
// "use server" file must be an async function.
// ---------------------------------------------------------------------------

export function isSingleGenerationTarget(target: {
  shotId: number | null;
  assetId: number | null;
  sequenceId: number | null;
}): boolean {
  return (
    [target.shotId, target.assetId, target.sequenceId].filter((v) => v !== null).length === 1
  );
}
