import { describe, expect, it } from "vitest";
import {
  getEditorialItemEffectiveDuration,
  getEditorialItemStatus,
  buildEditorialDocument,
  deriveEmptySpaces,
  getEmptySpacePreviewItemId,
  type EditorialDocumentInputItem,
  type EditorialDocument,
} from "@/lib/editorial/editorialDocument";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for editorialDocument.ts — the
// cumulative-duration / start-time arithmetic underlying every editorial
// read model (timeline UI, export, snapshot fingerprint). Behavior as-is,
// surprises noted, never corrected here.
// ---------------------------------------------------------------------------

function shotInput(overrides: Partial<EditorialDocumentInputItem> = {}): EditorialDocumentInputItem {
  return {
    id: 1,
    sequenceId: 1,
    type: "shot",
    shotId: 100,
    orderIndex: 0,
    trackIndex: 0,
    durationSeconds: 5,
    trimInSeconds: null,
    trimOutSeconds: null,
    ...overrides,
  };
}

describe("getEditorialItemEffectiveDuration", () => {
  it("a gap uses its own durationSeconds when positive", () => {
    expect(getEditorialItemEffectiveDuration(shotInput({ type: "gap", durationSeconds: 3 }))).toBe(3);
  });

  it("a gap with null or non-positive durationSeconds is 0", () => {
    expect(getEditorialItemEffectiveDuration(shotInput({ type: "gap", durationSeconds: null }))).toBe(0);
    expect(getEditorialItemEffectiveDuration(shotInput({ type: "gap", durationSeconds: 0 }))).toBe(0);
    expect(getEditorialItemEffectiveDuration(shotInput({ type: "gap", durationSeconds: -1 }))).toBe(0);
  });

  it("a gap never reads trim, even if trim fields are (incorrectly) populated", () => {
    expect(
      getEditorialItemEffectiveDuration(
        shotInput({ type: "gap", durationSeconds: 2, trimInSeconds: 0, trimOutSeconds: 10 })
      )
    ).toBe(2);
  });

  it("a shot with a valid trim uses trimOut - trimIn, ignoring durationSeconds entirely", () => {
    expect(
      getEditorialItemEffectiveDuration(shotInput({ trimInSeconds: 1, trimOutSeconds: 4, durationSeconds: 99 }))
    ).toBe(3);
  });

  it("a trim is valid only when trimIn >= 0 and trimOut > trimIn", () => {
    // trimOut === trimIn: not valid, falls through to durationSeconds.
    expect(getEditorialItemEffectiveDuration(shotInput({ trimInSeconds: 2, trimOutSeconds: 2, durationSeconds: 7 }))).toBe(
      7
    );
    // negative trimIn: not valid.
    expect(
      getEditorialItemEffectiveDuration(shotInput({ trimInSeconds: -1, trimOutSeconds: 4, durationSeconds: 7 }))
    ).toBe(7);
    // trimOut < trimIn: not valid.
    expect(
      getEditorialItemEffectiveDuration(shotInput({ trimInSeconds: 5, trimOutSeconds: 1, durationSeconds: 7 }))
    ).toBe(7);
  });

  it("a shot without a valid trim uses durationSeconds when positive", () => {
    expect(getEditorialItemEffectiveDuration(shotInput({ durationSeconds: 12 }))).toBe(12);
  });

  it("a shot with no valid trim and no positive durationSeconds falls back to the 1.0s placeholder", () => {
    expect(getEditorialItemEffectiveDuration(shotInput({ durationSeconds: null }))).toBe(1.0);
    expect(getEditorialItemEffectiveDuration(shotInput({ durationSeconds: 0 }))).toBe(1.0);
    expect(getEditorialItemEffectiveDuration(shotInput({ durationSeconds: -3 }))).toBe(1.0);
  });
});

describe("getEditorialItemStatus", () => {
  it("a placeholder shot is 'placeholder' regardless of media presence", () => {
    expect(
      getEditorialItemStatus(
        shotInput({ shot: { id: 100, shotCode: "S1", title: "t", approvedVideoPath: "x", isPlaceholder: true } })
      )
    ).toBe("placeholder");
  });

  it("media via mediaUrl or shot.approvedVideoPath is 'approved'", () => {
    expect(getEditorialItemStatus(shotInput({ mediaUrl: "u" }))).toBe("approved");
    expect(
      getEditorialItemStatus(
        shotInput({ shot: { id: 100, shotCode: null, title: null, approvedVideoPath: "p", isPlaceholder: false } })
      )
    ).toBe("approved");
  });

  it("no media, not a placeholder, is 'missing'", () => {
    expect(getEditorialItemStatus(shotInput())).toBe("missing");
  });
});

