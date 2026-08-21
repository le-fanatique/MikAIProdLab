// ---------------------------------------------------------------------------
// actions/bindings.ts — LLMW.ACTION.REGISTRY.1b (B4b)
//
// Resolves each `ActionId` in `registry.ts` to the real, callable Server
// Action it names. `registry.ts` stays declarative (`source: { module,
// export }` is documentation only, no runtime import); this module is the
// one place that actually imports and exposes the seven functions, so an
// `ActionId` can be turned into a callable without a `switch` naming every
// operation — what B5 needs.
//
// Every value below is the action's own export, unmodified: no adapter, no
// wrapper, no `.bind`, no uniform call shape. Signatures stay heterogeneous
// (`returnValue` vs `redirectOnly`, per `registry.ts`'s `response` field),
// and `as const satisfies` preserves each one for callers rather than
// widening them to a common type.
// ---------------------------------------------------------------------------

import {
  updateAssetDetailsInline,
  updateAssetDescriptionFieldInline,
  applyBatchAssetDescriptionDraftsInline,
  updateAssetLightingInline,
} from "@/actions/assets";
import {
  updateShotPrompt,
  updateShotNarrativeContext,
  updateShotNarrativePrompt,
  updateShotLighting,
} from "@/actions/shots";
import { updateSequencePrompt, updateSequenceLighting } from "@/actions/sequences";
import { applyCameraConversions } from "@/actions/llm/cameraConversion";
import { applyGeneratedStory } from "@/actions/llm/story";
import { applyGeneratedOutline } from "@/actions/llm/outlineGeneration";
// LLMW.ACTION.INSERT.1 (B7c-w) — the three insert-operation actions. Same
// shape as updateShotPrompt/updateSequencePrompt above: (formData: FormData)
// => Promise<void>, response observable only through redirect().
import { createGeneratedShots } from "@/actions/llm/sequenceShots";
import { createSelectedAssets } from "@/actions/llm/assetExtraction";
import { createGeneratedSequences } from "@/actions/llm/sequenceGeneration";
// LLMW.ACTION.CASTING.1 (B7h-a) — same shape as the three insert entries
// above: (formData: FormData) => Promise<void>, response observable only
// through redirect(). Added because `ActionId` grew and this module's own
// `satisfies Record<ActionId, …>` (below) forces every member to resolve to
// a real callable — the same mechanical consequence B7c-w's three entries
// had here, not a new decision of this ticket's own.
import { applySelectedCastingSuggestions } from "@/actions/llm/castingSuggestions";
// LLMW.ACTION.INSERT_AT.1 (B11-a) — same shape as the four insert entries
// above: (formData: FormData) => Promise<void>, response observable only
// through redirect(). Added because ActionId grew (types.ts) and this
// module's own `satisfies Record<ActionId, …>` (below) forces every member
// to resolve to a real callable.
import { createShotAtPosition } from "@/actions/llm/shotInsertion";
import type { ActionId } from "../types";

export const ACTION_BINDINGS = {
  updateAssetDetailsInline,
  updateAssetDescriptionFieldInline,
  applyBatchAssetDescriptionDraftsInline,
  updateShotPrompt,
  updateSequencePrompt,
  applyGeneratedStory,
  applyGeneratedOutline,
  updateShotNarrativeContext,
  createGeneratedShots,
  createSelectedAssets,
  createGeneratedSequences,
  applySelectedCastingSuggestions,
  createShotAtPosition,
  updateShotNarrativePrompt,
  updateShotLighting,
  updateSequenceLighting,
  updateAssetLightingInline,
  applyCameraConversions,
} as const satisfies Record<ActionId, (...args: never[]) => Promise<unknown>>;
