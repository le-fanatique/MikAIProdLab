import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.MIGRATE.LIST.3 (B7f-m) — the same proof B7g-m already established for
// `sequenceGeneration.ts`, and B7e for `sequenceShots.ts`, reproduced here
// for `assetExtraction.ts`: the migrated `generateAssetCandidatesDraft`
// (adapter over `runOperation`) must return output that is *indiscernible*
// from the pre-migration `parseAssetsResult` + `normalizeCandidate` chain
// (`git show bd38db5:src/actions/llm/assetExtraction.ts`, the HEAD this
// ticket started from), for the same raw model response. Not "it works" —
// equality, field by field, computed by hand against the old, un-exported
// logic.
//
// The old chain rendered `null` for any string field absent, non-string, or
// empty after `trim()` (`str()`, old file lines 30-34). The runner's
// `parseListOutput` does not: `readStringField` (`runner.ts`) always returns
// a value — `""` for absent/non-string/empty, never `null`. That gap is
// exactly what the adapter (`src/actions/llm/assetExtraction.ts`) must close
// for the five `type: "string"` fields, exactly as B7e's and B7g-m's
// adapters closed it for their own string fields. `assetType` and
// `sourceLevel` need no such fill: both are `type: "enum"` fields with a
// mandatory `default` (`assetsFromProjectDescriptor.output.item.fields`), so
// `readEnumField` always produces one of their valid members, never `""`.
//
// This is also the migration where the two-parameter conversion
// (`includeShots` + `assetTypes`, from the form's seven booleans) and the
// empty-`assetTypes` guard are proven at the adapter level — the runner-level
// proof for both already exists in `assetsFromProject.runner.test.ts`; this
// file proves the *adapter* reproduces them, not the runner in isolation.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const callLLMJson = vi.fn<(prompt: unknown, config: unknown) => Promise<string>>();
vi.mock("@/lib/llm", () => ({ callLLMJson: (...args: [unknown, unknown]) => callLLMJson(...args) }));

// A `sourceExcerpt` longer than its declared bound (200) — both the old
// `str()` (`maxLen = 200`) and the runner's `truncateTo: 200` must cut it to
// exactly 200 characters, at the same offset.
const longSourceExcerpt = "E".repeat(250);

// Twenty extra, minimally valid raw items appended after the two items that
// exercise every field state below — pushing the *valid* item count past 20
// so the shared `.slice(0, 20)` behaviour (old code's own line, and the
// descriptor's own `maxItems: 20`) is exercised identically by both chains.
// No `sort` is declared on this descriptor (unlike `sequencesFromOutline`'s
// `order_index`), so both chains keep the raw array's own order.
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

// Computed by hand from the old, un-exported `normalizeCandidate` +
// `parseAssetsResult` (`git show bd38db5:src/actions/llm/assetExtraction.ts`,
// lines 30-81), applied to `rawModelResponse` above, then truncated to 20 (no
// sort on this side either). Comments mark exactly where each `null` comes
// from.
const expectedAssets = [
  {
    name: "Kai the Courier",
    assetType: "character",
    description: null, // absent -> str(undefined) -> null
    notes: null, // str("") -> trim() === "" -> null
    sourceLevel: "sequence", // valid primary key
    sourceExcerpt: longSourceExcerpt.slice(0, 200), // str(value, 200) -> sliced
    duplicateWarning: null, // absent -> str(undefined) -> null
  },
  {
    name: "Neon District",
    assetType: "other", // normalizeAssetType("unknown-type") -> not in VALID_ASSET_TYPES -> "other"
    description: "A dense, rain-lit district.",
    notes: "Recurring backdrop.",
    sourceLevel: "outline", // source_level: "not-a-real-level" is none of the four valid values -> "outline"
    sourceExcerpt: null, // absent -> str(undefined) -> null
    duplicateWarning: null, // absent -> str(undefined) -> null
  },
  ...paddingItems.slice(0, 18).map((p) => ({
    name: p.name,
    assetType: "other", // normalizeAssetType(undefined) -> "other"
    description: null,
    notes: null,
    sourceLevel: "outline", // rawSourceLevel undefined -> "outline"
    sourceExcerpt: null,
    duplicateWarning: null,
  })),
];

let ctx: TempDb;
let generateAssetCandidatesDraft: typeof import("@/actions/llm/assetExtraction").generateAssetCandidatesDraft;
let projectId: number;

async function makeProject(fields: { pitch?: string | null }): Promise<number> {
  const id = await insertProject(ctx, "Neon Skyline");
  await ctx.db.update(ctx.schema.projects).set(fields).where(eq(ctx.schema.projects.id, id));
  return id;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateAssetCandidatesDraft } = await import("@/actions/llm/assetExtraction"));

  projectId = await makeProject({ pitch: "A courier races across a rain-soaked megacity." });
});

