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
} from "@/actions/assets";
import { updateShotPrompt } from "@/actions/shots";
import { updateSequencePrompt } from "@/actions/sequences";
import { applyGeneratedStory } from "@/actions/llm/story";
import { applyGeneratedOutline } from "@/actions/llm/outlineGeneration";
import type { ActionId } from "../types";

export const ACTION_BINDINGS = {
  updateAssetDetailsInline,
  updateAssetDescriptionFieldInline,
  applyBatchAssetDescriptionDraftsInline,
  updateShotPrompt,
  updateSequencePrompt,
  applyGeneratedStory,
  applyGeneratedOutline,
} as const satisfies Record<ActionId, (...args: never[]) => Promise<unknown>>;
