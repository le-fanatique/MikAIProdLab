// ---------------------------------------------------------------------------
// generationTarget.ts — SEQGEN.STORYBOARD.3, widened by STYLE.1.G.CORE.1
//
// Pure validator: a generation_jobs row must target exactly one of
// shotId/assetId/sequenceId/lookTestId. Application-level rule, not a DB
// CHECK constraint (consistent with every other applicative-only rule in
// this schema — e.g. "at most one approved draft" on storyboardImages).
// Kept in a plain module (not a "use server" actions file) since every
// export of a "use server" file must be an async function.
//
// STYLE.1.G.CORE.1 — `lookTestId` is optional and defaults to `null` so
// every existing call site (`isSingleGenerationTarget({shotId, assetId:
// null, sequenceId: null})`) keeps type-checking and behaving identically
// without modification. This stays the ONE canonical target validator —
// widening it here (rather than adding a second, Look-aware validator)
// means a row that somehow carried both e.g. `shotId` and `lookTestId`
// fails this check exactly like any other multi-target row always has.
// ---------------------------------------------------------------------------

export function isSingleGenerationTarget(target: {
  shotId: number | null;
  assetId: number | null;
  sequenceId: number | null;
  lookTestId?: number | null;
}): boolean {
  return (
    [target.shotId, target.assetId, target.sequenceId, target.lookTestId ?? null].filter((v) => v !== null).length === 1
  );
}
