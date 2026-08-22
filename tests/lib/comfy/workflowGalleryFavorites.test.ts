// WF.FAVORITE.1 §5/§6 — the gallery's "Favorites" section.
import { describe, it, expect } from "vitest";
import { groupGalleryWorkflowsWithFavorites, type GalleryWorkflowRow } from "@/lib/comfy/workflowGallery";

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

describe("groupGalleryWorkflowsWithFavorites — presence", () => {
  it("adds no Favorites section when nothing is favorited", () => {
    const sections = groupGalleryWorkflowsWithFavorites([
      row({ category: "video" }),
      row({ category: "text-to-image" }),
    ]);
    expect(sections.map((s) => s.categoryId)).not.toContain("favorites");
  });
});

describe("groupGalleryWorkflowsWithFavorites — order and duplication", () => {
  it("places Favorites first, before the first real category", () => {
    const workflows = [
      row({ name: "video wf", category: "video", isFavorite: true }),
      row({ name: "t2i wf", category: "text-to-image" }),
    ];
    const sections = groupGalleryWorkflowsWithFavorites(workflows);
    expect(sections[0].categoryId).toBe("favorites");
    expect(sections.map((s) => s.categoryId)).toEqual(["favorites", "text-to-image", "video"]);
  });

  it("keeps a favorite in its own category section as well as in Favorites", () => {
    const workflows = [row({ name: "video wf", category: "video", isFavorite: true })];
    const sections = groupGalleryWorkflowsWithFavorites(workflows);
    const favoritesSection = sections.find((s) => s.categoryId === "favorites");
    const videoSection = sections.find((s) => s.categoryId === "video");
    expect(favoritesSection?.workflows).toHaveLength(1);
    expect(videoSection?.workflows).toHaveLength(1);
  });

  it("does not disturb the order of the other sections", () => {
    const workflows = [
      row({ name: "video wf", category: "video", isFavorite: true }),
      row({ name: "t2i wf", category: "text-to-image" }),
      row({ name: "utility wf", category: "utility" }),
    ];
    const sections = groupGalleryWorkflowsWithFavorites(workflows);
    expect(sections.slice(1).map((s) => s.categoryId)).toEqual(["text-to-image", "video", "utility"]);
  });

  it("orders Favorites the same way the gallery itself orders (category order), not by marking order", () => {
    const workflows = [
      row({ name: "video wf", category: "video", isFavorite: true }),
      row({ name: "t2i wf", category: "text-to-image", isFavorite: true }),
    ];
    const sections = groupGalleryWorkflowsWithFavorites(workflows);
    const favoritesSection = sections.find((s) => s.categoryId === "favorites");
    // WORKFLOW_CATEGORY_IDS puts text-to-image before video — favorites
    // follows that same gallery order, not the order workflows were marked.
    expect(favoritesSection?.workflows.map((w) => w.name)).toEqual(["t2i wf", "video wf"]);
  });
});

describe("groupGalleryWorkflowsWithFavorites — respects context/search filtering", () => {
  it("never surfaces a favorite excluded by the context filter", () => {
    const assetOnlyFavorite = row({
      category: "video",
      isFavorite: true,
      contexts: JSON.stringify(["asset"]),
    });
    const sections = groupGalleryWorkflowsWithFavorites([assetOnlyFavorite], {
      contexts: ["shot-keyframe"],
    });
    expect(sections).toHaveLength(0);
  });
});
