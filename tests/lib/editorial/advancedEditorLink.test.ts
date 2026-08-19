import { describe, expect, it } from "vitest";
import { editorialExportHrefFor, buildAdvancedEditorHref } from "@/lib/editorial/advancedEditorLink";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for advancedEditorLink.ts's two
// pure URL builders.
// ---------------------------------------------------------------------------

describe("editorialExportHrefFor", () => {
  it("builds a plain, query-string-free path when videoSourceMode is omitted", () => {
    expect(editorialExportHrefFor(1, 2)).toBe("/api/projects/1/sequences/2/editorial-export");
  });

  it("appends the mode as a query string when given", () => {
    expect(editorialExportHrefFor(1, 2, "latest-generation")).toBe(
      "/api/projects/1/sequences/2/editorial-export?videoSourceMode=latest-generation"
    );
  });
});

describe("buildAdvancedEditorHref", () => {
  it("builds a sidecar URL carrying the absolute export URL and both ids", () => {
    const href = buildAdvancedEditorHref({
      mikaiOrigin: "http://localhost:3000",
      sidecarOrigin: "http://localhost:4000",
      projectId: 1,
      sequenceId: 2,
    });
    const url = new URL(href);
    expect(url.origin).toBe("http://localhost:4000");
    expect(url.searchParams.get("mikaiExportUrl")).toBe(
      "http://localhost:3000/api/projects/1/sequences/2/editorial-export"
    );
    expect(url.searchParams.get("mikaiProjectId")).toBe("1");
    expect(url.searchParams.get("mikaiSequenceId")).toBe("2");
  });

  it("propagates an explicit videoSourceMode into the embedded export URL", () => {
    const href = buildAdvancedEditorHref({
      mikaiOrigin: "http://localhost:3000",
      sidecarOrigin: "http://localhost:4000",
      projectId: 1,
      sequenceId: 2,
      videoSourceMode: "approved-only",
    });
    const url = new URL(href);
    expect(url.searchParams.get("mikaiExportUrl")).toBe(
      "http://localhost:3000/api/projects/1/sequences/2/editorial-export?videoSourceMode=approved-only"
    );
  });
});
