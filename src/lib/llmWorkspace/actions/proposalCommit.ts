// ---------------------------------------------------------------------------
// actions/proposalCommit.ts — LLMW.PROPOSAL.COMPONENT.1 (B5)
//
// The per-entry adaptation `docs/PROJECT_STATE.md` (B4b) left for B5 to
// define: "That call shape is B5's to define, from what the proposal
// component actually needs." `ACTION_BINDINGS` (B4b) resolves an `ActionId`
// to the action's own unmodified export — heterogeneous on purpose, no
// uniform call shape. This module is the one place that turns
// `ProposalPanel`'s generic draft/field state into each binding's real
// arguments (`response: "returnValue"`) or hidden form fields
// (`response: "redirectOnly"`), typed against
// `Parameters<typeof ACTION_BINDINGS[K]>` so a signature drift on the
// binding fails `tsc`, not a production Approve click.
//
// Covers the seven mono-entity entries and only those — the `entitySet`
// batch action (`applyBatchAssetDescriptionDraftsInline`) has no consumer
// here: `BatchAssetDescriptionEnhancePanel.tsx` stays on `ACTION_BINDINGS`
// directly, out of this ticket's scope (§11.2 "Mode objet uniquement").
// ---------------------------------------------------------------------------

import { preserveAssetBibleField } from "@/lib/prompts/assetBibleDraft";
import { ACTION_BINDINGS } from "./bindings";

// ── assetBible.generate → updateAssetDetailsInline (returnValue) ──────────
//
// The action replaces all five fields on every call (registry behaviour 3).
// `assetBible.generate` only produces three of them — `description` and
// `notes` are carried through untouched, and the two generated-but-editable
// fields fall back to their pre-generation value when the user clears them,
// exactly as `AssetBibleEnhancePanel`'s own `handleApply` did before this
// ticket.
export function buildAssetBibleCommitArgs(input: {
  assetId: number;
  projectId: number;
  description: string | null;
  notes: string | null;
  existingVisualIdentity: string | null;
  existingUsageRules: string | null;
  existingForbiddenVariations: string | null;
  visualIdentity: string;
  usageRules: string;
  forbiddenVariations: string;
}): Parameters<typeof ACTION_BINDINGS.updateAssetDetailsInline> {
  return [
    {
      assetId: input.assetId,
      projectId: input.projectId,
      description: input.description ?? "",
      notes: input.notes ?? "",
      visualIdentity: preserveAssetBibleField(input.existingVisualIdentity ?? "", input.visualIdentity),
      usageRules: preserveAssetBibleField(input.existingUsageRules ?? "", input.usageRules),
      forbiddenVariations: preserveAssetBibleField(input.existingForbiddenVariations ?? "", input.forbiddenVariations),
    },
  ];
}

// ── assetDescription.generate / assetNotes.generate → updateAssetDescriptionFieldInline (returnValue) ──
//
// The action itself carries `mode: "replace" | "append"` — one binding, two
// Approve variants (`ProposalPanel` renders both as separate approve
// actions calling this same adapter with a different `mode`).
export function buildAssetDescriptionFieldCommitArgs(input: {
  assetId: number;
  projectId: number;
  field: "description" | "notes";
  mode: "replace" | "append";
  content: string;
}): Parameters<typeof ACTION_BINDINGS.updateAssetDescriptionFieldInline> {
  return [
    {
      assetId: input.assetId,
      projectId: input.projectId,
      field: input.field,
      mode: input.mode,
      content: input.content.trim(),
    },
  ];
}

// ── story.generate → applyGeneratedStory (returnValue, positional) ────────
export function buildApplyGeneratedStoryArgs(
  projectId: number,
  story: string
): Parameters<typeof ACTION_BINDINGS.applyGeneratedStory> {
  return [projectId, story];
}

// ── outline.generate → applyGeneratedOutline (returnValue, positional) ────
export function buildApplyGeneratedOutlineArgs(
  projectId: number,
  outline: string
): Parameters<typeof ACTION_BINDINGS.applyGeneratedOutline> {
  return [projectId, outline];
}

// ── shotPrompt.assist → updateShotPrompt (redirectOnly) ────────────────────
//
// `updateShotPrompt` stays `(formData: FormData) => Promise<void>` with
// `redirect()` on every path (registry behaviour 6) — `ProposalPanel` never
// calls it directly, it renders `<form action={ACTION_BINDINGS.updateShotPrompt}>`
// with these hidden fields. `append` is not a mode the action understands;
// the caller pre-computes the final text exactly as
// `ShotPromptLLMAssistPanel` did before this ticket
// (`existing.trim() + "\n\n" + draft.trim()`).
export function buildUpdateShotPromptHiddenFields(input: {
  projectId: number;
  sequenceId: number;
  shotId: number;
  shotPrompt: string;
  returnTo: string;
}): Record<string, string> {
  return {
    projectId: String(input.projectId),
    sequenceId: String(input.sequenceId),
    shotId: String(input.shotId),
    shotPrompt: input.shotPrompt,
    returnTo: input.returnTo,
  };
}

// ── sequencePrompt.assist → updateSequencePrompt (redirectOnly) ───────────
export function buildUpdateSequencePromptHiddenFields(input: {
  projectId: number;
  sequenceId: number;
  sequencePrompt: string;
  returnTo: string;
}): Record<string, string> {
  return {
    projectId: String(input.projectId),
    sequenceId: String(input.sequenceId),
    sequencePrompt: input.sequencePrompt,
    returnTo: input.returnTo,
  };
}
