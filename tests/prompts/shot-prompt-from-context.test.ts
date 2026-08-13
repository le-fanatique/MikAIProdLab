import { describe, it, expect } from "vitest";
import { buildShotPromptFromContextPrompt } from "@/lib/prompts/shot-prompt-from-context";

describe("buildShotPromptFromContextPrompt", () => {
  it("builds the 'generate' prompt with all optional fields present", () => {
    const result = buildShotPromptFromContextPrompt({
      projectName: "Neon Harvest",
      projectPitch: "A cyberpunk farmer defends her last crop.",
      projectStory: "Long story text describing the world.",
      sequenceTitle: "The Standoff",
      sequenceSummary: "Tense confrontation at dawn.",
      sequenceDescription: "Wide rooftop location.",
      sequenceMood: "tense",
      sequenceLocationHint: "Rooftop, dawn",
      shotTitle: "Close on Mara",
      shotCode: "SH010",
      shotDescription: "Mara grips her weapon.",
      actionPitch: "She raises her weapon slowly.",
      cameraPitch: "Low angle, wide lens.",
      framing: "CU",
      cameraMovement: "static",
      durationSeconds: 5,
      currentShotPrompt: "Existing draft prompt.",
      castSummary: ["Mara", "Drone"],
      referenceSummary: ["ref-1", "ref-2"],
      assistMode: "generate",
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the 'generate' prompt with optional fields absent/null/empty", () => {
    const result = buildShotPromptFromContextPrompt({
      projectName: "Neon Harvest",
      projectPitch: null,
      projectStory: null,
      sequenceTitle: "The Standoff",
      sequenceSummary: null,
      sequenceDescription: null,
      sequenceMood: null,
      sequenceLocationHint: null,
      shotTitle: "Close on Mara",
      shotCode: null,
      shotDescription: null,
      actionPitch: null,
      cameraPitch: null,
      framing: null,
      cameraMovement: null,
      durationSeconds: null,
      currentShotPrompt: "",
      castSummary: [],
      referenceSummary: [],
    });
    expect(result).toMatchSnapshot();
  });

  it("builds a transform-mode prompt (enhance) with context present", () => {
    const result = buildShotPromptFromContextPrompt({
      projectName: "Neon Harvest",
      sequenceTitle: "The Standoff",
      shotTitle: "Close on Mara",
      shotDescription: "Mara grips her weapon.",
      sequenceMood: "tense",
      sequenceLocationHint: "Rooftop, dawn",
      currentShotPrompt: "Existing draft prompt to enhance.",
      assistMode: "enhance",
    });
    expect(result).toMatchSnapshot();
  });

  it("builds a transform-mode prompt (shorten) with no background context and no current prompt", () => {
    const result = buildShotPromptFromContextPrompt({
      projectName: "Neon Harvest",
      sequenceTitle: "The Standoff",
      shotTitle: "Close on Mara",
      currentShotPrompt: null,
      assistMode: "shorten",
    });
    expect(result).toMatchSnapshot();
  });
});
