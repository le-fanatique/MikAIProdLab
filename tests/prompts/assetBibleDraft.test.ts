import { describe, it, expect } from "vitest";
import {
  extractAssetBibleCodeFence,
  parseAssetBibleDraft,
  preserveAssetBibleField,
} from "@/lib/prompts/assetBibleDraft";

describe("extractAssetBibleCodeFence", () => {
  it("strips a ```json fenced block", () => {
    const result = extractAssetBibleCodeFence('```json\n{"visual_identity":"x"}\n```');
    expect(result).toMatchSnapshot();
  });

  it("returns the trimmed text unchanged when there is no fence", () => {
    const result = extractAssetBibleCodeFence('  {"visual_identity":"x"}  ');
    expect(result).toMatchSnapshot();
  });
});

describe("parseAssetBibleDraft", () => {
  it("parses a valid JSON draft with all three fields present", () => {
    const raw = JSON.stringify({
      visual_identity: "Tall, weathered coat.",
      usage_rules: "Always framed with her tools.",
      forbidden_variations: "Never smiling.",
    });
    expect(parseAssetBibleDraft(raw)).toMatchSnapshot();
  });

  it("defaults missing/absent fields to empty strings when at least one field is present", () => {
    const raw = JSON.stringify({ visual_identity: "Tall, weathered coat." });
    expect(parseAssetBibleDraft(raw)).toMatchSnapshot();
  });

  it("throws when the response is not valid JSON", () => {
    expect(() => parseAssetBibleDraft("not json")).toThrowError(
      "The model returned an unexpected format. Try again."
    );
  });

  it("throws when every field is empty", () => {
    const raw = JSON.stringify({ visual_identity: "", usage_rules: "", forbidden_variations: "" });
    expect(() => parseAssetBibleDraft(raw)).toThrowError(
      "The model returned an empty draft. Try again."
    );
  });
});

describe("preserveAssetBibleField", () => {
  it("uses the applied value when it is non-empty", () => {
    expect(preserveAssetBibleField("Existing value.", "New value.")).toBe("New value.");
  });

  it("falls back to the existing value when the applied value is empty/whitespace", () => {
    expect(preserveAssetBibleField("Existing value.", "   ")).toBe("Existing value.");
  });
});
