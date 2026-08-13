import { describe, it, expect } from "vitest";
import { buildPromptCompilerSystemPrompt } from "@/lib/prompts/promptCompilerSystemPrompt";
import { PROMPT_COMPILER_PRESETS } from "@/lib/prompts/promptCompilerPresets";

// buildPromptCompilerSystemPrompt takes a single required PromptCompilerPreset
// object (no optional fields) — there is no "absent/empty optional field" case
// to cover here. Two different real presets are used instead to exercise the
// only branch point that exists: which preset's instructions get appended.
describe("buildPromptCompilerSystemPrompt", () => {
  it("combines the shared system prompt with the text-to-video preset instructions", () => {
    const result = buildPromptCompilerSystemPrompt(PROMPT_COMPILER_PRESETS["text-to-video"]);
    expect(result).toMatchSnapshot();
  });

  it("combines the shared system prompt with the first-last-frame preset instructions", () => {
    const result = buildPromptCompilerSystemPrompt(PROMPT_COMPILER_PRESETS["first-last-frame"]);
    expect(result).toMatchSnapshot();
  });
});
