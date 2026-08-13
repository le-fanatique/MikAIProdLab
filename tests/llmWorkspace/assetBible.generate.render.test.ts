import { describe, expect, it } from "vitest";
import { assetBibleGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetBible";
import {
  renderAssetCoreBibleLines,
  renderAssetBibleExistingLines,
  renderProjectStyleBibleBlock,
  renderProjectStyleBibleFinalRule,
  renderAssetCoreClosingBible,
  type AssetCoreData,
  type AssetBibleData,
  type ProjectStyleData,
} from "@/lib/llmWorkspace/variables/registry";
import { buildAssetBibleFromContextPrompt, type AssetBibleFromContextInput } from "@/lib/prompts/asset-bible-from-context";
import { assembleDescriptorMessages } from "./helpers/assembleDescriptor";

// ---------------------------------------------------------------------------
// Proof required by the ticket: assembling {system, user} from
// `assetBibleGenerateDescriptor`'s blocks must equal, byte-for-byte, what
// `buildAssetBibleFromContextPrompt` produces for the same input — the
// second known divergence to close mechanically (B1b-2's paraphrased
// `systemPrompt`, see the descriptor's header comment).
// ---------------------------------------------------------------------------

type Fixture = {
  core: AssetCoreData;
  bible: AssetBibleData;
  style: ProjectStyleData;
};

function assemble(fixture: Fixture) {
  return assembleDescriptorMessages(assetBibleGenerateDescriptor, (variableId, render) => {
    switch (`${variableId}::${render}`) {
      case "ASSET.CORE::assetBible.coreLines":
        return renderAssetCoreBibleLines(fixture.core);
      case "ASSET.BIBLE::assetBible.existingBibleLines":
        return renderAssetBibleExistingLines(fixture.bible);
      case "PROJECT.STYLE::assetBible.styleBlock":
        return renderProjectStyleBibleBlock(fixture.style);
      case "PROJECT.STYLE::assetBible.finalRuleLine":
        return renderProjectStyleBibleFinalRule(fixture.style);
      case "ASSET.CORE::assetBible.closingLine":
        return renderAssetCoreClosingBible(fixture.core);
      default:
        throw new Error(`unexpected block ${variableId}::${render}`);
    }
  });
}

function toBuilderInput(fixture: Fixture): AssetBibleFromContextInput {
  return {
    asset: {
      name: fixture.core.name,
      type: fixture.core.type,
      description: fixture.core.description,
      notes: fixture.core.notes,
      visualIdentity: fixture.bible.visualIdentity,
      usageRules: fixture.bible.usageRules,
      forbiddenVariations: fixture.bible.forbiddenVariations,
    },
    style:
      fixture.style.mode === "active"
        ? {
            worldSegment: fixture.style.worldSegment,
            visualSegment: fixture.style.visualSegment,
            rulesSegment: fixture.style.rulesSegment,
          }
        : { worldSegment: "", visualSegment: "", rulesSegment: "" },
  };
}

describe("assetBible.generate descriptor — strict prompt equality", () => {
  it("matches buildAssetBibleFromContextPrompt for a complete Asset (existing Bible, active Style)", () => {
    const fixture: Fixture = {
      core: {
        name: "Hero Robot",
        type: "character",
        description: "A weathered combat robot.",
        notes: "Appears throughout Act 2.",
      },
      bible: {
        visualIdentity: "Matte grey chassis, one glowing blue optic.",
        usageRules: "Always framed from a low angle in combat.",
        forbiddenVariations: "Never shown with bright colors.",
      },
      style: {
        mode: "active",
        worldSegment: "A rain-soaked megacity.",
        visualSegment: "Neon and chrome.",
        rulesSegment: "Never show daylight.",
      },
    };
    const expected = buildAssetBibleFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildAssetBibleFromContextPrompt for a minimal Asset (no existing Bible, no Style)", () => {
    const fixture: Fixture = {
      core: { name: "Placeholder Prop", type: "prop", description: null, notes: null },
      bible: { visualIdentity: null, usageRules: null, forbiddenVariations: null },
      style: { mode: "none" },
    };
    const expected = buildAssetBibleFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
