import { describe, expect, it } from "vitest";
import { castingFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/castingFromSequence";
import {
  renderCastingFromSequenceAssetLibraryLines,
  renderCastingFromSequenceClosingInstructionLine,
  renderCastingFromSequenceExistingCastingsBlock,
  renderCastingFromSequenceProjectBackgroundLines,
  renderCastingFromSequenceSequenceContextLines,
  renderCastingFromSequenceShotsLines,
  renderCastingFromSequenceSystemBody,
  type ProjectAssetLibraryEntry,
  type ProjectIdentityData,
  type SeqContextData,
  type SeqExistingCastingsData,
  type SeqIdentityData,
  type SeqShotTargetEntry,
  type VariableParameterRenderInput,
} from "@/lib/llmWorkspace/variables/registry";
import type { VariableId } from "@/lib/llmWorkspace/types";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";
import { buildCastingFromSequencePrompt } from "@/lib/prompts/casting-from-sequence";

// ---------------------------------------------------------------------------
// Level 1 proof required by the ticket ("Validation attendue" §1): assembling
// {system, user} from `castingFromSequenceDescriptor`'s blocks must equal,
// byte-for-byte, what `buildCastingFromSequencePrompt` produces for the same
// input, across: both values of `includeSequenceLevel`, plus with/without
// shots, with/without assets, with/without existing castings (at both
// levels). Same dispatcher discipline as `sequencesFromOutline.render.test.ts`
// / `shotsFromSequence.render.test.ts`: builds the real render-form inputs
// the production dispatch would build, not a hand-threaded stand-in.
// ---------------------------------------------------------------------------

type Fixture = {
  project: ProjectIdentityData;
  seqIdentity: SeqIdentityData;
  seqContext: SeqContextData;
  shotTargets: SeqShotTargetEntry[];
  assetLibrary: ProjectAssetLibraryEntry[];
  existing: SeqExistingCastingsData;
  includeSequenceLevel: boolean;
};

function assemble(f: Fixture) {
  const allVariables: Partial<Record<VariableId, unknown>> = {
    "PROJECT.IDENTITY": f.project,
    "SEQ.IDENTITY": f.seqIdentity,
    "SEQ.CONTEXT": f.seqContext,
    "SEQ.SHOT_TARGETS": f.shotTargets,
    "PROJECT.ASSET_LIBRARY": f.assetLibrary,
    "SEQ.EXISTING_CASTINGS": f.existing,
  };
  const allParameters: Record<string, boolean | undefined> = {
    includeSequenceLevel: f.includeSequenceLevel,
  };

  return assembleDescriptorMessages(
    castingFromSequenceDescriptor,
    (variableId, render) => {
      const data = allVariables[variableId as VariableId];
      if (render === "castingFromSequence.projectBackgroundLines") {
        return renderCastingFromSequenceProjectBackgroundLines(data as ProjectIdentityData);
      }
      if (render === "castingFromSequence.assetLibraryLines") {
        return renderCastingFromSequenceAssetLibraryLines(data as ProjectAssetLibraryEntry[]);
      }
      if (render === "castingFromSequence.shotsLines") {
        return renderCastingFromSequenceShotsLines(data as SeqShotTargetEntry[]);
      }
      throw new Error(`unexpected single-variable block ${variableId}::${render}`);
    },
    (parameterId, render) => {
      throw new Error(`unexpected parameter block ${parameterId}::${render}`);
    },
    undefined,
    (variableIds, render) => {
      const args = variableIds.map((id) => allVariables[id]);
      if (render === "castingFromSequence.sequenceContextLines") {
        return renderCastingFromSequenceSequenceContextLines(args[0] as SeqIdentityData, args[1] as SeqContextData);
      }
      if (render === "castingFromSequence.existingCastingsBlock") {
        return renderCastingFromSequenceExistingCastingsBlock(
          args[0] as SeqIdentityData,
          args[1] as SeqExistingCastingsData
        );
      }
      throw new Error(`unexpected multi-variable block ${variableIds.join(",")}::${render}`);
    },
    undefined,
    (variableIds, parameterIds, render) => {
      const variables: Partial<Record<VariableId, unknown>> = {};
      for (const id of variableIds) variables[id] = allVariables[id];
      const parameters: Record<string, boolean | undefined> = {};
      for (const id of parameterIds) parameters[id] = allParameters[id];
      const input: VariableParameterRenderInput = { variables, parameters, mode: undefined };

      if (render === "castingFromSequence.systemBody") return renderCastingFromSequenceSystemBody(input);
      if (render === "castingFromSequence.closingInstructionLine") {
        return renderCastingFromSequenceClosingInstructionLine(input);
      }
      throw new Error(`unexpected variables-parameters block ${variableIds.join(",")}/${parameterIds.join(",")}::${render}`);
    }
  );
}

function expectMatches(f: Fixture) {
  const expected = buildCastingFromSequencePrompt({
    project: { name: f.project.name, pitch: f.project.pitch, story: f.project.story, outline: f.project.outline },
    sequence: {
      id: f.seqIdentity.id,
      title: f.seqIdentity.title,
      summary: f.seqContext.summary,
      description: f.seqContext.description,
      narrativePurpose: f.seqContext.narrativePurpose,
      mood: f.seqContext.mood,
      locationHint: f.seqContext.locationHint,
    },
    shots: f.shotTargets,
    assets: f.assetLibrary,
    existingShotCastings: f.existing.shotCastings,
    existingSequenceCastings: f.existing.sequenceCastings,
    includeSequenceLevel: f.includeSequenceLevel,
  });
  const assembled = assemble(f);
  expect(assembled.system).toBe(expected.system);
  expect(assembled.user).toBe(expected.user);
}

const baseProject: ProjectIdentityData = {
  name: "Neon Skyline",
  pitch: "A courier races across a rain-soaked megacity.",
  story: "Full story text goes here.",
  description: "Internal notes.",
  outline: null,
};

const baseSeqIdentity: SeqIdentityData = { id: 42, title: "The Rooftop Chase" };

const baseSeqContext: SeqContextData = {
  title: "The Rooftop Chase",
  summary: "The courier is pursued across rooftops.",
  description: "A tense chase sequence at night.",
  mood: "Tense",
  locationHint: "Exterior rooftops / night",
  narrativePurpose: "Rising action",
};

const oneShot: SeqShotTargetEntry[] = [
  {
    id: 1,
    shotCode: "SH010",
    title: "Rooftop leap",
    description: "The courier leaps between buildings.",
    actionPitch: "A daring jump under gunfire.",
    continuityIn: "Coming from the alley chase.",
    continuityOut: "Lands on the far rooftop.",
  },
];

const oneAsset: ProjectAssetLibraryEntry[] = [
  { id: 10, name: "Kira the Courier", type: "character", description: "A young courier in a rain jacket.", notes: "Protagonist." },
];

const emptyExisting: SeqExistingCastingsData = { shotCastings: [], sequenceCastings: [] };

describe("casting.fromSequence descriptor — strict prompt equality", () => {
  it("includeSequenceLevel=false, with shots and assets, no existing castings", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: oneShot,
      assetLibrary: oneAsset,
      existing: emptyExisting,
      includeSequenceLevel: false,
    });
  });

  it("includeSequenceLevel=true, with shots and assets, no existing castings", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: oneShot,
      assetLibrary: oneAsset,
      existing: emptyExisting,
      includeSequenceLevel: true,
    });
  });

  it("without shots (empty sequence)", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: [],
      assetLibrary: oneAsset,
      existing: emptyExisting,
      includeSequenceLevel: false,
    });
  });

  it("without assets (empty library)", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: oneShot,
      assetLibrary: [],
      existing: emptyExisting,
      includeSequenceLevel: false,
    });
  });

  it("without shots and without assets", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: [],
      assetLibrary: [],
      existing: emptyExisting,
      includeSequenceLevel: true,
    });
  });

  it("with existing shot-level castings only", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: oneShot,
      assetLibrary: oneAsset,
      existing: { shotCastings: [{ shotId: 1, assetId: 10 }], sequenceCastings: [] },
      includeSequenceLevel: false,
    });
  });

  it("with existing sequence-level castings only (present even when includeSequenceLevel is false)", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: oneShot,
      assetLibrary: oneAsset,
      existing: { shotCastings: [], sequenceCastings: [{ assetId: 10 }] },
      includeSequenceLevel: false,
    });
  });

  it("with existing castings at both levels, includeSequenceLevel=true", () => {
    expectMatches({
      project: baseProject,
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: oneShot,
      assetLibrary: oneAsset,
      existing: { shotCastings: [{ shotId: 1, assetId: 10 }], sequenceCastings: [{ assetId: 10 }] },
      includeSequenceLevel: true,
    });
  });

  it("minimal project (no pitch/story/outline), minimal sequence (no optional fields)", () => {
    expectMatches({
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      seqIdentity: { id: 7, title: "Untitled Sequence" },
      seqContext: { title: "Untitled Sequence", summary: null, description: null, mood: null, locationHint: null, narrativePurpose: null },
      shotTargets: [{ id: 2, shotCode: null, title: "Only shot", description: null, actionPitch: null, continuityIn: null, continuityOut: null }],
      assetLibrary: [{ id: 20, name: "Only asset", type: "prop", description: null, notes: null }],
      existing: emptyExisting,
      includeSequenceLevel: false,
    });
  });

  it("multiple shots and assets, more than one existing casting per level, long fields exercise truncation", () => {
    const longText = "x".repeat(400);
    expectMatches({
      project: {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: longText,
        description: "Internal notes.",
        outline: longText,
      },
      seqIdentity: baseSeqIdentity,
      seqContext: baseSeqContext,
      shotTargets: [
        { id: 1, shotCode: "SH010", title: "First", description: longText, actionPitch: longText, continuityIn: longText, continuityOut: longText },
        { id: 2, shotCode: null, title: "Second", description: null, actionPitch: null, continuityIn: null, continuityOut: null },
      ],
      assetLibrary: [
        { id: 10, name: "Kira", type: "character", description: longText, notes: longText },
        { id: 11, name: "Getaway Van", type: "vehicle", description: null, notes: null },
      ],
      existing: {
        shotCastings: [{ shotId: 1, assetId: 10 }, { shotId: 2, assetId: 11 }],
        sequenceCastings: [{ assetId: 10 }, { assetId: 11 }],
      },
      includeSequenceLevel: true,
    });
  });
});
