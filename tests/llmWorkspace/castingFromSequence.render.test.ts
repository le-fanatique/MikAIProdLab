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

// ---------------------------------------------------------------------------
// Level 1 proof required by the ticket ("Validation attendue" §1): assembling
// {system, user} from `castingFromSequenceDescriptor`'s blocks must equal,
// byte-for-byte, what `buildCastingFromSequencePrompt` produces for the same
// input, across: both values of `includeSequenceLevel`, plus with/without
// shots, with/without assets, with/without existing castings (at both
// levels). Same dispatcher discipline as `sequencesFromOutline.render.test.ts`
// / `shotsFromSequence.render.test.ts`: builds the real render-form inputs
// the production dispatch would build, not a hand-threaded stand-in.
//
// LLMW.C0.REANCHOR.1 — each `expected` below is a frozen literal captured
// from `buildCastingFromSequencePrompt` for this exact fixture, not a live
// call to the builder: comparing the descriptor's output to the builder's
// output would no longer prove anything once the builder is deleted
// (C1/C2/C3).
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

function expectMatches(f: Fixture, expected: { system: string; user: string }) {
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
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: oneShot,
        assetLibrary: oneAsset,
        existing: emptyExisting,
        includeSequenceLevel: false,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:
[ASSET ID: 10] Kira the Courier — character — A young courier in a rain jacket. | Protagonist.

SHOTS:
[SHOT ID: 1] SH010 — Rooftop leap — The courier leaps between buildings. | Action: A daring jump under gunfire. | In: Coming from the alley chase. | Out: Lands on the far rooftop.

Suggest which assets should be cast into each shot. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("includeSequenceLevel=true, with shots and assets, no existing castings", () => {
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: oneShot,
        assetLibrary: oneAsset,
        existing: emptyExisting,
        includeSequenceLevel: true,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots and optionally into the sequence itself.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- Sequence-level casting: use targetType="sequence" and targetId=42 only for assets that are thematically relevant to the full sequence (e.g., the main character or primary location).
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot | sequence",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:
[ASSET ID: 10] Kira the Courier — character — A young courier in a rain jacket. | Protagonist.

SHOTS:
[SHOT ID: 1] SH010 — Rooftop leap — The courier leaps between buildings. | Action: A daring jump under gunfire. | In: Coming from the alley chase. | Out: Lands on the far rooftop.

Suggest which assets should be cast into each shot. You may also suggest sequence-level castings (targetType="sequence", targetId=42) for assets that are central to the whole sequence. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("without shots (empty sequence)", () => {
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: [],
        assetLibrary: oneAsset,
        existing: emptyExisting,
        includeSequenceLevel: false,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:
[ASSET ID: 10] Kira the Courier — character — A young courier in a rain jacket. | Protagonist.

SHOTS:


Suggest which assets should be cast into each shot. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("without assets (empty library)", () => {
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: oneShot,
        assetLibrary: [],
        existing: emptyExisting,
        includeSequenceLevel: false,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:


SHOTS:
[SHOT ID: 1] SH010 — Rooftop leap — The courier leaps between buildings. | Action: A daring jump under gunfire. | In: Coming from the alley chase. | Out: Lands on the far rooftop.

Suggest which assets should be cast into each shot. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("without shots and without assets", () => {
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: [],
        assetLibrary: [],
        existing: emptyExisting,
        includeSequenceLevel: true,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots and optionally into the sequence itself.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- Sequence-level casting: use targetType="sequence" and targetId=42 only for assets that are thematically relevant to the full sequence (e.g., the main character or primary location).
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot | sequence",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:


SHOTS:


Suggest which assets should be cast into each shot. You may also suggest sequence-level castings (targetType="sequence", targetId=42) for assets that are central to the whole sequence. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("with existing shot-level castings only", () => {
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: oneShot,
        assetLibrary: oneAsset,
        existing: { shotCastings: [{ shotId: 1, assetId: 10 }], sequenceCastings: [] },
        includeSequenceLevel: false,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:
[ASSET ID: 10] Kira the Courier — character — A young courier in a rain jacket. | Protagonist.

SHOTS:
[SHOT ID: 1] SH010 — Rooftop leap — The courier leaps between buildings. | Action: A daring jump under gunfire. | In: Coming from the alley chase. | Out: Lands on the far rooftop.

ALREADY ASSIGNED (do not suggest these again):
Shot 1 ← Asset 10

Suggest which assets should be cast into each shot. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("with existing sequence-level castings only (present even when includeSequenceLevel is false)", () => {
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: oneShot,
        assetLibrary: oneAsset,
        existing: { shotCastings: [], sequenceCastings: [{ assetId: 10 }] },
        includeSequenceLevel: false,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:
[ASSET ID: 10] Kira the Courier — character — A young courier in a rain jacket. | Protagonist.

SHOTS:
[SHOT ID: 1] SH010 — Rooftop leap — The courier leaps between buildings. | Action: A daring jump under gunfire. | In: Coming from the alley chase. | Out: Lands on the far rooftop.

ALREADY ASSIGNED (do not suggest these again):
Sequence 42 ← Asset 10

Suggest which assets should be cast into each shot. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("with existing castings at both levels, includeSequenceLevel=true", () => {
    expectMatches(
      {
        project: baseProject,
        seqIdentity: baseSeqIdentity,
        seqContext: baseSeqContext,
        shotTargets: oneShot,
        assetLibrary: oneAsset,
        existing: { shotCastings: [{ shotId: 1, assetId: 10 }], sequenceCastings: [{ assetId: 10 }] },
        includeSequenceLevel: true,
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots and optionally into the sequence itself.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- Sequence-level casting: use targetType="sequence" and targetId=42 only for assets that are thematically relevant to the full sequence (e.g., the main character or primary location).
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot | sequence",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): Full story text goes here.

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:
[ASSET ID: 10] Kira the Courier — character — A young courier in a rain jacket. | Protagonist.

SHOTS:
[SHOT ID: 1] SH010 — Rooftop leap — The courier leaps between buildings. | Action: A daring jump under gunfire. | In: Coming from the alley chase. | Out: Lands on the far rooftop.

ALREADY ASSIGNED (do not suggest these again):
Shot 1 ← Asset 10
Sequence 42 ← Asset 10

Suggest which assets should be cast into each shot. You may also suggest sequence-level castings (targetType="sequence", targetId=42) for assets that are central to the whole sequence. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("minimal project (no pitch/story/outline), minimal sequence (no optional fields)", () => {
    expectMatches(
      {
        project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
        seqIdentity: { id: 7, title: "Untitled Sequence" },
        seqContext: { title: "Untitled Sequence", summary: null, description: null, mood: null, locationHint: null, narrativePurpose: null },
        shotTargets: [{ id: 2, shotCode: null, title: "Only shot", description: null, actionPitch: null, continuityIn: null, continuityOut: null }],
        assetLibrary: [{ id: 20, name: "Only asset", type: "prop", description: null, notes: null }],
        existing: emptyExisting,
        includeSequenceLevel: false,
      },
      { system: `You are a casting director and production supervisor for the project "Untitled Project".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Untitled Project

SEQUENCE [ID: 7]: Untitled Sequence

ASSET LIBRARY:
[ASSET ID: 20] Only asset — prop

SHOTS:
[SHOT ID: 2] Only shot

Suggest which assets should be cast into each shot. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });

  it("multiple shots and assets, more than one existing casting per level, long fields exercise truncation", () => {
    const longText = "x".repeat(400);
    expectMatches(
      {
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
      },
      { system: `You are a casting director and production supervisor for the project "Neon Skyline".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots and optionally into the sequence itself.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.
- Sequence-level casting: use targetType="sequence" and targetId=42 only for assets that are thematically relevant to the full sequence (e.g., the main character or primary location).
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "shot | sequence",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story (background): xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Outline (background): xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

SEQUENCE [ID: 42]: The Rooftop Chase
Summary: The courier is pursued across rooftops.
Description: A tense chase sequence at night.
Purpose: Rising action
Mood: Tense
Location: Exterior rooftops / night

ASSET LIBRARY:
[ASSET ID: 10] Kira — character — xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
[ASSET ID: 11] Getaway Van — vehicle

SHOTS:
[SHOT ID: 1] SH010 — First — xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | Action: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | In: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | Out: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
[SHOT ID: 2] Second

ALREADY ASSIGNED (do not suggest these again):
Shot 1 ← Asset 10
Shot 2 ← Asset 11
Sequence 42 ← Asset 10
Sequence 42 ← Asset 11

Suggest which assets should be cast into each shot. You may also suggest sequence-level castings (targetType="sequence", targetId=42) for assets that are central to the whole sequence. Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.` }
    );
  });
});