describe("buildEditorialDocument", () => {
  it("derives start by cumulative duration when startSeconds is absent, in orderIndex order", () => {
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [
        shotInput({ id: 1, orderIndex: 0, durationSeconds: 4 }),
        shotInput({ id: 2, orderIndex: 1, durationSeconds: 6 }),
      ],
    });
    expect(doc.tracks).toHaveLength(1);
    expect(doc.tracks[0].items.map((i) => ({ id: i.id, start: i.start, duration: i.duration }))).toEqual([
      { id: 1, start: 0, duration: 4 },
      { id: 2, start: 4, duration: 6 },
    ]);
    expect(doc.tracks[0].durationSeconds).toBe(10);
    expect(doc.durationSeconds).toBe(10);
  });

  it("orders items by orderIndex, using id as a stable tie-breaker for equal orderIndex", () => {
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [
        shotInput({ id: 20, orderIndex: 0, durationSeconds: 1 }),
        shotInput({ id: 5, orderIndex: 0, durationSeconds: 1 }),
      ],
    });
    expect(doc.tracks[0].items.map((i) => i.id)).toEqual([5, 20]);
  });

  it("groups items into separate tracks by trackIndex, sorted by trackIndex ascending", () => {
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [
        shotInput({ id: 1, trackIndex: 1, durationSeconds: 3 }),
        shotInput({ id: 2, trackIndex: 0, durationSeconds: 5 }),
      ],
    });
    expect(doc.tracks.map((t) => t.id)).toEqual([0, 1]);
  });

  it("prefers a backfilled startSeconds over the cumulative cursor", () => {
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [
        shotInput({ id: 1, orderIndex: 0, durationSeconds: 4, startSeconds: 10 }),
        shotInput({ id: 2, orderIndex: 1, durationSeconds: 2 }), // no startSeconds -> cursor
      ],
    });
    expect(doc.tracks[0].items[0].start).toBe(10);
    // cursor after item 1 is max(0, 10+4) = 14, so item 2 (no backfilled start) lands at 14.
    expect(doc.tracks[0].items[1].start).toBe(14);
  });

  it("the cursor never moves backwards even when a later item's backfilled start is earlier than the previous end", () => {
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [
        shotInput({ id: 1, orderIndex: 0, durationSeconds: 10, startSeconds: 0 }),
        shotInput({ id: 2, orderIndex: 1, durationSeconds: 2 }), // no startSeconds -> falls back to cursor, which is 10 not 0
      ],
    });
    expect(doc.tracks[0].items[1].start).toBe(10);
    expect(doc.tracks[0].durationSeconds).toBe(12);
  });

  it("a later backfilled start EARLIER than the running cursor does not pull the cursor itself backwards for the item after it", () => {
    // item1 ends at 21 (backfilled start 20 + duration 1). item2 has its own
    // backfilled start of 5 (earlier than 21) — its OWN position honors that
    // backfilled value regardless, but the cursor used for the next
    // not-yet-backfilled item must stay at max(21, 5+1)=21, never fall to 6.
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [
        shotInput({ id: 1, orderIndex: 0, durationSeconds: 1, startSeconds: 20 }),
        shotInput({ id: 2, orderIndex: 1, durationSeconds: 1, startSeconds: 5 }),
        shotInput({ id: 3, orderIndex: 2, durationSeconds: 1 }), // no startSeconds -> uses the cursor
      ],
    });
    expect(doc.tracks[0].items[0].start).toBe(20);
    expect(doc.tracks[0].items[1].start).toBe(5); // its own backfilled value, honored as-is
    expect(doc.tracks[0].items[2].start).toBe(21); // cursor stayed at max(21, 6) = 21, not 6
    expect(doc.tracks[0].durationSeconds).toBe(22);
  });

  it("track duration is the cursor's final value, document duration is the max across tracks", () => {
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [
        shotInput({ id: 1, trackIndex: 0, orderIndex: 0, durationSeconds: 20 }),
        shotInput({ id: 2, trackIndex: 1, orderIndex: 0, durationSeconds: 5 }),
      ],
    });
    expect(doc.tracks.find((t) => t.id === 0)!.durationSeconds).toBe(20);
    expect(doc.tracks.find((t) => t.id === 1)!.durationSeconds).toBe(5);
    expect(doc.durationSeconds).toBe(20);
  });

  it("an empty items array produces zero tracks and zero duration", () => {
    const doc = buildEditorialDocument({ projectId: 1, sequenceId: 2, items: [] });
    expect(doc.tracks).toEqual([]);
    expect(doc.durationSeconds).toBe(0);
  });

  it("a gap item's sourceType wins even if shotId is (incorrectly) non-null", () => {
    const doc = buildEditorialDocument({
      projectId: 1,
      sequenceId: 2,
      items: [shotInput({ id: 1, type: "gap", shotId: 999, durationSeconds: 3 })],
    });
    expect(doc.tracks[0].items[0].sourceType).toBe("gap");
    expect(doc.tracks[0].items[0].shotId).toBeNull();
  });

  it("does not mutate the input items array or its objects", () => {
    const items = [shotInput({ id: 1, orderIndex: 0, durationSeconds: 4 })];
    const snapshot = JSON.parse(JSON.stringify(items));
    buildEditorialDocument({ projectId: 1, sequenceId: 2, items });
    expect(items).toEqual(snapshot);
  });
});

