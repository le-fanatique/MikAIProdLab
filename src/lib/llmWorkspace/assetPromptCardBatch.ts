// ---------------------------------------------------------------------------
// assetPromptCardBatch.ts — ASSET.PROMPTCARD.BATCH.1
//
// Pure, DB/network-free decision extracted from AssetPromptCardBatchPanel.tsx
// per `.claude/rules/frontend.md` ("keep business logic out of Client
// Components"): whether an Asset's Prompt Card counts as missing — the
// criterion the batch panel's "Select Missing" quick-pick uses to decide
// which Assets to pre-select, and the same criterion that decides the short
// status label shown on each row. One place decides, never two — same
// discipline as `src/lib/projectStyle/assetAlignmentBatch.ts`
// (STYLE.ALIGN.BATCH.1), the model for this module.
// ---------------------------------------------------------------------------

/**
 * True when an Asset's Prompt Card is missing: `null`, empty, or made only
 * of whitespace. Mirrors the write side's own trimming
 * (`updateAssetPromptCardInline` stores an all-whitespace value as `null`),
 * so a Prompt Card this function calls "missing" is never one that write
 * path would actually keep as a value.
 */
export function isPromptCardMissing(promptCard: string | null): boolean {
  if (promptCard === null) return true;
  return promptCard.trim() === "";
}

// ---------------------------------------------------------------------------
// ASSET.PROMPTCARD.BATCH.2 — the "Apply All" decision
//
// Which of the assets the review screen is showing an "Apply All" click
// actually touches, and which of those overwrite an existing Prompt Card.
// Pure and DB/network-free, same discipline as `isPromptCardMissing` above:
// the component calls this, it never refilters the same question itself.
// ---------------------------------------------------------------------------

export type ApplyAllTarget = { id: number; overwrites: boolean };

/**
 * @param order Display order of the review — the order targets are returned in.
 * @param generated Ids whose generation succeeded (a proposal is on screen).
 * @param alreadyApplied Ids already written in this pass — never reapplied.
 * @param hasExistingCard Ids that already carry a Prompt Card before this
 *   pass — applying to one of these overwrites a value.
 */
export function selectApplyAllTargets(
  order: number[],
  generated: ReadonlySet<number>,
  alreadyApplied: ReadonlySet<number>,
  hasExistingCard: ReadonlySet<number>
): ApplyAllTarget[] {
  const targets: ApplyAllTarget[] = [];
  for (const id of order) {
    if (!generated.has(id)) continue;
    if (alreadyApplied.has(id)) continue;
    targets.push({ id, overwrites: hasExistingCard.has(id) });
  }
  return targets;
}
