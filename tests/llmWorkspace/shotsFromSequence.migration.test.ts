import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.MIGRATE.LIST.1 (B7e) — originally the proof that the migrated
// `generateShotsFromSequenceDraft` adapter reproduced the pre-migration
// `parseShotsResult` + `normalizeShot` chain (`git show
// f892850:src/actions/llm/sequenceShots.ts`) field by field, including its
// `"" -> null` / out-of-bounds-> `null` fill-back.
//
// LLMW.UNIFY.PANEL.3 deletes that adapter: `SequenceShotsLLMAssistPanel` now
// calls `runWorkspaceOperation` directly, and the fill-back this file used to
// prove moved into the panel (`toShot`, `src/components/SequenceShotsLLMAssistPanel.tsx`)
// — presentation the ticket keeps identical in behaviour but which this repo
// has no test harness for a client component to reach
// (`.agents/executor_report.md`, same limitation `LLMW.UNIFY.PANEL.2`'s own
// report already recorded). What this file still proves, at the level
// `runWorkspaceOperation` now is: the *raw* item shape — `""` for an absent
// or blank string field (not `null`), `duration_seconds` omitted, not
// present-as-`null`, when absent or out of bounds — is unchanged, and every
// refusal message is unchanged verbatim.
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

// Computed by hand from `readStringField`/`readNumberField`
// (`src/lib/llmWorkspace/runner.ts`), applied to `rawModelResponse` above —
// `runWorkspaceOperation`'s raw shape (LLMW.UNIFY.PANEL.3), no longer the old
// adapter's null-filled one. Comments mark exactly where each `""` /
// omission comes from.
const expectedShots = [
  {
    title: "Rooftop Confrontation",
    shot_code: "", // absent -> readStringField's own default, ""
    description: "", // "" after trim -> readStringField keeps ""
    // duration_seconds: 999 > 120 -> readNumberField's fallback: "omit" drops
    // the key entirely.
    continuity_in: "Courier arrives, tense standoff.",
    action_pitch: "A dramatic pause before the confrontation.",
    camera_pitch: longCameraPitch.slice(0, 200), // truncateTo: 200
    framing: "wide",
    camera_movement: "static",
    continuity_out: "Courier and rival face off, weapons drawn.",
    shot_prompt: "Wide static shot of two figures facing off on a rooftop at dusk.",
  },
  {
    title: "Ledge Escape",
    shot_code: "",
    description: "",
    duration_seconds: 45, // 0 < 45 <= 120 -> kept as-is
    continuity_in: "",
    action_pitch: "",
    camera_pitch: "",
    framing: "",
    camera_movement: "",
    continuity_out: "",
    shot_prompt: "",
  },
  // Item 2 (no title) is absent from this array entirely.
];

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let projectId: number;
let sequenceId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));

  projectId = await insertProject(ctx, "Neon Skyline");
  sequenceId = await insertSequence(ctx, projectId, { title: "Rooftop chase", sequencePrompt: null });
});

afterAll(() => ctx.cleanup());

describe("shots.fromSequence via runWorkspaceOperation — raw item shape (LLMW.UNIFY.PANEL.3, was LLMW.MIGRATE.LIST.1)", () => {
  it("returns items in the model's own JSON keys, matching readStringField/readNumberField's own raw behaviour", async () => {
    callLLMJson.mockResolvedValueOnce(rawModelResponse);

    const result = await runWorkspaceOperation({
      descriptorId: "shots.fromSequence",
      ids: { projectId, sequenceId },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    // Deep equality on the whole array — not field by field — so an extra
    // or missing key fails the test too.
    expect(result.items).toEqual(expectedShots);
  });

  it("reproduces the exact 'unparsable' message on a non-JSON model response", async () => {
    callLLMJson.mockResolvedValueOnce("not json at all");

    const result = await runWorkspaceOperation({ descriptorId: "shots.fromSequence", ids: { projectId, sequenceId } });
    expect(result).toEqual({ ok: false, error: "The model returned an unexpected format. Try again." });
  });

  it("reproduces the exact 'notArray' message when the shots key is absent", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ nope: [] }));

    const result = await runWorkspaceOperation({ descriptorId: "shots.fromSequence", ids: { projectId, sequenceId } });
    expect(result).toEqual({ ok: false, error: "The model did not return a shots array. Try again." });
  });

  it("reproduces the exact 'empty' message when every item is filtered (no title)", async () => {
    callLLMJson.mockResolvedValueOnce(JSON.stringify({ shots: [{ shot_code: "NO_TITLE" }] }));

    const result = await runWorkspaceOperation({ descriptorId: "shots.fromSequence", ids: { projectId, sequenceId } });
    expect(result).toEqual({ ok: false, error: "The model returned no valid shots. Try again." });
  });
});
