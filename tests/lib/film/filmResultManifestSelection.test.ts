import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// FILM.EXPORT.SELECT.CORE.1 — buildFilmResultManifest's `sequenceIds`
// selection option.
//
// The most important property under test is case 1: an absent selection
// must produce a manifest identical to what buildFilmResultManifest produced
// before this ticket — same sequences, same order, same `included`, same
// warnings. Every other case exercises the selection's three rules: it
// restricts (never forces `included: true`), it reorders `sequences[]` to
// the selection's own order, and a deselected sequence is a choice (no
// warning, no missingReason) rather than a gap.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let buildFilmResultManifest: typeof import("@/lib/film/filmResultManifest").buildFilmResultManifest;
let computeFilmResultTotalDuration: typeof import("@/lib/film/filmResultManifest").computeFilmResultTotalDuration;
let FilmResultManifestError: typeof import("@/lib/film/filmResultManifest").FilmResultManifestError;
let parseFilmResultManifest: typeof import("@/types/filmResult").parseFilmResultManifest;
let serializeFilmResultManifest: typeof import("@/types/filmResult").serializeFilmResultManifest;
let FILM_RESULT_MANIFEST_SCHEMA_VERSION: typeof import("@/types/filmResult").FILM_RESULT_MANIFEST_SCHEMA_VERSION;

async function insertActiveSequenceResult(sequenceId: number, projectId: number, durationSeconds: number) {
  const [row] = await ctx.db
    .insert(ctx.schema.sequenceResults)
    .values({
      projectId,
      sequenceId,
      sourceMode: "basic",
      status: "active",
      videoPath: `uploads/sequence-results/seq-${sequenceId}.mp4`,
      durationSeconds,
    })
    .returning({ id: ctx.schema.sequenceResults.id });
  return row.id;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ buildFilmResultManifest, computeFilmResultTotalDuration, FilmResultManifestError } = await import(
    "@/lib/film/filmResultManifest"
  ));
  ({ parseFilmResultManifest, serializeFilmResultManifest, FILM_RESULT_MANIFEST_SCHEMA_VERSION } = await import(
    "@/types/filmResult"
  ));
});

afterAll(() => {
  ctx.cleanup();
});

