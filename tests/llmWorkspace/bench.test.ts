import { describe, expect, it } from "vitest";
import {
  buildVariablePreviewRows,
  normalizeBenchSelection,
  parseIntentInputFromSearchParams,
  parseSelectionFromSearchParams,
  parseTemplateRef,
} from "@/lib/llmWorkspace/bench";
import { outlineGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/outline";
import { sequencePromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/sequencePrompt";

describe("parseTemplateRef — LLMW.BENCH.READ.1 (B6b) §3", () => {
  it("a positive integer segment resolves to a stored row", () => {
    expect(parseTemplateRef("42")).toEqual({ kind: "stored", id: 42 });
  });

  it("a dotted built-in descriptor id resolves to a built-in reference", () => {
    expect(parseTemplateRef("story.generate")).toEqual({ kind: "builtin", id: "story.generate" });
  });

  it('"0" is not a positive integer — built-in, per the export route\'s own parseInt convention', () => {
    expect(parseTemplateRef("0")).toEqual({ kind: "builtin", id: "0" });
  });

  it('"-3" is not a positive integer — built-in', () => {
    expect(parseTemplateRef("-3")).toEqual({ kind: "builtin", id: "-3" });
  });

  it('"12abc" — parseInt("12abc", 10) is 12, a positive integer, so this resolves to stored id 12, matching the export route\'s own convention exactly', () => {
    expect(parseTemplateRef("12abc")).toEqual({ kind: "stored", id: 12 });
  });

  it("an empty string is not a positive integer — built-in with an empty id, resolved to notFound() by the route, not by this function", () => {
    expect(parseTemplateRef("")).toEqual({ kind: "builtin", id: "" });
  });
});

describe("normalizeBenchSelection — LLMW.BENCH.READ.1 (B6b) §4.1", () => {
  it("project anchor: only projectId is required, present -> complete", () => {
    const result = normalizeBenchSelection({
      anchorEntity: "project",
      selection: { projectId: 1 },
      sequenceIds: [],
      shotIds: [],
      assetIds: [],
    });
    expect(result).toEqual({ selection: { projectId: 1, sequenceId: undefined, shotId: undefined, assetId: undefined }, complete: true });
  });

  it("sequence anchor: complete selection", () => {
    const result = normalizeBenchSelection({
      anchorEntity: "sequence",
      selection: { projectId: 1, sequenceId: 10 },
      sequenceIds: [10, 11],
      shotIds: [],
      assetIds: [],
    });
    expect(result.complete).toBe(true);
    expect(result.selection).toEqual({ projectId: 1, sequenceId: 10, shotId: undefined, assetId: undefined });
  });

  it("shot anchor: a sequence not belonging to the project is dropped, and the shot downstream of it is dropped too", () => {
    const result = normalizeBenchSelection({
      anchorEntity: "shot",
      selection: { projectId: 1, sequenceId: 99, shotId: 500 },
      sequenceIds: [10, 11], // sequence 99 does not belong to project 1
      shotIds: [500, 501], // shot 500 would otherwise be valid
      assetIds: [],
    });
    expect(result.selection).toEqual({ projectId: 1, sequenceId: undefined, shotId: undefined, assetId: undefined });
    expect(result.complete).toBe(false);
  });

  it("shot anchor: a shot not belonging to the (valid) selected sequence is dropped, the sequence stays", () => {
    const result = normalizeBenchSelection({
      anchorEntity: "shot",
      selection: { projectId: 1, sequenceId: 10, shotId: 999 },
      sequenceIds: [10, 11],
      shotIds: [500, 501], // 999 does not belong to sequence 10
      assetIds: [],
    });
    expect(result.selection).toEqual({ projectId: 1, sequenceId: 10, shotId: undefined, assetId: undefined });
    expect(result.complete).toBe(false);
  });

  it("shot anchor: complete selection with a valid chain", () => {
    const result = normalizeBenchSelection({
      anchorEntity: "shot",
      selection: { projectId: 1, sequenceId: 10, shotId: 500 },
      sequenceIds: [10, 11],
      shotIds: [500, 501],
      assetIds: [],
    });
    expect(result.selection).toEqual({ projectId: 1, sequenceId: 10, shotId: 500, assetId: undefined });
    expect(result.complete).toBe(true);
  });

  it("asset anchor: an asset belonging to a different project is dropped", () => {
    const result = normalizeBenchSelection({
      anchorEntity: "asset",
      selection: { projectId: 1, assetId: 77 },
      sequenceIds: [],
      shotIds: [],
      assetIds: [80, 81], // 77 does not belong to project 1
    });
    expect(result.selection).toEqual({ projectId: 1, sequenceId: undefined, shotId: undefined, assetId: undefined });
    expect(result.complete).toBe(false);
  });

  it("asset anchor: complete selection", () => {
    const result = normalizeBenchSelection({
      anchorEntity: "asset",
      selection: { projectId: 1, assetId: 80 },
      sequenceIds: [],
      shotIds: [],
      assetIds: [80, 81],
    });
    expect(result.selection).toEqual({ projectId: 1, sequenceId: undefined, shotId: undefined, assetId: 80 });
    expect(result.complete).toBe(true);
  });

  it("empty selection is never complete, for every anchor entity", () => {
    for (const anchorEntity of ["project", "sequence", "shot", "asset"] as const) {
      const result = normalizeBenchSelection({
        anchorEntity,
        selection: {},
        sequenceIds: [],
        shotIds: [],
        assetIds: [],
      });
      expect(result.complete).toBe(false);
    }
  });
});

describe("parseSelectionFromSearchParams", () => {
  it("reads positive integers and drops anything else", () => {
    expect(
      parseSelectionFromSearchParams({ projectId: "1", sequenceId: "0", shotId: "abc", assetId: undefined })
    ).toEqual({ projectId: 1, sequenceId: undefined, shotId: undefined, assetId: undefined });
  });

  it("takes the first value of a repeated query key", () => {
    expect(parseSelectionFromSearchParams({ projectId: ["3", "4"] })).toEqual({
      projectId: 3,
      sequenceId: undefined,
      shotId: undefined,
      assetId: undefined,
    });
  });
});

describe("parseIntentInputFromSearchParams", () => {
  it("falls back to defaultMode when no mode param is present", () => {
    const intent = parseIntentInputFromSearchParams(sequencePromptAssistDescriptor, {});
    expect(intent.mode).toBe(sequencePromptAssistDescriptor.intent.mode!.defaultMode);
  });

  it("falls back to defaultMode when the requested mode is unknown", () => {
    const intent = parseIntentInputFromSearchParams(sequencePromptAssistDescriptor, { mode: "not-a-real-mode" });
    expect(intent.mode).toBe(sequencePromptAssistDescriptor.intent.mode!.defaultMode);
  });

  it("keeps a known requested mode", () => {
    const intent = parseIntentInputFromSearchParams(sequencePromptAssistDescriptor, { mode: "enhance" });
    expect(intent.mode).toBe("enhance");
  });

  it("an integer parameter left blank is omitted, not defaulted", () => {
    const intent = parseIntentInputFromSearchParams(outlineGenerateDescriptor, { targetSections: "" });
    expect(intent.parameters).toBeUndefined();
  });

  it("an integer parameter with a value is parsed as a number", () => {
    const intent = parseIntentInputFromSearchParams(outlineGenerateDescriptor, { targetSections: "6" });
    expect(intent.parameters).toEqual({ targetSections: 6 });
  });
});

describe("buildVariablePreviewRows", () => {
  it("renders null explicitly rather than dropping the row", () => {
    const rows = buildVariablePreviewRows([{ id: "PROJECT.IDENTITY", data: null }]);
    expect(rows).toEqual([
      { id: "PROJECT.IDENTITY", text: "null", charCount: 4, tokenEstimate: 1 },
    ]);
  });

  it("serialises resolved data readable and computes its char/token cost", () => {
    const rows = buildVariablePreviewRows([{ id: "PROJECT.IDENTITY", data: { name: "X" } }]);
    expect(rows[0].text).toBe(JSON.stringify({ name: "X" }, null, 2));
    expect(rows[0].charCount).toBe(rows[0].text.length);
  });
});
