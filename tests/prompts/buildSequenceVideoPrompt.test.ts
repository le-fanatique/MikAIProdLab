import { describe, it, expect } from "vitest";
import { buildSequenceVideoPrompt } from "@/lib/prompts/buildSequenceVideoPrompt";

describe("buildSequenceVideoPrompt", () => {
  it("includes approved casting references when the workflow supports multiple images", () => {
    const result = buildSequenceVideoPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: "The Standoff",
      sequenceCode: "SEQ010",
      shotCount: 3,
      multiImageSupported: true,
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

  it("drops references and warns when the workflow does not support multiple images, with sequence title/code absent", () => {
    const result = buildSequenceVideoPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: null,
      sequenceCode: null,
      shotCount: 3,
      multiImageSupported: false,
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
      packageText: "=== Shot 1/3 ===\nMara stands.",
    });
    expect(result).toMatchSnapshot();
  });

  it("warns about an unapproved reference and zero shots with no references selected", () => {
    const result = buildSequenceVideoPrompt({
      projectId: 1,
      sequenceId: 2,
      sequenceTitle: "The Standoff",
      sequenceCode: "SEQ010",
      shotCount: 0,
      multiImageSupported: true,
      references: [],
      packageText: "",
    });
    expect(result).toMatchSnapshot();
  });
});
