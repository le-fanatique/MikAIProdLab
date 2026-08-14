// Pure computation of the visible outcome of a batch-apply call
// (`ACTION_BINDINGS.applyBatchAssetDescriptionDraftsInline`). Kept out of
// `BatchAssetDescriptionEnhancePanel.tsx` per `.claude/rules/frontend.md`
// ("keep business logic out of Client Components"), and because the "nothing
// applied" case is close to impossible to provoke from a real browser — the
// panel only lists Assets from the current project, and every one of them
// would have to be refused. A pure function is the only way to prove it.
//
// Contract this relies on, arbitrated 2026-08-13 in
// `src/lib/llmWorkspace/actions/registry.ts` and NOT corrected here:
//   - the underlying action is not atomic (one UPDATE per item);
//   - it answers `ok: true` with `applied: []` when every item is refused.
// This module only decides what the interface says about that answer.

export type BatchApplyItemResult = {
  assetId: number;
  descriptionApplied: boolean;
  notesApplied: boolean;
};

export type BatchApplyItemError = {
  assetId: number;
  error: string;
};

export type BatchApplyOutcomeStatus = "all" | "partial" | "none";
export type BatchApplyOutcomeTone = "success" | "warning" | "error";

export type BatchApplyOutcome = {
  status: BatchApplyOutcomeStatus;
  tone: BatchApplyOutcomeTone;
  message: string;
  failures: BatchApplyItemError[];
};

const TONE_CLASS: Record<BatchApplyOutcomeTone, string> = {
  success: "text-[#6b9e72]",
  warning: "text-[#b89a5a]",
  error: "text-[#cf7b6b]",
};

export function batchApplyOutcomeToneClass(tone: BatchApplyOutcomeTone): string {
  return TONE_CLASS[tone];
}

/**
 * Resolves the batch-apply issue from the raw result of
 * `applyBatchAssetDescriptionDraftsInline`: `applied` (one entry per item the
 * action actually wrote — see note below) and `errors` (one entry per item it
 * refused), plus the `replace`/`append` mode used for the call.
 *
 * Note on what an `applied` entry means: every entry the action pushes to
 * `applied` corresponds to a real `UPDATE` that wrote at least one column.
 * The only way for both `descriptionApplied` and `notesApplied` to be false
 * for an item is for both drafts to be empty after trimming, and that case is
 * routed to `errors` ("Both drafts are empty.") before the item ever reaches
 * `applied` — see `src/actions/assets.ts:212-215`. So `applied.length` is a
 * correct count of Assets actually written, not merely attempted.
 */
export function resolveBatchApplyOutcome(
  applied: BatchApplyItemResult[],
  errors: BatchApplyItemError[],
  mode: "replace" | "append"
): BatchApplyOutcome {
  const modeLabel = mode === "replace" ? "replaced" : "appended";
  const total = applied.length + errors.length;
  const plural = (n: number) => (n === 1 ? "" : "s");

  if (applied.length > 0 && errors.length === 0) {
    return {
      status: "all",
      tone: "success",
      message: `Batch ${modeLabel}: ${applied.length} asset${plural(applied.length)} updated.`,
      failures: [],
    };
  }

  if (applied.length > 0 && errors.length > 0) {
    return {
      status: "partial",
      tone: "warning",
      message: `Batch ${modeLabel}: ${applied.length} of ${total} assets updated. ${errors.length} failed.`,
      failures: errors,
    };
  }

  return {
    status: "none",
    tone: "error",
    message: `No changes were saved. ${errors.length} asset${plural(errors.length)} failed.`,
    failures: errors,
  };
}
