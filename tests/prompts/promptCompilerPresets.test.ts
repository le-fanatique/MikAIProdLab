import { describe, it, expect } from "vitest";
import {
  PROMPT_COMPILER_PRESETS,
  getDefaultSourceFlags,
  isSourceLocked,
  resolveEffectiveSourceFlags,
  validatePresetRequirements,
  computePromptCompilerFingerprint,
  cleanDraftText,
  buildPromptCompilerUserMessage,
  type PromptCompilerPresetId,
} from "@/lib/prompts/promptCompilerPresets";
import type { PromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";

// getDefaultSourceFlags takes a single required PromptCompilerPreset object
// (no optional field) — one representative preset per requirement shape is
// enough to exercise the required/recommended -> true, optional/excluded ->
// false mapping; there is no "field absent" branch to cover.
describe("getDefaultSourceFlags", () => {
  it("maps required/recommended sources to true and optional/excluded to false (text-to-video)", () => {
    const result = getDefaultSourceFlags(PROMPT_COMPILER_PRESETS["text-to-video"]);
    expect(result).toMatchSnapshot();
  });
});

// isSourceLocked also takes only required arguments — both outcomes (locked
// vs not) are covered as the only real branch.
describe("isSourceLocked", () => {
  it("returns true for a required source", () => {
    expect(isSourceLocked(PROMPT_COMPILER_PRESETS["animate-keyframe"], "references")).toBe(true);
  });

  it("returns false for a recommended (unlocked) source", () => {
    expect(isSourceLocked(PROMPT_COMPILER_PRESETS["animate-keyframe"], "assetBibles")).toBe(false);
  });
});

describe("resolveEffectiveSourceFlags", () => {
  it("uses the user's overrides for recommended/optional sources", () => {
    const result = resolveEffectiveSourceFlags(PROMPT_COMPILER_PRESETS["text-to-video"], {
      casting: false,
      projectContext: true,
    });
    expect(result).toMatchSnapshot();
  });

  it("falls back to the preset defaults when userFlags is empty (absent overrides)", () => {
    const result = resolveEffectiveSourceFlags(PROMPT_COMPILER_PRESETS["text-to-video"], {});
    expect(result).toMatchSnapshot();
  });
});

function minimalContext(overrides: Partial<PromptCompilationContext> = {}): PromptCompilationContext {
  return {
    shot: {
      title: null,
      description: null,
      actionPitch: null,
      cameraPitch: null,
      durationSeconds: null,
      shotPrompt: null,
      compiledPromptSegments: null,
      hasPromptSegments: false,
      hasMissingTiming: false,
    },
    castAssets: [],
    references: [],
    assetBibles: [],
    sequenceContext: null,
    projectContext: null,
    sourcesIncluded: ["shot"],
    sourcesExcluded: [],
    imageMap: {},
    warnings: [],
    ...overrides,
  };
}

describe("validatePresetRequirements", () => {
  it("text-to-video: ok when duration and a shot prompt are present", () => {
    const result = validatePresetRequirements(
      "text-to-video",
      minimalContext({ shot: { ...minimalContext().shot, durationSeconds: 5, shotPrompt: "Mara stands." } })
    );
    expect(result).toMatchSnapshot();
  });

  it("text-to-video: missing when duration and shot text are all absent", () => {
    const result = validatePresetRequirements("text-to-video" as PromptCompilerPresetId, minimalContext());
    expect(result).toMatchSnapshot();
  });

  it("reference-to-video: ok when duration and a reference are present", () => {
    const result = validatePresetRequirements(
      "reference-to-video",
      minimalContext({
        shot: { ...minimalContext().shot, durationSeconds: 5 },
        references: [
          {
            tag: "@Image1",
            refId: "shot-1",
            source: "shot",
            assetId: null,
            assetName: null,
            label: null,
            role: null,
            variantState: null,
            usageNotes: null,
            approvedForGeneration: null,
          },
        ],
      })
    );
    expect(result).toMatchSnapshot();
  });

  it("first-last-frame: missing when no First Frame or Last Frame reference is present", () => {
    const result = validatePresetRequirements(
      "first-last-frame",
      minimalContext({ shot: { ...minimalContext().shot, durationSeconds: 5 } })
    );
    expect(result).toMatchSnapshot();
  });
});

// computePromptCompilerFingerprint takes only required arguments (no optional
// field) — a single deterministic case is enough to snapshot its shape.
describe("computePromptCompilerFingerprint", () => {
  it("produces a deterministic JSON fingerprint from presetId, sourceFlags and context", () => {
    const result = computePromptCompilerFingerprint(
      "text-to-video",
      getDefaultSourceFlags(PROMPT_COMPILER_PRESETS["text-to-video"]),
      minimalContext()
    );
    expect(result).toMatchSnapshot();
  });
});

describe("cleanDraftText", () => {
  it("strips a ```json fenced block", () => {
    const result = cleanDraftText("```json\nMara stands on the rooftop.\n```");
    expect(result).toMatchSnapshot();
  });

  it("returns the trimmed text unchanged when there is no code fence", () => {
    const result = cleanDraftText("  Mara stands on the rooftop.  ");
    expect(result).toMatchSnapshot();
  });
});

describe("buildPromptCompilerUserMessage", () => {
  it("formats every section when the context is fully populated", () => {
    const context = minimalContext({
      shot: {
        title: "Close on Mara",
        description: "Mara grips her weapon.",
        actionPitch: "She raises her weapon.",
        cameraPitch: "Low angle.",
        durationSeconds: 5,
        shotPrompt: "Mara stands on the rooftop.",
        compiledPromptSegments: "0-2s: static shot",
        hasPromptSegments: true,
        hasMissingTiming: false,
      },
      castAssets: [
        { assetId: 1, assetName: "Mara", assetType: "character", description: "cyberpunk farmer", notes: "protagonist", assetBible: null },
      ],
      references: [
        {
          tag: "@Image1",
          refId: "shot-1",
          source: "shot",
          assetId: null,
          assetName: null,
          label: "Rooftop wide",
          role: "establishing",
          variantState: "day",
          usageNotes: "wide framing",
          approvedForGeneration: null,
        },
      ],
      assetBibles: [
        {
          assetId: 1,
          assetName: "Mara",
          assetType: "character",
          visualIdentity: "Tall, weathered coat.",
          usageRules: "Always framed with her tools.",
          forbiddenVariations: "Never smiling.",
        },
      ],
      sequenceContext: {
        title: "The Standoff",
        summary: "Tense confrontation.",
        mood: "tense",
        locationHint: "Rooftop",
        narrativePurpose: "Climax",
      },
      projectContext: { name: "Neon Harvest", pitch: "A cyberpunk farmer.", story: "Full story." },
    });
    expect(buildPromptCompilerUserMessage(context)).toMatchSnapshot();
  });

  it("returns an empty message when every section is empty (minimal context)", () => {
    expect(buildPromptCompilerUserMessage(minimalContext())).toMatchSnapshot();
  });
});
