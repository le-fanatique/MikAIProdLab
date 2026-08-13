import { describe, it, expect } from "vitest";
import { buildAssetAlignmentPrompt } from "@/lib/prompts/asset-alignment-from-context";

describe("buildAssetAlignmentPrompt", () => {
  it("builds the prompt with full project background and asset fields", () => {
    const result = buildAssetAlignmentPrompt({
      project: {
        name: "Neon Harvest",
        pitch: "A cyberpunk farmer defends her last crop.",
        story: "Full narrative synopsis.",
        outline: "## Opening\nMara arrives.",
      },
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

  it("builds the prompt with project background absent and asset fields empty", () => {
    const result = buildAssetAlignmentPrompt({
      project: { name: "Neon Harvest", pitch: null, story: null, outline: null },
      asset: {
        name: "Mara",
        type: "character",
        description: "",
        notes: "",
        visualIdentity: "",
        usageRules: "",
        forbiddenVariations: "",
      },
      style: { worldSegment: "Neon-lit dystopia.", visualSegment: "", rulesSegment: "" },
    });
    expect(result).toMatchSnapshot();
  });
});
