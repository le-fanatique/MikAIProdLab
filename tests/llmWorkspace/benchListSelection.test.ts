import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, captureRedirect, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";
import { buildListSelectionPayload } from "@/lib/llmWorkspace/benchRun";

// ---------------------------------------------------------------------------
// LLMW.PROPOSAL.LIST.1 (B7d), §5 — the ticket's own "the proof that holds the
// ticket": the round trip from the real runner's items (keyed by entity
// field name) through `buildListSelectionPayload` (keyed by the model's own
// `jsonKey`) to the real write action's own normalization
// (`createGeneratedShots`'s `normalizeShot`, `src/actions/llm/sequenceShots.ts`).
//
// Neither `normalizeShot` nor `parseShotsResult` (`sequenceShots.ts`) is
// exported, and touching that file is out of this ticket's scope (§ "Hors
// scope"). The ticket's own text anticipates using one of them "si elle est
// exportable" — neither is. `createGeneratedShots` itself already is
// (`ACTION_BINDINGS` imports it): calling it end-to-end, against a real
// disposable database, exercises the exact normalization the write action
// actually runs, which is a strictly more faithful proof than importing
// `normalizeShot` in isolation would have been. `shotCode` is excluded from
// the field-by-field equality below on purpose — it is deliberately
// regenerated from the nomenclature template, never the model's proposed
// value (`ACTION_REGISTRY.createGeneratedShots`'s own note).
//
// B19d — `shotSize`/`cameraSubject` dropped from the round trip below, and
// asserted null instead. `shots.fromSequence`'s own `output.item.fields`
// now maps `shotSize` to the jsonKey `shot_size` (was `framing`) and no
// longer declares `cameraSubject` at all — but `sequenceShots.ts`'s
// `normalizeShot` (untouched, out of this ticket's scope: only the
// descriptor and `ACTION_REGISTRY`'s own declaration change) still only
// reads a raw `framing`/`camera_subject` key. The payload this test's own
// `buildListSelectionPayload` step builds carries `shot_size` /
// `camera_position` / `movement_speed` / `camera_subject` instead — keys
// `normalizeShot` does not recognize — so those two columns land `null` on
// the created row even though the runner item carried real values. This is
// a genuine gap this ticket leaves unrepaired (`.agents/executor_report.md`
// has the full account); `cameraMovement` alone still round-trips, its
// jsonKey unchanged.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const rawModelResponse = JSON.stringify({
  shots: [
    // index 0 — selected. Every field present, no bound to trigger, no empty
    // string: a clean round trip, so DB equality can be asserted directly.
    {
      title: "Rooftop Approach",
      shot_code: "MODEL_CODE_0",
      description: "The courier lands on the rooftop.",
      duration_seconds: 8,
      continuity_in: "Courier mid-air, package secured.",
      action_pitch: "A tense landing.",
      shot_size: "WS",
      camera_position: "low_angle",
      camera_movement: "pan",
      movement_speed: "gentle",
      camera_subject: "Camera pans with the courier as they land.",
      continuity_out: "Courier crouched on rooftop, package intact.",
      shot_prompt: "Wide low angle shot of a courier landing on a rain-soaked rooftop.",
    },
    // index 1 — NOT selected. `duration_seconds` out of bounds (omitted by
    // the runner's own "omit" fallback) and an empty string field
    // (`camera_subject`) — the ticket's own required shape for the mocked
    // response, proven through the runner's own list parsing, deliberately
    // left out of the selection so it never has to round-trip through the
    // write action's null-conversion for an empty string.
    {
      title: "Alley Turn",
      duration_seconds: 999,
      camera_subject: "",
    },
    // index 2 — selected. Same "clean" shape as index 0.
    {
      title: "Ledge Jump",
      shot_code: "MODEL_CODE_2",
      description: "The courier leaps to the next ledge.",
      duration_seconds: 12,
      continuity_in: "Courier crouched on rooftop, package intact.",
      action_pitch: "A daring leap across the gap.",
      shot_size: "MS",
      camera_position: "eye_level",
      camera_movement: "tracking",
      movement_speed: "smooth",
      camera_subject: "Camera tracks the courier across the gap.",
      continuity_out: "Courier airborne, mid-leap.",
      shot_prompt: "Medium tracking shot of a courier leaping between rooftops.",
    },
  ],
});

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => rawModelResponse),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let createGeneratedShots: typeof import("@/actions/llm/sequenceShots").createGeneratedShots;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ createGeneratedShots } = await import("@/actions/llm/sequenceShots"));

  projectId = await insertProject(ctx, "Neon Skyline");
});

