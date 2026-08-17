import { describe, expect, it } from "vitest";
import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";

// ---------------------------------------------------------------------------
// commitAdvisory.test.ts — LLMW.COMMIT.ADVISORY.1 (B10-f).
//
// Pins the ticket's frozen contract: exactly three descriptors declare
// `commitAdvisory` (`asset.retakeDirected`, `assetDescription.generate`,
// `assetNotes.generate`), the text is identical on all three, and no
// non-asset descriptor carries it. A fourth descriptor adding
// `commitAdvisory` without deliberate review must fail this test — see
// `.agents/executor_report.md` for the mutation-control run that proves it.
// ---------------------------------------------------------------------------

const EXPECTED_ADVISORY = "The Asset Bible is written from Description and Notes — regenerate it to keep it in sync.";

describe("commitAdvisory", () => {
  it("is declared by exactly three descriptors", () => {
    const ids = Object.values(DESCRIPTORS)
      .filter((d) => d.commitAdvisory !== undefined)
      .map((d) => d.id)
      .sort();

    expect(ids).toEqual(["asset.retakeDirected", "assetDescription.generate", "assetNotes.generate"].sort());
  });

  it("has the identical frozen text on all three", () => {
    expect(DESCRIPTORS["asset.retakeDirected"].commitAdvisory).toBe(EXPECTED_ADVISORY);
    expect(DESCRIPTORS["assetDescription.generate"].commitAdvisory).toBe(EXPECTED_ADVISORY);
    expect(DESCRIPTORS["assetNotes.generate"].commitAdvisory).toBe(EXPECTED_ADVISORY);
  });

  it("is not carried by any non-asset descriptor", () => {
    const nonAssetIdsWithAdvisory = Object.values(DESCRIPTORS)
      .filter((d) => d.commitAdvisory !== undefined)
      .filter((d) => d.anchor.entity !== "asset")
      .map((d) => d.id);

    expect(nonAssetIdsWithAdvisory).toEqual([]);
  });
});
