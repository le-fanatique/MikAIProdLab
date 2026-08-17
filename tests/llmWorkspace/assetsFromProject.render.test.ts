import { describe, expect, it } from "vitest";
import { assetsFromProjectDescriptor } from "@/lib/llmWorkspace/descriptors/assetsFromProject";
import {
  renderAssetsFromProjectBackgroundLines,
  renderAssetsFromProjectExistingAssetsBlock,
  renderAssetsFromProjectFinalInstructionLine,
  renderAssetsFromProjectOutlineOrStoryBlock,
  renderAssetsFromProjectSequencesBlock,
  renderAssetsFromProjectShotsBlock,
  renderAssetsFromProjectSystemBody,
  type ProjectAssetEntry,
  type ProjectIdentityData,
  type ProjectSequenceEntry,
  type ProjectShotEntry,
  type VariableParameterRenderInput,
} from "@/lib/llmWorkspace/variables/registry";
import type { VariableId } from "@/lib/llmWorkspace/types";
import { buildAssetsFromProjectPrompt } from "@/lib/prompts/assets-from-project";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket ("Validation attendue" §1): assembling
// {system, user} from `assetsFromProjectDescriptor`'s blocks must equal,
// byte-for-byte, what `buildAssetsFromProjectPrompt` produces for the same
// input, across: outline present/absent; `includeShots` true/false; shots
// present/absent; existing assets present/absent; sequences present/absent;
// `assetTypes` at one member and at six.
//
// Same dispatcher discipline as `shotsFromSequence.render.test.ts` /
// `sequencesFromOutline.render.test.ts`: builds the real
// `VariableParameterRenderInput` the production dispatch would build.
// ---------------------------------------------------------------------------

type Fixture = {
  project: ProjectIdentityData;
  sequences: ProjectSequenceEntry[];
  shots: ProjectShotEntry[];
  existingAssets: ProjectAssetEntry[];
  includeShots: boolean;
  assetTypes: string[];
};

function assemble(fixture: Fixture) {
  const allVariables: Partial<Record<VariableId, unknown>> = {
    "PROJECT.IDENTITY": fixture.project,
    "PROJECT.SEQUENCES": fixture.sequences,
    "PROJECT.SHOTS": fixture.shots,
    "PROJECT.ASSETS": fixture.existingAssets,
  };
  const allParameters: Record<string, number | string | boolean | string[] | undefined> = {
    includeShots: fixture.includeShots,
    assetTypes: fixture.assetTypes,
  };

  return assembleDescriptorMessages(
    assetsFromProjectDescriptor,
    (variableId, render) => {
      if (variableId === "PROJECT.IDENTITY" && render === "assetsFromProject.backgroundLines") {
        return renderAssetsFromProjectBackgroundLines(fixture.project);
      }
      if (variableId === "PROJECT.IDENTITY" && render === "assetsFromProject.outlineOrStoryBlock") {
        return renderAssetsFromProjectOutlineOrStoryBlock(fixture.project);
      }
      if (variableId === "PROJECT.SEQUENCES" && render === "assetsFromProject.sequencesBlock") {
        return renderAssetsFromProjectSequencesBlock(fixture.sequences);
      }
      if (variableId === "PROJECT.ASSETS" && render === "assetsFromProject.existingAssetsBlock") {
        return renderAssetsFromProjectExistingAssetsBlock(fixture.existingAssets);
      }
      throw new Error(`unexpected single-variable block ${variableId}::${render}`);
    },
    (parameterId, render) => {
      if (parameterId === "assetTypes" && render === "assetsFromProject.finalInstructionLine") {
        return renderAssetsFromProjectFinalInstructionLine(fixture.assetTypes);
      }
      throw new Error(`unexpected parameter block ${parameterId}::${render}`);
    },
    undefined,
    (variableIds, render) => {
      throw new Error(`unexpected multi-variable block ${variableIds.join(",")}::${render}`);
    },
    undefined,
    (variableIds, parameterIds, render) => {
      const variables: Partial<Record<VariableId, unknown>> = {};
      for (const id of variableIds) variables[id] = allVariables[id];
      const parameters: Record<string, number | string | boolean | string[] | undefined> = {};
      for (const id of parameterIds) parameters[id] = allParameters[id];
      const input: VariableParameterRenderInput = { variables, parameters, mode: undefined };

      if (render === "assetsFromProject.systemBody") return renderAssetsFromProjectSystemBody(input);
      if (render === "assetsFromProject.shotsBlock") return renderAssetsFromProjectShotsBlock(input);
      throw new Error(`unexpected variables-parameters block ${variableIds.join(",")}/${parameterIds.join(",")}::${render}`);
    }
  );
}

