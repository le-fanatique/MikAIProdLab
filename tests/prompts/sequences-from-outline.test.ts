import { describe, it, expect } from "vitest";
import { buildSequencesFromOutlinePrompt } from "@/lib/prompts/sequences-from-outline";

describe("buildSequencesFromOutlinePrompt", () => {
  it("Path B (outline absent): builds the fallback prompt with pitch/story and targetCount present", () => {
    const result = buildSequencesFromOutlinePrompt({
      name: "Neon Harvest",
      pitch: "A cyberpunk farmer defends her last crop.",
      story: "Full narrative synopsis of the project.",
      outline: null,
      targetCount: 4,
    });
    expect(result).toMatchSnapshot();
  });

  it("Path B (outline absent): builds the fallback prompt with every optional field absent", () => {
    const result = buildSequencesFromOutlinePrompt({
      name: "Neon Harvest",
      pitch: null,
      story: null,
      outline: null,
      targetCount: null,
    });
    expect(result).toMatchSnapshot();
  });

  it("Path A (outline present): builds the prompt from the raw outline text, no sectionCount/outlineSections", () => {
    const result = buildSequencesFromOutlinePrompt({
      name: "Neon Harvest",
      pitch: "A cyberpunk farmer defends her last crop.",
      story: "Full narrative synopsis.",
      outline: "## Opening — The Arrival\nMara arrives at the rooftop farm.\n\n## Climax\nThe standoff.",
    });
    expect(result).toMatchSnapshot();
  });

  it("Path A (outline present): builds the prompt from parsed outlineSections, with sectionCount and no pitch/story", () => {
    const result = buildSequencesFromOutlinePrompt({
      name: "Neon Harvest",
      pitch: null,
      story: null,
      outline: "## Opening — The Arrival\nMara arrives.\n\n## Climax\nThe standoff.",
      sectionCount: 2,
      outlineSections: [
        { title: "Opening — The Arrival", body: "Mara arrives at the rooftop farm." },
        { title: "Climax", body: "" },
      ],
    });
    expect(result).toMatchSnapshot();
  });
});
