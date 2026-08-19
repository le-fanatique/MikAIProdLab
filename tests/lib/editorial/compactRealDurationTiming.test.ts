import { describe, expect, it } from "vitest";
import {
  computeCompactRealDurationPositions,
  truncateWarningMessage,
  MAX_TIMING_WARNINGS,
  MAX_TIMING_WARNING_MESSAGE_LENGTH,
} from "@/lib/editorial/compactRealDurationTiming";
import type { EditorialDocument, EditorialDocumentItem } from "@/lib/editorial/editorialDocument";
import type { ResolvedShotSource } from "@/lib/editorial/videoSourceModeShared";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for compactRealDurationTiming.ts —
// recomputes real-media, gap-free positions for a "latest-generation"
// export. Timing arithmetic with several clamp/omit rules; a mistake here
// propagates into every downstream compact export.
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
    ...overrides,
  };
}

function doc(tracks: Array<{ id: number; items: EditorialDocumentItem[] }>): EditorialDocument {
  return {
    projectId: 1,
    sequenceId: 2,
    durationSeconds: 0,
    tracks: tracks.map((t) => ({ id: t.id, kind: "video" as const, durationSeconds: 0, items: t.items })),
  };
}

function resolved(overrides: Partial<ResolvedShotSource> = {}): ResolvedShotSource {
  return {
    shotId: 10,
    videoPath: "uploads/shot-videos/shot-10/a.mp4",
    provenance: null,
    durationSeconds: 4,
    ...overrides,
  };
}

describe("computeCompactRealDurationPositions", () => {
  it("positions consecutive items back-to-back using real durations, no planned gaps", () => {
    const document = doc([
      { id: 0, items: [shotItem({ id: 1, shotId: 10, start: 0, duration: 999 }), shotItem({ id: 2, shotId: 20, start: 100, duration: 1 })] },
    ]);
    const sources = new Map<number, ResolvedShotSource>([
      [10, resolved({ shotId: 10, durationSeconds: 4 })],
      [20, resolved({ shotId: 20, durationSeconds: 6 })],
    ]);
    const result = computeCompactRealDurationPositions(document, sources);
    expect(result.positions.get(1)).toEqual({ startSeconds: 0, durationSeconds: 4 });
    expect(result.positions.get(2)).toEqual({ startSeconds: 4, durationSeconds: 6 });
    expect(result.trackDurationsSeconds.get(0)).toBe(10);
    expect(result.warnings).toEqual([]);
  });

  it("omits (does not position) an item whose shot has no resolved source at all", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, shotId: 999 })] }]);
    const result = computeCompactRealDurationPositions(document, new Map());
    expect(result.positions.has(1)).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("no verified, playable media file");
  });

  it("omits an item whose resolved source has videoPath null even if durationSeconds is set (rejected candidate)", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, shotId: 10 })] }]);
    const sources = new Map<number, ResolvedShotSource>([[10, resolved({ videoPath: null, durationSeconds: 4 })]]);
    const result = computeCompactRealDurationPositions(document, sources);
    expect(result.positions.has(1)).toBe(false);
    expect(result.warnings[0]).toContain("no verified, playable media file");
  });

  it("omits an item whose resolved source has no valid real duration (null, zero, negative, non-finite)", () => {
    for (const bad of [null, 0, -1, NaN, Infinity]) {
      const document = doc([{ id: 0, items: [shotItem({ id: 1, shotId: 10 })] }]);
      const sources = new Map<number, ResolvedShotSource>([[10, resolved({ durationSeconds: bad as number | null })]]);
      const result = computeCompactRealDurationPositions(document, sources);
      expect(result.positions.has(1)).toBe(false);
      expect(result.warnings[0]).toContain("no valid real media duration");
    }
  });

  it("skips non-shot items (gaps) and items with a null shotId without warning", () => {
    const document = doc([
      { id: 0, items: [shotItem({ id: 1, sourceType: "gap", shotId: null }), shotItem({ id: 2, sourceType: "shot", shotId: null })] },
    ]);
    const result = computeCompactRealDurationPositions(document, new Map());
    expect(result.positions.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("clamps a valid trim to the real duration and uses the clamped width", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, shotId: 10, trimIn: 1, trimOut: 3 })] }]);
    const sources = new Map<number, ResolvedShotSource>([[10, resolved({ durationSeconds: 10 })]]);
    const result = computeCompactRealDurationPositions(document, sources);
    expect(result.positions.get(1)).toEqual({ startSeconds: 0, durationSeconds: 2 });
  });

  it("clamps a trim that exceeds the real duration down to [0, realDuration]", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, shotId: 10, trimIn: 1, trimOut: 100 })] }]);
    const sources = new Map<number, ResolvedShotSource>([[10, resolved({ durationSeconds: 4 })]]);
    const result = computeCompactRealDurationPositions(document, sources);
    // clampedTrimOut = min(100, 4) = 4, clampedTrimIn = 1 -> span 3
    expect(result.positions.get(1)).toEqual({ startSeconds: 0, durationSeconds: 3 });
  });

  it("omits an item whose trim clamps to an empty or negative span, rather than widening to the planned duration", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, shotId: 10, trimIn: 5, trimOut: 6 })] }]);
    // realDuration 4 -> clampedTrimIn = min(5,4)=4, clampedTrimOut = min(6,4)=4 -> span 0
    const sources = new Map<number, ResolvedShotSource>([[10, resolved({ durationSeconds: 4 })]]);
    const result = computeCompactRealDurationPositions(document, sources);
    expect(result.positions.has(1)).toBe(false);
    expect(result.warnings[0]).toContain("outside the real media span");
  });

  it("uses the full real duration when trimIn/trimOut are both undefined", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, shotId: 10 })] }]);
    const sources = new Map<number, ResolvedShotSource>([[10, resolved({ durationSeconds: 7 })]]);
    const result = computeCompactRealDurationPositions(document, sources);
    expect(result.positions.get(1)).toEqual({ startSeconds: 0, durationSeconds: 7 });
  });

  it("compacts forward across an omitted item — the next item lands right after the last included one, not after the omitted one's planned slot", () => {
    const document = doc([
      { id: 0, items: [shotItem({ id: 1, shotId: 10, start: 0 }), shotItem({ id: 2, shotId: 999, start: 100 }), shotItem({ id: 3, shotId: 20, start: 200 })] },
    ]);
    const sources = new Map<number, ResolvedShotSource>([
      [10, resolved({ shotId: 10, durationSeconds: 4 })],
      [20, resolved({ shotId: 20, durationSeconds: 6 })],
    ]);
    const result = computeCompactRealDurationPositions(document, sources);
    expect(result.positions.get(1)).toEqual({ startSeconds: 0, durationSeconds: 4 });
    expect(result.positions.has(2)).toBe(false);
    expect(result.positions.get(3)).toEqual({ startSeconds: 4, durationSeconds: 6 });
    expect(result.trackDurationsSeconds.get(0)).toBe(10);
  });

  it("compacts each track independently, with no cross-track merge", () => {
    const document = doc([
      { id: 0, items: [shotItem({ id: 1, shotId: 10, trackIndex: 0 })] },
      { id: 1, items: [shotItem({ id: 2, shotId: 20, trackIndex: 1 })] },
    ]);
    const sources = new Map<number, ResolvedShotSource>([
      [10, resolved({ shotId: 10, durationSeconds: 4 })],
      [20, resolved({ shotId: 20, durationSeconds: 6 })],
    ]);
    const result = computeCompactRealDurationPositions(document, sources);
    expect(result.positions.get(1)).toEqual({ startSeconds: 0, durationSeconds: 4 });
    expect(result.positions.get(2)).toEqual({ startSeconds: 0, durationSeconds: 6 });
  });
});

