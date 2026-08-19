import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.MIGRATE.LIST.2 (B7g-m) — originally the proof that the migrated
// `generateSequencesFromOutlineDraft` adapter reproduced the pre-migration
// `parseSequencesResult` + `normalizeSequence` chain (`git show
// e867636:src/actions/llm/sequenceGeneration.ts`) field by field, including
// its `"" -> null` fill-back for the six `type: "string"` fields.
//
// LLMW.UNIFY.PANEL.3 deletes that adapter: `SequencesGenerationPanel` now
// calls `runWorkspaceOperation` directly, and the fill-back this file used to
// prove moved into the panel (`toSequence`,
// `src/components/SequencesGenerationPanel.tsx`) — presentation the ticket
// keeps identical in behaviour but which this repo has no test harness for a
// client component to reach (`.agents/executor_report.md`, the same
// limitation `LLMW.UNIFY.PANEL.2`'s own report already recorded). What this
// file still proves, at the level `runWorkspaceOperation` now is: the *raw*
// item shape (`""` where the deleted adapter used to fill `null`), and every
// refusal message, are unchanged. `order_index` still needs no fill: the
// descriptor's own `fallback: "index"` makes it unconditionally present.
//
// The second proof this file always needed survives unchanged: the
// deterministic title/summary override
// (`sequencesFromOutlineDescriptor.postResponse`, LLMW.POSTRESPONSE.1, B7g)
// is applied by `runOperation` itself, regardless of caller — it needed no
// change and none is made here beyond calling `runWorkspaceOperation`
// instead of the deleted adapter.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const callLLMJson = vi.fn<(prompt: unknown, config: unknown) => Promise<string>>();
vi.mock("@/lib/llm", () => ({ callLLMJson: (...args: [unknown, unknown]) => callLLMJson(...args) }));

// A `location_hint` longer than its declared bound (300) — both the old
// `str()` (`maxLen = 300`) and the runner's `truncateTo: 300` must cut it to
// exactly 300 characters, at the same offset.
const longLocationHint = "L".repeat(350);
// A `narrative_purpose` longer than its declared bound (300) — same check,
// different field.
const longNarrativePurpose = "N".repeat(350);

// Raw items, in the model's own array order. `order_index` values are
// deliberately out of order (item 0 declares 5, item 2 declares 0) so the
// runner's own post-parse sort (`sort: { field: "orderIndex", direction:
// "asc" }`) and the old code's own `.sort((a,b) => a.order_index -
// b.order_index)` must agree on the same final order.
const rawModelResponse = JSON.stringify({
  sequences: [
    // Item 0 — exercises: an absent string field (`summary`), an empty
    // string field after trim (`description: ""`), a string field longer
    // than its bound (`narrative_purpose`, truncated to 300), and an
    // explicit `order_index` (5) that sorts this item last.
    {
      title: "Rooftop Confrontation",
      description: "",
      narrative_purpose: longNarrativePurpose,
      mood: "tense",
      location_hint: "Rooftop, dusk",
      order_index: 5,
    },
    // Item 1 — exercises: `order_index` absent entirely, so both chains fall
    // back to this item's own position in the raw array (1) — and every
    // other optional field absent (all fall back to `null` on both chains).
    {
      title: "Ledge Escape",
    },
    // Item 2 — exercises: a valid `summary`/`description`, an empty
    // `mood` after trim, a `location_hint` longer than its bound (truncated
    // to 300), and an explicit `order_index` (0) that sorts this item
    // first, even though it is third in the raw array.
    {
      title: "Final Stand",
      summary: "Full summary text.",
      description: "A rich description.",
      mood: "",
      location_hint: longLocationHint,
      order_index: 0,
    },
    // Item 3 — no `title`: filtered by both chains (`normalizeSequence`'s
    // sole gate on the old side; `item.validity: { fields: ["title"],
    // require: "all" }` on the runner side) — must not appear in the result
    // at all.
    {
      order_index: 1,
    },
  ],
});

