import { describe, it, expect } from "vitest";
import {
  buildSequenceGenerationPackage,
  formatSequenceGenerationPackageText,
  type SequenceGenerationPackageShotInput,
} from "@/lib/prompts/buildSequenceGenerationPackage";
import { composeStoryboardShot } from "@/lib/llmWorkspace/composition/storyboardShot";

const meta = { projectId: 1, sequenceId: 2, sequenceTitle: "The Standoff", sequenceCode: "SEQ010" };

const shotOne: SequenceGenerationPackageShotInput = {
  shotId: 10,
  shotCode: "SH010",
  title: "Wide establishing",
  orderIndex: 0,
  durationSeconds: 5,
  hasApprovedVideo: false,
  continuity: {
    shotSize: "WS",
    cameraPosition: null,
    cameraMovement: "static",
    movementSpeed: null,
    cameraSubject: null,
    cameraLens: null,
    continuityIn: "Calm",
    continuityOut: "Alert",
    continuityNotes: "Mara notices the drone.",
  },
  promptContext: {
    shot: {
      title: "Wide establishing",
      shotPrompt: "Mara stands on the rooftop.",
      compiledPromptSegments: "0-2s: static shot",
      hasPromptSegments: true,
      hasMissingTiming: false,
    },
    castAssets: [{ assetId: 1, assetName: "Mara" }],
    references: [
      { refId: "asset-1-2", source: "asset", assetId: 1, assetName: "Mara", approvedForGeneration: true },
    ],
    assetBibles: [],
    sequenceContext: null,
    projectContext: null,
    sources: { casting: true, references: true, assetBibles: false, sequenceContext: false, projectContext: false },
  },
};

const shotTwo: SequenceGenerationPackageShotInput = {
  shotId: 20,
  shotCode: null,
  title: "Close on Mara",
  orderIndex: 1,
  durationSeconds: null,
  hasApprovedVideo: false,
  continuity: {},
  promptContext: {
    shot: {},
    castAssets: [],
    references: [],
    assetBibles: [],
    sequenceContext: null,
    projectContext: null,
    sources: { casting: false, references: false, assetBibles: false, sequenceContext: false, projectContext: false },
  },
};

describe("buildSequenceGenerationPackage", () => {
  it("builds a package from two shots with mixed complete/minimal data", () => {
    const result = buildSequenceGenerationPackage(meta, [shotOne, shotTwo]);
    expect(result).toMatchSnapshot();
  });

  it("builds an empty package when the shots array is empty (no options passed)", () => {
    const result = buildSequenceGenerationPackage(meta, []);
    expect(result).toMatchSnapshot();
  });

  it("applies ignorePromptSegments and ignoreUnapprovedReferences options", () => {
    const shotWithUnapproved: SequenceGenerationPackageShotInput = {
      ...shotOne,
      promptContext: {
        ...shotOne.promptContext,
        references: [
          { refId: "asset-1-2", source: "asset", assetId: 1, assetName: "Mara", approvedForGeneration: false },
        ],
      },
    };
    const result = buildSequenceGenerationPackage(meta, [shotWithUnapproved], {
      ignorePromptSegments: true,
      ignoreUnapprovedReferences: true,
    });
    expect(result).toMatchSnapshot();
  });
});

