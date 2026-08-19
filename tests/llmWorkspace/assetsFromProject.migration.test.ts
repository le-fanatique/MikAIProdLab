import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.MIGRATE.LIST.3 (B7f-m) — originally the proof that the migrated
// `generateAssetCandidatesDraft` adapter reproduced the pre-migration
// `parseAssetsResult` + `normalizeCandidate` chain (`git show
// bd38db5:src/actions/llm/assetExtraction.ts`) field by field, including its
// `"" -> null` fill-back for the five `type: "string"` fields.
//
// LLMW.UNIFY.PANEL.3 deletes that adapter: `AssetsLLMExtractPanel` now calls
// `runWorkspaceOperation` directly, and the fill-back this file used to prove
// moved into the panel (`toCandidate`,
// `src/components/AssetsLLMExtractPanel.tsx`) — presentation the ticket keeps
// identical in behaviour but which this repo has no test harness for a
// client component to reach (`.agents/executor_report.md`, the same
// limitation `LLMW.UNIFY.PANEL.2`'s own report already recorded). What this
// file still proves, at the level `runWorkspaceOperation` now is: the *raw*
// item shape (`""` where the deleted adapter used to fill `null`), the
// two-parameter conversion (`includeShots` + `assetTypes`, now built by the
// panel itself from its own checkbox state), the empty-`assetTypes` guard,
// and every refusal message, are all unchanged.
//
// LLMW.ASSETS.TYPEFILTER.1 (S2, 2026-08-17) narrows "unchanged" above: the
// migrated chain drops a candidate whose `assetType` was not among the
// requested `assetTypes` (`assetsFromProject.filterByType`,
// `variables/registry.ts`) — see the "form-to-intent conversion" case below,
// the one place in this file that exercises it.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const callLLMJson = vi.fn<(prompt: unknown, config: unknown) => Promise<string>>();
vi.mock("@/lib/llm", () => ({ callLLMJson: (...args: [unknown, unknown]) => callLLMJson(...args) }));

// A `sourceExcerpt` longer than its declared bound (200) — the runner's
// `truncateTo: 200` must cut it to exactly 200 characters, at the same
// offset the old `str()` (`maxLen = 200`) did.
const longSourceExcerpt = "E".repeat(250);

// Twenty extra, minimally valid raw items appended after the two items that
// exercise every field state below — pushing the *valid* item count past 20
// so the descriptor's own `maxItems: 20` is exercised.
const paddingItems = Array.from({ length: 20 }, (_, i) => ({ name: `Padding Asset ${i + 1}` }));

// Raw items, in the model's own array order.
const rawModelResponse = JSON.stringify({
  assets: [
    // Item 0 — exercises: an absent string field (`description`), an empty
    // string field after trim (`notes: ""`), a valid `sourceLevel` under its
    // primary key spelling, and a string field longer than its bound
    // (`sourceExcerpt`, truncated to 200).
    {
      name: "Kai the Courier",
      assetType: "character",
      notes: "",
      sourceLevel: "sequence",
      sourceExcerpt: longSourceExcerpt,
    },
    // Item 1 — exercises: an unknown `assetType` (falls back to its default,
    // `"other"`), the fallback key spelling for `sourceLevel`
    // (`source_level`) with an unknown value (falls back to its default,
    // `"outline"`), a valid `description`/`notes`, and an absent
    // `duplicateWarning`.
    {
      name: "Neon District",
      assetType: "unknown-type",
      description: "A dense, rain-lit district.",
      notes: "Recurring backdrop.",
      source_level: "not-a-real-level",
    },
    // Item 2 — no `name`: filtered by both chains (`normalizeCandidate`'s
    // sole gate on the old side; `item.validity: { fields: ["name"], require:
    // "all" }` on the runner side) — must not appear in the result at all.
    {
      assetType: "prop",
    },
    // Items 3..22 — twenty more valid items, pushing the valid count to 22
    // so both chains must truncate to 20, dropping the last two
    // ("Padding Asset 19", "Padding Asset 20").
    ...paddingItems,
  ],
});

// Computed by hand from `readStringField`/`readEnumField`
// (`src/lib/llmWorkspace/runner.ts`), applied to `rawModelResponse` above —
// `runWorkspaceOperation`'s raw shape (LLMW.UNIFY.PANEL.3), no longer the old
// adapter's null-filled one. Comments mark exactly where each `""` comes
// from.
const expectedAssets = [
  {
    name: "Kai the Courier",
    assetType: "character",
    description: "", // absent -> readStringField default ""
    notes: "", // "" after trim -> readStringField keeps ""
    sourceLevel: "sequence", // valid primary key
    sourceExcerpt: longSourceExcerpt.slice(0, 200), // truncateTo: 200
    duplicateWarning: "", // absent -> readStringField default ""
  },
  {
    name: "Neon District",
    assetType: "other", // "unknown-type" not in the enum's values -> default "other"
    description: "A dense, rain-lit district.",
    notes: "Recurring backdrop.",
    sourceLevel: "outline", // source_level: "not-a-real-level" is not a recognised value -> default "outline"
    sourceExcerpt: "",
    duplicateWarning: "",
  },
  ...paddingItems.slice(0, 18).map((p) => ({
    name: p.name,
    assetType: "other",
    description: "",
    notes: "",
    sourceLevel: "outline",
    sourceExcerpt: "",
    duplicateWarning: "",
  })),
];

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let projectId: number;

