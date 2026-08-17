import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";

// `createGeneratedShots` and `createGeneratedSequences` call
// `revalidatePath("/", "layout")` on their success path
// (src/actions/llm/sequenceShots.ts:211, src/actions/llm/sequenceGeneration.ts:231).
// Outside a real Next.js request (this test's plain Node/vitest process),
// `revalidatePath` throws ("Invariant: static generation store missing") —
// no action tested by this file before LLMW.ACTION.INSERT.1 (B7c-w) called
// it. Mocked to a no-op so the insert side effects can be proven; this does
// not touch or hide any of the three actions' own written behaviour.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  insertAsset,
  insertProject,
  insertSequence,
  insertShot,
  readAsset,
  readProject,
  readSequence,
  readShot,
} from "./helpers/fixtures";
import { ACTION_REGISTRY } from "@/lib/llmWorkspace/actions/registry";
import { buildShotJsonPayload } from "@/lib/llmWorkspace/benchRun";
import { shotInsertDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotInsertDirected";

/**
 * Correspondence proof for `src/lib/llmWorkspace/actions/registry.ts`
 * (LLMW.ACTION.REGISTRY.1a / B4a).
 *
 * Two separate obligations, per the ticket:
 *
 * 1. Column correspondence — for every entry, a real write against a seeded
 *    disposable database, full-row diff before/after, and the changed
 *    columns (`updatedAt` excepted) must equal exactly
 *    `ACTION_REGISTRY[id].columns.written`. This is a *declaration*
 *    exercise, not a re-run of every edge case already covered by the
 *    dedicated file under `tests/actions/` — one representative call per
 *    action (or per reachable column, where the action targets more than
 *    one depending on an argument) is enough to prove the columns line up.
 *
 * 2. Particularity correspondence — every particularity a registry entry's
 *    `notes` declares is either behaviourally proven here, or, where that
 *    would duplicate a proof `tests/actions/<action>.test.ts` already
 *    performs, referenced instead (this file does not re-run those). The
 *    ownership/transaction particularity is a structural fact about the
 *    source rather than an observable behaviour under a single-connection,
 *    single-process `better-sqlite3` handle — proven below by reading the
 *    action's own source text, once per action, rather than by attempting a
 *    race that a synchronous embedded driver cannot exhibit.
 */

let ctx: TempDb;
let assetsActions: typeof import("@/actions/assets");
let shotsActions: typeof import("@/actions/shots");
let sequencesActions: typeof import("@/actions/sequences");
let storyActions: typeof import("@/actions/llm/story");
let outlineActions: typeof import("@/actions/llm/outlineGeneration");
let sequenceShotsActions: typeof import("@/actions/llm/sequenceShots");
let assetExtractionActions: typeof import("@/actions/llm/assetExtraction");
let sequenceGenerationActions: typeof import("@/actions/llm/sequenceGeneration");
let castingSuggestionsActions: typeof import("@/actions/llm/castingSuggestions");
let shotInsertionActions: typeof import("@/actions/llm/shotInsertion");
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  assetsActions = await import("@/actions/assets");
  shotsActions = await import("@/actions/shots");
  sequencesActions = await import("@/actions/sequences");
  storyActions = await import("@/actions/llm/story");
  outlineActions = await import("@/actions/llm/outlineGeneration");
  sequenceShotsActions = await import("@/actions/llm/sequenceShots");
  assetExtractionActions = await import("@/actions/llm/assetExtraction");
  sequenceGenerationActions = await import("@/actions/llm/sequenceGeneration");
  castingSuggestionsActions = await import("@/actions/llm/castingSuggestions");
  shotInsertionActions = await import("@/actions/llm/shotInsertion");
  projectId = await insertProject(ctx, "Registry project");
});

afterAll(() => ctx.cleanup());

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2];
    }
    throw err;
  }
  throw new Error("Expected the action to redirect, but it returned normally.");
}