afterAll(() => ctx.cleanup());

function itemFields() {
  if (shotsFromSequenceDescriptor.output.kind !== "list") throw new Error("unreachable");
  return shotsFromSequenceDescriptor.output.item.fields;
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("buildListSelectionPayload — the payload round trip proof (LLMW.PROPOSAL.LIST.1, B7d, §5)", () => {
  it("runner items -> partial, non-contiguous selection -> real write action -> DB row, field by field", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { title: "Rooftop chase", sequencePrompt: null });

    const result = await runOperation(shotsFromSequenceDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    expect(result.items).toHaveLength(3);

    // Non-contiguous, reverse-order selection: index 2 before index 0.
    const payload = buildListSelectionPayload(itemFields(), result.items, [2, 0]);
    const parsed = JSON.parse(payload) as Array<Record<string, unknown>>;

    // Order proof: the emitted order is 0, 2 — the list's own insertion
    // order — never the selection array's own [2, 0] order.
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe("Rooftop Approach");
    expect(parsed[1].title).toBe("Ledge Jump");

    const target = await captureRedirect(() =>
      createGeneratedShots(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          returnTo: "/test",
          shotsJson: payload,
        })
      )
    );
    expect(target).toContain("shotsCreated=2");

    const rows = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    const created = rows.sort((a, b) => a.orderIndex - b.orderIndex);
    expect(created).toHaveLength(2);

    const selectedItems = [result.items[0], result.items[2]];
    // `shotCode` deliberately excluded — regenerated from the nomenclature
    // template, never the model's own `shot_code` (see file header).
    // `shotSize`/`cameraSubject` deliberately excluded too (B19d, see file
    // header): `normalizeShot` no longer recognizes the jsonKeys this
    // payload now carries for them, so they do not round-trip — asserted
    // null explicitly right below instead of silently dropped from this
    // list.
    const roundTripFields = [
      "title",
      "description",
      "durationSeconds",
      "continuityIn",
      "actionPitch",
      "cameraMovement",
      "continuityOut",
      "shotPrompt",
    ] as const;

    for (let i = 0; i < selectedItems.length; i++) {
      const runnerItem = selectedItems[i];
      const createdRow = created[i] as unknown as Record<string, unknown>;
      for (const field of roundTripFields) {
        expect(createdRow[field]).toBe(runnerItem[field]);
      }
    }

    // This block recorded a gap until B19h closed it: `normalizeShot`
    // (`sequenceShots.ts`) had no path for the new axes' JSON keys, and still
    // read `framing` for the shot size after the instruction had been
    // rewritten to ask for `shot_size` — so Generate Shots stored no shot size
    // at all, and none of the other axes. Every one of them now survives onto
    // the created row, which is what these assertions exist to keep true.
    expect(selectedItems[0].shotSize).toBe("WS");
    expect(selectedItems[1].shotSize).toBe("MS");
    expect(created[0].shotSize).toBe("WS");
    expect(created[1].shotSize).toBe("MS");
    expect(created[0].cameraSubject).toBe("Camera pans with the courier as they land.");
    expect(created[0].cameraPosition).toBe("low_angle");
    expect(created[0].movementSpeed).toBe("gentle");

    // Distinct from the model's proposed values — proves shotCode really is
    // regenerated, not silently passed through by an accidental key match.
    expect(created[0].shotCode).not.toBe("MODEL_CODE_0");
    expect(created[1].shotCode).not.toBe("MODEL_CODE_2");
  });
});

describe("buildListSelectionPayload — edge cases", () => {
  const fields = itemFields();

  it("an empty selection serializes to \"[]\"", () => {
    const items = [{ title: "A", shotCode: "S1" }];
    expect(buildListSelectionPayload(fields, items, [])).toBe("[]");
  });

  it("an out-of-bounds index is ignored", () => {
    const items = [{ title: "A", shotCode: "S1" }];
    const payload = buildListSelectionPayload(fields, items, [0, 5, -1]);
    expect(JSON.parse(payload)).toEqual([{ title: "A", shot_code: "S1" }]);
  });
});