async function makeProject(fields: { pitch?: string | null }): Promise<number> {
  const id = await insertProject(ctx, "Neon Skyline");
  await ctx.db.update(ctx.schema.projects).set(fields).where(eq(ctx.schema.projects.id, id));
  return id;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));

  projectId = await makeProject({ pitch: "A courier races across a rain-soaked megacity." });
});

afterAll(() => ctx.cleanup());

function allTypes(): string[] {
  return ["character", "environment", "prop", "vehicle", "crowd", "other"];
}

describe("assets.fromProject via runWorkspaceOperation — raw item shape (LLMW.UNIFY.PANEL.3, was LLMW.MIGRATE.LIST.3)", () => {
  it("returns items in the model's own JSON keys, matching readStringField/readEnumField's own raw behaviour", async () => {
    callLLMJson.mockResolvedValueOnce(rawModelResponse);

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId },
      intent: { parameters: { includeShots: false, assetTypes: allTypes() } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    // Deep equality on the whole array — not field by field — so an extra
    // or missing key fails the test too.
    expect(result.items).toEqual(expectedAssets);
    expect(result.items.length).toBe(20);
  });

  it("reproduces the exact 'unparsable' message on a non-JSON model response", async () => {
    callLLMJson.mockResolvedValueOnce("not json at all");

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId },
      intent: { parameters: { includeShots: false, assetTypes: allTypes() } },
    });
    expect(result).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });
  });

  it("reproduces the exact 'notArray' message when the assets key is absent", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ nope: [] }));

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId },
      intent: { parameters: { includeShots: false, assetTypes: allTypes() } },
    });
    expect(result).toEqual({
      ok: false,
      error: "The model did not return an assets array. Try again.",
    });
  });

  it("reproduces the exact 'empty' message when every item is filtered (no name)", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ assets: [{ assetType: "prop" }] }));

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId },
      intent: { parameters: { includeShots: false, assetTypes: allTypes() } },
    });
    expect(result).toEqual({
      ok: false,
      error: "The model returned no valid assets. Try again.",
    });
  });
});

describe("assets.fromProject via runWorkspaceOperation — the panel's form-to-intent conversion (LLMW.UNIFY.PANEL.3)", () => {
  it("only vehicle and character requested -> assetTypes: ['character', 'vehicle'], in that order (not the checkbox order), and a non-requested type is dropped", async () => {
    callLLMJson.mockClear();
    // "Neon Alley" carries a type ("prop") that was not requested (only
    // "vehicle" and "character" are). The `postResponse` filter
    // (`assetsFromProject.filterByType`, `variables/registry.ts`) drops it —
    // LLMW.ASSETS.TYPEFILTER.1 (S2, 2026-08-17), unchanged by this ticket.
    callLLMJson.mockResolvedValueOnce(
      JSON.stringify({
        assets: [
          { name: "Getaway Bike", assetType: "vehicle" },
          { name: "Neon Alley", assetType: "prop" },
        ],
      })
    );

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId },
      // The panel's own six-`if` order (character, environment, prop,
      // vehicle, crowd, other, `AssetsLLMExtractPanel.tsx`) — only vehicle
      // and character are checked here.
      intent: { parameters: { includeShots: false, assetTypes: ["character", "vehicle"] } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    expect(callLLMJson).toHaveBeenCalledTimes(1);
    const [prompt] = callLLMJson.mock.calls[0] as [{ system: string; user: string }, unknown];
    expect(prompt.system).toContain("Asset types to extract: character, vehicle");
    // The deliberate divergence itself: "Neon Alley" (type "prop", not
    // requested) is dropped; "Getaway Bike" (type "vehicle", requested)
    // survives.
    expect(result.items.map((i) => i.name)).toEqual(["Getaway Bike"]);
  });
});

describe("assets.fromProject via runWorkspaceOperation — the empty asset-type-array guard (LLMW.UNIFY.PANEL.3)", () => {
  it("no asset type checked -> the exact precondition message, and no model call at all", async () => {
    callLLMJson.mockClear();

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId },
      intent: { parameters: { includeShots: false, assetTypes: [] } },
    });

    expect(result).toEqual({ ok: false, error: "Select at least one asset type." });
    expect(callLLMJson).not.toHaveBeenCalled();
  });
});

describe("assets.fromProject via runWorkspaceOperation — the narrative guard (LLMW.UNIFY.PANEL.3)", () => {
  it("no pitch/story/outline and no sequence -> the exact precondition message", async () => {
    const emptyProjectId = await insertProject(ctx, "Empty project");

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId: emptyProjectId },
      intent: { parameters: { includeShots: false, assetTypes: allTypes() } },
    });

    expect(result).toEqual({
      ok: false,
      error: "No narrative content found. Add a pitch, story, outline, or sequences first.",
    });
  });

  it("the same project, now with a Sequence, passes the narrative guard", async () => {
    const seqOnlyProjectId = await insertProject(ctx, "Sequence-only project");
    await insertSequence(ctx, seqOnlyProjectId, { title: "The only narrative source" });
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ assets: [] }));

    const result = await runWorkspaceOperation({
      descriptorId: "assets.fromProject",
      ids: { projectId: seqOnlyProjectId },
      intent: { parameters: { includeShots: false, assetTypes: allTypes() } },
    });

    // The model returns no assets, which is itself refused ("empty") — the
    // point is that the run reached the LLM call at all, i.e. the narrative
    // guard did not refuse it first.
    expect(result).toEqual({
      ok: false,
      error: "The model returned no valid assets. Try again.",
    });
  });
});
