import { describe, it, expect } from "vitest";
import { buildCastingFromSequencePrompt } from "@/lib/prompts/casting-from-sequence";

describe("buildCastingFromSequencePrompt", () => {
  it("builds the prompt with sequence-level casting included and full optional context", () => {
    const result = buildCastingFromSequencePrompt({
      project: {
        name: "Neon Harvest",
        pitch: "A cyberpunk farmer defends her last crop.",
        story: "Full narrative synopsis.",
        outline: "## Opening\nMara arrives.",
      },
      sequence: {
        id: 12,
        title: "The Standoff",
        summary: "Tense confrontation.",
        description: "Rooftop location.",
        narrativePurpose: "Climax",
        mood: "tense",
        locationHint: "Rooftop",
      },
      shots: [
        {
          id: 34,
          shotCode: "SH010",
          title: "Close on Mara",
          description: "Mara grips her weapon.",
          actionPitch: "She raises her weapon.",
          continuityIn: "Calm",
          continuityOut: "Alert",
        },
      ],
      assets: [
        { id: 1, name: "Mara", type: "character", description: "cyberpunk farmer", notes: "protagonist" },
      ],
      existingShotCastings: [{ shotId: 99, assetId: 2 }],
      existingSequenceCastings: [{ assetId: 3 }],
      includeSequenceLevel: true,
    });
    expect(result).toMatchSnapshot();
  });

  it("builds the prompt with sequence-level casting excluded and optional context absent", () => {
    const result = buildCastingFromSequencePrompt({
      project: { name: "Neon Harvest", pitch: null, story: null, outline: null },
      sequence: {
        id: 12,
        title: "The Standoff",
        summary: null,
        description: null,
        narrativePurpose: null,
        mood: null,
        locationHint: null,
      },
      shots: [
        {
          id: 34,
          shotCode: null,
          title: "Close on Mara",
          description: null,
          actionPitch: null,
          continuityIn: null,
          continuityOut: null,
        },
      ],
      assets: [{ id: 1, name: "Mara", type: "character", description: null, notes: null }],
      existingShotCastings: [],
      existingSequenceCastings: [],
      includeSequenceLevel: false,
    });
    expect(result).toMatchSnapshot();
  });
});
