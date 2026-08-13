import { describe, it, expect } from "vitest";
import { buildAssetBibleFromContextPrompt } from "@/lib/prompts/asset-bible-from-context";

describe("buildAssetBibleFromContextPrompt", () => {
  it("builds the prompt with an existing bible and an active Project Style", () => {
    const result = buildAssetBibleFromContextPrompt({
      asset: {
        name: "Mara",
        type: "character",
        description: "A cyberpunk farmer.",
        notes: "Protagonist.",
        visualIdentity: "Tall, weathered coat.",
        usageRules: "Always framed with her tools.",
        forbiddenVariations: "Never smiling.",
      },
      style: {
        worldSegment: "Neon-lit dystopia.",
        visualSegment: "High contrast, teal and orange.",
        rulesSegment: "Never depict corporate logos.",
      },
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the prompt with no existing bible and no Project Style (byte-identical to pre-Style output)", () => {
    const result = buildAssetBibleFromContextPrompt({
      asset: {
        name: "Mara",
        type: "character",
        description: null,
        notes: null,
        visualIdentity: null,
        usageRules: null,
        forbiddenVariations: null,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the prompt with an existing bible but no active Project Style", () => {
    const result = buildAssetBibleFromContextPrompt({
      asset: {
        name: "Mara",
        type: "character",
        description: "A cyberpunk farmer.",
        notes: null,
        visualIdentity: "Tall, weathered coat.",
        usageRules: null,
        forbiddenVariations: null,
      },
      style: { worldSegment: "", visualSegment: "", rulesSegment: "" },
    });
    expect(result).toMatchSnapshot();
  });
});
