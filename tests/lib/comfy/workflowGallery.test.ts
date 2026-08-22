import { describe, it, expect } from "vitest";
import { selectGalleryWorkflows, type GalleryWorkflowRow } from "@/lib/comfy/workflowGallery";

function row(overrides: Partial<GalleryWorkflowRow> = {}): GalleryWorkflowRow {
  return {
    name: "Text to Image (Gemini)",
    kind: "image",
    status: "active",
    description: "Generates a keyframe from a free-text prompt.",
    category: null,
    tags: null,
    contexts: null,
    isFavorite: false,
    ...overrides,
  };
}

describe("selectGalleryWorkflows — search", () => {
  it("finds a match on the name", () => {
    const sections = selectGalleryWorkflows([row({ name: "Gemini Storyboard" })], { search: "storyboard" });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });

  it("finds a match on the description", () => {
    const sections = selectGalleryWorkflows([row({ description: "Batches a contact sheet." })], {
      search: "contact sheet",
    });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });

  it("finds a match on a tag", () => {
    const sections = selectGalleryWorkflows([row({ tags: JSON.stringify(["rapide", "gemini"]) })], {
      search: "rapide",
    });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });

  it("is case-insensitive and tolerant of leading/trailing whitespace in the search term", () => {
    const sections = selectGalleryWorkflows([row({ name: "Gemini Storyboard" })], {
      search: "  STORYBOARD  ",
    });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });

  it("filters nothing when the search term is empty", () => {
    const workflows = [row({ name: "A" }), row({ name: "B" })];
    const sections = selectGalleryWorkflows(workflows, { search: "" });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(2);
  });

  it("filters nothing when search is omitted entirely", () => {
    const workflows = [row({ name: "A" }), row({ name: "B" })];
    const sections = selectGalleryWorkflows(workflows);
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(2);
  });

  it("excludes a workflow matching nothing", () => {
    const sections = selectGalleryWorkflows([row({ name: "Gemini Storyboard" })], { search: "nomatch" });
    expect(sections).toHaveLength(0);
  });
});

describe("selectGalleryWorkflows — grouping", () => {
  it("groups by category in WORKFLOW_CATEGORY_IDS order, Uncategorized last", () => {
    const workflows = [
      row({ name: "video wf", category: "video" }),
      row({ name: "t2i wf", category: "text-to-image" }),
      row({ name: "uncategorized wf", category: null }),
      row({ name: "utility wf", category: "utility" }),
    ];
    const sections = selectGalleryWorkflows(workflows);
    expect(sections.map((s) => s.categoryId)).toEqual(["text-to-image", "video", "utility", "uncategorized"]);
    expect(sections[sections.length - 1].label).toBe("Uncategorized");
  });

  it("omits empty sections", () => {
    const sections = selectGalleryWorkflows([row({ category: "video" })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].categoryId).toBe("video");
  });

  it("falls back to Uncategorized for a category value outside the closed vocabulary", () => {
    const sections = selectGalleryWorkflows([row({ category: "not-a-real-category" })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].categoryId).toBe("uncategorized");
  });
});

describe("selectGalleryWorkflows — corrupt data never throws and never disappears", () => {
  it("keeps a row whose tags column is corrupt JSON", () => {
    expect(() =>
      selectGalleryWorkflows([row({ tags: "{not json" })], { search: "" })
    ).not.toThrow();
    const sections = selectGalleryWorkflows([row({ tags: "{not json" })], { search: "" });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });

  it("keeps a row whose tags column is corrupt JSON even while searching", () => {
    const sections = selectGalleryWorkflows([row({ name: "Findable Name", tags: "{not json" })], {
      search: "findable",
    });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });

  it("keeps a row whose contexts column is corrupt JSON when context-filtering", () => {
    const sections = selectGalleryWorkflows([row({ contexts: "{not json" })], { contexts: ["shot-keyframe"] });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });
});

describe("selectGalleryWorkflows — multi-context OR (the Shot workflow picker's case)", () => {
  it("includes a workflow offered in only one of the two requested contexts", () => {
    // kind: "video" is never accepted by "shot-keyframe" (image-only), but
    // is accepted by "shot-video" — offered nowhere-specific (contexts: null)
    // means "everywhere the kind allows", so it is offered in shot-video.
    const videoWorkflow = row({ kind: "video", contexts: null });
    const sections = selectGalleryWorkflows([videoWorkflow], {
      contexts: ["shot-keyframe", "shot-video"],
    });
    expect(sections.flatMap((s) => s.workflows)).toHaveLength(1);
  });

  it("excludes a workflow offered in neither requested context", () => {
    const assetOnly = row({ kind: "image", contexts: JSON.stringify(["asset"]) });
    const sections = selectGalleryWorkflows([assetOnly], {
      contexts: ["shot-keyframe", "shot-video"],
    });
    expect(sections).toHaveLength(0);
  });

  it("excludes an archived workflow regardless of context", () => {
    const archived = row({ status: "archived" });
    const sections = selectGalleryWorkflows([archived], { contexts: ["shot-keyframe"] });
    expect(sections).toHaveLength(0);
  });
});