describe("action registry — declared columns match the columns actually written", () => {
  it("updateAssetDetailsInline", async () => {
    const assetId = await insertAsset(ctx, projectId);
    const before = await readAsset(ctx, assetId);

    await assetsActions.updateAssetDetailsInline({
      assetId,
      projectId,
      description: "d",
      notes: "n",
      visualIdentity: "v",
      usageRules: "u",
      forbiddenVariations: "f",
    });

    const after = await readAsset(ctx, assetId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt").sort()).toEqual(
      [...ACTION_REGISTRY.updateAssetDetailsInline.columns.written].sort()
    );
  });

  it("updateAssetDescriptionFieldInline — description branch", async () => {
    const assetId = await insertAsset(ctx, projectId);
    const before = await readAsset(ctx, assetId);

    await assetsActions.updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "replace",
      content: "d",
    });

    const after = await readAsset(ctx, assetId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "description",
    ]);
    // Both columns declared are individually reachable, not both written by
    // one call — the "notes" branch is exercised separately below.
    expect(ACTION_REGISTRY.updateAssetDescriptionFieldInline.columns.written).toContain(
      "description"
    );
  });

  it("updateAssetDescriptionFieldInline — notes branch", async () => {
    const assetId = await insertAsset(ctx, projectId);
    const before = await readAsset(ctx, assetId);

    await assetsActions.updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "notes",
      mode: "replace",
      content: "n",
    });

    const after = await readAsset(ctx, assetId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["notes"]);
    expect(ACTION_REGISTRY.updateAssetDescriptionFieldInline.columns.written).toContain("notes");
  });

  it("applyBatchAssetDescriptionDraftsInline — both columns reachable in one item", async () => {
    const assetId = await insertAsset(ctx, projectId);
    const before = await readAsset(ctx, assetId);

    await assetsActions.applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: [{ assetId, descriptionDraft: "d", notesDraft: "n" }],
    });

    const after = await readAsset(ctx, assetId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt").sort()).toEqual(
      [...ACTION_REGISTRY.applyBatchAssetDescriptionDraftsInline.columns.written].sort()
    );
  });

  it("updateShotPrompt", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const before = await readShot(ctx, shotId);

    await captureRedirect(() =>
      shotsActions.updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          shotPrompt: "p",
        })
      )
    );

    const after = await readShot(ctx, shotId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(
      ACTION_REGISTRY.updateShotPrompt.columns.written
    );
  });

  it("updateSequencePrompt", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const before = await readSequence(ctx, sequenceId);

    await captureRedirect(() =>
      sequencesActions.updateSequencePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          sequencePrompt: "p",
        })
      )
    );

    const after = await readSequence(ctx, sequenceId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(
      ACTION_REGISTRY.updateSequencePrompt.columns.written
    );
  });

  it("applyGeneratedStory", async () => {
    const before = await readProject(ctx, projectId);

    await storyActions.applyGeneratedStory(projectId, "a story");

    const after = await readProject(ctx, projectId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(
      ACTION_REGISTRY.applyGeneratedStory.columns.written
    );
  });

  it("applyGeneratedOutline", async () => {
    const before = await readProject(ctx, projectId);

    await outlineActions.applyGeneratedOutline(projectId, "an outline");

    const after = await readProject(ctx, projectId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(
      ACTION_REGISTRY.applyGeneratedOutline.columns.written
    );
  });

  it("updateShotNarrativeContext", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const before = await readShot(ctx, shotId);

    await shotsActions.updateShotNarrativeContext(shotId, sequenceId, projectId, {
      description: "d",
      actionPitch: "a",
      cameraPitch: "c",
    });

    const after = await readShot(ctx, shotId);
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt").sort()).toEqual(
      [...ACTION_REGISTRY.updateShotNarrativeContext.columns.written].sort()
    );
  });
});

describe("action registry — particularities referenced instead of duplicated", () => {
  // Behaviours 1, 2, 3, 5, 6 are each already proven end-to-end by a
  // dedicated file under tests/actions/, cited in the corresponding
  // registry entry's `notes`. Re-running them here would duplicate that
  // proof rather than add to it, per this ticket's own instruction. This
  // suite only asserts that the entries which declare them still point at a
  // real, existing test.
  const referencedTestFiles = [
    "updateAssetDetailsInline.test.ts",
    "updateAssetDescriptionFieldInline.test.ts",
    "applyBatchAssetDescriptionDraftsInline.test.ts",
    "updateShotPrompt.test.ts",
    "updateSequencePrompt.test.ts",
    "applyGeneratedStory.test.ts",
    "applyGeneratedOutline.test.ts",
  ];

  it.each(referencedTestFiles)("%s exists under tests/actions/", (fileName) => {
    const filePath = path.join(__dirname, fileName);
    expect(() => readFileSync(filePath, "utf8")).not.toThrow();
  });
});

