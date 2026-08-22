import { describe, it, expect } from "vitest";
import { buildLibraryCategories } from "@/lib/comfy/workflowGallery";
import type { GalleryWorkflowRow } from "@/lib/comfy/workflowGallery";

function row(overrides: Partial<GalleryWorkflowRow> = {}): GalleryWorkflowRow {
  return {
    name: "Text to Image (Gemini)",
    kind: "image",
    status: "active",
    description: null,
    category: null,
    tags: null,
    contexts: null,
    isFavorite: false,
    ...overrides,
  };
}

describe("buildLibraryCategories — order", () => {
  it("puts All first, follows WORKFLOW_CATEGORY_IDS order, Uncategorized last", () => {
    const workflows = [
      row({ category: "video" }),
      row({ category: "text-to-image" }),
      row({ category: null }),
      row({ category: "utility" }),
    ];
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    expect(entries.map((e) => e.id)).toEqual(["all", "text-to-image", "video", "utility", "uncategorized"]);
  });
});

describe("buildLibraryCategories — counts", () => {
  it("counts each category correctly, and All as the sum", () => {
    const workflows = [
      row({ category: "video" }),
      row({ category: "video" }),
      row({ category: "text-to-image" }),
    ];
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.count]));
    expect(byId["video"]).toBe(2);
    expect(byId["text-to-image"]).toBe(1);
    expect(byId["all"]).toBe(3);
  });

  it("reflects the context already filtered, not the whole library", () => {
    // asset-only workflow, requested with a shot context — must not be counted.
    const workflows = [row({ category: "video", contexts: JSON.stringify(["asset"]) })];
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.count]));
    expect(byId["all"]).toBe(0);
    expect(byId["video"]).toBeUndefined();
  });
});

describe("buildLibraryCategories — empty categories", () => {
  it("omits a category with no workflow, All always present", () => {
    const workflows = [row({ category: "video" })];
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    expect(entries.map((e) => e.id)).toEqual(["all", "video"]);
  });

  it("All is present even when the whole library is empty for this context", () => {
    const entries = buildLibraryCategories([], ["shot-keyframe", "shot-video"]);
    expect(entries).toEqual([{ id: "all", label: "All", count: 0 }]);
  });
});

describe("buildLibraryCategories — corrupt data never throws", () => {
  it("counts a row with corrupt tags/contexts instead of throwing", () => {
    const workflows = [row({ category: "video", tags: "{not json", contexts: "{not json" })];
    expect(() => buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"])).not.toThrow();
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.count]));
    expect(byId["video"]).toBe(1);
  });
});

// WF.FAVORITE.1 §5/§6 — the sidebar "Favorites" entry.
describe("buildLibraryCategories — Favorites entry", () => {
  it("is absent when no workflow is a favorite — today's state for all 33", () => {
    const workflows = [row({ category: "video" }), row({ category: "text-to-image" })];
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    expect(entries.map((e) => e.id)).not.toContain("favorites");
  });

  it("appears before All, with the correct count, when at least one workflow is a favorite", () => {
    const workflows = [
      row({ category: "video", isFavorite: true }),
      row({ category: "text-to-image" }),
      row({ category: "utility", isFavorite: true }),
    ];
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    expect(entries.map((e) => e.id)).toEqual([
      "favorites",
      "all",
      "text-to-image",
      "video",
      "utility",
    ]);
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.count]));
    expect(byId["favorites"]).toBe(2);
    // The favorite keeps its place in its own category count too — it is a
    // flag, not a category (§0), so it is never removed from either count.
    expect(byId["video"]).toBe(1);
    expect(byId["utility"]).toBe(1);
  });

  it("counts favorites after context filtering, like every other entry", () => {
    // asset-only favorite, requested with a shot context — must not count.
    const workflows = [
      row({ category: "video", isFavorite: true, contexts: JSON.stringify(["asset"]) }),
    ];
    const entries = buildLibraryCategories(workflows, ["shot-keyframe", "shot-video"]);
    expect(entries.map((e) => e.id)).not.toContain("favorites");
  });
});