describe("deriveEmptySpaces", () => {
  function docWithShots(items: Array<{ id: number; trackIndex: number; start: number; duration: number }>): EditorialDocument {
    const byTrack = new Map<number, typeof items>();
    for (const it of items) {
      const b = byTrack.get(it.trackIndex);
      if (b) b.push(it);
      else byTrack.set(it.trackIndex, [it]);
    }
    return {
      projectId: 1,
      sequenceId: 2,
      durationSeconds: 0,
      tracks: [...byTrack.entries()].map(([trackIndex, trackItems]) => ({
        id: trackIndex,
        kind: "video" as const,
        durationSeconds: 0,
        items: trackItems.map((it) => ({
          id: it.id,
          sourceType: "shot" as const,
          shotId: it.id,
          trackIndex: it.trackIndex,
          orderIndex: 0,
          start: it.start,
          duration: it.duration,
        })),
      })),
    };
  }

  it("finds a gap between the timeline origin and the first shot", () => {
    const spaces = deriveEmptySpaces(docWithShots([{ id: 1, trackIndex: 0, start: 5, duration: 3 }]));
    expect(spaces).toEqual([
      { id: "empty-space-0-0-5", trackIndex: 0, start: 0, duration: 5, previousItemId: null, nextItemId: 1 },
    ]);
  });

  it("finds a gap between two shots, referencing both neighbor ids", () => {
    const spaces = deriveEmptySpaces(
      docWithShots([
        { id: 1, trackIndex: 0, start: 0, duration: 5 },
        { id: 2, trackIndex: 0, start: 10, duration: 5 },
      ])
    );
    expect(spaces).toEqual([
      { id: "empty-space-0-5-5", trackIndex: 0, start: 5, duration: 5, previousItemId: 1, nextItemId: 2 },
    ]);
  });

  it("does not report a gap under the epsilon (0.05s) as touching, not empty", () => {
    const spaces = deriveEmptySpaces(
      docWithShots([
        { id: 1, trackIndex: 0, start: 0, duration: 5 },
        { id: 2, trackIndex: 0, start: 5.01, duration: 5 },
      ])
    );
    expect(spaces).toEqual([]);
  });

  it("no gap when shots are contiguous from the origin", () => {
    const spaces = deriveEmptySpaces(
      docWithShots([
        { id: 1, trackIndex: 0, start: 0, duration: 5 },
        { id: 2, trackIndex: 0, start: 5, duration: 5 },
      ])
    );
    expect(spaces).toEqual([]);
  });

  it("computes multiple tracks independently", () => {
    const spaces = deriveEmptySpaces(
      docWithShots([
        { id: 1, trackIndex: 0, start: 5, duration: 5 },
        { id: 2, trackIndex: 1, start: 10, duration: 5 },
      ])
    );
    expect(spaces).toHaveLength(2);
    expect(spaces.find((s) => s.trackIndex === 0)!.start).toBe(0);
    expect(spaces.find((s) => s.trackIndex === 1)!.start).toBe(0);
  });

  it("sorts shots by start (id as tie-break) regardless of input array order", () => {
    const spaces = deriveEmptySpaces(
      docWithShots([
        { id: 2, trackIndex: 0, start: 10, duration: 5 },
        { id: 1, trackIndex: 0, start: 0, duration: 5 },
      ])
    );
    expect(spaces).toEqual([
      { id: "empty-space-0-5-5", trackIndex: 0, start: 5, duration: 5, previousItemId: 1, nextItemId: 2 },
    ]);
  });
});

describe("getEmptySpacePreviewItemId", () => {
  it("is always negative and deterministic from trackIndex + start alone", () => {
    const id1 = getEmptySpacePreviewItemId({ id: "x", trackIndex: 0, start: 5, duration: 1, previousItemId: null, nextItemId: null });
    const id2 = getEmptySpacePreviewItemId({ id: "y", trackIndex: 0, start: 5, duration: 99, previousItemId: 1, nextItemId: 2 });
    expect(id1).toBeLessThan(0);
    expect(id1).toBe(id2); // duration/neighbors never factor in
  });

  it("computes -1 - trackIndex*1_000_000 - round(start*10)", () => {
    expect(
      getEmptySpacePreviewItemId({ id: "x", trackIndex: 2, start: 3.05, duration: 1, previousItemId: null, nextItemId: null })
    ).toBe(-1 - 2 * 1_000_000 - 31); // round(30.5) = 31 (banker's? no, Math.round rounds .5 up)
  });

  it("distinguishes two different tracks at the same start", () => {
    const a = getEmptySpacePreviewItemId({ id: "a", trackIndex: 0, start: 1, duration: 1, previousItemId: null, nextItemId: null });
    const b = getEmptySpacePreviewItemId({ id: "b", trackIndex: 1, start: 1, duration: 1, previousItemId: null, nextItemId: null });
    expect(a).not.toBe(b);
  });
});
