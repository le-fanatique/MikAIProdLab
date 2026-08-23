import { describe, it, expect } from "vitest";
import { isAssetAlignmentStatusStale } from "@/lib/projectStyle/assetAlignmentBatch";
import type { AssetAlignmentStatus } from "@/actions/assetAlignment";

describe("isAssetAlignmentStatusStale", () => {
  it("is stale when never reviewed", () => {
    const status: AssetAlignmentStatus = { kind: "not-reviewed", activeStyleVersionNumber: 3 };
    expect(isAssetAlignmentStatusStale(status)).toBe(true);
  });

  it("is stale when the reviewed Style version was superseded", () => {
    const status: AssetAlignmentStatus = {
      kind: "style-changed",
      reviewedStyleVersionNumber: 2,
      activeStyleVersionNumber: 3,
    };
    expect(isAssetAlignmentStatusStale(status)).toBe(true);
  });

  it("is stale when the Asset changed since its last review", () => {
    const status: AssetAlignmentStatus = { kind: "asset-changed", styleVersionNumber: 3 };
    expect(isAssetAlignmentStatusStale(status)).toBe(true);
  });

  it("is NOT stale when already aligned with the active version", () => {
    const status: AssetAlignmentStatus = { kind: "aligned", styleVersionNumber: 3 };
    expect(isAssetAlignmentStatusStale(status)).toBe(false);
  });

  it("is NOT stale when there is no active Project Style to review against", () => {
    const status: AssetAlignmentStatus = { kind: "no-active-style" };
    expect(isAssetAlignmentStatusStale(status)).toBe(false);
  });

  it("is NOT stale when the status could not be loaded (null)", () => {
    expect(isAssetAlignmentStatusStale(null)).toBe(false);
  });
});
