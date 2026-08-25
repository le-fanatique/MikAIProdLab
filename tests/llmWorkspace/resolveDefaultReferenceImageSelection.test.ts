import { describe, expect, it } from "vitest";
import { resolveDefaultReferenceImageSelection } from "@/lib/llmWorkspace/resolveDefaultReferenceImageSelection";

// ---------------------------------------------------------------------------
// ASSET.LIGHTING.PLACE.3 — proof of the default-selection rule the panel's
// `useState` initializer now calls, in isolation from React and the DOM.
// ---------------------------------------------------------------------------

describe("resolveDefaultReferenceImageSelection", () => {
  it("selects no image when none is approved", () => {
    const images = [
      { id: 1, approvedForGeneration: false },
      { id: 2, approvedForGeneration: false },
    ];
    expect(resolveDefaultReferenceImageSelection(images, 4)).toEqual([]);
  });

  it("selects the approved images alone, in their existing order", () => {
    const images = [
      { id: 1, approvedForGeneration: false },
      { id: 2, approvedForGeneration: true },
      { id: 3, approvedForGeneration: false },
      { id: 4, approvedForGeneration: true },
    ];
    expect(resolveDefaultReferenceImageSelection(images, 4)).toEqual([2, 4]);
  });

  it("caps the approved selection at maxCount, never adding an unapproved image to fill the cap", () => {
    const images = [
      { id: 1, approvedForGeneration: true },
      { id: 2, approvedForGeneration: true },
      { id: 3, approvedForGeneration: true },
      { id: 4, approvedForGeneration: false },
    ];
    expect(resolveDefaultReferenceImageSelection(images, 2)).toEqual([1, 2]);
  });

  it("returns an empty selection for an empty reference image list", () => {
    expect(resolveDefaultReferenceImageSelection([], 4)).toEqual([]);
  });
});
