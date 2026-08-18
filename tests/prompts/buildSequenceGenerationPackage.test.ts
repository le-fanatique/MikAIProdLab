import { describe, it, expect } from "vitest";
import {
  buildSequenceGenerationPackage,
  formatSequenceGenerationPackageText,
  type SequenceGenerationPackageShotInput,
} from "@/lib/prompts/buildSequenceGenerationPackage";

const meta = { projectId: 1, sequenceId: 2, sequenceTitle: "The Standoff", sequenceCode: "SEQ010" };

const shotOne: SequenceGenerationPackageShotInput = {
  shotId: 10,
  shotCode: "SH010",
  title: "Wide establishing",
  orderIndex: 0,
  durationSeconds: 5,
  hasApprovedVideo: false,
  continuity: {
    framing: "WS",
    cameraMovement: "static",
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
});