describe("formatSequenceGenerationPackageText", () => {
  it("includes per-shot warnings by default", () => {
    const pkg = buildSequenceGenerationPackage(meta, [shotOne, shotTwo]);
    expect(formatSequenceGenerationPackageText(pkg)).toMatchSnapshot();
  });

  it("omits per-shot warnings when includeWarnings is false", () => {
    const pkg = buildSequenceGenerationPackage(meta, [shotOne, shotTwo]);
    expect(formatSequenceGenerationPackageText(pkg, { includeWarnings: false })).toMatchSnapshot();
  });

  // LLMW.STORYBOARD.WARNINGS.1 — pinned by name rather than by snapshot,
  // because this is the exact contract `sequenceVideoGeneration.ts` now
  // depends on: its `packageText` becomes the `suggestedText` queued to the
  // generation backend, so a diagnostic line reaching this text reaches the
  // model. A snapshot would record the same fact, but silently — and a
  // regression here would be accepted by re-running with `-u`.
  it("keeps author-facing diagnostics out of the text when includeWarnings is false", () => {
    const emptyPromptShot: SequenceGenerationPackageShotInput = {
      ...shotOne,
      shotId: 99,
      shotCode: "SH099",
      promptContext: {
        ...shotOne.promptContext,
        shot: { ...shotOne.promptContext.shot, shotPrompt: "" },
      },
    };
    const pkg = buildSequenceGenerationPackage(meta, [emptyPromptShot]);

    expect(formatSequenceGenerationPackageText(pkg)).toContain("Shot Prompt is empty.");
    expect(formatSequenceGenerationPackageText(pkg, { includeWarnings: false })).not.toContain(
      "Shot Prompt is empty."
    );

    // The structured warnings are still computed and returned — only their
    // rendering into this one text form is skipped, never their detection.
    expect(pkg.shots[0].warnings).toContain("Shot Prompt is empty.");
  });

  // LLMW.STORYBOARD.COMPOSE.2 (B14b) — the `storyboardComposition` option.
  describe("storyboardComposition option", () => {
    it("is byte-identical to the legacy default when omitted", () => {
      const pkg = buildSequenceGenerationPackage(meta, [shotOne, shotTwo]);
      expect(formatSequenceGenerationPackageText(pkg, { includeWarnings: false })).toEqual(
        formatSequenceGenerationPackageText(pkg, { includeWarnings: false, storyboardComposition: undefined })
      );
    });

    it("replaces each Shot's body with composeStoryboardShot's composition, carrying the ingredients §5.7 found missing", () => {
      const shotWithEverything: SequenceGenerationPackageShotInput = {
        ...shotOne,
        continuity: { shotSize: "WS", cameraPosition: null, cameraMovement: "slow push in", movementSpeed: null, cameraSubject: null, cameraLens: null},
        promptContext: {
          ...shotOne.promptContext,
          shot: { ...shotOne.promptContext.shot, cameraPitch: "low angle", actionPitch: "Mara steps out of cover." },
          assetBibles: [{ assetId: 1, assetName: "Mara", visualIdentity: "Cropped hair, scarred jaw." }],
          sequenceContext: { locationHint: "Rooftop, dusk", mood: "Tense" },
          sources: { ...shotOne.promptContext.sources, assetBibles: true, sequenceContext: true },
        },
      };
      const pkg = buildSequenceGenerationPackage(meta, [shotWithEverything]);

      const text = formatSequenceGenerationPackageText(pkg, {
        includeWarnings: false,
        storyboardComposition: {
          projectStyle: "Grainy anamorphic, muted palette.",
          lighting: { byShotId: {} },
        },
      });

      // Distribution (cast), camera, mood, style — the four §5.7 named as
      // absent from the storyboard prompt before this ticket.
      expect(text).toContain("Mara");
      expect(text).toContain("Cropped hair, scarred jaw.");
      expect(text).toContain("low angle");
      expect(text).toContain("slow push in");
      expect(text).toContain("Tense");
      expect(text).toContain("Grainy anamorphic, muted palette.");
      // The legacy label/envelope is untouched — only the body changed.
      expect(text).toContain('=== Shot 1/1 — SH010 — "Wide establishing" (5.0s) ===');
      // The Shot Prompt is still present — it stops being the only
      // ingredient, it does not disappear (composeStoryboardShot's own
      // contract, unmodified by this ticket).
      expect(text).toContain("Mara stands on the rooftop.");
    });

    it("never blocks the composed text on a conformation finding — findings are reachable separately, informationally", () => {
      const pkg = buildSequenceGenerationPackage(meta, [shotOne]);
      const options = {
        includeWarnings: false as const,
        storyboardComposition: {
          projectStyle: null,
          lighting: { byShotId: {} }, // no lighting resolved for shotOne — a `lightingMissing` finding
        },
      };

      const text = formatSequenceGenerationPackageText(pkg, options);
      // The text is produced whole regardless of the finding below.
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain("Mara stands on the rooftop.");

      // The same finding, reachable through composeStoryboardShot directly —
      // the exact function this option wires in, unmodified — proves the
      // finding exists without ever having gated the text above.
      const composed = composeStoryboardShot({
        context: pkg.shots[0].context,
        continuity: { shotSize: pkg.shots[0].continuity.shotSize, cameraPosition: null, cameraMovement: pkg.shots[0].continuity.cameraMovement, movementSpeed: null, cameraSubject: null, cameraLens: null},
        projectStyle: options.storyboardComposition.projectStyle,
        lighting: null,
      });
      expect(composed.findings.map((f) => f.code)).toContain("lightingMissing");
      expect(composed.text.length).toBeGreaterThan(0);
    });
  });
});