function expectMatches(fixture: Fixture) {
  const expected = buildAssetsFromProjectPrompt({
    project: {
      name: fixture.project.name,
      pitch: fixture.project.pitch,
      story: fixture.project.story,
      outline: fixture.project.outline,
    },
    sequences: fixture.sequences,
    shots: fixture.shots,
    existingAssets: fixture.existingAssets,
    includeShots: fixture.includeShots,
    assetTypes: fixture.assetTypes as unknown as Parameters<typeof buildAssetsFromProjectPrompt>[0]["assetTypes"],
  });
  const assembled = assemble(fixture);
  expect(assembled.system).toBe(expected.system);
  expect(assembled.user).toBe(expected.user);
}

const baseProject: ProjectIdentityData = {
  name: "Neon Skyline",
  pitch: "A courier races across a rain-soaked megacity.",
  story: "Full story text goes here, several sentences long.",
  description: "Internal production notes.",
  outline: null,
};

const seqFixture: ProjectSequenceEntry[] = [
  {
    title: "Rooftop chase",
    summary: "The courier is chased across the rooftops.",
    description: "A tense pursuit at night.",
    narrativePurpose: "Escalates the central conflict.",
    mood: "Tense, kinetic",
    locationHint: "Rain-soaked rooftops, neon skyline",
  },
  { title: "Quiet aftermath", summary: null, description: null, narrativePurpose: null, mood: null, locationHint: null },
];

const shotFixture: ProjectShotEntry[] = [
  { title: "Wide establishing", description: "Neon skyline at dusk.", actionPitch: "The courier sprints.", continuityIn: "Calm street.", continuityOut: "Alley entered." },
  { title: "Close on courier", description: null, actionPitch: null, continuityIn: null, continuityOut: null },
];

const existingAssetsFixture: ProjectAssetEntry[] = [
  { name: "Kai the Courier", type: "character" },
  { name: "Neon Alley", type: "environment" },
];

describe("assets.fromProject descriptor — strict prompt equality", () => {
  it("outline absent, story present, no sequences/shots/existing assets, includeShots false, one asset type", () => {
    expectMatches({
      project: { ...baseProject, outline: null },
      sequences: [],
      shots: [],
      existingAssets: [],
      includeShots: false,
      assetTypes: ["character"],
    });
  });

  it("outline present (story ignored for background), sequences present, includeShots false, six asset types", () => {
    expectMatches({
      project: { ...baseProject, outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins." },
      sequences: seqFixture,
      shots: shotFixture,
      existingAssets: [],
      includeShots: false,
      assetTypes: ["character", "environment", "prop", "vehicle", "crowd", "other"],
    });
  });

  it("outline absent, includeShots true with shots present, existing assets present, sequences present", () => {
    expectMatches({
      project: { ...baseProject, outline: null },
      sequences: seqFixture,
      shots: shotFixture,
      existingAssets: existingAssetsFixture,
      includeShots: true,
      assetTypes: ["character", "prop"],
    });
  });

  it("outline present, includeShots true but shots empty (gate stays closed)", () => {
    expectMatches({
      project: { ...baseProject, outline: "## Only section\nJust one body." },
      sequences: [],
      shots: [],
      existingAssets: existingAssetsFixture,
      includeShots: true,
      assetTypes: ["environment"],
    });
  });

  it("minimal project (no pitch, no story, no outline), everything else empty", () => {
    expectMatches({
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      sequences: [],
      shots: [],
      existingAssets: [],
      includeShots: false,
      assetTypes: ["other"],
    });
  });

  it("outline absent, no story either (background line has no Story:), sequences and existing assets present", () => {
    expectMatches({
      project: { name: "Bare Project", pitch: "A pitch only.", story: null, description: null, outline: null },
      sequences: seqFixture,
      shots: [],
      existingAssets: existingAssetsFixture,
      includeShots: false,
      assetTypes: ["character", "environment", "prop", "vehicle", "crowd", "other"],
    });
  });
});
