import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";

// Every mutating action in this file calls `revalidatePath` on its success
// path. Outside a real Next.js request (this test's plain Node/vitest
// process), `revalidatePath` throws ("Invariant: static generation store
// missing") — mocked to a no-op, same precedent as tests/actions/registry.test.ts.
// This does not touch or hide any of the six actions' own written behaviour.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  insertProject,
  insertSequence,
  insertShot,
  insertEditorialItem,
  readEditorialItem,
  readEditorialItems,
} from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// editorialTimeline — IND.EDITORIAL.3. Characterization tests: they lock down
// `src/actions/editorialTimeline.ts` exactly as it behaves today, the last
// server path in the repo without a net. No production behavior is changed
// by this ticket.
//
// All six actions here write to SQLite only — no filesystem, no subprocess —
// so unlike the two precedents (sequenceVideoSplit, storyboardExtraction)
// nothing needs mocking or a fixture file on disk.
//
// ---------------------------------------------------------------------------
// CHARACTERIZATION: unlike every other action in this file (and unlike both
// precedent files, where every rejection redirects with an error message in
// the query string), `updateEditorialItemTrim`'s *basic* validation, its
// ownership check, and its "must be a shot" check all fall through to a bare
// `return;` — no redirect at all, no error surfaced, nothing in the URL. Only
// an actually-invalid trim VALUE pair (trimOut <= trimIn, etc.) redirects.
// The other five actions in this file always call `redirect(returnTo)` on
// every path, success or refusal — they just never append a query-string
// reason, unlike sequenceVideoSplit/storyboardExtraction. The author was
// shown this asymmetry; no ticket authorizes changing it here — frozen as
// observed.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let actions: typeof import("@/actions/editorialTimeline");

let projectId: number;
let sequenceId: number;
let otherSequenceId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  actions = await import("@/actions/editorialTimeline");

  projectId = await insertProject(ctx, "Editorial timeline project");
  sequenceId = await insertSequence(ctx, projectId);
  otherSequenceId = await insertSequence(ctx, projectId, { title: "Other sequence" });
});

afterAll(() => {
  ctx.cleanup();
});

// ---------------------------------------------------------------------------
// updateEditorialItemTrim
// ---------------------------------------------------------------------------

describe("updateEditorialItemTrim", () => {
  it("sets trimInSeconds/trimOutSeconds on a shot item, and redirects to returnTo", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { durationSeconds: 10 });

    const target = await captureRedirect(() =>
      actions.updateEditorialItemTrim(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), trimInSeconds: "1", trimOutSeconds: "4", returnTo: "/x" })
      )
    );
    expect(target).toBe("/x");

    const item = await readEditorialItem(ctx, itemId);
    expect(item.trimInSeconds).toBe(1);
    expect(item.trimOutSeconds).toBe(4);
    expect(item.durationSeconds).toBe(10); // untouched — trims live alongside, not instead of, durationSeconds
    expect(item.orderIndex).toBe(0);
    expect(item.trackIndex).toBe(0);
  });

  it("clears both trim fields when clearTrim=1", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { trimInSeconds: 1, trimOutSeconds: 4 });

    await captureRedirect(() =>
      actions.updateEditorialItemTrim(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), clearTrim: "1", returnTo: "/x" })
      )
    );

    const item = await readEditorialItem(ctx, itemId);
    expect(item.trimInSeconds).toBeNull();
    expect(item.trimOutSeconds).toBeNull();
  });

  it("CHARACTERIZATION: an invalid projectId returns silently — no redirect, no write, no error surfaced", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId);
    const before = await readEditorialItem(ctx, itemId);

    // Directly awaited (not captureRedirect) — this path resolves normally.
    await expect(
      actions.updateEditorialItemTrim(
        form({ projectId: "0", sequenceId: String(sequenceId), itemId: String(itemId), trimInSeconds: "1", trimOutSeconds: "2", returnTo: "/x" })
      )
    ).resolves.toBeUndefined();

    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("CHARACTERIZATION: a sequence/project ownership mismatch returns silently — no redirect, no write", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId);
    const before = await readEditorialItem(ctx, itemId);
    const foreignProjectId = await insertProject(ctx, "Foreign project");

    await expect(
      actions.updateEditorialItemTrim(
        form({ projectId: String(foreignProjectId), sequenceId: String(sequenceId), itemId: String(itemId), trimInSeconds: "1", trimOutSeconds: "2", returnTo: "/x" })
      )
    ).resolves.toBeUndefined();

    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("CHARACTERIZATION: a gap item is rejected silently — trims never apply to gaps", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { type: "gap", durationSeconds: 3, shotId: null });
    const before = await readEditorialItem(ctx, itemId);

    await expect(
      actions.updateEditorialItemTrim(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), trimInSeconds: "1", trimOutSeconds: "2", returnTo: "/x" })
      )
    ).resolves.toBeUndefined();

    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("redirects (does not write) when trimOut <= trimIn", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { trimInSeconds: 1, trimOutSeconds: 4 });
    const before = await readEditorialItem(ctx, itemId);

    const target = await captureRedirect(() =>
      actions.updateEditorialItemTrim(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), trimInSeconds: "5", trimOutSeconds: "5", returnTo: "/x" })
      )
    );
    expect(target).toBe("/x"); // redirects, but no query-string reason (see file-level note)

    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("falls back to the default editorial returnTo when returnTo is missing", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { durationSeconds: 10 });

    const target = await captureRedirect(() =>
      actions.updateEditorialItemTrim(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), trimInSeconds: "1", trimOutSeconds: "2" })
      )
    );
    expect(target).toBe(`/projects/${projectId}/sequences/${sequenceId}/editorial`);
  });
});