describe("action registry — behaviour 4, ownership check and mutation are not transactional", () => {
  // Structural proof, not a race: better-sqlite3 is a synchronous, single
  // connection driver, so two calls in the same test process cannot be
  // forced to interleave the way two real concurrent requests could — B0
  // recorded the identical limitation. What is provable, and what the
  // registry actually claims, is the *shape* of the source: the ownership
  // check and the mutation are separate statements, and the function body
  // never opens a `db.transaction`. That is asserted directly against the
  // real source files below, once per action the registry declares
  // `transactional: false` for.

  /**
   * Extracts a top-level function's body text via the real TypeScript
   * parser rather than brace-matching by hand: several of these signatures
   * return a union type that itself contains braces (e.g.
   * `applyBatchAssetDescriptionDraftsInline`'s `Promise<{ ok: true; ... } |
   * { ok: false; ... }>`), which a naive first-"{"-after-the-return-type
   * search matches against the wrong pair.
   */
  function readFunctionBody(filePath: string, exportName: string): string {
    const absPath = path.join(process.cwd(), filePath);
    const src = readFileSync(absPath, "utf8");
    const sourceFile = ts.createSourceFile(absPath, src, ts.ScriptTarget.Latest, true);

    let found: string | undefined;
    sourceFile.forEachChild((node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === exportName &&
        node.body
      ) {
        found = node.body.getFullText(sourceFile);
      }
    });

    if (found === undefined) {
      throw new Error(`Could not find function declaration "${exportName}" in ${filePath}`);
    }
    return found;
  }

  const cases: Array<{ id: keyof typeof ACTION_REGISTRY; file: string; export: string }> = [
    { id: "updateAssetDetailsInline", file: "src/actions/assets.ts", export: "updateAssetDetailsInline" },
    {
      id: "updateAssetDescriptionFieldInline",
      file: "src/actions/assets.ts",
      export: "updateAssetDescriptionFieldInline",
    },
    {
      id: "applyBatchAssetDescriptionDraftsInline",
      file: "src/actions/assets.ts",
      export: "applyBatchAssetDescriptionDraftsInline",
    },
    { id: "updateShotPrompt", file: "src/actions/shots.ts", export: "updateShotPrompt" },
    { id: "updateSequencePrompt", file: "src/actions/sequences.ts", export: "updateSequencePrompt" },
    {
      id: "updateShotNarrativeContext",
      file: "src/actions/shots.ts",
      export: "updateShotNarrativeContext",
    },
  ];

  it.each(cases)("$id: no db.transaction, at least one SELECT and one UPDATE", (testCase) => {
    const entry = ACTION_REGISTRY[testCase.id];
    if (!("transactional" in entry.ownership) || entry.ownership.transactional !== false) {
      throw new Error(`${testCase.id} does not declare transactional: false`);
    }

    const body = readFunctionBody(testCase.file, testCase.export);
    expect(body).not.toContain("db.transaction");
    expect(body).toMatch(/db\s*\.\s*select/);
    expect(body).toMatch(/db\s*\.\s*update/);
  });

  it.each([
    { id: "applyGeneratedStory" as const, file: "src/actions/llm/story.ts", export: "applyGeneratedStory" },
    {
      id: "applyGeneratedOutline" as const,
      file: "src/actions/llm/outlineGeneration.ts",
      export: "applyGeneratedOutline",
    },
  ])("$id: no ownership check at all (behaviour 5), just the UPDATE", (testCase) => {
    const entry = ACTION_REGISTRY[testCase.id];
    expect(entry.ownership.checked).toBe(false);

    const body = readFunctionBody(testCase.file, testCase.export);
    expect(body).not.toMatch(/db\s*\.\s*select/);
    expect(body).toMatch(/db\s*\.\s*update/);
  });
});

