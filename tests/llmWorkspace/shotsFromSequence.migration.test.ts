import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.MIGRATE.LIST.1 (B7e) — the proof that holds the ticket: the migrated
// `generateShotsFromSequenceDraft` (adapter over `runOperation`) must return
// output that is *indiscernible* from the pre-migration
// `parseShotsResult` + `normalizeShot` chain (`git show
// f892850:src/actions/llm/sequenceShots.ts`), for the same raw model
// response. Not "it works" — equality, field by field, computed by hand
// against the old, un-exported logic.
//
// The old chain rendered `null` for any field absent, non-string, or empty
// after `trim()` (`str()`, old file lines 17-21) and for an out-of-bounds
// `duration_seconds` (lines 29-34). The runner's `parseListOutput` does not:
// `readStringField` (`runner.ts`) always returns a value — `""` for
// absent/non-string/empty, never `null` — and `readNumberField`'s
// `fallback: "omit"` drops an out-of-bounds numeric field from the item
// entirely, rather than keeping the key with `null`. Both gaps are named in
// the ticket's own risk section, and are exactly what the adapter
// (`src/actions/llm/sequenceShots.ts`) must close.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const callLLMJson = vi.fn<(prompt: unknown, config: unknown) => Promise<string>>();
vi.mock("@/lib/llm", () => ({ callLLMJson: (...args: [unknown, unknown]) => callLLMJson(...args) }));

// A camera_pitch longer than its declared bound (200) — both the old `str()`
// (`maxLen = 200`) and the runner's `truncateTo: 200` must cut it to exactly
// 200 characters, at the same offset.
const longCameraPitch = "P".repeat(250);

const rawModelResponse = JSON.stringify({
  shots: [
    // Item 0 — exercises: an absent string field (`shot_code`), an empty
    // string field after trim (`description: ""`), an out-of-bounds
    // `duration_seconds` (999 > 120), and a string field longer than its
    // bound (`camera_pitch`, truncated to 200).
    {
      title: "Rooftop Confrontation",
      // shot_code: absent entirely.
      description: "",
      duration_seconds: 999,
      continuity_in: "Courier arrives, tense standoff.",
      action_pitch: "A dramatic pause before the confrontation.",
      camera_pitch: longCameraPitch,
      framing: "wide",
      camera_movement: "static",
      continuity_out: "Courier and rival face off, weapons drawn.",
      shot_prompt: "Wide static shot of two figures facing off on a rooftop at dusk.",
    },
    // Item 1 — exercises: a valid `duration_seconds` (45, kept as-is), and
    // every other optional field absent (all fall back to `null` on both
    // chains).
    {
      title: "Ledge Escape",
      duration_seconds: 45,
    },
    // Item 2 — no `title`: filtered by both chains (`normalizeShot`'s sole
    // gate on the old side; `item.validity: { fields: ["title"], require:
    // "all" }` on the runner side) — must not appear in the result at all.
    {
      shot_code: "NO_TITLE",
    },
  ],
});

// Computed by hand from the old, un-exported `normalizeShot` +
// `parseShotsResult` (`git show f892850:src/actions/llm/sequenceShots.ts`,
// lines 17-68), applied to `rawModelResponse` above. Comments mark exactly
// where each `null` comes from.
const expectedShots = [
  {
    title: "Rooftop Confrontation",
    shot_code: null, // str(undefined) -> typeof !== "string" -> null
    description: null, // str("") -> trim() === "" -> null
    duration_seconds: null, // 999 > 120 -> dur = null
    continuity_in: "Courier arrives, tense standoff.",
    action_pitch: "A dramatic pause before the confrontation.",
    camera_pitch: longCameraPitch.slice(0, 200), // str(value, 200) -> sliced
    framing: "wide",
    camera_movement: "static",
    continuity_out: "Courier and rival face off, weapons drawn.",
    shot_prompt: "Wide static shot of two figures facing off on a rooftop at dusk.",
  },
  {
    title: "Ledge Escape",
    shot_code: null, // absent -> str(undefined) -> null
    description: null, // absent -> null
    duration_seconds: 45, // 0 < 45 <= 120 -> kept as-is
    continuity_in: null, // absent -> null
    action_pitch: null, // absent -> null
    camera_pitch: null, // absent -> null
    framing: null, // absent -> null
    camera_movement: null, // absent -> null
    continuity_out: null, // absent -> null
    shot_prompt: null, // absent -> null
  },
  // Item 2 (no title) is absent from this array entirely.
];

let ctx: TempDb;
let generateShotsFromSequenceDraft: typeof import("@/actions/llm/sequenceShots").generateShotsFromSequenceDraft;
let projectId: number;
let sequenceId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateShotsFromSequenceDraft } = await import("@/actions/llm/sequenceShots"));

  projectId = await insertProject(ctx, "Neon Skyline");
  sequenceId = await insertSequence(ctx, projectId, { title: "Rooftop chase", sequencePrompt: null });
});

afterAll(() => ctx.cleanup());

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("generateShotsFromSequenceDraft — old/new equality (LLMW.MIGRATE.LIST.1, B7e)", () => {
  it("returns output indiscernible from the pre-migration parseShotsResult + normalizeShot chain", async () => {
    callLLMJson.mockResolvedValueOnce(rawModelResponse);

    const result = await generateShotsFromSequenceDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId) })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Deep equality on the whole array — not field by field — so an extra
    // or missing key fails the test too.
    expect(result.shots).toEqual(expectedShots);
  });

  it("reproduces the exact 'unparsable' message on a non-JSON model response", async () => {
    callLLMJson.mockResolvedValueOnce("not json at all");

    const result = await generateShotsFromSequenceDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId) })
    );
    expect(result).toEqual({ ok: false, error: "The model returned an unexpected format. Try again." });
  });

  it("reproduces the exact 'notArray' message when the shots key is absent", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ nope: [] }));

    const result = await generateShotsFromSequenceDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId) })
    );
    expect(result).toEqual({ ok: false, error: "The model did not return a shots array. Try again." });
  });

  it("reproduces the exact 'empty' message when every item is filtered (no title)", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ shots: [{ shot_code: "NO_TITLE" }] }));

    const result = await generateShotsFromSequenceDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId) })
    );
    expect(result).toEqual({ ok: false, error: "The model returned no valid shots. Try again." });
  });
});