// ---------------------------------------------------------------------------
// resetAllEditorialItemTrims — destructive-ish (mass write), proof of what
// survives: gap items are never touched.
// ---------------------------------------------------------------------------

describe("resetAllEditorialItemTrims", () => {
  it("clears trims on every shot item, and leaves gap items completely untouched", async () => {
    const shotA = await insertEditorialItem(ctx, sequenceId, { orderIndex: 0, trimInSeconds: 1, trimOutSeconds: 4, durationSeconds: 10 });
    const shotB = await insertEditorialItem(ctx, sequenceId, { orderIndex: 2, trimInSeconds: 2, trimOutSeconds: 6 });
    const gap = await insertEditorialItem(ctx, sequenceId, { orderIndex: 1, type: "gap", shotId: null, durationSeconds: 3 });
    const gapBefore = await readEditorialItem(ctx, gap);

    const target = await captureRedirect(() =>
      actions.resetAllEditorialItemTrims(form({ projectId: String(projectId), sequenceId: String(sequenceId), returnTo: "/x" }))
    );
    expect(target).toBe("/x");

    const a = await readEditorialItem(ctx, shotA);
    const b = await readEditorialItem(ctx, shotB);
    expect(a.trimInSeconds).toBeNull();
    expect(a.trimOutSeconds).toBeNull();
    expect(a.durationSeconds).toBe(10); // restores source duration by leaving durationSeconds as-is
    expect(b.trimInSeconds).toBeNull();
    expect(b.trimOutSeconds).toBeNull();

    // The gap survives byte-for-byte, including its own updatedAt.
    expect(await readEditorialItem(ctx, gap)).toEqual(gapBefore);
  });

  it("redirects on an invalid projectId, and writes nothing", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { trimInSeconds: 1, trimOutSeconds: 2 });
    const before = await readEditorialItem(ctx, itemId);

    const target = await captureRedirect(() =>
      actions.resetAllEditorialItemTrims(form({ projectId: "0", sequenceId: String(sequenceId), returnTo: "/x" }))
    );
    expect(target).toBe("/x");
    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("redirects on an ownership mismatch, and writes nothing", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { trimInSeconds: 1, trimOutSeconds: 2 });
    const before = await readEditorialItem(ctx, itemId);
    const foreignProjectId = await insertProject(ctx, "Foreign project 2");

    const target = await captureRedirect(() =>
      actions.resetAllEditorialItemTrims(form({ projectId: String(foreignProjectId), sequenceId: String(sequenceId), returnTo: "/x" }))
    );
    expect(target).toBe("/x");
    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// deleteEditorialGap — destructive. Proof of what survives: shot items and
// other tracks are untouched; only the affected track is renumbered.
// ---------------------------------------------------------------------------

describe("deleteEditorialGap", () => {
  it("removes exactly the gap row and renumbers orderIndex 0..n-1 on its track — shot items' own columns are byte-for-byte unchanged", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `deleteGap ${Date.now()}` });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, durationSeconds: 10 });
    const gap = await insertEditorialItem(ctx, seqId, { orderIndex: 1, type: "gap", shotId: null, durationSeconds: 3 });
    const item2 = await insertEditorialItem(ctx, seqId, { orderIndex: 2, durationSeconds: 5 });
    const item0Before = await readEditorialItem(ctx, item0);

    const target = await captureRedirect(() =>
      actions.deleteEditorialGap(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(gap), returnTo: "/x" }))
    );
    expect(target).toBe("/x");

    const remaining = await readEditorialItems(ctx, seqId);
    expect(remaining.map((r) => r.id)).toEqual([item0, item2]); // gap genuinely gone
    expect(remaining.map((r) => r.orderIndex)).toEqual([0, 1]); // item2 renumbered 2 -> 1

    expect(await readEditorialItem(ctx, item0)).toEqual(item0Before); // untouched by the renumbering of its sibling
    const item2After = await readEditorialItem(ctx, item2);
    expect(item2After.durationSeconds).toBe(5); // survivor's own geometry never moved
  });

  it("does not touch a different track's own orderIndex sequence", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `deleteGap-tracks ${Date.now()}` });
    const t0Item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, trackIndex: 0, durationSeconds: 10 });
    const t0Gap = await insertEditorialItem(ctx, seqId, { orderIndex: 1, trackIndex: 0, type: "gap", shotId: null, durationSeconds: 2 });
    const t0Item2 = await insertEditorialItem(ctx, seqId, { orderIndex: 2, trackIndex: 0, durationSeconds: 4 });
    const t1Item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, trackIndex: 1, durationSeconds: 7 });
    const t1Item1 = await insertEditorialItem(ctx, seqId, { orderIndex: 1, trackIndex: 1, durationSeconds: 8 });
    const t1Item0Before = await readEditorialItem(ctx, t1Item0);
    const t1Item1Before = await readEditorialItem(ctx, t1Item1);

    await captureRedirect(() =>
      actions.deleteEditorialGap(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(t0Gap), returnTo: "/x" }))
    );

    expect(await readEditorialItem(ctx, t1Item0)).toEqual(t1Item0Before);
    expect(await readEditorialItem(ctx, t1Item1)).toEqual(t1Item1Before);
    const t0Item2After = await readEditorialItem(ctx, t0Item2);
    expect(t0Item2After.orderIndex).toBe(1);
    expect(await readEditorialItem(ctx, t0Item0)).not.toBeUndefined();
  });

  it("refuses to delete a shot item (type guard), and writes nothing", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { orderIndex: 0, durationSeconds: 10 });
    const before = await readEditorialItem(ctx, itemId);

    const target = await captureRedirect(() =>
      actions.deleteEditorialGap(form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), returnTo: "/x" }))
    );
    expect(target).toBe("/x");
    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("refuses an item that does not belong to this sequence, and writes nothing", async () => {
    const foreignGap = await insertEditorialItem(ctx, otherSequenceId, { type: "gap", shotId: null, durationSeconds: 1 });
    const before = await readEditorialItem(ctx, foreignGap);

    const target = await captureRedirect(() =>
      actions.deleteEditorialGap(form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(foreignGap), returnTo: "/x" }))
    );
    expect(target).toBe("/x");
    expect(await readEditorialItem(ctx, foreignGap)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// resizeEditorialItemRightEdge — the highest-priority arithmetic/ordering
// risk: shrink creates/extends a gap, extend consumes one, and orderIndex is
// renormalized per track afterwards.
// ---------------------------------------------------------------------------

describe("resizeEditorialItemRightEdge", () => {
  it("shrink with no gap after: inserts a new gap holding exactly the freed delta, and shifts the following item's orderIndex — its own duration stays untouched", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `resize-shrink-nogap ${Date.now()}` });
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, shotId: shotA, durationSeconds: 10 });
    const item1 = await insertEditorialItem(ctx, seqId, { orderIndex: 1, durationSeconds: 5 });

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newTrimOutSeconds: "6", returnTo: "/x" })
      )
    );

    const rows = await readEditorialItems(ctx, seqId);
    expect(rows).toHaveLength(3);
    const byOrder = [...rows].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(byOrder.map((r) => r.orderIndex)).toEqual([0, 1, 2]);

    const resized = byOrder[0];
    const gap = byOrder[1];
    const survivor = byOrder[2];

    expect(resized.id).toBe(item0);
    expect(resized.trimOutSeconds).toBe(6);
    expect(resized.trimInSeconds).toBeNull(); // left handle untouched

    expect(gap.type).toBe("gap");
    expect(gap.durationSeconds).toBe(4); // delta = 10 - 6
    expect(gap.trackIndex).toBe(0);
    expect(gap.shotId).toBeNull();

    expect(survivor.id).toBe(item1);
    expect(survivor.durationSeconds).toBe(5); // untouched — proof the shift did not also mutate geometry
  });

  it("shrink with a gap already after: extends the existing gap by exactly the freed delta instead of inserting a new row", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `resize-shrink-gap ${Date.now()}` });
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, shotId: shotA, durationSeconds: 10 });
    const gap = await insertEditorialItem(ctx, seqId, { orderIndex: 1, type: "gap", shotId: null, durationSeconds: 3 });

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newTrimOutSeconds: "6", returnTo: "/x" })
      )
    );

    const rows = await readEditorialItems(ctx, seqId);
    expect(rows).toHaveLength(2); // no new row inserted
    const resized = rows.find((r) => r.id === item0)!;
    const gapAfter = rows.find((r) => r.id === gap)!;
    expect(resized.trimOutSeconds).toBe(6);
    expect(gapAfter.durationSeconds).toBe(7); // 3 + (10 - 6)
    expect(gapAfter.orderIndex).toBe(1); // unchanged
  });

  it("extend: fully consumes a next gap that becomes empty — the gap row is deleted and a following item's orderIndex renumbers down", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `resize-extend-consume ${Date.now()}` });
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, shotId: shotA, trimInSeconds: 0, trimOutSeconds: 6 });
    const gap = await insertEditorialItem(ctx, seqId, { orderIndex: 1, type: "gap", shotId: null, durationSeconds: 4 });
    const item2 = await insertEditorialItem(ctx, seqId, { orderIndex: 2, durationSeconds: 9 });

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newTrimOutSeconds: "10", returnTo: "/x" })
      )
    );

    const rows = await readEditorialItems(ctx, seqId);
    expect(rows.map((r) => r.id)).toEqual([item0, item2]); // gap genuinely gone
    expect(rows.map((r) => r.id)).not.toContain(gap);
    const resized = rows.find((r) => r.id === item0)!;
    expect(resized.trimOutSeconds).toBe(10); // 0 + 6 + 4 (full delta requested == gap duration)
    const survivor = rows.find((r) => r.id === item2)!;
    expect(survivor.orderIndex).toBe(1); // renumbered down after the gap's removal
    expect(survivor.durationSeconds).toBe(9); // its own geometry never moved
  });

  it("extend: a request larger than the available gap is CLAMPED to the gap's duration — it does not ripple into the item beyond the gap", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `resize-extend-clamp ${Date.now()}` });
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, shotId: shotA, trimInSeconds: 0, trimOutSeconds: 6 });
    const gap = await insertEditorialItem(ctx, seqId, { orderIndex: 1, type: "gap", shotId: null, durationSeconds: 4 });

    // Ask for +20s (duration 26) though only 4s of gap is available.
    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newTrimOutSeconds: "26", returnTo: "/x" })
      )
    );

    const resized = await readEditorialItem(ctx, item0);
    expect(resized.trimOutSeconds).toBe(10); // clamped: 0 + 6 + min(20, 4)
    // Gap fully consumed (4 - 4 = 0 <= epsilon) — deleted, not left at a negative or zero-but-present duration.
    await expect(readEditorialItem(ctx, gap)).resolves.toBeUndefined();
  });

  it("extend: a request smaller than the gap only PARTIALLY consumes it — the gap row survives with the leftover duration", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `resize-extend-partial ${Date.now()}` });
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, shotId: shotA, trimInSeconds: 0, trimOutSeconds: 6 });
    const gap = await insertEditorialItem(ctx, seqId, { orderIndex: 1, type: "gap", shotId: null, durationSeconds: 4 });

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newTrimOutSeconds: "8", returnTo: "/x" })
      )
    );

    const resized = await readEditorialItem(ctx, item0);
    expect(resized.trimOutSeconds).toBe(8); // 0 + 6 + 2
    const gapAfter = await readEditorialItem(ctx, gap);
    expect(gapAfter).not.toBeUndefined();
    expect(gapAfter.durationSeconds).toBe(2); // 4 - 2, survives
  });

  it("extend: refuses (no write) when there is no gap immediately after the item", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `resize-extend-noGap ${Date.now()}` });
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, shotId: shotA, trimInSeconds: 0, trimOutSeconds: 6 });
    const item1 = await insertEditorialItem(ctx, seqId, { orderIndex: 1, durationSeconds: 5 });
    const before0 = await readEditorialItem(ctx, item0);
    const before1 = await readEditorialItem(ctx, item1);

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newTrimOutSeconds: "9", returnTo: "/x" })
      )
    );

    expect(await readEditorialItem(ctx, item0)).toEqual(before0);
    expect(await readEditorialItem(ctx, item1)).toEqual(before1);
  });

  it("refuses (no write) when the resulting duration would be below the 0.2s floor", async () => {
    const shotA = await insertShot(ctx, sequenceId, { title: "Shot floor" });
    const itemId = await insertEditorialItem(ctx, sequenceId, { orderIndex: 0, shotId: shotA, trimInSeconds: 0, trimOutSeconds: 6 });
    const before = await readEditorialItem(ctx, itemId);

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), newTrimOutSeconds: "0.15", returnTo: "/x" })
      )
    );

    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("no-op (no write) when the requested duration is unchanged within 1ms", async () => {
    const shotA = await insertShot(ctx, sequenceId, { title: "Shot noop" });
    const itemId = await insertEditorialItem(ctx, sequenceId, { orderIndex: 0, shotId: shotA, trimInSeconds: 0, trimOutSeconds: 6 });
    const before = await readEditorialItem(ctx, itemId);

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), newTrimOutSeconds: "6.0001", returnTo: "/x" })
      )
    );

    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("a shrink on one track leaves an item on a different track byte-for-byte unchanged, including its orderIndex", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `resize-cross-track ${Date.now()}` });
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const t0Item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, trackIndex: 0, shotId: shotA, durationSeconds: 10 });
    const t1Item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 5, trackIndex: 1, durationSeconds: 7 });
    const t1Before = await readEditorialItem(ctx, t1Item0);

    await captureRedirect(() =>
      actions.resizeEditorialItemRightEdge(
        form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(t0Item0), newTrimOutSeconds: "6", returnTo: "/x" })
      )
    );

    const t1After = await readEditorialItem(ctx, t1Item0);
    // Every column except orderIndex survives untouched; orderIndex itself is
    // renormalized to 0 on its own track regardless (sole item on track 1) —
    // see the file-level report for the intermediate cross-track shift this
    // masks.
    expect(changedColumns(t1Before, t1After)).toEqual(["orderIndex"]);
    expect(t1After.orderIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// moveEditorialItemOrder — pure adjacent orderIndex swap.
// ---------------------------------------------------------------------------

describe("moveEditorialItemOrder", () => {
  it("swaps orderIndex with the previous sibling on 'up', touching orderIndex only on both rows", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveOrder-up ${Date.now()}` });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, durationSeconds: 10, trimInSeconds: 1, trimOutSeconds: 3 });
    const item1 = await insertEditorialItem(ctx, seqId, { orderIndex: 1, durationSeconds: 5 });
    const before0 = await readEditorialItem(ctx, item0);
    const before1 = await readEditorialItem(ctx, item1);

    await captureRedirect(() =>
      actions.moveEditorialItemOrder(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), direction: "up", returnTo: "/x" }))
    );

    const after0 = await readEditorialItem(ctx, item0);
    const after1 = await readEditorialItem(ctx, item1);
    expect(after0.orderIndex).toBe(1);
    expect(after1.orderIndex).toBe(0);
    // updatedAt is excluded: SQLite's strftime('%f') millisecond resolution
    // can leave it identical when the whole action completes within the same
    // millisecond, which is not itself a fact about what this action writes.
    expect(changedColumns(before0, after0).filter((c) => c !== "updatedAt")).toEqual(["orderIndex"]);
    expect(changedColumns(before1, after1).filter((c) => c !== "updatedAt")).toEqual(["orderIndex"]);
  });

  it("swaps orderIndex with the next sibling on 'down'", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveOrder-down ${Date.now()}` });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, durationSeconds: 10 });
    const item1 = await insertEditorialItem(ctx, seqId, { orderIndex: 1, durationSeconds: 5 });

    await captureRedirect(() =>
      actions.moveEditorialItemOrder(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), direction: "down", returnTo: "/x" }))
    );

    expect((await readEditorialItem(ctx, item0)).orderIndex).toBe(1);
    expect((await readEditorialItem(ctx, item1)).orderIndex).toBe(0);
  });

  it("refuses moving the first item further up, and writes nothing", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveOrder-firstUp ${Date.now()}` });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, durationSeconds: 10 });
    const before = await readEditorialItem(ctx, item0);

    await captureRedirect(() =>
      actions.moveEditorialItemOrder(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), direction: "up", returnTo: "/x" }))
    );

    expect(await readEditorialItem(ctx, item0)).toEqual(before);
  });

  it("refuses moving the last item further down, and writes nothing", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveOrder-lastDown ${Date.now()}` });
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, durationSeconds: 10 });
    const item1 = await insertEditorialItem(ctx, seqId, { orderIndex: 1, durationSeconds: 5 });
    const item0Before = await readEditorialItem(ctx, item0);
    const before = await readEditorialItem(ctx, item1);

    await captureRedirect(() =>
      actions.moveEditorialItemOrder(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), direction: "down", returnTo: "/x" }))
    );

    expect(await readEditorialItem(ctx, item1)).toEqual(before);
    expect(await readEditorialItem(ctx, item0)).toEqual(item0Before); // its would-be swap partner is also untouched
  });

  it("redirects on an invalid direction, and writes nothing", async () => {
    const itemId = await insertEditorialItem(ctx, sequenceId, { orderIndex: 0 });
    const before = await readEditorialItem(ctx, itemId);

    const target = await captureRedirect(() =>
      actions.moveEditorialItemOrder(form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(itemId), direction: "sideways", returnTo: "/x" }))
    );
    expect(target).toBe("/x");
    expect(await readEditorialItem(ctx, itemId)).toEqual(before);
  });

  it("redirects when the item does not belong to this sequence, and writes nothing", async () => {
    const foreignItem = await insertEditorialItem(ctx, otherSequenceId, { orderIndex: 0 });
    const before = await readEditorialItem(ctx, foreignItem);

    const target = await captureRedirect(() =>
      actions.moveEditorialItemOrder(form({ projectId: String(projectId), sequenceId: String(sequenceId), itemId: String(foreignItem), direction: "up", returnTo: "/x" }))
    );
    expect(target).toBe("/x");
    expect(await readEditorialItem(ctx, foreignItem)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// moveEditorialItem — non-ripple absolute move, bounded by immediate shot
// neighbors only (gaps are never obstacles).
// ---------------------------------------------------------------------------

describe("moveEditorialItem", () => {
  async function makeThreeShotTimeline(seqId: number) {
    const shotA = await insertShot(ctx, seqId, { title: "Shot A" });
    const shotB = await insertShot(ctx, seqId, { title: "Shot B" });
    const shotC = await insertShot(ctx, seqId, { title: "Shot C" });
    // Deliberate gaps between items (0-10, 15-25, 30-35) so there is room to
    // move item1 without touching either neighbor.
    const item0 = await insertEditorialItem(ctx, seqId, { orderIndex: 0, shotId: shotA, startSeconds: 0, durationSeconds: 10 });
    const item1 = await insertEditorialItem(ctx, seqId, { orderIndex: 1, shotId: shotB, startSeconds: 15, durationSeconds: 10 });
    const item2 = await insertEditorialItem(ctx, seqId, { orderIndex: 2, shotId: shotC, startSeconds: 30, durationSeconds: 5 });
    return { item0, item1, item2 };
  }

  it("moves within the space bounded by its immediate shot neighbors — orderIndex and every other column untouched", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-inbounds ${Date.now()}` });
    const { item0, item1, item2 } = await makeThreeShotTimeline(seqId);
    const before = await readEditorialItem(ctx, item1);

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), newStartSeconds: "12", returnTo: "/x" }))
    );

    const after = await readEditorialItem(ctx, item1);
    expect(after.startSeconds).toBe(12);
    // updatedAt excluded — see the moveEditorialItemOrder test's own note on
    // strftime's millisecond resolution.
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["startSeconds"]);
    expect((await readEditorialItem(ctx, item0)).startSeconds).toBe(0); // neighbors untouched
    expect((await readEditorialItem(ctx, item2)).startSeconds).toBe(30);
  });

  it("accepts the exact lower bound (touching the previous neighbor's end)", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-lowerBound ${Date.now()}` });
    const { item1 } = await makeThreeShotTimeline(seqId);

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), newStartSeconds: "10", returnTo: "/x" }))
    );
    expect((await readEditorialItem(ctx, item1)).startSeconds).toBe(10);
  });

  it("accepts the exact upper bound (item's own end touching the next neighbor's start)", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-upperBound ${Date.now()}` });
    const { item1 } = await makeThreeShotTimeline(seqId);

    // allowedMax = next.start(30) - duration(10) = 20
    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), newStartSeconds: "20", returnTo: "/x" }))
    );
    expect((await readEditorialItem(ctx, item1)).startSeconds).toBe(20);
  });

  it("refuses a target that would cross the previous neighbor, and writes nothing", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-crossPrev ${Date.now()}` });
    const { item1 } = await makeThreeShotTimeline(seqId);
    const before = await readEditorialItem(ctx, item1);

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), newStartSeconds: "5", returnTo: "/x" }))
    );
    expect(await readEditorialItem(ctx, item1)).toEqual(before);
  });

  it("refuses a target that would cross (or jump past) the next neighbor, and writes nothing", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-crossNext ${Date.now()}` });
    const { item1 } = await makeThreeShotTimeline(seqId);
    const before = await readEditorialItem(ctx, item1);

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), newStartSeconds: "40", returnTo: "/x" }))
    );
    expect(await readEditorialItem(ctx, item1)).toEqual(before);
  });

  it("the first item has no lower bound other than 0", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-firstNoLower ${Date.now()}` });
    const { item0 } = await makeThreeShotTimeline(seqId);

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newStartSeconds: "3", returnTo: "/x" }))
    );
    expect((await readEditorialItem(ctx, item0)).startSeconds).toBe(3);
  });

  it("the last item has no upper bound", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-lastNoUpper ${Date.now()}` });
    const { item2 } = await makeThreeShotTimeline(seqId);

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item2), newStartSeconds: "1000", returnTo: "/x" }))
    );
    expect((await readEditorialItem(ctx, item2)).startSeconds).toBe(1000);
  });

  it("a gap item positioned between two shots is never treated as an obstacle to the move", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-gapNotObstacle ${Date.now()}` });
    const { item0, item1, item2 } = await makeThreeShotTimeline(seqId);
    // A gap row sitting spatially between item0 and item1, with a startSeconds
    // value that WOULD constrain the move if gaps were considered neighbors.
    await insertEditorialItem(ctx, seqId, { orderIndex: 3, type: "gap", shotId: null, durationSeconds: 2, startSeconds: 11 });

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item1), newStartSeconds: "10", returnTo: "/x" }))
    );
    // Still governed only by item0 (shot neighbor), not blocked by the gap at 11.
    expect((await readEditorialItem(ctx, item1)).startSeconds).toBe(10);
    expect((await readEditorialItem(ctx, item0)).startSeconds).toBe(0);
    expect((await readEditorialItem(ctx, item2)).startSeconds).toBe(30);
  });

  it("refuses a gap item (only shot-backed items can move), and writes nothing", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-gapRefused ${Date.now()}` });
    const gap = await insertEditorialItem(ctx, seqId, { orderIndex: 0, type: "gap", shotId: null, durationSeconds: 3, startSeconds: 0 });
    const before = await readEditorialItem(ctx, gap);

    await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(gap), newStartSeconds: "5", returnTo: "/x" }))
    );
    expect(await readEditorialItem(ctx, gap)).toEqual(before);
  });

  it("redirects on a negative newStartSeconds, and writes nothing", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-negative ${Date.now()}` });
    const { item0 } = await makeThreeShotTimeline(seqId);
    const before = await readEditorialItem(ctx, item0);

    const target = await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newStartSeconds: "-1", returnTo: "/x" }))
    );
    expect(target).toBe("/x");
    expect(await readEditorialItem(ctx, item0)).toEqual(before);
  });

  it("falls back to the nle-prototype default returnTo when returnTo is missing", async () => {
    const seqId = await insertSequence(ctx, projectId, { title: `moveItem-defaultReturn ${Date.now()}` });
    const { item0 } = await makeThreeShotTimeline(seqId);

    const target = await captureRedirect(() =>
      actions.moveEditorialItem(form({ projectId: String(projectId), sequenceId: String(seqId), itemId: String(item0), newStartSeconds: "3" }))
    );
    expect(target).toBe(`/projects/${projectId}/sequences/${seqId}/nle-prototype`);
  });
});
