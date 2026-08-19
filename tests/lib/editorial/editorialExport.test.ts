import { describe, expect, it } from "vitest";
import { buildEditorialExport, COMPACT_REAL_DURATION_TIMING_BASIS } from "@/lib/editorial/editorialExport";
import type { EditorialDocument, EditorialDocumentItem } from "@/lib/editorial/editorialDocument";
import type { CompactRealDurationResult } from "@/lib/editorial/compactRealDurationTiming";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for editorialExport.ts's assembly
// of the MikAIEditorialExportV1 payload — the external contract OpenReel
// consumes. Behavior as-is, surprises noted, never corrected.
// ---------------------------------------------------------------------------

function shotItem(overrides: Partial<EditorialDocumentItem> = {}): EditorialDocumentItem {
  return {
    id: 1,
    sourceType: "shot",
    shotId: 10,
    trackIndex: 0,
    orderIndex: 0,
    start: 0,
    duration: 5,
    status: "approved",
    ...overrides,
  };
}

function doc(tracks: Array<{ id: number; items: EditorialDocumentItem[] }>, durationSeconds = 0): EditorialDocument {
  return {
    projectId: 1,
    sequenceId: 2,
    durationSeconds,
    tracks: tracks.map((t) => ({ id: t.id, kind: "video" as const, durationSeconds: 0, items: t.items })),
  };
}

const project = { id: 1, name: "Project" };
const sequence = { id: 2, title: "Sequence" };

