import { describe, expect, it } from "vitest";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";
import {
  renderProjectIdentityAssetContextLines,
  renderAssetCoreAssetContextLines,
  renderAssetSeqAppearancesLines,
  renderAssetShotAppearancesLines,
  renderAssetReferencesLine,
  renderProjectStyleWorldRulesBlock,
  renderProjectStyleDescriptionOnlyFinalRule,
  renderAssetCoreClosingDescriptionOnly,
  type ProjectIdentityData,
  type AssetCoreData,
  type AssetSeqAppearanceEntry,
  type AssetShotAppearanceEntry,
  type AssetReferenceEntry,
  type ProjectStyleData,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket: assembling {system, user} from
// `assetDescriptionGenerateDescriptor`'s blocks must equal, byte-for-byte,
// what `buildAssetDescriptionOnlyPrompt` produces for the same input. This
// is also the corrected divergence the ticket names: the old flat
// `ASSET_DESCRIPTION_SYSTEM_PROMPT` string is gone, replaced by blocks whose
// correctness this test proves directly, not by inspection.
// ---------------------------------------------------------------------------

type Fixture = {
  project: ProjectIdentityData;
  asset: AssetCoreData;
  seq: AssetSeqAppearanceEntry[];
  shots: AssetShotAppearanceEntry[];
  refs: AssetReferenceEntry[];
  style: ProjectStyleData;
};

function assemble(fixture: Fixture) {
  return assembleDescriptorMessages(assetDescriptionGenerateDescriptor, (variableId, render) => {
    switch (`${variableId}::${render}`) {
      case "PROJECT.IDENTITY::assetContext.identityLines":
        return renderProjectIdentityAssetContextLines(fixture.project);
      case "ASSET.CORE::assetContext.coreLines":
        return renderAssetCoreAssetContextLines(fixture.asset);
      case "ASSET.SEQ_APPEARANCES::assetContext.seqAppearancesLines":
        return renderAssetSeqAppearancesLines(fixture.seq);
      case "ASSET.SHOT_APPEARANCES::assetContext.shotAppearancesLines":
        return renderAssetShotAppearancesLines(fixture.shots);
      case "ASSET.REFERENCES::assetContext.referencesLine":
        return renderAssetReferencesLine(fixture.refs);
      case "PROJECT.STYLE::assetContext.worldRulesBlock":
        return renderProjectStyleWorldRulesBlock(fixture.style);
      case "PROJECT.STYLE::assetDescription.finalRuleLine":
        return renderProjectStyleDescriptionOnlyFinalRule(fixture.style);
      case "ASSET.CORE::assetDescription.closingLine":
        return renderAssetCoreClosingDescriptionOnly(fixture.asset);
      default:
        throw new Error(`unexpected block ${variableId}::${render}`);
    }
  });
}

describe("assetDescription.generate descriptor — strict prompt equality", () => {
  it("matches buildAssetDescriptionOnlyPrompt for a complete Asset (with Style, appearances, references)", () => {
    const fixture: Fixture = {
      project: {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "A long story text.".repeat(30),
        description: "extra notes",
        outline: "An outline.".repeat(40),
      },
      asset: {
        name: "Hero Robot",
        type: "character",
        description: "A weathered combat robot.",
        notes: "Appears throughout Act 2.",
      },
      seq: [
        { title: "Sequence 0", summary: "Summary 0".repeat(20), mood: "Tense", locationHint: "Rooftop", narrativePurpose: "Introduce hero" },
        { title: "Sequence 1", summary: null, mood: null, locationHint: null, narrativePurpose: null },
      ],
      shots: [
        { shotCode: "S1", title: "Arrival", description: "Description text".repeat(10), actionPitch: "Runs".repeat(10), cameraSubject: "Tracking".repeat(10) },
        { shotCode: null, title: "Reveal", description: null, actionPitch: null, cameraSubject: null },
      ],
      refs: [
        { label: "Front view", imageRole: "reference", sourceFilename: "front.png" },
        { label: null, imageRole: "reference", sourceFilename: "side.png" },
      ],
      style: { mode: "active", worldSegment: "A rain-soaked megacity.", visualSegment: "Neon and chrome.", rulesSegment: "Never show daylight." },
    };
    const expected = { system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the visual/production description for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- If the asset already has a description, improve and complete it — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.
- Do not write narrative role, usage context or design constraints — that belongs to Notes, which is not requested here.
- A Project Style is provided below. Respect its World & Design Language and any listed rules; never contradict them.
Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>" }
No markdown. No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story
Outline: An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An outline.An 

Asset: Hero Robot
Type: character
Current description: A weathered combat robot.
Current notes: Appears throughout Act 2.

Sequences this asset appears in:
- Sequence 0 | mood: Tense | location: Rooftop | purpose: Introduce hero | summary: Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Summary 0Sum
- Sequence 1

Shots this asset appears in:
- S1 — Arrival | Description textDescription textDescription textDescription textDescription textDescription textDesc | action: RunsRunsRunsRunsRunsRunsRunsRunsRunsRuns | camera: TrackingTrackingTrackingTrackingTrackingTrackingTrackingTrackingTrackingTracking
- Reveal

Reference images: Front view, side.png

Project Style:
A rain-soaked megacity.

Never show daylight.

Write or enrich only the description for "Hero Robot".` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildAssetDescriptionOnlyPrompt for a minimal Asset (no Style, no appearances, no references)", () => {
    const fixture: Fixture = {
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      asset: { name: "Placeholder Prop", type: "prop", description: null, notes: null },
      seq: [],
      shots: [],
      refs: [],
      style: { mode: "none" },
    };
    const expected = { system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the visual/production description for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- If the asset already has a description, improve and complete it — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.
- Do not write narrative role, usage context or design constraints — that belongs to Notes, which is not requested here.
Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>" }
No markdown. No explanation. Only the JSON object.`, user: `Project: Untitled Project

Asset: Placeholder Prop
Type: prop
Current description: (none)

Write or enrich only the description for "Placeholder Prop".` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
