import { describe, it, expect } from "vitest";
import { buildPromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";

describe("buildPromptCompilationContext", () => {
  it("builds the context with every source enabled and full data", () => {
    const result = buildPromptCompilationContext({
      shot: {
        title: "Close on Mara",
        description: "Mara grips her weapon.",
        actionPitch: "She raises her weapon.",
        cameraPitch: "Low angle, wide lens.",
        durationSeconds: 5,
        shotPrompt: "Mara stands on the rooftop.",
        compiledPromptSegments: "0-2s: static shot",
        hasPromptSegments: true,
        hasMissingTiming: false,
      },
      castAssets: [
        { assetId: 1, assetName: "Mara", assetType: "character", description: "cyberpunk farmer", notes: "protagonist" },
      ],
      references: [
        {
          refId: "shot-1",
          source: "shot",
          label: "Rooftop wide",
          role: "establishing",
          variantState: "day",
          usageNotes: "use for wide framing",
        },
        {
          refId: "asset-1-2",
          source: "asset",
          assetId: 1,
          assetName: "Mara",
          label: "Mara identity",
          role: "identity",
          variantState: "default",
          usageNotes: null,
          approvedForGeneration: true,
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
      sources: {
        casting: true,
        references: true,
        assetBibles: true,
        sequenceContext: true,
        projectContext: true,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the context with every source disabled and only required shot fields", () => {
    const result = buildPromptCompilationContext({
      shot: {},
      castAssets: [],
      references: [],
      assetBibles: [],
      sequenceContext: null,
      projectContext: null,
      sources: {
        casting: false,
        references: false,
        assetBibles: false,
        sequenceContext: false,
        projectContext: false,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it("emits 'produced no content' warnings when sources are enabled but their inputs are empty", () => {
    const result = buildPromptCompilationContext({
      shot: { title: "Close on Mara" },
      castAssets: [],
      references: [],
      assetBibles: [],
      sequenceContext: { title: null, summary: null, mood: null, locationHint: null, narrativePurpose: null },
      projectContext: { name: null, pitch: null, story: null },
      sources: {
        casting: true,
        references: true,
        assetBibles: true,
        sequenceContext: true,
        projectContext: true,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it("deduplicates references, cast assets and asset bibles that share the same id", () => {
    const result = buildPromptCompilationContext({
      shot: { title: "Close on Mara" },
      castAssets: [
        { assetId: 1, assetName: "Mara" },
        { assetId: 1, assetName: "Mara (dup)" },
      ],
      references: [
        { refId: "shot-1", source: "shot" },
        { refId: "shot-1", source: "shot" },
      ],
      assetBibles: [
        { assetId: 1, assetName: "Mara" },
        { assetId: 1, assetName: "Mara (dup)" },
      ],
      sequenceContext: null,
      projectContext: null,
      sources: {
        casting: true,
        references: true,
        assetBibles: true,
        sequenceContext: false,
        projectContext: false,
      },
    });
    expect(result).toMatchSnapshot();
  });
});
