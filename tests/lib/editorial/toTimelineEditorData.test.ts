import { describe, expect, it } from "vitest";
import { toTimelineEditorData } from "@/lib/editorial/toTimelineEditorData";
import type { EditorialDocument, EditorialDocumentItem } from "@/lib/editorial/editorialDocument";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for toTimelineEditorData.ts — the
// EditorialDocument -> react-timeline-editor adapter.
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

function doc(tracks: Array<{ id: number; items: EditorialDocumentItem[] }>): EditorialDocument {
  return {
    projectId: 1,
    sequenceId: 2,
    durationSeconds: 0,
    tracks: tracks.map((t) => ({ id: t.id, kind: "video" as const, durationSeconds: 0, items: t.items })),
  };
}

describe("toTimelineEditorData", () => {
  it("produces one row per track, one action per shot item plus derived empty spaces", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, start: 5, duration: 5 })] }]);
    const data = toTimelineEditorData(document);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].id).toBe("0");
    expect(data.rows[0].actions.map((a) => a.effectId)).toEqual(["shot-approved", "empty-space"]);
  });

  it("derives effectId from status as shot-<status>, falling back to plain 'shot' with no status", () => {
    const document = doc([{ id: 0, items: [shotItem({ status: undefined })] }]);
    const data = toTimelineEditorData(document);
    expect(data.rows[0].actions[0].effectId).toBe("shot");
  });

  it("registers each distinct effect exactly once in the effects map, with the known label", () => {
    const document = doc([
      { id: 0, items: [shotItem({ id: 1, status: "approved" }), shotItem({ id: 2, status: "approved", shotId: 20 })] },
    ]);
    const data = toTimelineEditorData(document);
    expect(Object.keys(data.effects)).toEqual(["shot-approved"]);
    expect(data.effects["shot-approved"].name).toBe("Approved shot");
  });

  it("falls back an unknown effectId's label to the id itself", () => {
    const document = doc([{ id: 0, items: [shotItem({ status: "placeholder" })] }]);
    const data = toTimelineEditorData(document);
    expect(data.effects["shot-placeholder"].name).toBe("Placeholder shot");
  });

  it("maps action id to the string form of the item id, and populates itemByActionId", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 42 })] }]);
    const data = toTimelineEditorData(document);
    expect(data.rows[0].actions[0].id).toBe("42");
    expect(data.itemByActionId.get("42")!.id).toBe(42);
  });

  it("end is start + duration for a shot action", () => {
    const document = doc([{ id: 0, items: [shotItem({ start: 3, duration: 4 })] }]);
    const data = toTimelineEditorData(document);
    const action = data.rows[0].actions.find((a) => a.effectId !== "empty-space")!;
    expect(action.start).toBe(3);
    expect(action.end).toBe(7);
  });

  it("minStart/maxEnd bound a shot to its immediate shot-only neighbors, first item bounded by 0 and Infinity", () => {
    const document = doc([
      {
        id: 0,
        items: [
          shotItem({ id: 1, start: 0, duration: 5 }),
          shotItem({ id: 2, start: 10, duration: 5, shotId: 20 }),
          shotItem({ id: 3, start: 20, duration: 5, shotId: 30 }),
        ],
      },
    ]);
    const data = toTimelineEditorData(document);
    const [a1, a2, a3] = data.rows[0].actions.filter((a) => a.effectId !== "empty-space");
    expect(a1.minStart).toBe(0);
    expect(a1.maxEnd).toBe(10);
    expect(a2.minStart).toBe(5); // previous end
    expect(a2.maxEnd).toBe(20); // next start
    expect(a3.minStart).toBe(15);
    expect(a3.maxEnd).toBe(Infinity);
  });

  it("every shot action is movable:true, flexible:false, disable:true (fixed by this prototype)", () => {
    const document = doc([{ id: 0, items: [shotItem()] }]);
    const data = toTimelineEditorData(document);
    const action = data.rows[0].actions[0];
    expect(action.movable).toBe(true);
    expect(action.flexible).toBe(false);
    expect(action.disable).toBe(true);
  });

  it("empty-space actions are never movable and carry no minStart/maxEnd", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, start: 5, duration: 5 })] }]);
    const data = toTimelineEditorData(document);
    const space = data.rows[0].actions.find((a) => a.effectId === "empty-space")!;
    expect(space.movable).toBe(false);
    expect(space.minStart).toBeUndefined();
    expect(space.maxEnd).toBeUndefined();
  });

  it("a legacy gap item (sourceType gap) is never turned into its own action", () => {
    const document = doc([{ id: 0, items: [shotItem({ id: 1, sourceType: "gap", shotId: null })] }]);
    const data = toTimelineEditorData(document);
    expect(data.rows[0].actions).toEqual([]);
  });

  it("an empty document produces zero rows", () => {
    const data = toTimelineEditorData({ projectId: 1, sequenceId: 2, durationSeconds: 0, tracks: [] });
    expect(data.rows).toEqual([]);
    expect(data.effects).toEqual({});
  });
});
