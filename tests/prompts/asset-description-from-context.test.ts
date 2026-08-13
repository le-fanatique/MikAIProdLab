import { describe, it, expect } from "vitest";
import {
  buildAssetDescriptionFromContextPrompt,
  buildAssetDescriptionOnlyPrompt,
  buildAssetNotesOnlyPrompt,
  type AssetDescriptionFromContextInput,
} from "@/lib/prompts/asset-description-from-context";

const fullInput: AssetDescriptionFromContextInput = {
  project: {
    name: "Neon Harvest",
    pitch: "A cyberpunk farmer defends her last crop.",
    story: "Full narrative synopsis.",
    outline: "## Opening\nMara arrives.",
  },
  asset: {
    name: "Mara",
    type: "character",
    description: "A cyberpunk farmer.",
    notes: "Protagonist.",
  },
  sequenceContexts: [
    { title: "The Standoff", summary: "Tense confrontation.", mood: "tense", locationHint: "Rooftop", narrativePurpose: "Climax" },
  ],
  shotContexts: [
    { shotCode: "SH010", title: "Close on Mara", description: "Mara grips her weapon.", actionPitch: "She raises her weapon.", cameraPitch: "Low angle." },
  ],
  refImageMeta: [{ label: "Mara identity", imageRole: "identity", sourceFilename: "mara.png" }],
  style: { worldSegment: "Neon-lit dystopia.", rulesSegment: "Never depict corporate logos." },
};

const minimalInput: AssetDescriptionFromContextInput = {
  project: { name: "Neon Harvest", pitch: null, story: null, outline: null },
  asset: { name: "Mara", type: "character", description: null, notes: null },
  sequenceContexts: [],
  shotContexts: [],
  refImageMeta: [],
};

describe("buildAssetDescriptionFromContextPrompt", () => {
  it("builds the combined description+notes prompt with full optional context", () => {
    expect(buildAssetDescriptionFromContextPrompt(fullInput)).toMatchSnapshot();
  });

  it("builds the combined prompt with every optional field/array absent", () => {
    expect(buildAssetDescriptionFromContextPrompt(minimalInput)).toMatchSnapshot();
  });
});

describe("buildAssetDescriptionOnlyPrompt", () => {
  it("builds the description-only prompt with full optional context", () => {
    expect(buildAssetDescriptionOnlyPrompt(fullInput)).toMatchSnapshot();
  });

  it("builds the description-only prompt with every optional field/array absent", () => {
    expect(buildAssetDescriptionOnlyPrompt(minimalInput)).toMatchSnapshot();
  });
});

describe("buildAssetNotesOnlyPrompt", () => {
  it("builds the notes-only prompt with full optional context", () => {
    expect(buildAssetNotesOnlyPrompt(fullInput)).toMatchSnapshot();
  });

  it("builds the notes-only prompt with every optional field/array absent", () => {
    expect(buildAssetNotesOnlyPrompt(minimalInput)).toMatchSnapshot();
  });
});