describe("truncateWarningMessage", () => {
  it("leaves a short message untouched", () => {
    expect(truncateWarningMessage("short")).toBe("short");
  });

  it("truncates a message over the limit, appending an ellipsis, at exactly MAX_TIMING_WARNING_MESSAGE_LENGTH chars", () => {
    const long = "x".repeat(MAX_TIMING_WARNING_MESSAGE_LENGTH + 50);
    const truncated = truncateWarningMessage(long);
    expect(truncated.length).toBe(MAX_TIMING_WARNING_MESSAGE_LENGTH);
    expect(truncated.endsWith("…")).toBe(true);
  });

  it("leaves a message at exactly the limit untouched (boundary is strictly greater-than)", () => {
    const exact = "x".repeat(MAX_TIMING_WARNING_MESSAGE_LENGTH);
    expect(truncateWarningMessage(exact)).toBe(exact);
  });
});

describe("bounded warning collector (via computeCompactRealDurationPositions)", () => {
  function manyOmittedDocument(count: number): EditorialDocument {
    const items = Array.from({ length: count }, (_, i) => shotItem({ id: i + 1, shotId: 1000 + i }));
    return doc([{ id: 0, items }]);
  }

  it("caps individual warnings at MAX_TIMING_WARNINGS - 1, adding a synthesis line for the remainder", () => {
    const count = MAX_TIMING_WARNINGS + 10;
    const result = computeCompactRealDurationPositions(manyOmittedDocument(count), new Map());
    expect(result.warnings).toHaveLength(MAX_TIMING_WARNINGS);
    expect(result.warnings[result.warnings.length - 1]).toBe(
      `${count - (MAX_TIMING_WARNINGS - 1)} more item(s) omitted from the compact timeline — full list truncated.`
    );
  });

  it("does not add a synthesis line when omissions fit within the bound exactly", () => {
    const count = MAX_TIMING_WARNINGS - 1;
    const result = computeCompactRealDurationPositions(manyOmittedDocument(count), new Map());
    expect(result.warnings).toHaveLength(count);
    expect(result.warnings.every((w) => w.includes("no verified, playable media file"))).toBe(true);
  });
});
