import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SEQ.SHOT_CONTINUITY — LLMW.VAR.CONTINUITY.1 (B11-c). No oracle exists for
// this variable (new, not migrated) — unit proofs of the resolver's own
// contract: order, exact projection, null preservation, empty sequence,
// non-existent sequence, bound, and isolation across both sequence and
// project (`LLMW.VAR.PROJECT_SCOPE.1`, B7c-n2, established isolation as the
// property under test for every collection variable). Same shape as
// `seqShots.test.ts` — the resolver this ticket is modelled on, one level up
// — extended with the cross-project isolation `castingVariables.test.ts`
// proves for `SEQ.SHOT_TARGETS`, since this variable also carries the two
// continuity fields and must not leak them across a project boundary either.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveSeqShotContinuity: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqShotContinuity;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveSeqShotContinuity } = await import("@/lib/llmWorkspace/variables/registry"));
});

afterAll(() => ctx.cleanup());

describe("resolveSeqShotContinuity — resolver contract", () => {
  it("returns the sequence's shots in orderIndex order, with exactly the declared fields", async () => {
    const projectId = await insertProject(ctx, "SEQ.SHOT_CONTINUITY project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
    await insertShot(ctx, sequenceId, {
      title: "Third",
      orderIndex: 2,
      shotCode: "SH030",
      continuityIn: "In3",
      continuityOut: "Out3",
    });
    await insertShot(ctx, sequenceId, {
      title: "First",
      orderIndex: 0,
      shotCode: "SH010",
      continuityIn: "In1",
      continuityOut: "Out1",
    });
    await insertShot(ctx, sequenceId, {
      title: "Second",
      orderIndex: 1,
      shotCode: "SH020",
      continuityIn: "In2",
      continuityOut: "Out2",
    });

    const result = await resolveSeqShotContinuity(sequenceId);
    expect(result.map((s) => s.shotCode)).toEqual(["SH010", "SH020", "SH030"]);
    expect(result.map((s) => s.orderIndex)).toEqual([0, 1, 2]);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["shotCode", "orderIndex", "continuityIn", "continuityOut"].sort()
    );
    expect(result[0]).toEqual({ shotCode: "SH010", orderIndex: 0, continuityIn: "In1", continuityOut: "Out1" });
  });

  it("preserves null continuity fields as null, never coerced to an empty string", async () => {
    const projectId = await insertProject(ctx, "Null continuity project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
    await insertShot(ctx, sequenceId, { title: "Only", orderIndex: 0, shotCode: "SH010" });

    const result = await resolveSeqShotContinuity(sequenceId);
    expect(result).toEqual([{ shotCode: "SH010", orderIndex: 0, continuityIn: null, continuityOut: null }]);
  });

  it("returns an empty array for a sequence with no shots", async () => {
    const projectId = await insertProject(ctx, "Empty seq project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Empty" });
    const result = await resolveSeqShotContinuity(sequenceId);
    expect(result).toEqual([]);
  });

  it("throws for a non-existent sequence, matching every other resolver's contract", async () => {
    await expect(resolveSeqShotContinuity(999999)).rejects.toThrow(
      /resolveSeqShotContinuity: sequence 999999 not found\./
    );
  });

  it("is bounded to 20 shots, ordered, so a large sequence does not produce an unbounded prompt", async () => {
    const projectId = await insertProject(ctx, "Bounded project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Big" });
    for (let i = 0; i < 25; i++) {
      await insertShot(ctx, sequenceId, { title: `Shot ${i}`, orderIndex: i, shotCode: `SH${i}` });
    }
    const result = await resolveSeqShotContinuity(sequenceId);
    expect(result.length).toBe(20);
    expect(result[0].shotCode).toBe("SH0");
    expect(result[19].shotCode).toBe("SH19");
  });

  it("isolation: nothing from a second sequence, in the same project, leaks into the first sequence's result", async () => {
    const projectId = await insertProject(ctx, "Iso A — same project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq A" });
    await insertShot(ctx, sequenceId, { title: "A-only", orderIndex: 0, shotCode: "A-only", continuityIn: "A in" });

    const otherSequenceId = await insertSequence(ctx, projectId, { title: "Seq B" });
    await insertShot(ctx, otherSequenceId, {
      title: "B-only-1",
      orderIndex: 0,
      shotCode: "B-only-1",
      continuityIn: "B in",
    });
    await insertShot(ctx, otherSequenceId, { title: "B-only-2", orderIndex: 1, shotCode: "B-only-2" });

    const result = await resolveSeqShotContinuity(sequenceId);
    expect(result.map((s) => s.shotCode)).toEqual(["A-only"]);
    expect(result.some((s) => s.shotCode?.startsWith("B-only"))).toBe(false);
  });

  it("isolation: nothing from a second project's sequence leaks into the first project's result", async () => {
    const projectId = await insertProject(ctx, "Iso A — cross project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq A" });
    await insertShot(ctx, sequenceId, { title: "A-only", orderIndex: 0, shotCode: "A-only", continuityOut: "A out" });

    const otherProjectId = await insertProject(ctx, "Iso B — cross project");
    const otherSequenceId = await insertSequence(ctx, otherProjectId, { title: "Seq C" });
    await insertShot(ctx, otherSequenceId, {
      title: "C-only",
      orderIndex: 0,
      shotCode: "C-only",
      continuityOut: "C out",
    });

    const result = await resolveSeqShotContinuity(sequenceId);
    expect(result.map((s) => s.shotCode)).toEqual(["A-only"]);
    expect(result.some((s) => s.shotCode?.startsWith("C-only"))).toBe(false);
  });
});