describe("buildFilmResultManifest — selection (FILM.EXPORT.SELECT.CORE.1)", () => {
  it("1. no selection -> manifest identical to today's behavior: same sequences, order, included, warnings", async () => {
    const projectId = await insertProject(ctx, "No-selection project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    const b = await insertSequence(ctx, projectId, { title: "B" });
    const c = await insertSequence(ctx, projectId, { title: "C" });
    await insertActiveSequenceResult(a, projectId, 10);
    // b, c have no Sequence Result at all.

    const withoutOption = await buildFilmResultManifest(projectId);
    const withUndefinedSequenceIds = await buildFilmResultManifest(projectId, { sequenceIds: undefined });

    for (const manifest of [withoutOption, withUndefinedSequenceIds]) {
      expect(manifest.sequences.map((s) => s.sequenceId)).toEqual([a, b, c]);
      expect(manifest.sequences.map((s) => s.orderIndex)).toEqual([0, 1, 2]);
      expect(manifest.sequences.map((s) => s.included)).toEqual([true, false, false]);
      expect(manifest.sequences.every((s) => s.deselected === undefined)).toBe(true);
      expect(manifest.warnings).toHaveLength(2);
      expect(manifest.warnings[0]).toContain("B");
      expect(manifest.warnings[1]).toContain("C");
    }
  });

  it("2. selecting two of three -> only those are included, the third is marked deselected", async () => {
    const projectId = await insertProject(ctx, "Two-of-three project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    const b = await insertSequence(ctx, projectId, { title: "B" });
    const c = await insertSequence(ctx, projectId, { title: "C" });
    await insertActiveSequenceResult(a, projectId, 5);
    await insertActiveSequenceResult(b, projectId, 5);
    await insertActiveSequenceResult(c, projectId, 5);

    const manifest = await buildFilmResultManifest(projectId, { sequenceIds: [a, b] });

    const byId = new Map(manifest.sequences.map((s) => [s.sequenceId, s]));
    expect(byId.get(a)!.included).toBe(true);
    expect(byId.get(b)!.included).toBe(true);
    expect(byId.get(c)!.included).toBe(false);
    expect(byId.get(c)!.deselected).toBe(true);
  });

  it("3. selection order is the array order — [C, A] places C before A, so the render would concatenate C then A", async () => {
    const projectId = await insertProject(ctx, "Reorder project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    const b = await insertSequence(ctx, projectId, { title: "B" });
    const c = await insertSequence(ctx, projectId, { title: "C" });
    await insertActiveSequenceResult(a, projectId, 5);
    await insertActiveSequenceResult(c, projectId, 5);

    const manifest = await buildFilmResultManifest(projectId, { sequenceIds: [c, a] });

    const includedIds = manifest.sequences.filter((s) => s.included).map((s) => s.sequenceId);
    expect(includedIds).toEqual([c, a]);
    // orderIndex still reflects the project position, not the film position.
    const byId = new Map(manifest.sequences.map((s) => [s.sequenceId, s]));
    expect(byId.get(a)!.orderIndex).toBe(0);
    expect(byId.get(c)!.orderIndex).toBe(2);
    void b;
  });

  it("4. a deselected sequence produces no warning", async () => {
    const projectId = await insertProject(ctx, "No-warning-on-deselect project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    const b = await insertSequence(ctx, projectId, { title: "B" });
    await insertActiveSequenceResult(a, projectId, 5);
    await insertActiveSequenceResult(b, projectId, 5);

    const manifest = await buildFilmResultManifest(projectId, { sequenceIds: [a] });

    expect(manifest.warnings).toHaveLength(0);
    const bEntry = manifest.sequences.find((s) => s.sequenceId === b)!;
    expect(bEntry.deselected).toBe(true);
    expect(bEntry.missingReason).toBeUndefined();
  });

  it("5. a selected sequence with no active Sequence Result stays excluded, keeps its missingReason and its warning", async () => {
    const projectId = await insertProject(ctx, "Selected-but-missing project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    const b = await insertSequence(ctx, projectId, { title: "B (no result)" });
    await insertActiveSequenceResult(a, projectId, 5);
    // b has no Sequence Result at all, but IS selected.

    const manifest = await buildFilmResultManifest(projectId, { sequenceIds: [a, b] });

    const bEntry = manifest.sequences.find((s) => s.sequenceId === b)!;
    expect(bEntry.included).toBe(false);
    expect(bEntry.missingReason).toBe("No Sequence Result has been published for this sequence.");
    expect(bEntry.deselected).toBeUndefined();
    expect(manifest.warnings).toHaveLength(1);
    expect(manifest.warnings[0]).toContain("B (no result)");
  });

  it("6. a sequence id foreign to the project raises FilmResultManifestError", async () => {
    const projectId = await insertProject(ctx, "Foreign-id project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    const otherProjectId = await insertProject(ctx, "Other project");
    const foreign = await insertSequence(ctx, otherProjectId, { title: "Foreign" });

    await expect(buildFilmResultManifest(projectId, { sequenceIds: [a, foreign] })).rejects.toThrow(
      FilmResultManifestError
    );
  });

  it("7. an empty selection is accepted, nothing is included, total duration is 0", async () => {
    const projectId = await insertProject(ctx, "Empty-selection project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    await insertActiveSequenceResult(a, projectId, 42);

    const manifest = await buildFilmResultManifest(projectId, { sequenceIds: [] });

    expect(manifest.sequences.every((s) => !s.included)).toBe(true);
    expect(manifest.warnings).toHaveLength(0);
    expect(computeFilmResultTotalDuration(manifest)).toBe(0);
  });

  it("8. computeFilmResultTotalDuration only sums the included sequences after selection", async () => {
    const projectId = await insertProject(ctx, "Duration-after-selection project");
    const a = await insertSequence(ctx, projectId, { title: "A" });
    const b = await insertSequence(ctx, projectId, { title: "B" });
    await insertActiveSequenceResult(a, projectId, 10);
    await insertActiveSequenceResult(b, projectId, 20);

    const manifest = await buildFilmResultManifest(projectId, { sequenceIds: [a] });

    expect(computeFilmResultTotalDuration(manifest)).toBe(10);
  });

  it("9. a manifest without the new field still parses (backward compatibility)", () => {
    const legacyManifest = {
      schemaVersion: FILM_RESULT_MANIFEST_SCHEMA_VERSION,
      projectId: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      sourceMode: "active-sequence-results",
      sequences: [
        {
          sequenceId: 1,
          sequenceTitle: "Legacy",
          orderIndex: 0,
          sequenceResultId: 1,
          sequenceResultStatus: "active",
          sequenceResultSourceMode: "basic",
          videoPath: "uploads/legacy.mp4",
          durationSeconds: 5,
          included: true,
          // no `deselected` field — this is what every already-stored row looks like.
        },
      ],
      warnings: [],
    };

    const raw = JSON.stringify(legacyManifest);
    const parsed = parseFilmResultManifest(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.sequences[0].sequenceId).toBe(1);
    expect(parsed!.sequences[0].deselected).toBeUndefined();

    // Round-trips through the real serializer too.
    const reserialized = serializeFilmResultManifest(parsed!);
    expect(parseFilmResultManifest(reserialized)).not.toBeNull();
  });
});
