import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// PROJECT.SEQUENCES / PROJECT.SHOTS / PROJECT.ASSETS —
// LLMW.VAR.PROJECT_SCOPE.1 (B7c-n2). No oracle exists for these three
// variables (new, not migrated) — unit proofs of each resolver's own
// contract: content + order, exact projection, project isolation, empty
// case. `PROJECT.SHOTS` additionally proves it traverses every Sequence of
// the Project, not just one.
//
// Isolation (§ of the ticket, "the most important property of the three") is
// proven with a second, fully populated project whose rows must never appear
// in the first project's result — see the "leaks nothing" tests below, plus
// the mutation control recorded in `.agents/executor_report.md`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveProjectSequences: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectSequences;
let resolveProjectShots: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectShots;
let resolveProjectAssets: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectAssets;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveProjectSequences, resolveProjectShots, resolveProjectAssets } = await import(
    "@/lib/llmWorkspace/variables/registry"
  ));
});

afterAll(() => ctx.cleanup());

describe("resolveProjectSequences — resolver contract", () => {
  it("returns the project's sequences in orderIndex order, with exactly the declared fields", async () => {
    const projectId = await insertProject(ctx, "PROJECT.SEQUENCES project");
    await insertSequence(ctx, projectId, {
      title: "Third",
      orderIndex: 2,
      summary: "S3",
      description: "D3",
      narrativePurpose: "P3",
      mood: "M3",
      locationHint: "L3",
    });
    await insertSequence(ctx, projectId, {
      title: "First",
      orderIndex: 0,
      summary: "S1",
      description: "D1",
      narrativePurpose: "P1",
      mood: "M1",
      locationHint: "L1",
    });
    await insertSequence(ctx, projectId, {
      title: "Second",
      orderIndex: 1,
      summary: "S2",
      description: "D2",
      narrativePurpose: "P2",
      mood: "M2",
      locationHint: "L2",
    });

    const result = await resolveProjectSequences(projectId);
    expect(result.map((s) => s.title)).toEqual(["First", "Second", "Third"]);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["title", "summary", "description", "narrativePurpose", "mood", "locationHint"].sort()
    );
  });

  it("returns an empty array for a project with no sequences", async () => {
    const projectId = await insertProject(ctx, "No sequences project");
    const result = await resolveProjectSequences(projectId);
    expect(result).toEqual([]);
  });

  it("isolation: nothing from a second, populated project leaks into the first project's result", async () => {
    const projectId = await insertProject(ctx, "Iso A — sequences");
    await insertSequence(ctx, projectId, { title: "A-only", orderIndex: 0 });

    const otherProjectId = await insertProject(ctx, "Iso B — sequences");
    await insertSequence(ctx, otherProjectId, { title: "B-only-1", orderIndex: 0 });
    await insertSequence(ctx, otherProjectId, { title: "B-only-2", orderIndex: 1 });

    const result = await resolveProjectSequences(projectId);
    expect(result.map((s) => s.title)).toEqual(["A-only"]);
    expect(result.some((s) => s.title.startsWith("B-only"))).toBe(false);
  });
});