describe("action registry — insert entries (LLMW.ACTION.INSERT.1, B7c-w)", () => {
  it("createGeneratedShots — one row per item, declared columns only, code from nomenclature not the model, orderIndex continues", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    // Seed one existing shot so the next orderIndex must continue rather
    // than restart at 0.
    await insertShot(ctx, sequenceId, { orderIndex: 4 });

    const shotsPayload = [
      {
        title: "Shot A",
        shot_code: "MODEL_PROPOSED_CODE",
        description: "d1",
        duration_seconds: 5,
        continuity_in: "ci1",
        action_pitch: "ap1",
        camera_pitch: "cp1",
        framing: "wide",
        camera_movement: "pan",
        continuity_out: "co1",
        shot_prompt: "sp1",
      },
      { title: "Shot B", shot_code: "MODEL_PROPOSED_CODE_2" },
    ];

    const target = await captureRedirect(() =>
      sequenceShotsActions.createGeneratedShots(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotsJson: JSON.stringify(shotsPayload),
        })
      )
    );
    expect(target).toContain("shotsCreated=2");

    const rows = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    const created = rows.filter((r) => r.orderIndex > 4).sort((a, b) => a.orderIndex - b.orderIndex);

    expect(created).toHaveLength(2);
    expect(created[0].orderIndex).toBe(5);
    expect(created[1].orderIndex).toBe(6);

    // shotCode: from the nomenclature template, not the model's proposed value.
    expect(created[0].shotCode).not.toBe("MODEL_PROPOSED_CODE");
    expect(created[0].shotCode).toMatch(/^Sh_/);
    expect(created[1].shotCode).not.toBe("MODEL_PROPOSED_CODE_2");
    expect(created[1].shotCode).toMatch(/^Sh_/);
    expect(created[0].shotCode).not.toBe(created[1].shotCode);

    // Declared columns are the ones populated; every undeclared column the
    // schema also allows to write stays at its default (null).
    expect(created[0].description).toBe("d1");
    expect(created[0].durationSeconds).toBe(5);
    expect(created[0].actionPitch).toBe("ap1");
    expect(created[0].cameraPitch).toBe("cp1");
    expect(created[0].framing).toBe("wide");
    expect(created[0].cameraMovement).toBe("pan");
    expect(created[0].continuityIn).toBe("ci1");
    expect(created[0].continuityOut).toBe("co1");
    expect(created[0].shotPrompt).toBe("sp1");
    expect(created[0].continuityNotes).toBeNull();
    expect(created[0].approvedVideoPath).toBeNull();
    expect(created[0].trimInSeconds).toBeNull();
    expect(created[0].trimOutSeconds).toBeNull();
  });

  it("createGeneratedShots — refuses a sequence belonging to another project and writes no row", async () => {
    const otherProjectId = await insertProject(ctx, "Foreign project (shots)");
    const otherSequenceId = await insertSequence(ctx, otherProjectId);

    const before = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, otherSequenceId));
    expect(before).toHaveLength(0);

    const target = await captureRedirect(() =>
      sequenceShotsActions.createGeneratedShots(
        form({
          projectId: String(projectId),
          sequenceId: String(otherSequenceId),
          shotsJson: JSON.stringify([{ title: "Injected" }]),
        })
      )
    );
    expect(target).toContain("shotsCreateError=");

    const after = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, otherSequenceId));
    expect(after).toHaveLength(0);
  });

  it("createSelectedAssets — one row per item, declared columns only, orderIndex continues", async () => {
    // Seed one existing asset so the next orderIndex must continue.
    await insertAsset(ctx, projectId, { orderIndex: 9 });
    const beforeCount = (await ctx.db.select().from(ctx.schema.assets)).length;

    const selectedPayload = [
      { name: "Asset A", assetType: "character", description: "d1", notes: "n1" },
      { name: "Asset B", assetType: "prop" },
    ];

    const target = await captureRedirect(() =>
      assetExtractionActions.createSelectedAssets(
        form({
          projectId: String(projectId),
          selectedJson: JSON.stringify(selectedPayload),
        })
      )
    );
    expect(target).toContain("assetsCreated=2");

    const after = await ctx.db.select().from(ctx.schema.assets);
    expect(after).toHaveLength(beforeCount + 2);

    const created = after
      .filter((r) => r.name === "Asset A" || r.name === "Asset B")
      .sort((a, b) => a.orderIndex - b.orderIndex);
    expect(created).toHaveLength(2);
    expect(created[0].orderIndex).toBe(10);
    expect(created[1].orderIndex).toBe(11);

    expect(created[0].description).toBe("d1");
    expect(created[0].notes).toBe("n1");
    expect(created[0].type).toBe("character");
    expect(created[1].type).toBe("prop");

    // Undeclared columns stay at their schema default.
    expect(created[0].visualIdentity).toBeNull();
    expect(created[0].usageRules).toBeNull();
    expect(created[0].forbiddenVariations).toBeNull();
  });

  it("createSelectedAssets — refuses a nonexistent projectId cleanly and writes no row", async () => {
    const before = await ctx.db.select().from(ctx.schema.assets);

    const target = await captureRedirect(() =>
      assetExtractionActions.createSelectedAssets(
        form({
          projectId: "999999",
          selectedJson: JSON.stringify([{ name: "Injected", assetType: "prop" }]),
        })
      )
    );
    // Pinned to the project-existence refusal specifically: a bare
    // `assetsCreateError=` would also pass on any other guard's message.
    expect(target).toContain(`assetsCreateError=${encodeURIComponent("Project not found.")}`);

    const after = await ctx.db.select().from(ctx.schema.assets);
    expect(after).toHaveLength(before.length);
  });

  it("createGeneratedSequences — one row per item, declared columns only, code from nomenclature, orderIndex continues, and the model's order_index only sorts", async () => {
    // Seed one existing sequence so the next orderIndex must continue.
    await insertSequence(ctx, projectId, { orderIndex: 20 });
    const beforeCount = (await ctx.db.select().from(ctx.schema.sequences)).length;

    const sequencesPayload = [
      {
        title: "Sequence B",
        summary: "s2",
        order_index: 1,
        description: "desc2",
        narrative_purpose: "purpose2",
        mood: "mood2",
        location_hint: "loc2",
      },
      {
        title: "Sequence A",
        summary: "s1",
        order_index: 0,
        description: "desc1",
        narrative_purpose: "purpose1",
        mood: "mood1",
        location_hint: "loc1",
      },
    ];

    const target = await captureRedirect(() =>
      sequenceGenerationActions.createGeneratedSequences(
        form({
          projectId: String(projectId),
          sequencesJson: JSON.stringify(sequencesPayload),
        })
      )
    );
    expect(target).toContain("sequencesCreated=2");

    const after = await ctx.db.select().from(ctx.schema.sequences);
    expect(after).toHaveLength(beforeCount + 2);

    const created = after
      .filter((r) => r.title === "Sequence A" || r.title === "Sequence B")
      .sort((a, b) => a.orderIndex - b.orderIndex);
    expect(created).toHaveLength(2);
    // The model's own order_index (0 for A, 1 for B) only decides which
    // item is inserted first; the stored orderIndex continues the scope's
    // own numbering (21, 22), never the model's 0/1.
    expect(created[0].title).toBe("Sequence A");
    expect(created[0].orderIndex).toBe(21);
    expect(created[1].title).toBe("Sequence B");
    expect(created[1].orderIndex).toBe(22);

    expect(created[0].sequenceCode).toMatch(/^Sq_/);
    expect(created[1].sequenceCode).toMatch(/^Sq_/);
    expect(created[0].sequenceCode).not.toBe(created[1].sequenceCode);

    expect(created[0].summary).toBe("s1");
    expect(created[1].summary).toBe("s2");
    expect(created[0].description).toBe("desc1");
    expect(created[0].narrativePurpose).toBe("purpose1");
    expect(created[0].mood).toBe("mood1");
    expect(created[0].locationHint).toBe("loc1");

    // Undeclared columns stay at their schema default.
    expect(created[0].sequencePrompt).toBeNull();
    expect(created[0].rowBackgroundImagePath).toBeNull();
    expect(created[0].rowBackgroundOpacity).toBeNull();
  });

  it("createGeneratedSequences — refuses a nonexistent projectId cleanly and writes no row", async () => {
    const before = await ctx.db.select().from(ctx.schema.sequences);

    const target = await captureRedirect(() =>
      sequenceGenerationActions.createGeneratedSequences(
        form({
          projectId: "999999",
          sequencesJson: JSON.stringify([{ title: "Injected" }]),
        })
      )
    );
    // Pinned to the project-existence refusal specifically: a bare
    // `sequencesCreateError=` would also pass on any other guard's message.
    expect(target).toContain(`sequencesCreateError=${encodeURIComponent("Project not found.")}`);

    const after = await ctx.db.select().from(ctx.schema.sequences);
    expect(after).toHaveLength(before.length);
  });
});

