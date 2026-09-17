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
