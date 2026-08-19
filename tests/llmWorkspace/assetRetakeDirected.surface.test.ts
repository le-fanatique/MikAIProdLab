import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "../actions/helpers/fixtures";
import { assetRetakeDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/assetRetakeDirected";
import { computeBibleSourceFingerprint, readAssetBibleFreshness } from "@/lib/assetBible/freshness";

/**
 * `AssetRetakeDirectedPanel.tsx` — LLMW.UC3.SURFACE.1 (S4), the surface that
 * hands `asset.retakeDirected`'s Asset Detail draft to
 * `updateAssetDescriptionFieldInline`. Corrective manche: the ticket's first
 * version was wrong about a preservation trap that does not exist — this
 * file proves the property the corrected ticket actually asks for (§ "Le
 * chemin d'écriture, pour de vrai" and validation item 2): approving writes
 * `description` alone and leaves `notes` and the three Asset Bible fields
 * untouched, because `updateAssetDescriptionFieldInline` writes exactly one
 * column, not because anything here reports a column.
 *
 * `generateAssetRetakeDraft` (`src/actions/llm/assetRetake.ts`) and
 * `AssetRetakeDirectedPanel` both import `@/db`-touching modules at module
 * scope — per this repository's convention (`tests/actions/bindings.test.ts`),
 * dynamically imported in `beforeAll`, after `setupTempDb()` has set
 * `DB_PATH`.
 */

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ description: "A softened, androgynous courier silhouette." })),
}));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let buildAssetDescriptionFieldCommitArgs: typeof import("@/lib/llmWorkspace/actions/proposalCommit").buildAssetDescriptionFieldCommitArgs;
let updateAssetDescriptionFieldInline: typeof import("@/actions/assets").updateAssetDescriptionFieldInline;

let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
  ({ buildAssetDescriptionFieldCommitArgs } = await import("@/lib/llmWorkspace/actions/proposalCommit"));
  ({ updateAssetDescriptionFieldInline } = await import("@/actions/assets"));

  projectId = await insertProject(ctx, "Asset retake surface project");
});

afterAll(() => ctx.cleanup());

describe("asset.retakeDirected — via runWorkspaceOperation (LLMW.UNIFY.PANEL.2)", () => {
  it("returns the model's description as a draft", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      name: "Courier",
      description: "A rugged courier in a weathered leather jacket.",
    });

    const draft = await runWorkspaceOperation({
      descriptorId: "asset.retakeDirected",
      ids: { projectId, assetId },
      intent: { freeText: "soften the jawline, less masculine" },
    });
    // LLMW.UNIFY.PANEL.2 — the shape is the generic action's now, not the
    // deleted adapter's. The VALUE is unchanged.
    expect(draft).toEqual({
      ok: true,
      kind: "object",
      values: { description: "A softened, androgynous courier silhouette." },
    });
  });
});

describe("AssetRetakeDirectedPanel's write path — commits description alone (validation item 2)", () => {
  it("approving a retake writes description and leaves notes and the three Asset Bible fields intact", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      name: "Courier",
      description: "A rugged courier in a weathered leather jacket.",
      notes: "Reads too masculine for the story's lead.",
      visualIdentity: "Angular jaw, broad shoulders, cropped hair.",
      usageRules: "Always shown in motion.",
      forbiddenVariations: "Never shown unarmed.",
    });
    const before = await readAsset(ctx, assetId);

    const draft = await runWorkspaceOperation({
      descriptorId: "asset.retakeDirected",
      ids: { projectId, assetId },
      intent: { freeText: "soften the jawline, less masculine" },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok || draft.kind !== "object") throw new Error("unreachable");
    const draftDescription = draft.values.description;
    if (typeof draftDescription !== "string") throw new Error("unreachable");

    // Same call shape `AssetRetakeDirectedPanel`'s Approve action uses:
    // `buildAssetDescriptionFieldCommitArgs` with a fixed `field: "description",
    // mode: "replace"` — never "append", the ticket's one vigilance point.
    const args = buildAssetDescriptionFieldCommitArgs({
      assetId,
      projectId,
      field: "description",
      mode: "replace",
      content: draftDescription,
    });
    const commitResult = await updateAssetDescriptionFieldInline(...args);
    expect(commitResult).toEqual({ ok: true });

    const after = await readAsset(ctx, assetId);
    expect(after.description).toBe("A softened, androgynous courier silhouette.");
    expect(after.notes).toBe(before.notes);
    expect(after.visualIdentity).toBe(before.visualIdentity);
    expect(after.usageRules).toBe(before.usageRules);
    expect(after.forbiddenVariations).toBe(before.forbiddenVariations);
  });
});

describe("commitAdvisory gating — Asset Detail's own `bibleFreshness === \"stale\" ? descriptor.commitAdvisory : undefined` (validation item 3)", () => {
  const CORE = { description: "A hero character.", notes: "Softer jawline." };
  const BIBLE = {
    visualIdentity: "Tall, red cape.",
    usageRules: "Always shown airborne.",
    forbiddenVariations: "Never shown grounded.",
  };

  it("shows the advisory when the Bible is stale", () => {
    const freshness = readAssetBibleFreshness({ ...CORE, ...BIBLE, bibleSourceFingerprint: null });
    expect(freshness).toBe("stale");
    const advisory = freshness === "stale" ? assetRetakeDirectedDescriptor.commitAdvisory : undefined;
    expect(advisory).toBe(
      "The Asset Bible is written from Description and Notes — regenerate it to keep it in sync."
    );
  });

  it("hides the advisory when the Bible is current", () => {
    const fingerprint = computeBibleSourceFingerprint(CORE);
    const freshness = readAssetBibleFreshness({ ...CORE, ...BIBLE, bibleSourceFingerprint: fingerprint });
    expect(freshness).toBe("current");
    const advisory = freshness === "stale" ? assetRetakeDirectedDescriptor.commitAdvisory : undefined;
    expect(advisory).toBeUndefined();
  });

  it("hides the advisory when there is no Bible at all", () => {
    const freshness = readAssetBibleFreshness({
      ...CORE,
      visualIdentity: null,
      usageRules: null,
      forbiddenVariations: null,
      bibleSourceFingerprint: null,
    });
    expect(freshness).toBe("no-bible");
    const advisory = freshness === "stale" ? assetRetakeDirectedDescriptor.commitAdvisory : undefined;
    expect(advisory).toBeUndefined();
  });
});