describe("action registry — applySelectedCastingSuggestions (LLMW.ACTION.CASTING.1, B7h-a)", () => {
  // The action's own two owned tables — read directly, the same way the
  // insert-entries suite above reads ctx.schema.shots/assets/sequences
  // directly rather than through a dedicated helper.
  async function shotAssetRows(shotId: number) {
    return ctx.db.select().from(ctx.schema.shotAssets).where(eq(ctx.schema.shotAssets.shotId, shotId));
  }
  async function sequenceAssetRows(sequenceId: number) {
    return ctx.db
      .select()
      .from(ctx.schema.sequenceAssets)
      .where(eq(ctx.schema.sequenceAssets.sequenceId, sequenceId));
  }

  it("1. a valid shot-targeted suggestion inserts one row in shot_assets, none in sequence_assets", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetId = await insertAsset(ctx, projectId);

    const target = await captureRedirect(() =>
      castingSuggestionsActions.applySelectedCastingSuggestions(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          selectedJson: JSON.stringify([{ targetType: "shot", targetId: shotId, assetId }]),
        })
      )
    );
    expect(target).toContain("castingsApplied=1");

    const shotRows = await shotAssetRows(shotId);
    expect(shotRows).toHaveLength(1);
    expect(shotRows[0].shotId).toBe(shotId);
    expect(shotRows[0].assetId).toBe(assetId);
    // Declared columns (shotId, assetId) are populated; the undeclared
    // `notes` column stays at its schema default — proof #7.
    expect(shotRows[0].notes).toBeNull();

    const seqRows = await sequenceAssetRows(sequenceId);
    expect(seqRows).toHaveLength(0);
  });

  it("2. a valid sequence-targeted suggestion inserts one row in sequence_assets, none in shot_assets", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetId = await insertAsset(ctx, projectId);

    const target = await captureRedirect(() =>
      castingSuggestionsActions.applySelectedCastingSuggestions(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          selectedJson: JSON.stringify([{ targetType: "sequence", targetId: sequenceId, assetId }]),
        })
      )
    );
    expect(target).toContain("castingsApplied=1");

    const seqRows = await sequenceAssetRows(sequenceId);
    expect(seqRows).toHaveLength(1);
    expect(seqRows[0].sequenceId).toBe(sequenceId);
    expect(seqRows[0].assetId).toBe(assetId);
    // Declared columns (sequenceId, assetId) are populated; the undeclared
    // `notes` column stays at its schema default — proof #7.
    expect(seqRows[0].notes).toBeNull();

    const shotRows = await shotAssetRows(shotId);
    expect(shotRows).toHaveLength(0);
  });

  it("3. a nonexistent assetId is ignored silently: no row, no error, and the redirect count excludes it", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);

    const target = await captureRedirect(() =>
      castingSuggestionsActions.applySelectedCastingSuggestions(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          selectedJson: JSON.stringify([{ targetType: "shot", targetId: shotId, assetId: 999999 }]),
        })
      )
    );
    expect(target).toContain("castingsApplied=0");
    expect(target).not.toContain("castingsError");

    const shotRows = await shotAssetRows(shotId);
    expect(shotRows).toHaveLength(0);
  });

  it("4. a shot targetId belonging to another sequence is ignored the same way", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const otherSequenceId = await insertSequence(ctx, projectId);
    const otherShotId = await insertShot(ctx, otherSequenceId);
    const assetId = await insertAsset(ctx, projectId);

    const target = await captureRedirect(() =>
      castingSuggestionsActions.applySelectedCastingSuggestions(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          selectedJson: JSON.stringify([{ targetType: "shot", targetId: otherShotId, assetId }]),
        })
      )
    );
    expect(target).toContain("castingsApplied=0");

    const shotRows = await shotAssetRows(otherShotId);
    expect(shotRows).toHaveLength(0);
  });

  it("5. a duplicate does not add a row and does not increment the redirect count", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetId = await insertAsset(ctx, projectId);
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });

    const target = await captureRedirect(() =>
      castingSuggestionsActions.applySelectedCastingSuggestions(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          selectedJson: JSON.stringify([{ targetType: "shot", targetId: shotId, assetId }]),
        })
      )
    );
    expect(target).toContain("castingsApplied=0");

    const shotRows = await shotAssetRows(shotId);
    expect(shotRows).toHaveLength(1);
  });

  it("6. a sequence belonging to another project writes nothing and redirects with \"Sequence not found.\"", async () => {
    const otherProjectId = await insertProject(ctx, "Foreign project (casting)");
    const otherSequenceId = await insertSequence(ctx, otherProjectId);
    const otherShotId = await insertShot(ctx, otherSequenceId);
    const assetId = await insertAsset(ctx, otherProjectId);

    const beforeShotAssets = await ctx.db.select().from(ctx.schema.shotAssets);
    const beforeSequenceAssets = await ctx.db.select().from(ctx.schema.sequenceAssets);

    const target = await captureRedirect(() =>
      castingSuggestionsActions.applySelectedCastingSuggestions(
        form({
          projectId: String(projectId),
          sequenceId: String(otherSequenceId),
          selectedJson: JSON.stringify([{ targetType: "shot", targetId: otherShotId, assetId }]),
        })
      )
    );
    expect(target).toContain(`castingsError=${encodeURIComponent("Sequence not found.")}`);

    const afterShotAssets = await ctx.db.select().from(ctx.schema.shotAssets);
    const afterSequenceAssets = await ctx.db.select().from(ctx.schema.sequenceAssets);
    expect(afterShotAssets).toHaveLength(beforeShotAssets.length);
    expect(afterSequenceAssets).toHaveLength(beforeSequenceAssets.length);
  });

  it("no db.transaction, at least one SELECT and one INSERT — behaviour 4, structural fact", async () => {
    const entry = ACTION_REGISTRY.applySelectedCastingSuggestions;
    expect(entry.ownership.transactional).toBe(false);

    const filePath = path.join(process.cwd(), "src/actions/llm/castingSuggestions.ts");
    const src = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);
    let body: string | undefined;
    sourceFile.forEachChild((node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "applySelectedCastingSuggestions" &&
        node.body
      ) {
        body = node.body.getFullText(sourceFile);
      }
    });
    if (body === undefined) throw new Error("applySelectedCastingSuggestions not found");

    expect(body).not.toContain("db.transaction");
    expect(body).toMatch(/db\s*\.\s*select/);
    expect(body).toMatch(/db\s*\.\s*insert/);
  });
});

