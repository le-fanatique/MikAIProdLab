import { describe, expect, it } from "vitest";
import { assetsFromProjectDescriptor } from "@/lib/llmWorkspace/descriptors/assetsFromProject";
import {
  renderAssetsFromProjectBackgroundLines,
  renderAssetsFromProjectExistingAssetsBlock,
  renderAssetsFromProjectFinalInstructionLine,
  renderAssetsFromProjectOutlineOrStoryBlock,
  renderAssetsFromProjectSequencesBlock,
  renderAssetsFromProjectSystemBody,
  type ProjectAssetEntry,
  type ProjectIdentityData,
  type ProjectSequenceEntry,
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
  existingAssets: ProjectAssetEntry[];
  assetTypes: string[];
};

function assemble(fixture: Fixture) {
  const allVariables: Partial<Record<VariableId, unknown>> = {
    "PROJECT.IDENTITY": fixture.project,
    "PROJECT.SEQUENCES": fixture.sequences,
    "PROJECT.ASSETS": fixture.existingAssets,
  };
  const allParameters: Record<string, number | string | boolean | string[] | undefined> = {
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

const existingAssetsFixture: ProjectAssetEntry[] = [
  { name: "Kai the Courier", type: "character" },
  { name: "Neon Alley", type: "environment" },
];

describe("assets.fromProject descriptor — strict prompt equality", () => {
  it("outline absent, story present, no sequences/existing assets, one asset type", () => {
    expectMatches(
      {
        project: { ...baseProject, outline: null },
        sequences: [],
        existingAssets: [],
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

  it("outline present (story ignored for background), sequences present, six asset types", () => {
    expectMatches(
      {
        project: { ...baseProject, outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins." },
        sequences: seqFixture,
        existingAssets: [],
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

  it("minimal project (no pitch, no story, no outline), everything else empty", () => {
    expectMatches(
      {
        project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
        sequences: [],
        existingAssets: [],
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
        existingAssets: existingAssetsFixture,
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

  // ASSET.EXTRACT.SEQ.1 §7, filet entry 1: a project whose `SEQUENCES:` block
  // exceeds 2000 characters must have every sequence emitted, not silently
  // cut — the pre-ticket `.slice(0, 2000)` truncation that hid
  // `Interior reactor control room` on the author's own project (§1 of the
  // ticket).
  it("a SEQUENCES: block over 2000 characters is emitted in full — the pre-ticket truncation is gone", () => {
    const manySequences: ProjectSequenceEntry[] = Array.from({ length: 40 }, (_, i) => ({
      title: `Sequence ${i + 1}`,
      summary: "A long enough summary to push this block well past two thousand characters in total across forty sequences.",
      description: null,
      narrativePurpose: null,
      mood: null,
      locationHint: null,
    }));
    const lastTitle = "Interior reactor control room";
    manySequences.push({
      title: lastTitle,
      summary: null,
      description: null,
      narrativePurpose: null,
      mood: null,
      locationHint: null,
    });

    const rendered = renderAssetsFromProjectSequencesBlock(manySequences);
    expect(rendered.length).toBeGreaterThan(2000);
    expect(rendered).toContain(`- ${lastTitle}`);

    const assembled = assemble({
      project: { ...baseProject, outline: null },
      sequences: manySequences,
      existingAssets: [],
      assetTypes: ["character"],
    });
    expect(assembled.user).toContain(`- ${lastTitle}`);
  });

  // ASSET.EXTRACT.SEQ.1 §7, filet entry 2: `assets.fromProject` no longer
  // declares `includeShots` at all, and emits no shots block — the per-shot
  // detail moved to `assets.fromSequence` entirely (§4a of the ticket).
  it("no longer declares includeShots, and emits no SHOTS: block regardless of any parameters supplied", () => {
    const declaredParameterIds = (assetsFromProjectDescriptor.intent.parameters ?? []).map((p) => p.id);
    expect(declaredParameterIds).not.toContain("includeShots");
    expect(declaredParameterIds).toEqual(["assetTypes"]);

    const assembled = assemble({
      project: { ...baseProject, outline: null },
      sequences: seqFixture,
      existingAssets: existingAssetsFixture,
      assetTypes: ["character", "prop"],
    });
    expect(assembled.user).not.toContain("SHOTS:");
  });
});
