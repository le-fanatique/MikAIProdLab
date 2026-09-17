import { describe, it, expect } from "vitest";
import { isPromptCardMissing, selectApplyAllTargets } from "@/lib/llmWorkspace/assetPromptCardBatch";

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

describe("selectApplyAllTargets", () => {
  it("returns an empty list when nothing was generated", () => {
    const targets = selectApplyAllTargets([1, 2, 3], new Set(), new Set(), new Set());
    expect(targets).toEqual([]);
  });

  it("excludes an asset whose generation errored (never in `generated`)", () => {
    // 2 succeeded, 3 errored (so 3 is absent from `generated`).
    const targets = selectApplyAllTargets([1, 2, 3], new Set([2]), new Set(), new Set());
    expect(targets.map((t) => t.id)).toEqual([2]);
  });

  it("excludes an asset already applied in this pass", () => {
    const targets = selectApplyAllTargets([1, 2, 3], new Set([1, 2, 3]), new Set([2]), new Set());
    expect(targets.map((t) => t.id)).toEqual([1, 3]);
  });

  it("respects the order of `order`, not the insertion order of the Sets", () => {
    // `generated` is built here in the reverse order of `order` — if the
    // implementation ever iterated the Set instead of `order`, this would
    // catch it.
    const targets = selectApplyAllTargets([3, 1, 2], new Set([2, 1, 3]), new Set(), new Set());
    expect(targets.map((t) => t.id)).toEqual([3, 1, 2]);
  });

  it("marks `overwrites: true` for an asset that already carries a Prompt Card", () => {
    const targets = selectApplyAllTargets([1, 2], new Set([1, 2]), new Set(), new Set([1]));
    expect(targets).toEqual([
      { id: 1, overwrites: true },
      { id: 2, overwrites: false },
    ]);
  });

  it("marks `overwrites: false` for an asset with no existing Prompt Card", () => {
    const targets = selectApplyAllTargets([1], new Set([1]), new Set(), new Set());
    expect(targets).toEqual([{ id: 1, overwrites: false }]);
  });

  it("`some(overwrites)` is false when every target is brand new", () => {
    const targets = selectApplyAllTargets([1, 2, 3], new Set([1, 2, 3]), new Set(), new Set());
    expect(targets.some((t) => t.overwrites)).toBe(false);
  });
});