afterAll(() => ctx.cleanup());

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function formWithAllTypes(projectId: number, extra: Record<string, string> = {}): FormData {
  return form({
    projectId: String(projectId),
    includeCharacters: "true",
    includeEnvironments: "true",
    includeProps: "true",
    includeVehicles: "true",
    includeCrowds: "true",
    includeOther: "true",
    ...extra,
  });
}

describe("generateAssetCandidatesDraft — old/new equality (LLMW.MIGRATE.LIST.3, B7f-m)", () => {
  it("returns output indiscernible from the pre-migration parseAssetsResult + normalizeCandidate chain", async () => {
    callLLMJson.mockResolvedValueOnce(rawModelResponse);

    const result = await generateAssetCandidatesDraft(formWithAllTypes(projectId));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Deep equality on the whole array — not field by field — so an extra
    // or missing key fails the test too.
    expect(result.assets).toEqual(expectedAssets);
    expect(result.assets.length).toBe(20);
  });

  it("reproduces the exact 'unparsable' message on a non-JSON model response", async () => {
    callLLMJson.mockResolvedValueOnce("not json at all");

    const result = await generateAssetCandidatesDraft(formWithAllTypes(projectId));
    expect(result).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });
  });

  it("reproduces the exact 'notArray' message when the assets key is absent", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ nope: [] }));

    const result = await generateAssetCandidatesDraft(formWithAllTypes(projectId));
    expect(result).toEqual({
      ok: false,
      error: "The model did not return an assets array. Try again.",
    });
  });

  it("reproduces the exact 'empty' message when every item is filtered (no name)", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ assets: [{ assetType: "prop" }] }));

    const result = await generateAssetCandidatesDraft(formWithAllTypes(projectId));
    expect(result).toEqual({
      ok: false,
      error: "The model returned no valid assets. Try again.",
    });
  });
});

describe("generateAssetCandidatesDraft — the form-to-intent conversion (LLMW.MIGRATE.LIST.3, B7f-m)", () => {
  it("only includeVehicles and includeCharacters checked -> assetTypes: ['character', 'vehicle'], in that order (not the checkbox order)", async () => {
    callLLMJson.mockClear();
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ assets: [{ name: "Getaway Bike", assetType: "vehicle" }] }));

    const result = await generateAssetCandidatesDraft(
      form({ projectId: String(projectId), includeVehicles: "true", includeCharacters: "true" })
    );

    // Both types are checked, so the call reaches the LLM — the six-`if`
    // order (character, environment, prop, vehicle, crowd, other) is the
    // only thing that can be observed — via the rendered prompt, which joins
    // `assetTypes` as-is (`assets-from-project.ts:52`).
    expect(result.ok).toBe(true);
    expect(callLLMJson).toHaveBeenCalledTimes(1);
    const [prompt] = callLLMJson.mock.calls[0] as [{ system: string; user: string }, unknown];
    expect(prompt.system).toContain("Asset types to extract: character, vehicle");
  });
});

describe("generateAssetCandidatesDraft — the empty asset-type-array guard (LLMW.MIGRATE.LIST.3, B7f-m)", () => {
  it("no asset type checked -> the exact precondition message, and no model call at all", async () => {
    callLLMJson.mockClear();

    const result = await generateAssetCandidatesDraft(form({ projectId: String(projectId) }));

    expect(result).toEqual({ ok: false, error: "Select at least one asset type." });
    expect(callLLMJson).not.toHaveBeenCalled();
  });
});

describe("generateAssetCandidatesDraft — the narrative guard (LLMW.MIGRATE.LIST.3, B7f-m)", () => {
  it("no pitch/story/outline and no sequence -> the exact precondition message", async () => {
    const emptyProjectId = await insertProject(ctx, "Empty project");

    const result = await generateAssetCandidatesDraft(formWithAllTypes(emptyProjectId));

    expect(result).toEqual({
      ok: false,
      error: "No narrative content found. Add a pitch, story, outline, or sequences first.",
    });
  });

  it("the same project, now with a Sequence, passes the narrative guard", async () => {
    const seqOnlyProjectId = await insertProject(ctx, "Sequence-only project");
    await insertSequence(ctx, seqOnlyProjectId, { title: "The only narrative source" });
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ assets: [] }));

    const result = await generateAssetCandidatesDraft(formWithAllTypes(seqOnlyProjectId));

    // The model returns no assets, which is itself refused ("empty") — the
    // point is that the run reached the LLM call at all, i.e. the narrative
    // guard did not refuse it first.
    expect(result).toEqual({
      ok: false,
      error: "The model returned no valid assets. Try again.",
    });
  });
});