describe("action registry — createShotAtPosition (LLMW.ACTION.INSERT_AT.1, B11-a)", () => {
  async function orderedShots(sequenceId: number) {
    const rows = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    return rows.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  it("insertion at the start (afterShotId absent): new plan at index 0, the three existing shift to 1,2,3", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotA = await insertShot(ctx, sequenceId, { title: "A", orderIndex: 0 });
    const shotB = await insertShot(ctx, sequenceId, { title: "B", orderIndex: 1 });
    const shotC = await insertShot(ctx, sequenceId, { title: "C", orderIndex: 2 });

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotJson: JSON.stringify({ title: "New at start" }),
        })
      )
    );
    expect(target).toContain("shotInserted=1");

    const rows = await orderedShots(sequenceId);
    expect(rows.map((r) => r.orderIndex)).toEqual([0, 1, 2, 3]);
    expect(rows[0].title).toBe("New at start");
    const byId = new Map(rows.map((r) => [r.id, r.orderIndex]));
    expect(byId.get(shotA)).toBe(1);
    expect(byId.get(shotB)).toBe(2);
    expect(byId.get(shotC)).toBe(3);
  });

  it("insertion in the middle (after the first of three): 0,1,2,3 with no duplicate and no gap", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotA = await insertShot(ctx, sequenceId, { title: "A", orderIndex: 0 });
    const shotB = await insertShot(ctx, sequenceId, { title: "B", orderIndex: 1 });
    const shotC = await insertShot(ctx, sequenceId, { title: "C", orderIndex: 2 });

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          afterShotId: String(shotA),
          shotJson: JSON.stringify({ title: "New in middle" }),
        })
      )
    );
    expect(target).toContain("shotInserted=1");

    const rows = await orderedShots(sequenceId);
    expect(rows.map((r) => r.orderIndex)).toEqual([0, 1, 2, 3]);
    // No duplicate orderIndex, no gap.
    const seen = new Set(rows.map((r) => r.orderIndex));
    expect(seen.size).toBe(4);

    const byId = new Map(rows.map((r) => [r.id, r.orderIndex]));
    expect(byId.get(shotA)).toBe(0);
    expect(rows.find((r) => r.title === "New in middle")?.orderIndex).toBe(1);
    expect(byId.get(shotB)).toBe(2);
    expect(byId.get(shotC)).toBe(3);
  });

  it("insertion after the last shot is equivalent to an append", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    await insertShot(ctx, sequenceId, { title: "A", orderIndex: 0 });
    await insertShot(ctx, sequenceId, { title: "B", orderIndex: 1 });
    const shotC = await insertShot(ctx, sequenceId, { title: "C", orderIndex: 2 });

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          afterShotId: String(shotC),
          shotJson: JSON.stringify({ title: "New at end" }),
        })
      )
    );
    expect(target).toContain("shotInserted=1");

    const rows = await orderedShots(sequenceId);
    expect(rows.map((r) => r.orderIndex)).toEqual([0, 1, 2, 3]);
    expect(rows[3].title).toBe("New at end");
  });

  it("shotCode is generated from the nomenclature template, never the JSON's own value; shotPrompt is derived; approvedVideoPath/trimInSeconds/trimOutSeconds stay null", async () => {
    const sequenceId = await insertSequence(ctx, projectId);

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotJson: JSON.stringify({
            title: "New shot",
            shotCode: "MODEL_PROPOSED_CODE",
            description: "d",
            actionPitch: "ap",
            cameraPitch: "cp",
          }),
        })
      )
    );
    expect(target).toContain("shotInserted=1");

    const rows = await orderedShots(sequenceId);
    expect(rows).toHaveLength(1);
    const created = rows[0];
    expect(created.shotCode).not.toBe("MODEL_PROPOSED_CODE");
    expect(created.shotCode).toMatch(/^Sh_/);
    expect(created.shotPrompt).toBeTruthy();
    expect(created.approvedVideoPath).toBeNull();
    expect(created.trimInSeconds).toBeNull();
    expect(created.trimOutSeconds).toBeNull();

    // Declared columns match ACTION_REGISTRY.createShotAtPosition.columns.written.
    expect([...ACTION_REGISTRY.createShotAtPosition.columns.written].sort()).toEqual(
      [
        "sequenceId",
        "shotCode",
        "title",
        "description",
        "durationSeconds",
        "actionPitch",
        "cameraPitch",
        "continuityNotes",
        "framing",
        "cameraMovement",
        "continuityIn",
        "continuityOut",
        "shotPrompt",
        "orderIndex",
      ].sort()
    );
  });

  // LLMW.UC1.TUNE.2 (S7b), défaut 2 — `normalizeProposedShot`'s cameraPitch
  // bound, raised from 200 to 500 alongside the descriptor's own
  // `truncateTo: 500` (`shotInsertDirected.test.ts`'s own matching pair of
  // tests, on the descriptor side). Both sides accepting the same 400
  // characters whole, and cutting the same 600 at exactly 500, is the
  // equality this ticket requires — a divergence on either side would show
  // up here or there.
  it("a 400-character cameraPitch is stored whole, not truncated (equal to the descriptor's own bound)", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const value = "x".repeat(400);

    await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotJson: JSON.stringify({ title: "Long camera pitch", cameraPitch: value }),
        })
      )
    );

    const rows = await orderedShots(sequenceId);
    expect(rows[0].cameraPitch).toBe(value);
  });

  it("a cameraPitch longer than 500 characters is cut at exactly 500, matching the descriptor's own bound", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const value = "y".repeat(600);

    await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotJson: JSON.stringify({ title: "Overlong camera pitch", cameraPitch: value }),
        })
      )
    );

    const rows = await orderedShots(sequenceId);
    expect(rows[0].cameraPitch).toBe(value.slice(0, 500));
    expect(rows[0].cameraPitch?.length).toBe(500);
  });

  it("refuses a non-integer projectId/sequenceId and writes nothing, shifts nothing", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotA = await insertShot(ctx, sequenceId, { title: "A", orderIndex: 0 });
    const before = await orderedShots(sequenceId);

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: "not-a-number",
          sequenceId: String(sequenceId),
          shotJson: JSON.stringify({ title: "Injected" }),
        })
      )
    );
    expect(target).toContain(`shotInsertError=${encodeURIComponent("Invalid request.")}`);

    const after = await orderedShots(sequenceId);
    expect(after).toEqual(before);
    expect(after.find((r) => r.id === shotA)?.orderIndex).toBe(0);
  });

  it("refuses a sequence belonging to another project and writes nothing, shifts nothing", async () => {
    const otherProjectId = await insertProject(ctx, "Foreign project (shot insertion)");
    const otherSequenceId = await insertSequence(ctx, otherProjectId);
    const shotA = await insertShot(ctx, otherSequenceId, { title: "A", orderIndex: 0 });
    const before = await orderedShots(otherSequenceId);

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(otherSequenceId),
          shotJson: JSON.stringify({ title: "Injected" }),
        })
      )
    );
    expect(target).toContain(`shotInsertError=${encodeURIComponent("Sequence not found.")}`);

    const after = await orderedShots(otherSequenceId);
    expect(after).toEqual(before);
    expect(after.find((r) => r.id === shotA)?.orderIndex).toBe(0);
  });

  it("refuses an afterShotId that does not belong to this sequence and writes nothing, shifts nothing", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotA = await insertShot(ctx, sequenceId, { title: "A", orderIndex: 0 });
    const otherSequenceId = await insertSequence(ctx, projectId);
    const foreignShot = await insertShot(ctx, otherSequenceId, { title: "Foreign", orderIndex: 0 });
    const before = await orderedShots(sequenceId);

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          afterShotId: String(foreignShot),
          shotJson: JSON.stringify({ title: "Injected" }),
        })
      )
    );
    expect(target).toContain(`shotInsertError=${encodeURIComponent("Shot not found.")}`);

    const after = await orderedShots(sequenceId);
    expect(after).toEqual(before);
    expect(after.find((r) => r.id === shotA)?.orderIndex).toBe(0);
  });

  it("refuses invalid/blank-title shot data and writes nothing, shifts nothing", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotA = await insertShot(ctx, sequenceId, { title: "A", orderIndex: 0 });
    const before = await orderedShots(sequenceId);

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotJson: JSON.stringify({ title: "   " }),
        })
      )
    );
    expect(target).toContain(`shotInsertError=${encodeURIComponent("Invalid shot data.")}`);

    const after = await orderedShots(sequenceId);
    expect(after).toEqual(before);
    expect(after.find((r) => r.id === shotA)?.orderIndex).toBe(0);
  });

  it("no plain SELECT+UPDATE/INSERT pair — the shift and the insert run inside one db.transaction (ownership.transactional: true)", async () => {
    const entry = ACTION_REGISTRY.createShotAtPosition;
    expect(entry.ownership.transactional).toBe(true);

    const filePath = path.join(process.cwd(), "src/actions/llm/shotInsertion.ts");
    const src = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);
    let body: string | undefined;
    sourceFile.forEachChild((node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "createShotAtPosition" &&
        node.body
      ) {
        body = node.body.getFullText(sourceFile);
      }
    });
    if (body === undefined) throw new Error("createShotAtPosition not found");

    expect(body).toContain("db.transaction");
  });
});

