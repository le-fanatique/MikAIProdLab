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
//
// LLMW.C0.REANCHOR.1 — each `expected` below is a frozen literal captured
// from `buildAssetsFromProjectPrompt` for this exact fixture, not a live call
// to the builder: comparing the descriptor's output to the builder's output
// would no longer prove anything once the builder is deleted (C1/C2/C3).
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

function expectMatches(fixture: Fixture, expected: { system: string; user: string }) {
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
    expectMatches(
      {
        project: { ...baseProject, outline: null },
        sequences: [],
        shots: [],
        existingAssets: [],
        includeShots: false,
        assetTypes: ["character"],
      },
      { system: `You are a production asset supervisor and art department coordinator for the project "Neon Skyline".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: character

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of character
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here, several sentences long.

PROJECT STORY (use as narrative background):
Full story text goes here, several sentences long.

Extract up to 20 production assets from the above narrative material. Asset types to include: character.` }
    );
  });

  it("outline present (story ignored for background), sequences present, includeShots false, six asset types", () => {
    expectMatches(
      {
        project: { ...baseProject, outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins." },
        sequences: seqFixture,
        shots: shotFixture,
        existingAssets: [],
        includeShots: false,
        assetTypes: ["character", "environment", "prop", "vehicle", "crowd", "other"],
      },
      { system: `You are a production asset supervisor and art department coordinator for the project "Neon Skyline".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: character, environment, prop, vehicle, crowd, other

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of character, environment, prop, vehicle, crowd, other
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.

PROJECT OUTLINE (primary narrative source):
## Opening
The courier receives the package.

## Chase
A rooftop pursuit begins.

SEQUENCES:
- Rooftop chase | Summary: The courier is chased across the rooftops. | Description: A tense pursuit at night. | Purpose: Escalates the central conflict. | Mood: Tense, kinetic | Location: Rain-soaked rooftops, neon skyline
- Quiet aftermath

Extract up to 20 production assets from the above narrative material. Asset types to include: character, environment, prop, vehicle, crowd, other.` }
    );
  });

  it("outline absent, includeShots true with shots present, existing assets present, sequences present", () => {
    expectMatches(
      {
        project: { ...baseProject, outline: null },
        sequences: seqFixture,
        shots: shotFixture,
        existingAssets: existingAssetsFixture,
        includeShots: true,
        assetTypes: ["character", "prop"],
      },
      { system: `You are a production asset supervisor and art department coordinator for the project "Neon Skyline".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: character, prop

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of character, prop
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here, several sentences long.

PROJECT STORY (use as narrative background):
Full story text goes here, several sentences long.

SEQUENCES:
- Rooftop chase | Summary: The courier is chased across the rooftops. | Description: A tense pursuit at night. | Purpose: Escalates the central conflict. | Mood: Tense, kinetic | Location: Rain-soaked rooftops, neon skyline
- Quiet aftermath

SHOTS:
- Wide establishing | Neon skyline at dusk. | Action: The courier sprints. | In: Calm street. | Out: Alley entered.
- Close on courier

EXISTING ASSETS (for duplicate detection — do not re-create these unless significantly different):
- Kai the Courier (character)
- Neon Alley (environment)

Extract up to 20 production assets from the above narrative material. Asset types to include: character, prop.` }
    );
  });

  it("outline present, includeShots true but shots empty (gate stays closed)", () => {
    expectMatches(
      {
        project: { ...baseProject, outline: "## Only section\nJust one body." },
        sequences: [],
        shots: [],
        existingAssets: existingAssetsFixture,
        includeShots: true,
        assetTypes: ["environment"],
      },
      { system: `You are a production asset supervisor and art department coordinator for the project "Neon Skyline".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: environment

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of environment
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.

PROJECT OUTLINE (primary narrative source):
## Only section
Just one body.

EXISTING ASSETS (for duplicate detection — do not re-create these unless significantly different):
- Kai the Courier (character)
- Neon Alley (environment)

Extract up to 20 production assets from the above narrative material. Asset types to include: environment.` }
    );
  });

  it("minimal project (no pitch, no story, no outline), everything else empty", () => {
    expectMatches(
      {
        project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
        sequences: [],
        shots: [],
        existingAssets: [],
        includeShots: false,
        assetTypes: ["other"],
      },
      { system: `You are a production asset supervisor and art department coordinator for the project "Untitled Project".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: other

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of other
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Untitled Project

Extract up to 20 production assets from the above narrative material. Asset types to include: other.` }
    );
  });

  it("outline absent, no story either (background line has no Story:), sequences and existing assets present", () => {
    expectMatches(
      {
        project: { name: "Bare Project", pitch: "A pitch only.", story: null, description: null, outline: null },
        sequences: seqFixture,
        shots: [],
        existingAssets: existingAssetsFixture,
        includeShots: false,
        assetTypes: ["character", "environment", "prop", "vehicle", "crowd", "other"],
      },
      { system: `You are a production asset supervisor and art department coordinator for the project "Bare Project".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: character, environment, prop, vehicle, crowd, other

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of character, environment, prop, vehicle, crowd, other
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Bare Project
Pitch: A pitch only.

SEQUENCES:
- Rooftop chase | Summary: The courier is chased across the rooftops. | Description: A tense pursuit at night. | Purpose: Escalates the central conflict. | Mood: Tense, kinetic | Location: Rain-soaked rooftops, neon skyline
- Quiet aftermath

EXISTING ASSETS (for duplicate detection — do not re-create these unless significantly different):
- Kai the Courier (character)
- Neon Alley (environment)

Extract up to 20 production assets from the above narrative material. Asset types to include: character, environment, prop, vehicle, crowd, other.` }
    );
  });
});
