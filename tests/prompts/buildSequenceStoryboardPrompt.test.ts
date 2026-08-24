import { describe, it, expect } from "vitest";
import { buildSequenceStoryboardPrompt } from "@/lib/prompts/buildSequenceStoryboardPrompt";

describe("buildSequenceStoryboardPrompt", () => {
  it("builds the prompt with approved references and sequence title/code present", () => {
    const result = buildSequenceStoryboardPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: "The Standoff",
      sequenceCode: "SEQ010",
      shotCount: 3,
      references: [
        {
          refId: "asset-1-2",
          assetId: 1,
          assetName: "Mara",
          assetType: "character",
          role: "identity",
          roleLabel: "Identity",
          label: "Mara identity",
          variantState: "default",
          approvedForGeneration: true,
        },
      ],
      packageText: "=== Shot 1/3 ===\nMara stands.",
    });
    expect(result).toMatchSnapshot();
  });

  it("warns about no references selected and zero shots, with sequence title/code absent", () => {
    const result = buildSequenceStoryboardPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: null,
      sequenceCode: null,
      shotCount: 0,
      references: [],
      packageText: "",
    });
    expect(result).toMatchSnapshot();
  });

  it("dedupes a duplicated refId and warns about an unapproved reference", () => {
    const result = buildSequenceStoryboardPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: "The Standoff",
      sequenceCode: "SEQ010",
      shotCount: 2,
      references: [
        {
          refId: "asset-1-2",
          assetId: 1,
          assetName: "Mara",
          assetType: "character",
          role: "identity",
          roleLabel: "Identity",
          label: null,
          variantState: null,
          approvedForGeneration: false,
        },
        {
          refId: "asset-1-2",
          assetId: 1,
          assetName: "Mara (dup)",
          assetType: "character",
          role: "identity",
          roleLabel: "Identity",
          label: null,
          variantState: null,
          approvedForGeneration: false,
        },
      ],
      packageText: "=== Shot 1/2 ===\nMara stands.",
    });
    expect(result).toMatchSnapshot();
  });

  it("without shotRange, the text is unchanged from the existing default (non-regression)", () => {
    const withoutRange = buildSequenceStoryboardPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: "The Standoff",
      sequenceCode: "SEQ010",
      shotCount: 3,
      references: [],
      packageText: "=== Shot 1/3 ===\nMara stands.",
    });
    const withUndefinedRange = buildSequenceStoryboardPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: "The Standoff",
      sequenceCode: "SEQ010",
      shotCount: 3,
      references: [],
      packageText: "=== Shot 1/3 ===\nMara stands.",
      shotRange: undefined,
    });
    expect(withoutRange.text).toBe(withUndefinedRange.text);
    expect(withoutRange).toMatchSnapshot();
  });

  it("with shotRange present, adds a Shot range line naming the bounds, the retained/total count, and the no-inference instruction", () => {
    const result = buildSequenceStoryboardPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: "The Standoff",
      sequenceCode: "SEQ010",
      shotCount: 2,
      references: [],
      packageText: "=== Shot 2/2 ===\nMara stands.",
      shotRange: { fromLabel: "SH020", toLabel: "SH030", totalShotCount: 5 },
    });
    expect(result.text).toContain("Shot range:");
    expect(result.text).toContain("SH020");
    expect(result.text).toContain("SH030");
    expect(result.text).toContain("2 of the 5 Shots");
    expect(result.text).toMatch(/do not infer, add or summarise them/i);
    expect(result).toMatchSnapshot();
  });

  // SHOTPROMPT.HEADER.1 — Subject Definition, the named guide mode, and the
  // Project Style header line.
  describe("SHOTPROMPT.HEADER.1", () => {
    it("renders Subject Definition with the guide's named mode for a role that has one", () => {
      const result = buildSequenceStoryboardPrompt({
        projectId: 1,
        sequenceId: 2,
        sequenceTitle: "The Standoff",
        sequenceCode: "SEQ010",
        shotCount: 1,
        references: [
          {
            refId: "asset-1-2",
            assetId: 1,
            assetName: "Mara",
            assetType: "character",
            role: "character",
            roleLabel: "Character",
            label: null,
            variantState: null,
            approvedForGeneration: true,
          },
        ],
        packageText: "=== Shot 1/1 ===\nMara stands.",
      });

      expect(result.text).toContain("Subject Definition:");
      expect(result.text).toContain("Mara (character) — @Image1 as character reference");
      expect(result.text).not.toContain("Casting References:");
    });

    it("renders Subject Definition with no mode suffix for a role with no named mode", () => {
      const result = buildSequenceStoryboardPrompt({
        projectId: 1,
        sequenceId: 2,
        sequenceTitle: "The Standoff",
        sequenceCode: "SEQ010",
        shotCount: 1,
        references: [
          {
            refId: "asset-1-2",
            assetId: 1,
            assetName: "Mara",
            assetType: "character",
            role: "identity",
            roleLabel: "Identity",
            label: null,
            variantState: null,
            approvedForGeneration: true,
          },
        ],
        packageText: "=== Shot 1/1 ===\nMara stands.",
      });

      expect(result.text).toContain("Mara (character) — @Image1");
      expect(result.text).not.toContain("@Image1 as");
    });

    it("renders the Project Style once in the header, ahead of Subject Definition", () => {
      const result = buildSequenceStoryboardPrompt({
        projectId: 1,
        sequenceId: 2,
        sequenceTitle: "The Standoff",
        sequenceCode: "SEQ010",
        shotCount: 1,
        references: [
          {
            refId: "asset-1-2",
            assetId: 1,
            assetName: "Mara",
            assetType: "character",
            role: "character",
            roleLabel: "Character",
            label: null,
            variantState: null,
            approvedForGeneration: true,
          },
        ],
        projectStyle: "Grainy anamorphic, muted palette.",
        packageText: "=== Shot 1/1 ===\nMara stands.",
      });

      expect(result.text).toContain("Style:\nGrainy anamorphic, muted palette.");
      const styleIndex = result.text.indexOf("Style:");
      const subjectIndex = result.text.indexOf("Subject Definition:");
      expect(styleIndex).toBeGreaterThan(-1);
      expect(styleIndex).toBeLessThan(subjectIndex);
      // Rendered exactly once even though it were to appear inside the
      // package text too — matched independently of packageText's own
      // content, which this test's packageText carries none of.
      expect(result.text.split("Style:").length - 1).toBe(1);
    });

    it("renders no Style line when projectStyle is null, absent or blank", () => {
      const withoutStyle = buildSequenceStoryboardPrompt({
        projectId: 1,
        sequenceId: 2,
        sequenceTitle: null,
        sequenceCode: null,
        shotCount: 1,
        references: [],
        packageText: "",
      });
      const withNullStyle = buildSequenceStoryboardPrompt({
        projectId: 1,
        sequenceId: 2,
        sequenceTitle: null,
        sequenceCode: null,
        shotCount: 1,
        references: [],
        projectStyle: null,
        packageText: "",
      });
      const withBlankStyle = buildSequenceStoryboardPrompt({
        projectId: 1,
        sequenceId: 2,
        sequenceTitle: null,
        sequenceCode: null,
        shotCount: 1,
        references: [],
        projectStyle: "   ",
        packageText: "",
      });

      expect(withoutStyle.text).not.toContain("Style:");
      expect(withNullStyle.text).not.toContain("Style:");
      expect(withBlankStyle.text).not.toContain("Style:");
    });
  });
});
