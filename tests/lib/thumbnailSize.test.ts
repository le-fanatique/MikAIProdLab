import { describe, it, expect } from "vitest";
import {
  THUMBNAIL_SIZE_DEFAULT,
  THUMBNAIL_SIZE_MAX,
  THUMBNAIL_SIZE_MIN,
  normalizeThumbnailSize,
} from "@/lib/thumbnailSize";

// ---------------------------------------------------------------------------
// WF.LIBRARY.2 — normalizeThumbnailSize is the only pure logic introduced by
// this ticket: reading a value written under the shared `localStorage` key,
// possibly by the other surface, possibly out of this surface's own range.
// ---------------------------------------------------------------------------

describe("normalizeThumbnailSize", () => {
  it("falls back to the default when nothing was stored", () => {
    expect(normalizeThumbnailSize(null)).toBe(THUMBNAIL_SIZE_DEFAULT);
    expect(normalizeThumbnailSize(undefined)).toBe(THUMBNAIL_SIZE_DEFAULT);
    expect(normalizeThumbnailSize("")).toBe(THUMBNAIL_SIZE_DEFAULT);
  });

  it("falls back to the default when the stored value is not numeric", () => {
    expect(normalizeThumbnailSize("not-a-number")).toBe(THUMBNAIL_SIZE_DEFAULT);
  });

  it("falls back to the default when the stored value is outside the valid range", () => {
    expect(normalizeThumbnailSize(String(THUMBNAIL_SIZE_MIN - 1))).toBe(THUMBNAIL_SIZE_DEFAULT);
    expect(normalizeThumbnailSize(String(THUMBNAIL_SIZE_MAX + 1))).toBe(THUMBNAIL_SIZE_DEFAULT);
    // A value the other surface could plausibly have written, well outside
    // this surface's own range — the ticket's §2 tolerance requirement.
    expect(normalizeThumbnailSize("9999")).toBe(THUMBNAIL_SIZE_DEFAULT);
    expect(normalizeThumbnailSize("-140")).toBe(THUMBNAIL_SIZE_DEFAULT);
  });

  it("keeps a valid in-range value, including both bounds", () => {
    expect(normalizeThumbnailSize(String(THUMBNAIL_SIZE_MIN))).toBe(THUMBNAIL_SIZE_MIN);
    expect(normalizeThumbnailSize(String(THUMBNAIL_SIZE_MAX))).toBe(THUMBNAIL_SIZE_MAX);
    expect(normalizeThumbnailSize("220")).toBe(220);
  });
});
