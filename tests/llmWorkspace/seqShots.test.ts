import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SEQ.SHOTS — LLMW.UC2.RETAKE.1 (B9b), §5 of the ticket. No oracle exists for
// this variable (it is new, not migrated) — these are unit proofs of the
// resolver's own contract (order, empty sequence, non-existent sequence) and
// of `renderSeqShotsOtherShotsLines`'s exclusion/bound behaviour, not an
// equality test against anything (§3 of the ticket).
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveSeqShots: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqShots;
let renderSeqShotsOtherShotsLines: typeof import("@/lib/llmWorkspace/variables/registry").renderSeqShotsOtherShotsLines;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveSeqShots, renderSeqShotsOtherShotsLines } = await import("@/lib/llmWorkspace/variables/registry"));
});

afterAll(() => ctx.cleanup());

describe("resolveSeqShots — resolver contract", () => {
  it("returns the sequence's shots in orderIndex order", async () => {
    const projectId = await insertProject(ctx, "SEQ.SHOTS project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
    const third = await insertShot(ctx, sequenceId, { title: "Third", orderIndex: 2 });
    const first = await insertShot(ctx, sequenceId, { title: "First", orderIndex: 0 });
    const second = await insertShot(ctx, sequenceId, { title: "Second", orderIndex: 1 });

    const result = await resolveSeqShots(sequenceId);
    expect(result.map((s) => s.title)).toEqual(["First", "Second", "Third"]);
    // Fields actually declared: shotCode, orderIndex, title, description, actionPitch.
    expect(Object.keys(result[0]).sort()).toEqual(
      ["shotCode", "orderIndex", "title", "description", "actionPitch"].sort()
    );
    void third;
    void first;
    void second;
  });

  it("returns an empty array for a sequence with no shots", async () => {
    const projectId = await insertProject(ctx, "Empty seq project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Empty" });
    const result = await resolveSeqShots(sequenceId);
    expect(result).toEqual([]);
  });

  it("throws for a non-existent sequence, matching every other resolver's contract", async () => {
    await expect(resolveSeqShots(999999)).rejects.toThrow(/not found/);
  });

  it("is bounded to 20 shots, ordered, so a large sequence does not produce an unbounded prompt", async () => {
    const projectId = await insertProject(ctx, "Bounded project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Big" });
    for (let i = 0; i < 25; i++) {
      await insertShot(ctx, sequenceId, { title: `Shot ${i}`, orderIndex: i });
    }
    const result = await resolveSeqShots(sequenceId);
    expect(result.length).toBe(20);
    expect(result[0].title).toBe("Shot 0");
    expect(result[19].title).toBe("Shot 19");
  });
});

describe("renderSeqShotsOtherShotsLines — current-shot exclusion", () => {
  const shotCoreOf = (overrides: Partial<Parameters<typeof renderSeqShotsOtherShotsLines>[1]>) => ({
    title: "Untitled",
    shotCode: null,
    description: null,
    actionPitch: null,
    cameraPitch: null,
    framing: null,
    cameraMovement: null,
    durationSeconds: null,
    ...overrides,
  });

  it("excludes the current shot by matching shotCode", () => {
    const shots = [
      { shotCode: "SH01", orderIndex: 0, title: "A", description: "Desc A", actionPitch: "Act A" },
      { shotCode: "SH02", orderIndex: 1, title: "B", description: null, actionPitch: null },
    ];
    const current = shotCoreOf({ shotCode: "SH01", title: "A" });
    const rendered = renderSeqShotsOtherShotsLines(shots, current);
    expect(rendered).not.toMatch(/SH01/);
    expect(rendered).toMatch(/SH02/);
    expect(rendered).toContain("Other shots in this sequence:");
  });

  it("falls back to title matching when shotCode is null on both sides", () => {
    const shots = [
      { shotCode: null, orderIndex: 0, title: "Current one", description: null, actionPitch: null },
      { shotCode: null, orderIndex: 1, title: "Sibling", description: null, actionPitch: null },
    ];
    const current = shotCoreOf({ shotCode: null, title: "Current one" });
    const rendered = renderSeqShotsOtherShotsLines(shots, current);
    expect(rendered).not.toMatch(/Current one/);
    expect(rendered).toMatch(/Sibling/);
  });

  it("renders empty when the only shot in the list is the current one", () => {
    const shots = [{ shotCode: "SH01", orderIndex: 0, title: "A", description: null, actionPitch: null }];
    const current = shotCoreOf({ shotCode: "SH01", title: "A" });
    expect(renderSeqShotsOtherShotsLines(shots, current)).toBe("");
  });

  it("renders empty for an empty list", () => {
    expect(renderSeqShotsOtherShotsLines([], shotCoreOf({}))).toBe("");
  });

  it("includes description and action pitch fragments for sibling shots", () => {
    const shots = [
      { shotCode: "SH02", orderIndex: 1, title: "B", description: "A quiet moment.", actionPitch: "She waits." },
    ];
    const current = shotCoreOf({ shotCode: "SH01", title: "A" });
    const rendered = renderSeqShotsOtherShotsLines(shots, current);
    expect(rendered).toContain("A quiet moment.");
    expect(rendered).toContain("action: She waits.");
  });
});
