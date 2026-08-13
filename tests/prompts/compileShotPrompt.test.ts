import { describe, it, expect } from "vitest";
import { compileShotPrompt } from "@/lib/prompts/compileShotPrompt";

describe("compileShotPrompt", () => {
  it("video kind: shotPrompt + Prompt Segments present, no missing timing", () => {
    const result = compileShotPrompt({
      kind: "video",
      shotPrompt: "Mara stands on the rooftop.",
      compiledPromptSegments: "0-2s: static shot\n2-5s: she raises her weapon",
      hasPromptSegments: true,
      hasMissingTiming: false,
    });
    expect(result).toMatchSnapshot();
  });

  it("video kind: every optional field absent/empty (empty Shot Prompt, no Prompt Segments)", () => {
    const result = compileShotPrompt({
      kind: "video",
    });
    expect(result).toMatchSnapshot();
  });

  it("video kind: Prompt Segments exist but produced no compiled text, with missing timing", () => {
    const result = compileShotPrompt({
      kind: "video",
      shotPrompt: "Mara stands on the rooftop.",
      compiledPromptSegments: "",
      hasPromptSegments: true,
      hasMissingTiming: true,
    });
    expect(result).toMatchSnapshot();
  });

  it("image kind: shotPrompt present, Prompt Segments exist but are informational-only", () => {
    const result = compileShotPrompt({
      kind: "image",
      shotPrompt: "Mara stands on the rooftop.",
      compiledPromptSegments: "0-2s: static shot",
      hasPromptSegments: true,
      hasMissingTiming: false,
    });
    expect(result).toMatchSnapshot();
  });
});
