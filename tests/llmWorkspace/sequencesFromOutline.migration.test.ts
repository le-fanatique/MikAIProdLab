import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.MIGRATE.LIST.2 (B7g-m) — the same proof B7e already established for
// `sequenceShots.ts`, reproduced here for `sequenceGeneration.ts`: the
// migrated `generateSequencesFromOutlineDraft` (adapter over `runOperation`)
// must return output that is *indiscernible* from the pre-migration
// `parseSequencesResult` + `normalizeSequence` chain (`git show
// e867636:src/actions/llm/sequenceGeneration.ts`), for the same raw model
// response. Not "it works" — equality, field by field, computed by hand
// against the old, un-exported logic.
//
// The old chain rendered `null` for any string field absent, non-string, or
// empty after `trim()` (`str()`, old file lines 25-29). The runner's
// `parseListOutput` does not: `readStringField` (`runner.ts`) always returns
// a value — `""` for absent/non-string/empty, never `null`. That gap is
// named in the ticket's own risk section, and is exactly what the adapter
// (`src/actions/llm/sequenceGeneration.ts`) must close, exactly as B7e's
// adapter closed it for shots. `order_index` needs no such fill: the
// descriptor declares `fallback: "index"` (not `fallback: "omit"`, unlike
// `duration_seconds` on the shots side), and the runner's `readNumberField`
// makes that fallback branch unconditionally present — so both chains always
// produce a number, never a gap.
//
// A second proof this ticket alone needs (B7e's shots descriptor declares no
// `postResponse`): the deterministic title/summary override that used to be
// a local block in this same file (`sequenceGeneration.ts:148-158`
// pre-migration) is now the descriptor's own `postResponse`
// (`sequencesFromOutlineDescriptor.postResponse`, LLMW.POSTRESPONSE.1, B7g).
// The rule must survive the migration even though its local copy in this
// file was removed in the same diff — proven below by exercising the
// adapter itself, not the runner directly (`sequencesFromOutline.runner.test.ts`
// already covers the runner side).
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

// Computed by hand from the old, un-exported `normalizeSequence` +
// `parseSequencesResult` (`git show
// e867636:src/actions/llm/sequenceGeneration.ts`, lines 25-71), applied to
// `rawModelResponse` above, then sorted by `order_index` ascending. Comments
// mark exactly where each `null` comes from.
const expectedSequences = [
  {
    title: "Final Stand", // order_index 0 -> sorts first
    summary: "Full summary text.",
    description: "A rich description.",
    narrative_purpose: null, // absent -> str(undefined) -> null
    mood: null, // str("") -> trim() === "" -> null
    location_hint: longLocationHint.slice(0, 300), // str(value, 300) -> sliced
    order_index: 0,
  },
  {
    title: "Ledge Escape", // order_index absent -> fallback to raw array position 1
    summary: null,
    description: null,
    narrative_purpose: null,
    mood: null,
    location_hint: null,
    order_index: 1,
  },
  {
    title: "Rooftop Confrontation", // order_index 5 -> sorts last
    summary: null, // absent -> str(undefined) -> null
    description: null, // str("") -> trim() === "" -> null
    narrative_purpose: longNarrativePurpose.slice(0, 300), // str(value, 300) -> sliced
    mood: "tense",
    location_hint: "Rooftop, dusk",
    order_index: 5,
  },
];

let ctx: TempDb;
let generateSequencesFromOutlineDraft: typeof import("@/actions/llm/sequenceGeneration").generateSequencesFromOutlineDraft;
let projectId: number;

async function makeProject(fields: { pitch?: string | null; outline?: string | null }): Promise<number> {
  const id = await insertProject(ctx, "Neon Skyline");
  await ctx.db.update(ctx.schema.projects).set(fields).where(eq(ctx.schema.projects.id, id));
  return id;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateSequencesFromOutlineDraft } = await import("@/actions/llm/sequenceGeneration"));

  // No outline: `postResponse`'s own guard (`outlineSections.length === 0`)
  // never fires, isolating the indiscernibility proof below from the
  // separate postResponse-survival proof further down.
  projectId = await makeProject({ pitch: "A courier races across a rain-soaked megacity.", outline: null });
});

afterAll(() => ctx.cleanup());

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("generateSequencesFromOutlineDraft — old/new equality (LLMW.MIGRATE.LIST.2, B7g-m)", () => {
  it("returns output indiscernible from the pre-migration parseSequencesResult + normalizeSequence chain", async () => {
    callLLMJson.mockResolvedValueOnce(rawModelResponse);

    const result = await generateSequencesFromOutlineDraft(form({ projectId: String(projectId) }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Deep equality on the whole array — not field by field — so an extra
    // or missing key fails the test too.
    expect(result.sequences).toEqual(expectedSequences);
  });

  it("reproduces the exact 'unparsable' message on a non-JSON model response", async () => {
    callLLMJson.mockResolvedValueOnce("not json at all");

    const result = await generateSequencesFromOutlineDraft(form({ projectId: String(projectId) }));
    expect(result).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again or use a different model.",
    });
  });

  it("reproduces the exact 'notArray' message when the sequences key is absent", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ nope: [] }));

    const result = await generateSequencesFromOutlineDraft(form({ projectId: String(projectId) }));
    expect(result).toEqual({
      ok: false,
      error: "The model did not return a sequences array. Try again.",
    });
  });

  it("reproduces the exact 'empty' message when every item is filtered (no title)", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ sequences: [{ order_index: 0 }] }));

    const result = await generateSequencesFromOutlineDraft(form({ projectId: String(projectId) }));
    expect(result).toEqual({
      ok: false,
      error: "The model returned no valid sequences. Try again.",
    });
  });
});

describe("generateSequencesFromOutlineDraft — postResponse survives the migration (LLMW.MIGRATE.LIST.2, B7g-m)", () => {
  it("targetCount absent + N sections + N items -> title and summary come from the outline sections, via the adapter", async () => {
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

    const result = await generateSequencesFromOutlineDraft(form({ projectId: String(outlineProjectId) }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.sequences.map((s) => ({ title: s.title, summary: s.summary }))).toEqual([
      { title: "Opening", summary: "The courier receives the package." },
      { title: "Chase", summary: "A rooftop pursuit begins." },
    ]);
  });
});