describe("resolveProjectShots — resolver contract", () => {
  it("returns the project's shots in orderIndex order, with exactly the declared fields", async () => {
    const projectId = await insertProject(ctx, "PROJECT.SHOTS project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
    await insertShot(ctx, sequenceId, {
      title: "Third",
      orderIndex: 2,
      description: "D3",
      actionPitch: "A3",
      continuityIn: "In3",
      continuityOut: "Out3",
    });
    await insertShot(ctx, sequenceId, {
      title: "First",
      orderIndex: 0,
      description: "D1",
      actionPitch: "A1",
      continuityIn: "In1",
      continuityOut: "Out1",
    });
    await insertShot(ctx, sequenceId, {
      title: "Second",
      orderIndex: 1,
      description: "D2",
      actionPitch: "A2",
      continuityIn: "In2",
      continuityOut: "Out2",
    });

    const result = await resolveProjectShots(projectId);
    expect(result.map((s) => s.title)).toEqual(["First", "Second", "Third"]);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["title", "description", "actionPitch", "continuityIn", "continuityOut"].sort()
    );
  });

  it("traverses every sequence of the project, ordered, not just one", async () => {
    const projectId = await insertProject(ctx, "Multi-sequence project");
    const seqA = await insertSequence(ctx, projectId, { title: "Seq A", orderIndex: 0 });
    const seqB = await insertSequence(ctx, projectId, { title: "Seq B", orderIndex: 1 });
    await insertShot(ctx, seqB, { title: "B-Second", orderIndex: 3 });
    await insertShot(ctx, seqA, { title: "A-First", orderIndex: 0 });
    await insertShot(ctx, seqB, { title: "B-First", orderIndex: 2 });
    await insertShot(ctx, seqA, { title: "A-Second", orderIndex: 1 });

    const result = await resolveProjectShots(projectId);
    expect(result.map((s) => s.title)).toEqual(["A-First", "A-Second", "B-First", "B-Second"]);
  });

  it("returns an empty array for a project with no shots (no sequences, and a sequence with no shots)", async () => {
    const emptyProjectId = await insertProject(ctx, "No sequences at all");
    expect(await resolveProjectShots(emptyProjectId)).toEqual([]);

    const noShotsProjectId = await insertProject(ctx, "Sequence with no shots");
    await insertSequence(ctx, noShotsProjectId, { title: "Empty seq" });
    expect(await resolveProjectShots(noShotsProjectId)).toEqual([]);
  });

  it("isolation: nothing from a second, populated project leaks into the first project's result", async () => {
    const projectId = await insertProject(ctx, "Iso A — shots");
    const seqA = await insertSequence(ctx, projectId, { title: "Seq A" });
    await insertShot(ctx, seqA, { title: "A-only", orderIndex: 0 });

    const otherProjectId = await insertProject(ctx, "Iso B — shots");
    const seqB1 = await insertSequence(ctx, otherProjectId, { title: "Seq B1" });
    const seqB2 = await insertSequence(ctx, otherProjectId, { title: "Seq B2" });
    await insertShot(ctx, seqB1, { title: "B-only-1", orderIndex: 0 });
    await insertShot(ctx, seqB2, { title: "B-only-2", orderIndex: 0 });

    const result = await resolveProjectShots(projectId);
    expect(result.map((s) => s.title)).toEqual(["A-only"]);
    expect(result.some((s) => s.title.startsWith("B-only"))).toBe(false);
  });
});

describe("resolveProjectAssets — resolver contract", () => {
  // Insertion order, not `orderIndex` order — supervisor correction during the
  // B7c-n2 review. `assetExtraction.ts:124-127` issues its query with no
  // `ORDER BY`, so the order this variable must reproduce is the scan order,
  // which `id` aliases. `orderIndex` is deliberately set **against** insertion
  // order below, so a resolver that sorted by it would fail this test.
  it("returns the project's assets in insertion (id) order, with exactly the declared fields", async () => {
    const projectId = await insertProject(ctx, "PROJECT.ASSETS project");
    await insertAsset(ctx, projectId, { name: "Third", orderIndex: 2, type: "prop" });
    await insertAsset(ctx, projectId, { name: "First", orderIndex: 0, type: "character" });
    await insertAsset(ctx, projectId, { name: "Second", orderIndex: 1, type: "environment" });

    const result = await resolveProjectAssets(projectId);
    expect(result.map((a) => a.name)).toEqual(["Third", "First", "Second"]);
    expect(Object.keys(result[0]).sort()).toEqual(["name", "type"].sort());
  });

  it("returns an empty array for a project with no assets", async () => {
    const projectId = await insertProject(ctx, "No assets project");
    const result = await resolveProjectAssets(projectId);
    expect(result).toEqual([]);
  });

  it("isolation: nothing from a second, populated project leaks into the first project's result", async () => {
    const projectId = await insertProject(ctx, "Iso A — assets");
    await insertAsset(ctx, projectId, { name: "A-only", orderIndex: 0, type: "character" });

    const otherProjectId = await insertProject(ctx, "Iso B — assets");
    await insertAsset(ctx, otherProjectId, { name: "B-only-1", orderIndex: 0, type: "prop" });
    await insertAsset(ctx, otherProjectId, { name: "B-only-2", orderIndex: 1, type: "vehicle" });

    const result = await resolveProjectAssets(projectId);
    expect(result.map((a) => a.name)).toEqual(["A-only"]);
    expect(result.some((a) => a.name.startsWith("B-only"))).toBe(false);
  });
});
