import { describe, expect, it } from "vitest";
import { buildShotVideoLibraryExport } from "@/lib/editorial/shotVideoExport";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for shotVideoExport.ts's pure
// Shot-local export builder.
// ---------------------------------------------------------------------------

describe("buildShotVideoLibraryExport", () => {
  it("positions entries sequentially, each starting where the previous one ends, in the caller's given order", () => {
    const result = buildShotVideoLibraryExport({
      project: { id: 1, name: "P" },
      sequence: { id: 2, title: "S" },
      shot: { id: 10, title: "Shot A" },
      entries: [
        { id: 100, videoPath: "uploads/a.mp4", durationSeconds: 3 },
        { id: 101, videoPath: "uploads/b.mp4", durationSeconds: 5 },
      ],
      mediaUrlFor: (p) => `/media/${p}`,
    });
    expect(result.tracks[0].items.map((i) => ({ id: i.id, startSeconds: i.startSeconds, durationSeconds: i.durationSeconds }))).toEqual([
      { id: 100, startSeconds: 0, durationSeconds: 3 },
      { id: 101, startSeconds: 3, durationSeconds: 5 },
    ]);
    expect(result.sequence.durationSeconds).toBe(8);
  });

  it("tags sourceMode 'shot-videos' and the shot object, with every item's shotId set to the one shot", () => {
    const result = buildShotVideoLibraryExport({
      project: { id: 1, name: "P" },
      sequence: { id: 2, title: "S" },
      shot: { id: 10, title: "Shot A" },
      entries: [{ id: 100, videoPath: "uploads/a.mp4", durationSeconds: 3 }],
      mediaUrlFor: (p) => `/media/${p}`,
    });
    expect(result.sourceMode).toBe("shot-videos");
    expect(result.shot).toEqual({ id: 10, title: "Shot A" });
    expect(result.tracks[0].items[0].shotId).toBe(10);
  });

  it("uses mediaUrlFor to resolve mediaUrl, and echoes videoPath as approvedVideoPath", () => {
    const result = buildShotVideoLibraryExport({
      project: { id: 1, name: "P" },
      sequence: { id: 2, title: "S" },
      shot: { id: 10, title: "Shot A" },
      entries: [{ id: 100, videoPath: "uploads/a.mp4", durationSeconds: 3 }],
      mediaUrlFor: (p) => `RESOLVED(${p})`,
    });
    expect(result.tracks[0].items[0].mediaUrl).toBe("RESOLVED(uploads/a.mp4)");
    expect(result.tracks[0].items[0].approvedVideoPath).toBe("uploads/a.mp4");
  });

  it("every item is status 'approved', shotCode/prompt/description null, no editorialSnapshot, no emptySpaces", () => {
    const result = buildShotVideoLibraryExport({
      project: { id: 1, name: "P" },
      sequence: { id: 2, title: "S" },
      shot: { id: 10, title: "Shot A" },
      entries: [{ id: 100, videoPath: "uploads/a.mp4", durationSeconds: 3 }],
      mediaUrlFor: (p) => p,
    });
    expect(result.tracks[0].items[0]).toMatchObject({ status: "approved", shotCode: null, prompt: null, description: null });
    expect(result.editorialSnapshot).toBeUndefined();
    expect(result.emptySpaces).toEqual([]);
  });

  it("an empty entries list produces a single empty track and zero duration", () => {
    const result = buildShotVideoLibraryExport({
      project: { id: 1, name: "P" },
      sequence: { id: 2, title: "S" },
      shot: { id: 10, title: "Shot A" },
      entries: [],
      mediaUrlFor: (p) => p,
    });
    expect(result.tracks).toEqual([{ trackIndex: 0, items: [] }]);
    expect(result.sequence.durationSeconds).toBe(0);
  });
});
