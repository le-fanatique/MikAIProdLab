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
import { ACTION_REGISTRY } from "./registry";

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

// ── shots.fromSequence → createGeneratedShots (redirectOnly) ──────────────
//
// LLMW.PROPOSAL.LIST.1 (B7d). Same model as
// `buildUpdateShotPromptHiddenFields` above: `createGeneratedShots` stays
// `(formData: FormData) => Promise<void>` with `redirect()` on every path
// (registry behaviour 6) — the four hidden field names are read verbatim off
// `src/actions/llm/sequenceShots.ts:131-136`. `shotsJson` is not built here —
// that serialization belongs to `buildListSelectionPayload` (`benchRun.ts`),
// which the caller runs first.
export function buildCreateGeneratedShotsHiddenFields(input: {
  projectId: number;
  sequenceId: number;
  returnTo: string;
  shotsJson: string;
}): Record<string, string> {
  return {
    projectId: String(input.projectId),
    sequenceId: String(input.sequenceId),
    returnTo: input.returnTo,
    shotsJson: input.shotsJson,
  };
}

// ── sequences.fromOutline → createGeneratedSequences (redirectOnly) ───────
//
// LLMW.MIGRATE.LIST.2 (B7g-m). Same model as
// `buildCreateGeneratedShotsHiddenFields` above: `createGeneratedSequences`
// stays `(formData: FormData) => Promise<void>` with `redirect()` on every
// path (registry behaviour 6) — the three hidden field names are read
// verbatim off `src/actions/llm/sequenceGeneration.ts:127,131`.
// `sequencesJson` is not built here — that serialization belongs to
// `buildListSelectionPayload` (`benchRun.ts`), which the caller runs first.
export function buildCreateGeneratedSequencesHiddenFields(input: {
  projectId: number;
  returnTo: string;
  sequencesJson: string;
}): Record<string, string> {
  return {
    projectId: String(input.projectId),
    returnTo: input.returnTo,
    sequencesJson: input.sequencesJson,
  };
}

// ── assets.fromProject → createSelectedAssets (redirectOnly) ──────────────
//
// LLMW.MIGRATE.LIST.3 (B7f-m). Same model as
// `buildCreateGeneratedSequencesHiddenFields` above: `createSelectedAssets`
// stays `(formData: FormData) => Promise<void>` with `redirect()` on every
// path (registry behaviour 6) — the three hidden field names are read
// verbatim off `src/actions/llm/assetExtraction.ts:172,176`.
// `selectedJson` is not built here — that serialization belongs to
// `buildListSelectionPayload` (`benchRun.ts`), which the caller runs first.
export function buildCreateSelectedAssetsHiddenFields(input: {
  projectId: number;
  returnTo: string;
  selectedJson: string;
}): Record<string, string> {
  return {
    projectId: String(input.projectId),
    returnTo: input.returnTo,
    selectedJson: input.selectedJson,
  };
}

// ── casting.fromSequence → applySelectedCastingSuggestions (redirectOnly) ─
//
// LLMW.MIGRATE.LIST.4 (B7h-m). Same model as
// `buildCreateSelectedAssetsHiddenFields` above: `applySelectedCastingSuggestions`
// stays `(formData: FormData) => Promise<void>` with `redirect()` on every
// path (registry behaviour 6) — the four hidden field names are read verbatim
// off `src/actions/llm/castingSuggestions.ts:284-289`. `selectedJson` is not
// built here — that serialization belongs to `buildListSelectionPayload`
// (`benchRun.ts`), which the caller runs first.
export function buildApplySelectedCastingSuggestionsHiddenFields(input: {
  projectId: number;
  sequenceId: number;
  returnTo: string;
  selectedJson: string;
}): Record<string, string> {
  return {
    projectId: String(input.projectId),
    sequenceId: String(input.sequenceId),
    returnTo: input.returnTo,
    selectedJson: input.selectedJson,
  };
}

// ── shot.retakeDirected → updateShotNarrativeContext (returnValue) ────────
//
// LLMW.UC2.RETAKE.1 (B9b), §4.3's piège: `shot.retakeDirected` declares
// `output.require: "any"` — the model may leave any of the three fields
// empty — but `updateShotNarrativeContext` replaces all three on every call
// (`set({ ...data })`, registry `writeSemantics: "replace"`). The motif is
// `preservedAssetDetailColumns` + `buildAssetBibleCommitArgs` (B6c1):
// derive which columns need fallback from `ACTION_REGISTRY`'s own
// `columns.written` (not a hard-coded three-name list), and fall back to the
// existing row's value — via `preserveAssetBibleField`, which is generic
// (existing/applied strings) despite its name, not asset-Bible-specific — for
// any column whose applied value is blank. Every one of this action's three
// written columns is always declared by this descriptor's `output.fields`
// (unlike `updateAssetDetailsInline`, where `assetBible.generate` never
// declares two of its five columns at all) — so unlike
// `preservedAssetDetailColumns`, the preservation this operation needs is
// per-value (an empty string the model chose not to fill), not per-column
// declaration. Both mechanisms fall back to the same existing-row value; only
// the trigger differs.
export function buildShotRetakeCommitArgs(input: {
  shotId: number;
  sequenceId: number;
  projectId: number;
  existing: { description: string | null; actionPitch: string | null; cameraPitch: string | null };
  applied: { description: string; actionPitch: string; cameraPitch: string };
}): Parameters<typeof ACTION_BINDINGS.updateShotNarrativeContext> {
  const existingByColumn: Record<string, string | null> = {
    description: input.existing.description,
    actionPitch: input.existing.actionPitch,
    cameraPitch: input.existing.cameraPitch,
  };
  const appliedByColumn: Record<string, string> = {
    description: input.applied.description,
    actionPitch: input.applied.actionPitch,
    cameraPitch: input.applied.cameraPitch,
  };

  const merged: Record<string, string | null> = {};
  for (const column of ACTION_REGISTRY.updateShotNarrativeContext.columns.written) {
    const preserved = preserveAssetBibleField(existingByColumn[column] ?? "", appliedByColumn[column] ?? "");
    merged[column] = preserved.trim() ? preserved.trim() : null;
  }

  return [
    input.shotId,
    input.sequenceId,
    input.projectId,
    {
      description: merged.description ?? null,
      actionPitch: merged.actionPitch ?? null,
      cameraPitch: merged.cameraPitch ?? null,
    },
  ];
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
