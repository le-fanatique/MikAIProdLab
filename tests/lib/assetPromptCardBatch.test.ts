import { describe, it, expect } from "vitest";
import { isPromptCardMissing } from "@/lib/llmWorkspace/assetPromptCardBatch";

describe("isPromptCardMissing", () => {
  it("is missing when null", () => {
    expect(isPromptCardMissing(null)).toBe(true);
  });

  it("is missing when an empty string", () => {
    expect(isPromptCardMissing("")).toBe(true);
  });

  it("is missing when only spaces", () => {
    expect(isPromptCardMissing("   ")).toBe(true);
  });

  it("is missing when only whitespace (newlines and tabs)", () => {
    expect(isPromptCardMissing("\n\t ")).toBe(true);
  });

  it("is NOT missing when it holds a real value", () => {
    expect(isPromptCardMissing("silhouette anchors, matte black armor")).toBe(false);
  });

  it("is NOT missing when a real value is surrounded by whitespace", () => {
    expect(isPromptCardMissing("  silhouette anchors  \n")).toBe(false);
  });
});
