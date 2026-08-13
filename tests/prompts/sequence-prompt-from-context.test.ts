import { describe, it, expect } from "vitest";
import { buildSequencePromptFromContextPrompt } from "@/lib/prompts/sequence-prompt-from-context";

describe("buildSequencePromptFromContextPrompt", () => {
  it("builds the 'generate' prompt with all optional fields present", () => {
    const result = buildSequencePromptFromContextPrompt({
      assistMode: "generate",
      projectName: "Neon Harvest",
      projectPitch: "A cyberpunk farmer defends her last crop.",
      projectStory: "Long story text describing the world.",
      sequenceTitle: "The Standoff",
      sequenceSummary: "Tense confrontation at dawn.",
      sequenceDescription: "Wide rooftop location.",
      sequenceMood: "tense",
      sequenceLocationHint: "Rooftop, dawn",
      currentSequencePrompt: "Existing draft.",
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the 'generate' prompt with optional fields absent/null", () => {
    const result = buildSequencePromptFromContextPrompt({
      projectName: "Neon Harvest",
      projectPitch: null,
      projectStory: null,
      sequenceTitle: "The Standoff",
      sequenceSummary: null,
      sequenceDescription: null,
      sequenceMood: null,
      sequenceLocationHint: null,
      currentSequencePrompt: null,
    });
    expect(result).toMatchSnapshot();
  });

  it("builds a transform-mode prompt (rewrite) with background context present", () => {
    const result = buildSequencePromptFromContextPrompt({
      assistMode: "rewrite",
      projectName: "Neon Harvest",
      sequenceTitle: "The Standoff",
      sequenceMood: "tense",
      sequenceLocationHint: "Rooftop, dawn",
      sequenceSummary: "Tense confrontation at dawn.",
      currentSequencePrompt: "Existing draft to rewrite.",
    });
    expect(result).toMatchSnapshot();
  });

  it("builds a transform-mode prompt (expand) with no background context and no current prompt", () => {
    const result = buildSequencePromptFromContextPrompt({
      assistMode: "expand",
      projectName: "Neon Harvest",
      sequenceTitle: "The Standoff",
      currentSequencePrompt: null,
    });
    expect(result).toMatchSnapshot();
  });
});
