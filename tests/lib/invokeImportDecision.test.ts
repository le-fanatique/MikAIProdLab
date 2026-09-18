import { describe, expect, it } from "vitest";
import { selectInvokeImagesToImport } from "@/lib/invoke/invokeImportDecision";

// ---------------------------------------------------------------------------
// INVOKE.SYNC.1 — ticket §3: "the decision — which images of a board are
// retained once pushed and already-imported ones are excluded — is a pure
// function, testable without network or DB, proven by mutation." No network,
// no DB anywhere in this file, on purpose.
// ---------------------------------------------------------------------------

describe("selectInvokeImagesToImport", () => {
  it("keeps an image that was neither pushed nor already imported", () => {
    const result = selectInvokeImagesToImport({
      images: [{ imageName: "new.png" }],
      pushedImageNames: new Set(),
      alreadyImportedImageNames: new Set(),
    });
    expect(result).toEqual([{ imageName: "new.png" }]);
  });

  it("excludes an image MikAI itself pushed to the board", () => {
    const result = selectInvokeImagesToImport({
      images: [{ imageName: "pushed.png" }, { imageName: "new.png" }],
      pushedImageNames: new Set(["pushed.png"]),
      alreadyImportedImageNames: new Set(),
    });
    expect(result).toEqual([{ imageName: "new.png" }]);
  });

  it("excludes an image already imported by a previous sync", () => {
    const result = selectInvokeImagesToImport({
      images: [{ imageName: "already.png" }, { imageName: "new.png" }],
      pushedImageNames: new Set(),
      alreadyImportedImageNames: new Set(["already.png"]),
    });
    expect(result).toEqual([{ imageName: "new.png" }]);
  });

  it("excludes an image that is both pushed and already imported", () => {
    const result = selectInvokeImagesToImport({
      images: [{ imageName: "both.png" }],
      pushedImageNames: new Set(["both.png"]),
      alreadyImportedImageNames: new Set(["both.png"]),
    });
    expect(result).toEqual([]);
  });

  it("returns an empty list when the board has no images at all", () => {
    const result = selectInvokeImagesToImport({
      images: [],
      pushedImageNames: new Set(["pushed.png"]),
      alreadyImportedImageNames: new Set(["already.png"]),
    });
    expect(result).toEqual([]);
  });

  it("preserves the board's own image order among the survivors", () => {
    const result = selectInvokeImagesToImport({
      images: [{ imageName: "c.png" }, { imageName: "a.png" }, { imageName: "b.png" }],
      pushedImageNames: new Set(),
      alreadyImportedImageNames: new Set(),
    });
    expect(result.map((i) => i.imageName)).toEqual(["c.png", "a.png", "b.png"]);
  });
});
