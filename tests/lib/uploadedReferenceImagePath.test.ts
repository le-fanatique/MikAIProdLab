import { describe, expect, it } from "vitest";
import path from "node:path";
import { isConfinedUploadedReferenceImagePath } from "@/lib/uploadImage";

// ---------------------------------------------------------------------------
// LLMW.DESCRIPTOR.IMAGE.1 (B16a). The Asset/Shot reference-image family's
// confinement rule existed before this ticket, written inline inside
// `deleteStoredReferenceImage`; it was exported so the workspace's image
// source (`llmWorkspace/images/registry.ts`) could apply the SAME rule before
// a read rather than keep a second, divergent copy.
//
// It had no test. It has one now, because it is the gate standing between a
// stored string and a filesystem read — and because `deleteStoredReferenceImage`
// now depends on it for a deletion, where a widened rule would be worse than a
// narrowed one.
// ---------------------------------------------------------------------------

describe("isConfinedUploadedReferenceImagePath", () => {
  it("accepts a path the upload path itself produces", () => {
    expect(isConfinedUploadedReferenceImagePath("uploads/reference-images/assets/abc.png")).toBe(true);
  });

  it("refuses a traversal, a backslash, or a NUL", () => {
    expect(isConfinedUploadedReferenceImagePath("uploads/reference-images/../../etc/passwd")).toBe(false);
    expect(isConfinedUploadedReferenceImagePath("uploads/reference-images\\assets\\abc.png")).toBe(false);
    expect(isConfinedUploadedReferenceImagePath("uploads/reference-images/a\0.png")).toBe(false);
  });

  it("refuses another storage root, including Project Style's own", () => {
    expect(isConfinedUploadedReferenceImagePath("uploads/project-style/references/abc.png")).toBe(false);
    expect(isConfinedUploadedReferenceImagePath("uploads/reference-images-elsewhere/abc.png")).toBe(false);
  });

  it("refuses the root itself, an absolute path, an empty value and a non-string", () => {
    expect(isConfinedUploadedReferenceImagePath("uploads/reference-images")).toBe(false);
    expect(isConfinedUploadedReferenceImagePath("uploads/reference-images/")).toBe(false);
    expect(isConfinedUploadedReferenceImagePath(path.resolve("uploads/reference-images/abc.png"))).toBe(false);
    expect(isConfinedUploadedReferenceImagePath("")).toBe(false);
    expect(isConfinedUploadedReferenceImagePath(null)).toBe(false);
    expect(isConfinedUploadedReferenceImagePath(undefined)).toBe(false);
  });

  it("refuses an absurdly long value", () => {
    expect(isConfinedUploadedReferenceImagePath(`uploads/reference-images/${"a".repeat(2000)}.png`)).toBe(false);
  });
});
