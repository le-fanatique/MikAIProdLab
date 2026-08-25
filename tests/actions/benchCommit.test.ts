import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset, readProject } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.BENCH.RUN.1 (B6c1), §5 — write-side proof for
// `commitBenchProposal` (`src/actions/llmWorkspace/bench.ts`) on a disposable
// database. `commitBenchProposal` imports `@/lib/llmWorkspace/benchDescriptor`,
// which imports `@/db` at module scope; per this directory's convention
// (`tests/actions/llmTemplates.test.ts`, `proposalCommit.test.ts`), it is
// imported dynamically in `beforeAll`, after `setupTempDb()` has set
// `DB_PATH`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let commitBenchProposal: typeof import("@/actions/llmWorkspace/bench").commitBenchProposal;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ commitBenchProposal } = await import("@/actions/llmWorkspace/bench"));
});

afterAll(() => ctx.cleanup());

describe("commitBenchProposal — story.generate → applyGeneratedStory", () => {
  it("writes the approved value onto projects.story", async () => {
    const projectId = await insertProject(ctx, "Story project");

    const result = await commitBenchProposal({
      templateId: "story.generate",
      ids: { projectId },
      values: { story: "The approved story text." },
    });

    expect(result.ok).toBe(true);
    const after = await readProject(ctx, projectId);
    expect(after.story).toBe("The approved story text.");
  });
});

describe("commitBenchProposal — assetNotes.generate → updateAssetDescriptionFieldInline", () => {
  it("writes notes, and not description — proving the routing by output.fields[0].field", async () => {
    const projectId = await insertProject(ctx, "Asset notes project");
    const assetId = await insertAsset(ctx, projectId, { description: "Original description" });

    const result = await commitBenchProposal({
      templateId: "assetNotes.generate",
      ids: { projectId, assetId },
      values: { notes: "The approved notes." },
    });

    expect(result.ok).toBe(true);
    const after = await readAsset(ctx, assetId);
    expect(after.notes).toBe("The approved notes.");
    expect(after.description).toBe("Original description");
  });
});

describe("commitBenchProposal — assetBible.generate → updateAssetDetailsInline", () => {
  it("writes the three bible fields and preserves the asset's existing description and notes", async () => {
    const projectId = await insertProject(ctx, "Asset bible project");
    const assetId = await insertAsset(ctx, projectId, {
      description: "Existing description",
      notes: "Existing notes",
    });

    const result = await commitBenchProposal({
      templateId: "assetBible.generate",
      ids: { projectId, assetId },
      values: {
        visualIdentity: "Approved visual identity",
        usageRules: "Approved usage rules",
        forbiddenVariations: "Approved forbidden variations",
      },
    });

    expect(result.ok).toBe(true);
    const after = await readAsset(ctx, assetId);
    expect(after.visualIdentity).toBe("Approved visual identity");
    expect(after.usageRules).toBe("Approved usage rules");
    expect(after.forbiddenVariations).toBe("Approved forbidden variations");
    // The most important proof of this file: without `preservedAssetDetailColumns`
    // carrying these two columns through, registry behaviour 3
    // (`updateAssetDetailsInline` replaces all five fields on every call)
    // would silently null them.
    expect(after.description).toBe("Existing description");
    expect(after.notes).toBe("Existing notes");
  });

  // ASSET.LIGHTING.PLACE.1 — `assetBible.generate` never declares `lighting`
  // as an output field, so approving one must never null it. This is the
  // caller-side half of the proof `proposalCommit.test.ts` gives the
  // *builder* (`buildAssetBibleCommitArgs` carries `existingLighting`
  // through): this test proves `bench.ts`'s own `updateAssetDetailsInline`
  // case actually reads the asset's real `lighting` column and passes it as
  // `existingLighting`, rather than e.g. `null` — a regression that would
  // pass every other assertion in this file.
  it("preserves the asset's existing lighting, untouched by an Asset Bible approval", async () => {
    const projectId = await insertProject(ctx, "Asset bible lighting project");
    const assetId = await insertAsset(ctx, projectId, {
      description: "Existing description",
      notes: "Existing notes",
      lighting: "Soft key from the left, cool ambient fill",
    });

    const result = await commitBenchProposal({
      templateId: "assetBible.generate",
      ids: { projectId, assetId },
      values: {
        visualIdentity: "Approved visual identity",
        usageRules: "Approved usage rules",
        forbiddenVariations: "Approved forbidden variations",
      },
    });

    expect(result.ok).toBe(true);
    const after = await readAsset(ctx, assetId);
    expect(after.lighting).toBe("Soft key from the left, cool ambient fill");
  });

  // ASSET.PROMPTCARD.1 §8 — the ticket's own required non-clearing test, same
  // shape as `lighting`'s above: `assetBible.generate` never declares
  // `promptCard` as an output field, so approving one must never null it.
  // This is the trap ASSET.LIGHTING.PLACE.1 hit and had to have this test
  // added by supervision for `lighting` — not repeated here.
  it("preserves the asset's existing prompt card, untouched by an Asset Bible approval", async () => {
    const projectId = await insertProject(ctx, "Asset bible prompt card project");
    const assetId = await insertAsset(ctx, projectId, {
      description: "Existing description",
      notes: "Existing notes",
      promptCard: "Weathered fur, calloused hands, scuffed flight jacket",
    });

    const result = await commitBenchProposal({
      templateId: "assetBible.generate",
      ids: { projectId, assetId },
      values: {
        visualIdentity: "Approved visual identity",
        usageRules: "Approved usage rules",
        forbiddenVariations: "Approved forbidden variations",
      },
    });

    expect(result.ok).toBe(true);
    const after = await readAsset(ctx, assetId);
    expect(after.promptCard).toBe("Weathered fur, calloused hands, scuffed flight jacket");
  });
});

describe("commitBenchProposal — chain refusal", () => {
  it("refuses an assetId that belongs to a different project than the one supplied, and writes nothing", async () => {
    const ownerProjectId = await insertProject(ctx, "Owner project");
    const otherProjectId = await insertProject(ctx, "Other project");
    const assetId = await insertAsset(ctx, ownerProjectId, {
      description: "Untouched description",
      notes: "Untouched notes",
    });

    const before = await readAsset(ctx, assetId);

    const result = await commitBenchProposal({
      templateId: "assetNotes.generate",
      ids: { projectId: otherProjectId, assetId },
      values: { notes: "Should never be written." },
    });

    expect(result.ok).toBe(false);

    // Verifies the row after the call, not only the return value — an
    // action that answered `ok: false` but still wrote would pass a
    // return-value-only check.
    const after = await readAsset(ctx, assetId);
    expect(after).toEqual(before);
    expect(after.notes).toBe("Untouched notes");
  });
});

describe("commitBenchProposal — entitySet refusal", () => {
  it("refuses assetDescription.batch and writes nothing", async () => {
    const projectId = await insertProject(ctx, "Batch project");
    const assetId = await insertAsset(ctx, projectId, { description: "Untouched" });
    const before = await readAsset(ctx, assetId);

    const result = await commitBenchProposal({
      templateId: "assetDescription.batch",
      ids: { projectId, assetId },
      values: { description: "Should never be written." },
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Batch operations cannot be approved from the bench.");

    const after = await readAsset(ctx, assetId);
    expect(after).toEqual(before);
  });
});