// Computed by hand from `readStringField`/`readNumberField`
// (`src/lib/llmWorkspace/runner.ts`), applied to `rawModelResponse` above —
// `runWorkspaceOperation`'s raw shape (LLMW.UNIFY.PANEL.3), no longer the old
// adapter's null-filled one, then sorted by `order_index` ascending. Comments
// mark exactly where each `""` comes from.
const expectedSequences = [
  {
    title: "Final Stand", // order_index 0 -> sorts first
    summary: "Full summary text.",
    description: "A rich description.",
    narrative_purpose: "", // absent -> readStringField default ""
    mood: "", // "" after trim -> readStringField keeps ""
    location_hint: longLocationHint.slice(0, 300), // truncateTo: 300
    order_index: 0,
  },
  {
    title: "Ledge Escape", // order_index absent -> fallback to raw array position 1
    summary: "",
    description: "",
    narrative_purpose: "",
    mood: "",
    location_hint: "",
    order_index: 1,
  },
  {
    title: "Rooftop Confrontation", // order_index 5 -> sorts last
    summary: "",
    description: "",
    narrative_purpose: longNarrativePurpose.slice(0, 300), // truncateTo: 300
    mood: "tense",
    location_hint: "Rooftop, dusk",
    order_index: 5,
  },
];

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let projectId: number;

async function makeProject(fields: { pitch?: string | null; outline?: string | null }): Promise<number> {
  const id = await insertProject(ctx, "Neon Skyline");
  await ctx.db.update(ctx.schema.projects).set(fields).where(eq(ctx.schema.projects.id, id));
  return id;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));

  // No outline: `postResponse`'s own guard (`outlineSections.length === 0`)
  // never fires, isolating the raw-shape proof below from the separate
  // postResponse-survival proof further down.
  projectId = await makeProject({ pitch: "A courier races across a rain-soaked megacity.", outline: null });
});

afterAll(() => ctx.cleanup());

describe("sequences.fromOutline via runWorkspaceOperation — raw item shape (LLMW.UNIFY.PANEL.3, was LLMW.MIGRATE.LIST.2)", () => {
  it("returns items in the model's own JSON keys, matching readStringField/readNumberField's own raw behaviour", async () => {
    callLLMJson.mockResolvedValueOnce(rawModelResponse);

    const result = await runWorkspaceOperation({ descriptorId: "sequences.fromOutline", ids: { projectId } });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    // Deep equality on the whole array — not field by field — so an extra
    // or missing key fails the test too.
    expect(result.items).toEqual(expectedSequences);
  });

  it("reproduces the exact 'unparsable' message on a non-JSON model response", async () => {
    callLLMJson.mockResolvedValueOnce("not json at all");

    const result = await runWorkspaceOperation({ descriptorId: "sequences.fromOutline", ids: { projectId } });
    expect(result).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again or use a different model.",
    });
  });

  it("reproduces the exact 'notArray' message when the sequences key is absent", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ nope: [] }));

    const result = await runWorkspaceOperation({ descriptorId: "sequences.fromOutline", ids: { projectId } });
    expect(result).toEqual({
      ok: false,
      error: "The model did not return a sequences array. Try again.",
    });
  });

  it("reproduces the exact 'empty' message when every item is filtered (no title)", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ sequences: [{ order_index: 0 }] }));

    const result = await runWorkspaceOperation({ descriptorId: "sequences.fromOutline", ids: { projectId } });
    expect(result).toEqual({
      ok: false,
      error: "The model returned no valid sequences. Try again.",
    });
  });
});

describe("sequences.fromOutline via runWorkspaceOperation — postResponse survives the migration (LLMW.UNIFY.PANEL.3, was LLMW.MIGRATE.LIST.2)", () => {
  it("targetCount absent + N sections + N items -> title and summary come from the outline sections", async () => {
    const outlineProjectId = await makeProject({
      pitch: "A pitch.",
      outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
    });
    callLLMJson.mockResolvedValueOnce(
      JSON.stringify({
        sequences: [
          { title: "Model title A", summary: "Model summary A", order_index: 0 },
          { title: "Model title B", summary: "Model summary B", order_index: 1 },
        ],
      })
    );

    const result = await runWorkspaceOperation({ descriptorId: "sequences.fromOutline", ids: { projectId: outlineProjectId } });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    expect(result.items.map((i) => ({ title: i.title, summary: i.summary }))).toEqual([
      { title: "Opening", summary: "The courier receives the package." },
      { title: "Chase", summary: "A rooftop pursuit begins." },
    ]);
  });
});
