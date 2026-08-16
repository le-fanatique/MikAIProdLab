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
