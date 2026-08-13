import { describe, it, expect } from "vitest";
import {
  getPromptCompilerHandoffStorageKey,
  buildPromptCompilerHandoff,
  sanitizePromptCompilerHandoff,
  evaluatePromptCompilerHandoff,
  buildSearchParamsWithTextOverride,
  buildSearchParamsWithoutTextOverride,
  resolvePromptCompilerTextNode,
  type PromptCompilerHandoff,
  type PromptCompilerHandoffLiveData,
} from "@/lib/prompts/promptCompilerHandoff";

// getPromptCompilerHandoffStorageKey takes only a required shotId — one
// deterministic case is enough.
describe("getPromptCompilerHandoffStorageKey", () => {
  it("builds the deterministic storage key for a shot id", () => {
    expect(getPromptCompilerHandoffStorageKey(42)).toBe("mikai:promptCompilerHandoff:shot:42");
  });
});

const fullReference = {
  tag: "@Image1",
  refId: "shot-1",
  source: "shot" as const,
  assetId: null,
  assetName: null,
  label: "Rooftop wide",
  role: "establishing",
  variantState: "day",
  usageNotes: "wide framing",
  approvedForGeneration: null,
};

describe("buildPromptCompilerHandoff", () => {
  it("trims/bounds the draft text and copies every collection (nominal case with references)", () => {
    const result = buildPromptCompilerHandoff({
      shotId: 1,
      draftText: "  Mara stands on the rooftop.  ",
      presetId: "text-to-video",
      sourceFlags: {
        casting: true,
        references: false,
        assetBibles: true,
        sequenceContext: true,
        projectContext: false,
      },
      fingerprint: "fp-1",
      references: [fullReference],
      availableReferenceRefIds: ["shot-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result).toMatchSnapshot();
  });

  it("builds an empty handoff when references and availableReferenceRefIds are empty arrays", () => {
    const result = buildPromptCompilerHandoff({
      shotId: 1,
      draftText: "",
      presetId: "text-to-video",
      sourceFlags: {
        casting: false,
        references: false,
        assetBibles: false,
        sequenceContext: false,
        projectContext: false,
      },
      fingerprint: "fp-empty",
      references: [],
      availableReferenceRefIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result).toMatchSnapshot();
  });
});

describe("sanitizePromptCompilerHandoff", () => {
  it("parses a structurally valid raw object", () => {
    const raw = {
      shotId: 1,
      draftText: "Mara stands on the rooftop.",
      presetId: "text-to-video",
      sourceFlags: {
        casting: true,
        references: false,
        assetBibles: true,
        sequenceContext: true,
        projectContext: false,
      },
      fingerprint: "fp-1",
      references: [fullReference],
      availableReferenceRefIds: ["shot-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(sanitizePromptCompilerHandoff(raw)).toMatchSnapshot();
  });

  it("returns null when a required field is missing (structurally invalid)", () => {
    const raw = { draftText: "Mara stands." };
    expect(sanitizePromptCompilerHandoff(raw)).toBeNull();
  });

  it("normalizes a reference entry whose optional fields are absent to null", () => {
    const raw = {
      shotId: 1,
      draftText: "Mara stands.",
      presetId: "text-to-video",
      sourceFlags: {
        casting: false,
        references: false,
        assetBibles: false,
        sequenceContext: false,
        projectContext: false,
      },
      fingerprint: "fp-1",
      references: [{ tag: "@Image1", refId: "shot-1", source: "shot" }],
      availableReferenceRefIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(sanitizePromptCompilerHandoff(raw)).toMatchSnapshot();
  });
});

const baseHandoff: PromptCompilerHandoff = buildPromptCompilerHandoff({
  shotId: 1,
  draftText: "Mara stands on the rooftop.",
  presetId: "text-to-video",
  sourceFlags: {
    casting: true,
    references: false,
    assetBibles: false,
    sequenceContext: false,
    projectContext: false,
  },
  fingerprint: "",
  references: [],
  availableReferenceRefIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("evaluatePromptCompilerHandoff", () => {
  it("is not stale when the live data matches the handoff exactly (fingerprint recomputed to match)", () => {
    const live: PromptCompilerHandoffLiveData = {
      shot: {},
      castAssets: [],
      assetBibles: [],
      sequenceContext: null,
      projectContext: null,
      availableReferenceRefIds: [],
      availableReferencesByRefId: {},
    };
    const evaluation = evaluatePromptCompilerHandoff(
      { ...baseHandoff, fingerprint: "placeholder" },
      live
    );
    // Replace the fingerprint with the freshly computed one so this fixture
    // is self-consistent, then re-evaluate to assert the "not stale" branch.
    const consistentHandoff = { ...baseHandoff, fingerprint: evaluation.currentFingerprint };
    const result = evaluatePromptCompilerHandoff(consistentHandoff, live);
    expect(result.stale).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.missingReferenceRefIds).toEqual([]);
  });

  it("is stale when a referenced image is no longer available", () => {
    const handoff: PromptCompilerHandoff = { ...baseHandoff, references: [fullReference], availableReferenceRefIds: ["shot-1"] };
    const live: PromptCompilerHandoffLiveData = {
      shot: {},
      castAssets: [],
      assetBibles: [],
      sequenceContext: null,
      projectContext: null,
      availableReferenceRefIds: [],
      availableReferencesByRefId: {},
    };
    const result = evaluatePromptCompilerHandoff(handoff, live);
    expect(result.stale).toBe(true);
    expect(result.missingReferenceRefIds).toEqual(["shot-1"]);
    expect(result.reasons).toMatchSnapshot();
  });
});

describe("buildSearchParamsWithTextOverride", () => {
  it("replaces a prior value for the same node id", () => {
    const result = buildSearchParamsWithTextOverride({ textNode_5: "old", other: "kept" }, "5", "new value");
    expect(result).toBe("other=kept&textNode_5=new+value");
  });

  it("adds the override when currentSearchParams is empty", () => {
    const result = buildSearchParamsWithTextOverride({}, "5", "value");
    expect(result).toBe("textNode_5=value");
  });
});

describe("buildSearchParamsWithoutTextOverride", () => {
  it("removes the node's override, keeping other params", () => {
    const result = buildSearchParamsWithoutTextOverride({ textNode_5: "old", other: "kept" }, "5");
    expect(result).toBe("other=kept");
  });

  it("returns an empty string when currentSearchParams is empty", () => {
    const result = buildSearchParamsWithoutTextOverride({}, "5");
    expect(result).toBe("");
  });
});

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
