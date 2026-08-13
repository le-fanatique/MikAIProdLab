import { describe, it, expect } from "vitest";
import { buildOutlineFromStoryPrompt } from "@/lib/prompts/outline-from-story";

describe("buildOutlineFromStoryPrompt", () => {
  it("builds the prompt with pitch, story and targetSections present", () => {
    const result = buildOutlineFromStoryPrompt({
      name: "Neon Harvest",
      pitch: "A cyberpunk farmer defends her last crop.",
      story: "Full narrative synopsis of the project.",
      targetSections: 5,
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the prompt with pitch, story and targetSections absent/null", () => {
    const result = buildOutlineFromStoryPrompt({
      name: "Neon Harvest",
      pitch: null,
      story: null,
      targetSections: null,
    });
    expect(result).toMatchSnapshot();
  });
});
