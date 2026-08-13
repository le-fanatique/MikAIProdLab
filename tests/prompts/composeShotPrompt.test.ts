import { describe, it, expect } from "vitest";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";

describe("composeShotPrompt", () => {
  it("composes a full sentence set with cast, framing, camera pitch and mood", () => {
    const result = composeShotPrompt({
      project: { name: "Neon Harvest", pitch: "A cyberpunk farmer defends her last crop." },
      sequence: {
        title: "The Standoff",
        mood: "tense and electric",
        locationHint: "a rain-soaked rooftop",
        summary: "Tense confrontation at dawn.",
        narrativePurpose: "Climax",
      },
      shot: {
        shotCode: "SH010",
        title: "Close on Mara",
        durationSeconds: 5,
        description: "Mara grips her weapon.",
        actionPitch: "she raises her weapon slowly",
        cameraPitch: "shot on a low angle with a wide lens",
        framing: "close-up",
        cameraMovement: "static",
      },
      castAssets: [
        { name: "Mara", type: "character", description: "cyberpunk farmer", notes: "protagonist" },
      ],
      shotRefImages: [],
      castAssetRefImages: [],
    });
    expect(result).toMatchSnapshot();
  });

  it("composes with no cast and no optional fields (desc/action/camera fallbacks)", () => {
    const result = composeShotPrompt({
      project: { name: "Neon Harvest", pitch: null },
      sequence: {
        title: "The Standoff",
        mood: null,
        locationHint: null,
        summary: null,
        narrativePurpose: null,
      },
      shot: {
        shotCode: null,
        title: "Empty Shot",
        durationSeconds: null,
        description: null,
        actionPitch: null,
        cameraPitch: null,
        framing: null,
        cameraMovement: null,
      },
      castAssets: [],
      shotRefImages: [],
      castAssetRefImages: [],
    });
    expect(result).toMatchSnapshot();
  });

  it("falls back to sequence summary for the mood sentence when mood is absent", () => {
    const result = composeShotPrompt({
      project: { name: "Neon Harvest", pitch: "A short pitch under eighty chars." },
      sequence: {
        title: "The Standoff",
        mood: null,
        locationHint: "a rooftop",
        summary: "Short summary text.",
        narrativePurpose: null,
      },
      shot: {
        shotCode: null,
        title: "Empty Shot",
        durationSeconds: null,
        description: "Mara looks up.",
        actionPitch: null,
        cameraPitch: null,
        framing: null,
        cameraMovement: "handheld",
      },
      castAssets: [],
      shotRefImages: [],
      castAssetRefImages: [],
    });
    expect(result).toMatchSnapshot();
  });

  it("never doubles terminal punctuation, and preserves an existing terminator", () => {
    const result = composeShotPrompt({
      project: { name: "Neon Harvest", pitch: null },
      sequence: {
        title: "The Standoff",
        mood: "everything is on fire!",
        locationHint: "a rooftop",
        summary: null,
        narrativePurpose: null,
      },
      shot: {
        shotCode: null,
        title: "Punctuated Shot",
        durationSeconds: null,
        description: "Mara grips her weapon.",
        actionPitch: "does she fire?",
        cameraPitch: "shot handheld, pushing in.",
        framing: null,
        cameraMovement: null,
      },
      castAssets: [],
      shotRefImages: [],
      castAssetRefImages: [],
    });

    expect(result.proposalText).not.toMatch(/[.!?…][.!?…]/);
    expect(result.proposalText).toContain("Everything is on fire!");
    expect(result).toMatchSnapshot();
  });
});
