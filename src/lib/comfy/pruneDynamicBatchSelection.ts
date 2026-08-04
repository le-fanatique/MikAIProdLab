// ---------------------------------------------------------------------------
// pruneDynamicBatchSelection.ts — SEQGEN.STORYBOARD.CASTING.FIX1 (retake).
//
// Pure function: no DB, no browser, no network. The single place that
// decides which Dynamic Batch/Direct Repeatable selection ids survive a
// change to the casting selection they were drawn from — used identically
// server-side (generate/page.tsx's SSR `batchSelectedIds`) and client-side
// (StoryboardAssetsPanel's same-tick URL + sessionStorage reconciliation),
// so the two can never diverge into two different reconciliation rules.
// ---------------------------------------------------------------------------

/**
 * Keeps only the batch ids that are still present in `allowedIds` (the
 * current casting selection), in their existing order. Never adds an id
 * that wasn't already in `currentIds` — a newly added casting reference
 * never auto-joins an existing batch selection; "Add From Casting" is the
 * deliberate action for that.
 */
export function pruneDynamicBatchIds(currentIds: string[], allowedIds: string[]): string[] {
  const allowed = new Set(allowedIds);
  return currentIds.filter((id) => allowed.has(id));
}