describe("buildEditorialExport", () => {
  it("exports only shot-sourced items with shotId, filtering out gaps and null-shotId shots", () => {
    const document = doc([
      {
        id: 0,
        items: [
          shotItem({ id: 1, shotId: 10 }),
          shotItem({ id: 2, sourceType: "gap", shotId: null }),
          shotItem({ id: 3, sourceType: "shot", shotId: null }),
        ],
      },
    ]);
    const result = buildEditorialExport({ project, sequence, document, shotExtrasById: new Map() });
    expect(result.tracks[0].items.map((i) => i.id)).toEqual([1]);
  });

  it("falls back an item's missing status to 'missing'", () => {
    const document = doc([{ id: 0, items: [shotItem({ status: undefined })] }]);
    const result = buildEditorialExport({ project, sequence, document, shotExtrasById: new Map() });
    expect(result.tracks[0].items[0].status).toBe("missing");
  });

  it("merges shot extras (prompt/description/approvedVideoPath) by shotId", () => {
    const document = doc([{ id: 0, items: [shotItem({ shotId: 10 })] }]);
    const result = buildEditorialExport({
      project,
      sequence,
      document,
      shotExtrasById: new Map([[10, { approvedVideoPath: "uploads/x.mp4", prompt: "p", description: "d" }]]),
    });
    expect(result.tracks[0].items[0]).toMatchObject({
      approvedVideoPath: "uploads/x.mp4",
      prompt: "p",
      description: "d",
    });
  });

  it("omits editorialSnapshot/videoSourceMode/timingBasis/sourceMode when not requested (byte-identical legacy shape)", () => {
    const document = doc([{ id: 0, items: [shotItem()] }]);
    const result = buildEditorialExport({ project, sequence, document, shotExtrasById: new Map() });
    expect(result.videoSourceMode).toBeUndefined();
    expect(result.timingBasis).toBeUndefined();
    expect(result.timingWarnings).toBeUndefined();
    expect(result.sourceMode).toBeUndefined();
    expect(result.editorialSnapshot).toBeDefined(); // always built from document
  });

  it("resolvedMediaByShotId overrides mediaUrl/provenance only — approvedVideoPath and status are untouched", () => {
    const document = doc([{ id: 0, items: [shotItem({ shotId: 10, mediaUrl: "planned-url", status: "approved" })] }]);
    const result = buildEditorialExport({
      project,
      sequence,
      document,
      shotExtrasById: new Map([[10, { approvedVideoPath: "uploads/approved.mp4", prompt: null, description: null }]]),
      resolvedMediaByShotId: new Map([[10, { mediaUrl: "resolved-url", provenance: { kind: "approved" } }]]),
    });
    const item = result.tracks[0].items[0];
    expect(item.mediaUrl).toBe("resolved-url");
    expect(item.provenance).toEqual({ kind: "approved" });
    expect(item.approvedVideoPath).toBe("uploads/approved.mp4");
    expect(item.status).toBe("approved");
  });

  it("falls back mediaUrl to the item's own mediaUrl when resolvedMediaByShotId has no entry for the shot", () => {
    const document = doc([{ id: 0, items: [shotItem({ shotId: 10, mediaUrl: "planned-url" })] }]);
    const result = buildEditorialExport({
      project,
      sequence,
      document,
      shotExtrasById: new Map(),
      resolvedMediaByShotId: new Map(),
    });
    expect(result.tracks[0].items[0].mediaUrl).toBe("planned-url");
  });

  it("omits the provenance key entirely (not just undefined) when resolved has no provenance", () => {
    const document = doc([{ id: 0, items: [shotItem({ shotId: 10 })] }]);
    const result = buildEditorialExport({
      project,
      sequence,
      document,
      shotExtrasById: new Map(),
      resolvedMediaByShotId: new Map([[10, { mediaUrl: "x", provenance: null }]]),
    });
    expect("provenance" in result.tracks[0].items[0]).toBe(false);
  });

  it("videoSourceMode is echoed only when explicitly given", () => {
    const document = doc([{ id: 0, items: [shotItem()] }]);
    const result = buildEditorialExport({
      project,
      sequence,
      document,
      shotExtrasById: new Map(),
      videoSourceMode: "latest-generation",
    });
    expect(result.videoSourceMode).toBe("latest-generation");
  });

  it("emptySpaces is derived from the planned document when there is no compactTiming", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, start: 5, duration: 5 })] }]);
    const result = buildEditorialExport({ project, sequence, document, shotExtrasById: new Map() });
    expect(result.emptySpaces).toEqual([
      { trackIndex: 0, startSeconds: 0, durationSeconds: 5, previousItemId: null, nextItemId: 1 },
    ]);
  });

  describe("compactTiming", () => {
    function compactTiming(overrides: Partial<CompactRealDurationResult> = {}): CompactRealDurationResult {
      return {
        positions: new Map([[1, { startSeconds: 0, durationSeconds: 3 }]]),
        warnings: ["one omitted"],
        trackDurationsSeconds: new Map([[0, 3]]),
        ...overrides,
      };
    }

    it("overrides startSeconds/durationSeconds with the compact position for items that have one", () => {
      const document = doc([{ id: 0, items: [shotItem({ id: 1, start: 100, duration: 999 })] }]);
      const result = buildEditorialExport({
        project,
        sequence,
        document,
        shotExtrasById: new Map(),
        compactTiming: compactTiming(),
      });
      expect(result.tracks[0].items[0]).toMatchObject({ startSeconds: 0, durationSeconds: 3 });
    });

    it("drops an item entirely from tracks[].items when compactTiming has no position for it", () => {
      const document = doc([
        { id: 0, items: [shotItem({ id: 1 }), shotItem({ id: 2, shotId: 20 })] },
      ]);
      const result = buildEditorialExport({
        project,
        sequence,
        document,
        shotExtrasById: new Map(),
        compactTiming: compactTiming({ positions: new Map([[1, { startSeconds: 0, durationSeconds: 3 }]]) }),
      });
      expect(result.tracks[0].items.map((i) => i.id)).toEqual([1]);
    });

    it("always reports zero emptySpaces when compactTiming is present, regardless of the planned document's own gaps", () => {
      const document = doc([{ id: 0, items: [shotItem({ id: 1, start: 5, duration: 5 })] }]);
      const result = buildEditorialExport({
        project,
        sequence,
        document,
        shotExtrasById: new Map(),
        compactTiming: compactTiming(),
      });
      expect(result.emptySpaces).toEqual([]);
    });

    it("sets timingBasis and echoes warnings verbatim", () => {
      const document = doc([{ id: 0, items: [shotItem({ id: 1 })] }]);
      const result = buildEditorialExport({
        project,
        sequence,
        document,
        shotExtrasById: new Map(),
        compactTiming: compactTiming({ warnings: ["w1", "w2"] }),
      });
      expect(result.timingBasis).toBe(COMPACT_REAL_DURATION_TIMING_BASIS);
      expect(result.timingWarnings).toEqual(["w1", "w2"]);
    });

    it("sequence.durationSeconds becomes the max across compact track durations, not the planned document's own", () => {
      const document = doc([{ id: 0, items: [shotItem({ id: 1 })] }], 999);
      const result = buildEditorialExport({
        project,
        sequence,
        document,
        shotExtrasById: new Map(),
        compactTiming: compactTiming({ trackDurationsSeconds: new Map([[0, 3], [1, 7]]) }),
      });
      expect(result.sequence.durationSeconds).toBe(7);
    });

    it("editorialSnapshot is still built from the planned document, unaffected by compactTiming", () => {
      const document = doc([{ id: 0, items: [shotItem({ id: 1, start: 100 })] }]);
      const withoutCompact = buildEditorialExport({ project, sequence, document, shotExtrasById: new Map() });
      const withCompact = buildEditorialExport({
        project,
        sequence,
        document,
        shotExtrasById: new Map(),
        compactTiming: compactTiming(),
      });
      expect(withCompact.editorialSnapshot!.fingerprint).toBe(withoutCompact.editorialSnapshot!.fingerprint);
    });
  });
});
