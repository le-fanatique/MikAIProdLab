import { describe, expect, it } from "vitest";
import { assetDescriptionBatchDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescriptionBatch";
import {
  renderProjectIdentityAssetContextLines,
  renderAssetCoreAssetContextLines,
  renderAssetSeqAppearancesLines,
  renderAssetShotAppearancesLines,
  renderAssetReferencesLine,
  renderProjectStyleWorldRulesBlock,
  renderProjectStyleBatchFinalRule,
  renderAssetCoreClosingBoth,
  type ProjectIdentityData,
  type AssetCoreData,
  type AssetSeqAppearanceEntry,
  type AssetShotAppearanceEntry,
  type AssetReferenceEntry,
  type ProjectStyleData,
} from "@/lib/llmWorkspace/variables/registry";
import { buildAssetDescriptionFromContextPrompt, type AssetDescriptionFromContextInput } from "@/lib/prompts/asset-description-from-context";
import { assembleDescriptorMessages } from "./helpers/assembleDescriptor";

// ---------------------------------------------------------------------------
// Proof required by the ticket: assembling {system, user} from
// `assetDescriptionBatchDescriptor`'s blocks (one Asset at a time — the
// batch action calls the same single-Asset builder per item) must equal,
// byte-for-byte, what `buildAssetDescriptionFromContextPrompt` produces for
// the same input.
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
  return assembleDescriptorMessages(assetDescriptionBatchDescriptor, (variableId, render) => {
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
      case "PROJECT.STYLE::assetDescriptionBatch.finalRuleLine":
        return renderProjectStyleBatchFinalRule(fixture.style);
      case "ASSET.CORE::assetDescriptionBatch.closingLine":
        return renderAssetCoreClosingBoth(fixture.asset);
      default:
        throw new Error(`unexpected block ${variableId}::${render}`);
    }
  });
}

function toBuilderInput(fixture: Fixture): AssetDescriptionFromContextInput {
  return {
    project: {
      name: fixture.project.name,
      pitch: fixture.project.pitch,
      story: fixture.project.story,
      outline: fixture.project.outline,
    },
    asset: {
      name: fixture.asset.name,
      type: fixture.asset.type,
      description: fixture.asset.description,
      notes: fixture.asset.notes,
    },
    sequenceContexts: fixture.seq,
    shotContexts: fixture.shots,
    refImageMeta: fixture.refs,
    style:
      fixture.style.mode === "active"
        ? { worldSegment: fixture.style.worldSegment, rulesSegment: fixture.style.rulesSegment }
        : { worldSegment: "", rulesSegment: "" },
  };
}

describe("assetDescription.batch descriptor — strict prompt equality", () => {
  it("matches buildAssetDescriptionFromContextPrompt for a complete Asset (with Style, appearances, references)", () => {
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
        { shotCode: "S1", title: "Arrival", description: "Description text".repeat(10), actionPitch: "Runs".repeat(10), cameraPitch: "Tracking".repeat(10) },
        { shotCode: null, title: "Reveal", description: null, actionPitch: null, cameraPitch: null },
      ],
      refs: [
        { label: "Front view", imageRole: "reference", sourceFilename: "front.png" },
        { label: null, imageRole: "reference", sourceFilename: "side.png" },
      ],
      style: { mode: "active", worldSegment: "A rain-soaked megacity.", visualSegment: "Neon and chrome.", rulesSegment: "Never show daylight." },
    };
    const expected = buildAssetDescriptionFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildAssetDescriptionFromContextPrompt for a minimal Asset (no Style, no appearances, no references)", () => {
    const fixture: Fixture = {
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      asset: { name: "Placeholder Prop", type: "prop", description: null, notes: null },
      seq: [],
      shots: [],
      refs: [],
      style: { mode: "none" },
    };
    const expected = buildAssetDescriptionFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
