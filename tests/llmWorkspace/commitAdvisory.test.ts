import { describe, expect, it } from "vitest";
import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";

// ---------------------------------------------------------------------------
// commitAdvisory.test.ts — LLMW.COMMIT.ADVISORY.1 (B10-f), widened by
// STYLE.LLM.ADJUST.CORE.1.
//
// Pinned the original ticket's frozen contract: exactly three Asset
// descriptors declare `commitAdvisory` (`asset.retakeDirected`,
// `assetDescription.generate`, `assetNotes.generate`), sharing one identical
// text, and no non-asset descriptor carried it — a tripwire so a fourth
// descriptor adding `commitAdvisory` would fail loudly and force deliberate
// review instead of silently drifting.
//
// STYLE.LLM.ADJUST.CORE.1 is that deliberate review: `style.adjustDirected`
// (anchor: project) is the first non-asset descriptor to carry
// `commitAdvisory`, with its own distinct text — a rule added to the Working
// Draft, unlike an Asset Bible going stale, is not itself a downstream
// artefact that can go stale (§5 of `docs/LLM_WORKSPACE_PRODUCT_VISION.md`:
// only jars carry staleness machinery). Both facts are pinned below rather
// than the guard being dropped, so a *fifth* descriptor still fails loudly.
// ---------------------------------------------------------------------------

const EXPECTED_ASSET_ADVISORY = "The Asset Bible is written from Description and Notes — regenerate it to keep it in sync.";
const EXPECTED_STYLE_ADJUST_ADVISORY =
  "A rule added here lives in the Working Draft and affects no generation until the author publishes a new Style version.";

describe("commitAdvisory", () => {
  it("is declared by exactly four descriptors", () => {
    const ids = Object.values(DESCRIPTORS)
      .filter((d) => d.commitAdvisory !== undefined)
      .map((d) => d.id)
      .sort();

    expect(ids).toEqual(
      ["asset.retakeDirected", "assetDescription.generate", "assetNotes.generate", "style.adjustDirected"].sort()
    );
  });

  it("has the identical frozen Asset Bible text on all three Asset descriptors", () => {
    expect(DESCRIPTORS["asset.retakeDirected"].commitAdvisory).toBe(EXPECTED_ASSET_ADVISORY);
    expect(DESCRIPTORS["assetDescription.generate"].commitAdvisory).toBe(EXPECTED_ASSET_ADVISORY);
    expect(DESCRIPTORS["assetNotes.generate"].commitAdvisory).toBe(EXPECTED_ASSET_ADVISORY);
  });

  it("style.adjustDirected carries its own distinct, non-Asset-Bible text", () => {
    expect(DESCRIPTORS["style.adjustDirected"].commitAdvisory).toBe(EXPECTED_STYLE_ADJUST_ADVISORY);
    expect(DESCRIPTORS["style.adjustDirected"].commitAdvisory).not.toBe(EXPECTED_ASSET_ADVISORY);
  });

  it("is carried by exactly one non-asset descriptor: style.adjustDirected", () => {
    const nonAssetIdsWithAdvisory = Object.values(DESCRIPTORS)
      .filter((d) => d.commitAdvisory !== undefined)
      .filter((d) => d.anchor.entity !== "asset")
      .map((d) => d.id);

    expect(nonAssetIdsWithAdvisory).toEqual(["style.adjustDirected"]);
  });
});
