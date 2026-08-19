import { describe, it, expect } from "vitest";
import { resolvePromptCompilerTextNode } from "@/lib/prompts/workflowTextNode";

describe("resolvePromptCompilerTextNode", () => {
  it("resolves the single generic candidate", () => {
    const result = resolvePromptCompilerTextNode([
      { nodeId: "5", label: "Text Prompt", title: "Text Prompt (Input)" },
      { nodeId: "6", label: "Negative Prompt", title: "Negative Prompt (Input)" },
    ]);
    expect(result).toMatchSnapshot();
  });

  it("fails when zero generic candidates are present", () => {
    const result = resolvePromptCompilerTextNode([
      { nodeId: "6", label: "Negative Prompt", title: "Negative Prompt (Input)" },
    ]);
    expect(result).toMatchSnapshot();
  });

  it("fails when more than one generic candidate is present", () => {
    const result = resolvePromptCompilerTextNode([
      { nodeId: "5", label: "Text Prompt", title: "Text Prompt (Input)" },
      { nodeId: "7", label: "Another Prompt", title: "Another Prompt (Input)" },
    ]);
    expect(result).toMatchSnapshot();
  });
});
