// ---------------------------------------------------------------------------
// descriptors/index.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1) / 1b (B1b-2)
//
// The descriptor table, indexed by `id`. B1b-1 delivered three entries;
// B1b-2 adds the remaining five, per
// `docs/LLM_WORKSPACE_ARCHITECTURE.md` §10.1's settled migration order — all
// eight flat-JSON operations of Phase B are now described.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { storyGenerateDescriptor } from "./story";
import { outlineGenerateDescriptor } from "./outline";
import { sequencePromptAssistDescriptor } from "./sequencePrompt";
import { assetBibleGenerateDescriptor } from "./assetBible";
import { assetDescriptionGenerateDescriptor } from "./assetDescription";
import { assetNotesGenerateDescriptor } from "./assetNotes";
import { assetDescriptionBatchDescriptor } from "./assetDescriptionBatch";
import { shotPromptAssistDescriptor } from "./shotPrompt";
import { shotRetakeDirectedDescriptor } from "./shotRetakeDirected";
import { assetRetakeDirectedDescriptor } from "./assetRetakeDirected";
import { shotInsertDirectedDescriptor } from "./shotInsertDirected";
import { shotsFromSequenceDescriptor } from "./shotsFromSequence";
import { sequencesFromOutlineDescriptor } from "./sequencesFromOutline";
import { assetsFromProjectDescriptor } from "./assetsFromProject";
import { cameraConvertDescriptor } from "./cameraConvert";
import { castingFromSequenceDescriptor } from "./castingFromSequence";
import { narrativePromptComposeDescriptor } from "./narrativePrompt";
import { lightingFromImageDescriptor } from "./lightingFromImage";
import { shotLightingDirectedDescriptor } from "./shotLightingDirected";
import { sequenceLightingDirectedDescriptor } from "./sequenceLightingDirected";

export const DESCRIPTORS = {
  "story.generate": storyGenerateDescriptor,
  "outline.generate": outlineGenerateDescriptor,
  "sequencePrompt.assist": sequencePromptAssistDescriptor,
  "assetBible.generate": assetBibleGenerateDescriptor,
  "assetDescription.generate": assetDescriptionGenerateDescriptor,
  "assetNotes.generate": assetNotesGenerateDescriptor,
  "assetDescription.batch": assetDescriptionBatchDescriptor,
  "shotPrompt.assist": shotPromptAssistDescriptor,
  "shot.retakeDirected": shotRetakeDirectedDescriptor,
  "asset.retakeDirected": assetRetakeDirectedDescriptor,
  "shot.insertDirected": shotInsertDirectedDescriptor,
  "shots.fromSequence": shotsFromSequenceDescriptor,
  "sequences.fromOutline": sequencesFromOutlineDescriptor,
  "assets.fromProject": assetsFromProjectDescriptor,
  "casting.fromSequence": castingFromSequenceDescriptor,
  "narrativePrompt.compose": narrativePromptComposeDescriptor,
  "lighting.fromImage": lightingFromImageDescriptor,
  "shot.lightingDirected": shotLightingDirectedDescriptor,
  "sequence.lightingDirected": sequenceLightingDirectedDescriptor,
} as const satisfies Record<string, OperationDescriptor>;

export {
  storyGenerateDescriptor,
  outlineGenerateDescriptor,
  sequencePromptAssistDescriptor,
  assetBibleGenerateDescriptor,
  assetDescriptionGenerateDescriptor,
  assetNotesGenerateDescriptor,
  assetDescriptionBatchDescriptor,
  shotPromptAssistDescriptor,
  shotRetakeDirectedDescriptor,
  assetRetakeDirectedDescriptor,
  shotInsertDirectedDescriptor,
  shotsFromSequenceDescriptor,
  sequencesFromOutlineDescriptor,
  assetsFromProjectDescriptor,
  cameraConvertDescriptor,
  castingFromSequenceDescriptor,
  narrativePromptComposeDescriptor,
  lightingFromImageDescriptor,
  shotLightingDirectedDescriptor,
  sequenceLightingDirectedDescriptor,
};
