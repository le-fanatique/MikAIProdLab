import { describe, it, expect } from "vitest";
import { buildStoryFromPitchPrompt } from "@/lib/prompts/story-from-pitch";

describe("buildStoryFromPitchPrompt", () => {
  it("builds the prompt with all fields present", () => {
    const result = buildStoryFromPitchPrompt({
      name: "Neon Harvest",
      pitch: "A cyberpunk farmer defends her last crop from a mega-corp.",
      description: "Tone: gritty, hopeful ending.",
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the prompt with optional fields absent (null)", () => {
    const result = buildStoryFromPitchPrompt({
      name: "Neon Harvest",
      pitch: null,
      description: null,
    });
    expect(result).toMatchSnapshot();
  });
});
