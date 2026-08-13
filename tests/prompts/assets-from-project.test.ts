import { describe, it, expect } from "vitest";
import { buildAssetsFromProjectPrompt } from "@/lib/prompts/assets-from-project";

describe("buildAssetsFromProjectPrompt", () => {
  it("builds the prompt with outline, shots and existing assets present", () => {
    const result = buildAssetsFromProjectPrompt({
      project: {
        name: "Neon Harvest",
        pitch: "A cyberpunk farmer defends her last crop.",
        story: "Full narrative synopsis.",
        outline: "## Opening\nMara arrives at the rooftop farm.",
      },
      sequences: [
        {
          title: "The Standoff",
          summary: "Tense confrontation.",
          description: "Rooftop location.",
          narrativePurpose: "Climax",
          mood: "tense",
          locationHint: "Rooftop",
        },
      ],
      shots: [
        {
          title: "Close on Mara",
          description: "Mara grips her weapon.",
          actionPitch: "She raises her weapon.",
          continuityIn: "Calm",
          continuityOut: "Alert",
        },
      ],
      existingAssets: [{ name: "Mara", type: "character" }],
      includeShots: true,
      assetTypes: ["character", "prop"],
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the prompt with outline absent, shots excluded, and no existing assets", () => {
    const result = buildAssetsFromProjectPrompt({
      project: {
        name: "Neon Harvest",
        pitch: null,
        story: "Full narrative synopsis.",
        outline: null,
      },
      sequences: [],
      existingAssets: [],
      includeShots: false,
      assetTypes: ["character"],
    });
    expect(result).toMatchSnapshot();
  });
});