// ---------------------------------------------------------------------------
// LLMW.UC1.BENCH.1 (B11-b3) — the round trip the supervisor asked for by name:
// the bench's own serializer feeding the write action's own reader. Each half
// is already proven alone — `buildShotJsonPayload` in `benchRun.test.ts`,
// `createShotAtPosition` above — and neither proof can catch the one defect
// that matters here, a duration emitted as `"4"` instead of `4`. The write
// action would drop it silently (`normalizeProposedShot` requires
// `typeof === "number"`), no error, no test failing. So the two halves are
// joined here, once, against a real row.
// ---------------------------------------------------------------------------

describe("UC1 end to end — buildShotJsonPayload feeds createShotAtPosition (LLMW.UC1.BENCH.1, B11-b3)", () => {
  const output = shotInsertDirectedDescriptor.output;

  it("a bench draft becomes a real shot, duration included, at the named position", async () => {
    if (output.kind !== "object") throw new Error("unreachable");
    const sequenceId = await insertSequence(ctx, projectId);
    const first = await insertShot(ctx, sequenceId, { title: "First", orderIndex: 0 });
    await insertShot(ctx, sequenceId, { title: "Second", orderIndex: 1 });

    const shotJson = buildShotJsonPayload(output.fields, {
      title: "Hero enters frame",
      description: "A low shot of the hero stepping into view.",
      // The textarea round trip: a number the user re-typed as text.
      durationSeconds: "4",
      actionPitch: "Hero walks in, pauses, walks out.",
      cameraPitch: "Low angle, static.",
      continuityNotes: "Picks up the previous shot's exit direction.",
      framing: "WS",
      cameraMovement: "static",
      continuityIn: "Hero off-frame, entering left.",
      continuityOut: "Hero exits right.",
    });

    const target = await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          afterShotId: String(first),
          shotJson,
        })
      )
    );
    expect(target).toContain("shotInserted=1");

    const rows = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    const inserted = rows.find((r) => r.title === "Hero enters frame");
    if (!inserted) throw new Error("the shot was not created");

    // The assertion this whole test exists for: the duration survived the
    // serializer. A `"4"` here would have been dropped to null in silence.
    expect(inserted.durationSeconds).toBe(4);
    expect(inserted.orderIndex).toBe(1);
    expect(inserted.framing).toBe("WS");
    expect(inserted.continuityOut).toBe("Hero exits right.");
  });

  it("a draft whose duration was left blank creates the shot with a null duration, not zero", async () => {
    if (output.kind !== "object") throw new Error("unreachable");
    const sequenceId = await insertSequence(ctx, projectId);

    const shotJson = buildShotJsonPayload(output.fields, {
      title: "No duration given",
      durationSeconds: "",
    });

    await captureRedirect(() =>
      shotInsertionActions.createShotAtPosition(
        form({ projectId: String(projectId), sequenceId: String(sequenceId), shotJson })
      )
    );

    const [row] = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    expect(row.title).toBe("No duration given");
    expect(row.durationSeconds).toBeNull();
  });
});
