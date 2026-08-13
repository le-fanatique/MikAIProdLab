import { describe, it, expect } from "vitest";
import { buildShotsFromSequencePrompt } from "@/lib/prompts/shots-from-sequence";

describe("buildShotsFromSequencePrompt", () => {
  it("Path A (sequencePrompt present): builds the prompt with full project/sequence context", () => {
    const result = buildShotsFromSequencePrompt({
      project: {
        name: "Neon Harvest",
        pitch: "A cyberpunk farmer defends her last crop.",
        story: "Full narrative synopsis of the project.",
        outline: "## Opening\nMara arrives.",
      },
      sequence: {
        title: "The Standoff",
        summary: "Tense confrontation at dawn.",
        description: "Wide rooftop location.",
        narrativePurpose: "Climax",
        mood: "tense",
        locationHint: "Rooftop, dawn",
        sequencePrompt: "Approved sequence prompt describing the standoff.",
      },
      targetCount: 4,
    });
    expect(result).toMatchSnapshot();
  });

  it("Path B (sequencePrompt absent): builds the fallback prompt with every optional field absent/null", () => {
    const result = buildShotsFromSequencePrompt({
      project: { name: "Neon Harvest", pitch: null, story: null, outline: null },
      sequence: {
        title: "The Standoff",
        summary: null,
        description: null,
        narrativePurpose: null,
        mood: null,
        locationHint: null,
        sequencePrompt: null,
      },
    });
    expect(result).toMatchSnapshot();
  });
});
