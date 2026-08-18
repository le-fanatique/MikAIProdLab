import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { shotInsertDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotInsertDirected";

// ---------------------------------------------------------------------------
// `shot.insertDirected` — LLMW.UC1.INSERT.1 (B11-b2). Same "no oracle"
// situation as `shot.retakeDirected` (B9b) and `asset.retakeDirected` (B10):
// no equality test exists on purpose. Proof is: runner-level assembly (every
// declared variable's fragment appears, the position is named in clear in
// both cases, the free consigne appears exactly once when filled and not at
// all when blank — in *both* messages, the piège that sent B9b and B10 back
// once each, at the user-message and system-message level respectively) and
// output parsing against the ten declared fields. This descriptor is not
// wired to the bench's Approve step (B11-b3's own scope) — no commit-side
// test here.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(),
}));

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;

let projectId: number;
let sequenceId: number;
let firstShotId: number;
let secondShotId: number;
let otherProjectId: number;
let otherSequenceId: number;

function mockedLLM() {
  return callLLMJson as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ resolveOperationPrompt, runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Insertion project");
  otherProjectId = await insertProject(ctx, "A different project");

  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A courier races across a rain-soaked megacity." })
    .where(eq(ctx.schema.projects.id, projectId));

  sequenceId = await insertSequence(ctx, projectId, {
    title: "Rooftop chase",
    summary: "A pursuit across the rooftops.",
    mood: "Tense",
    locationHint: "Downtown rooftops",
  });
  otherSequenceId = await insertSequence(ctx, otherProjectId, { title: "Unrelated sequence" });

  firstShotId = await insertShot(ctx, sequenceId, {
    title: "Vex gives chase",
    shotCode: "SH020",
    orderIndex: 0,
    description: "Vex sprints across the rooftop after the hero.",
    actionPitch: "Vex leaps a gap, closing the distance.",
    continuityOut: "Vex is one rooftop behind the hero.",
  });
  secondShotId = await insertShot(ctx, sequenceId, {
    title: "Hero looks back",
    shotCode: "SH030",
    orderIndex: 1,
    description: "The hero glances over their shoulder.",
    continuityIn: "The hero is running, Vex closing in.",
  });
});

afterAll(() => ctx.cleanup());

describe("shot.insertDirected — assembly (no oracle, §Pas d'oracle of the ticket)", () => {
  it("every declared variable's fragment appears in the resolved user prompt", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      {}
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    // PROJECT.IDENTITY
    expect(result.prompt.user).toContain("Project: Insertion project");
    expect(result.prompt.user).toContain("A courier races across a rain-soaked megacity.");
    // SEQ.CONTEXT
    expect(result.prompt.user).toContain("Sequence: Rooftop chase");
    expect(result.prompt.user).toContain("Mood: Tense");
    // SEQ.SHOT_TARGETS — LLMW.UC1.TUNE.2 (S7b), défaut 1: quoted title, no
    // em dash, so the model has nothing composed-looking to imitate into
    // its own `title` field.
    expect(result.prompt.user).toContain('SH020 "Vex gives chase"');
    expect(result.prompt.user).toContain('SH030 "Hero looks back"');
  });

  it("the position is named in clear when afterShotId names a real shot of this sequence", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { parameters: { afterShotId: firstShotId } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain('Insert the new shot after SH020 "Vex gives chase".');
  });

  it("the position is named in clear for a second shot of the same sequence too — not just the first", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { parameters: { afterShotId: secondShotId } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain('Insert the new shot after SH030 "Hero looks back".');
  });

  it("an afterShotId that does not belong to this sequence falls back to the start, the same safe text as an absent one", async () => {
    const foreignShotId = await insertShot(ctx, otherSequenceId, { title: "Foreign shot" });
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { parameters: { afterShotId: foreignShotId } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("Insert the new shot at the very start of the sequence.");
  });

  it("the position falls back to the start of the sequence when afterShotId is absent", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      {}
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("Insert the new shot at the very start of the sequence.");
  });

  it("the free consigne appears exactly once in the user message when given, and not at all when absent", async () => {
    const withoutNote = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      {}
    );
    expect(withoutNote.ok).toBe(true);
    if (!withoutNote.ok) throw new Error("unreachable");
    expect(withoutNote.prompt.user).not.toMatch(/Director's direction/);

    const withNote = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { freeText: "low to the ground, the hero enters and exits frame" }
    );
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) throw new Error("unreachable");
    expect(withNote.prompt.user).toContain(
      "Director's direction: low to the ground, the hero enters and exits frame"
    );
    expect((withNote.prompt.user.match(/Director's direction:/g) ?? []).length).toBe(1);
  });

  it("the free consigne's system-message reference appears exactly once when given, and not at all when absent (the piège that sent B9b and B10 back)", async () => {
    const withoutNote = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      {}
    );
    expect(withoutNote.ok).toBe(true);
    if (!withoutNote.ok) throw new Error("unreachable");
    expect(withoutNote.prompt.system).not.toMatch(/Answer the director's direction/);

    const withNote = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { freeText: "low to the ground, the hero enters and exits frame" }
    );
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) throw new Error("unreachable");
    expect(withNote.prompt.system).toContain(
      "- Answer the director's direction below. It is the brief, not a suggestion — if it names a camera height, an entrance, an exit or an intent, your shot must show it."
    );
    expect((withNote.prompt.system.match(/Answer the director's direction below/g) ?? []).length).toBe(1);
  });

  it("a whitespace-only consigne behaves like an absent one, in both messages", async () => {
    const base = await resolveOperationPrompt(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    const blank = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { freeText: "   " }
    );
    expect(blank).toEqual(base);
  });

  it("the system message carries the fixed role text and JSON schema, unaffected by the consigne", async () => {
    const result = await resolveOperationPrompt(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toContain("storyboard supervisor");
    expect(result.prompt.system).toContain('"duration_seconds"');
    expect(result.prompt.system).toContain('"continuity_in"');
    expect(result.prompt.system).toContain('"continuity_out"');
  });

  // LLMW.UC1.TUNE.1 (S7), défaut 1 et 2 — the two rule tunings, checked in
  // the rendered system message itself, not just recited from the ticket.
  it("the system message enumerates framing and camera_movement as closed sets and forbids intervals/combinations (défaut 1)", async () => {
    const result = await resolveOperationPrompt(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toContain("ECU, CU, MCU, MS, MLS, WS, EWS, OTS, POV");
    expect(result.prompt.system).toContain("static, pan, tilt, dolly in, dolly out, track, crane, handheld, zoom");
    expect(result.prompt.system).toMatch(/never an interval/i);
    expect(result.prompt.system).toMatch(/never a combination/i);
  });

  it("the system message scopes continuity_out to this shot's own ending, not the next shot's progress (défaut 2)", async () => {
    const result = await resolveOperationPrompt(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toContain(
      "continuity_out describes the state of the world at the end of this shot, and only this shot — never what the following shot goes on to accomplish."
    );
  });

  // LLMW.UC1.TUNE.3 (S7c) — `action_pitch` and `continuity_notes` gained
  // their own rule, filling the gap `framing`/`camera_movement`/
  // `duration_seconds` already had. Existing rules stay put — checked by
  // every assertion above still passing unchanged.
  it("the system message rules action_pitch as visible action, not the directive's own intention (LLMW.UC1.TUNE.3)", async () => {
    const result = await resolveOperationPrompt(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const matches = result.prompt.system.match(
      /action_pitch describes what happens on screen, in terms an animation team can act — who does what, in what order\. Never the intention behind the shot and never the effect you want it to have on the audience: that belongs to camera_pitch for the camera, and to nowhere else for anything not about the camera\. If the director's note gives you an intention, your job is to translate it into a visible action, not to copy it in\./g
    );
    expect(matches?.length).toBe(1);
  });

  it("the system message rules continuity_notes as material carry-over, not tone or a summary of the cut (LLMW.UC1.TUNE.3)", async () => {
    const result = await resolveOperationPrompt(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const matches = result.prompt.system.match(
      /continuity_notes lists the material elements the next shot must find again — props, lighting, costume, VFX, the position of objects\. Never the tone, never this shot's role in the sequence, never a summary of what it connects: continuity_in and continuity_out already describe the connection\./g
    );
    expect(matches?.length).toBe(1);
  });

  // LLMW.UC1.TUNE.2 (S7b), défaut 1 — the explicit "no code in title" rule,
  // plus the quoted rendering, on both a shot that has a code and one that
  // does not (the ticket's own two required cases).
  it("the system message states that title never carries a shot code (défaut 1, LLMW.UC1.TUNE.2)", async () => {
    const result = await resolveOperationPrompt(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toContain(
      "title is the name of the shot alone. It never contains a shot code — numbering is assigned by production, not by you — and no field you write should carry one either."
    );
  });

  it("the shot list and position line quote the title and drop the em dash, for a shot with a code", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { parameters: { afterShotId: firstShotId } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain('SH020 "Vex gives chase"');
    expect(result.prompt.user).toContain('Insert the new shot after SH020 "Vex gives chase".');
    expect(result.prompt.user).not.toMatch(/SH020 — /);
  });

  it("the shot list and position line render correctly for a shot with no code — title only, still no em dash", async () => {
    const codelessSequenceId = await insertSequence(ctx, projectId, { title: "Codeless sequence" });
    const codelessShotId = await insertShot(ctx, codelessSequenceId, { title: "Uncoded establishing shot" });
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId: codelessSequenceId },
      { parameters: { afterShotId: codelessShotId } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("[ID: " + codelessShotId + "] Uncoded establishing shot");
    expect(result.prompt.user).toContain("Insert the new shot after Uncoded establishing shot.");
    expect(result.prompt.user).not.toContain('"Uncoded establishing shot"');
  });
});

// ---------------------------------------------------------------------------
// LLMW.UC1.TUNE.2 (S7b), défaut 2 — `cameraPitch`'s bound, raised from 200 to
// 500 in the descriptor (`truncateTo: 500`), proven at the runner level: a
// value under the bound survives whole, one over it is cut at exactly 500 —
// the descriptor-side half of the "both sides stay equal" guarantee. The
// write-action half (`normalizeProposedShot`) is proven the same way in
// `tests/actions/registry.test.ts`.
// ---------------------------------------------------------------------------
describe("shot.insertDirected — cameraPitch bound (LLMW.UC1.TUNE.2, défaut 2)", () => {
  it("the descriptor declares cameraPitch's truncateTo as 500, not 200", () => {
    if (shotInsertDirectedDescriptor.output.kind !== "object") throw new Error("unreachable");
    const field = shotInsertDirectedDescriptor.output.fields.find((f) => f.field === "cameraPitch");
    if (field?.type !== "string") throw new Error("cameraPitch is expected to be a string field");
    expect(field.truncateTo).toBe(500);
  });

  it("a 400-character camera_pitch survives the runner whole, no truncation", async () => {
    const value = "x".repeat(400);
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "Shot", camera_pitch: value }));
    const result = await runOperation(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "object") throw new Error("unreachable");
    expect(result.values.cameraPitch).toBe(value);
  });

  it("a camera_pitch longer than 500 characters is cut at exactly 500", async () => {
    const value = "y".repeat(600);
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "Shot", camera_pitch: value }));
    const result = await runOperation(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "object") throw new Error("unreachable");
    expect(result.values.cameraPitch).toBe(value.slice(0, 500));
    expect((result.values.cameraPitch as string).length).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// LLMW.UC1.TUNE.1 (S7), défaut 3 — `shotInsert.shotListLines` neighbor
// selection. A six-shot sequence, every field long enough that the previous
// 200/150/100-char slicing would have cut it mid-word, to prove the new form
// carries neighbors whole and everyone else title-only.
// ---------------------------------------------------------------------------
describe("shot.insertDirected — shot list rendering (LLMW.UC1.TUNE.1, défaut 3)", () => {
  let longSequenceId: number;
  let longShotIds: number[];
  const longField =
    "Alpha alpha alpha alpha alpha bravo bravo bravo bravo bravo charlie charlie charlie charlie charlie delta delta delta delta delta echo echo echo echo echo.";

  function shotLine(prompt: string, id: number): string {
    const line = prompt.split("\n").find((l) => l.startsWith(`[ID: ${id}]`));
    if (line === undefined) throw new Error(`no rendered line for shot id ${id}`);
    return line;
  }

  beforeAll(async () => {
    longSequenceId = await insertSequence(ctx, projectId, { title: "Long sequence" });
    longShotIds = [];
    for (let i = 0; i < 6; i++) {
      const id = await insertShot(ctx, longSequenceId, {
        title: `Shot ${i}`,
        shotCode: `SH${i}00`,
        orderIndex: i,
        description: longField,
        actionPitch: longField,
        continuityIn: longField,
        continuityOut: longField,
      });
      longShotIds.push(id);
    }
  });

  it("the four shots framing the insertion point render in full, with no truncation anywhere", async () => {
    // afterShotId = longShotIds[2] -> insertionIndex 3 -> neighbors {1,2,3,4}
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId: longSequenceId },
      { parameters: { afterShotId: longShotIds[2] } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    for (const index of [1, 2, 3, 4]) {
      const line = shotLine(result.prompt.user, longShotIds[index]);
      expect(line).toContain(longField);
    }
    expect(result.prompt.user).not.toContain("…");
  });

  it('a shot outside the neighbor window renders only as [ID] Code "Title", none of its other fields', async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId: longSequenceId },
      { parameters: { afterShotId: longShotIds[2] } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // index 0 and 5 are outside {1,2,3,4}
    expect(shotLine(result.prompt.user, longShotIds[0])).toBe(`[ID: ${longShotIds[0]}] SH000 "Shot 0"`);
    expect(shotLine(result.prompt.user, longShotIds[5])).toBe(`[ID: ${longShotIds[5]}] SH500 "Shot 5"`);
  });

  it("afterShotId absent renders the first two shots of the sequence as the neighbors", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId: longSequenceId },
      {}
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(shotLine(result.prompt.user, longShotIds[0])).toContain(longField);
    expect(shotLine(result.prompt.user, longShotIds[1])).toContain(longField);
    // every other shot is title-only
    for (const index of [2, 3, 4, 5]) {
      const line = shotLine(result.prompt.user, longShotIds[index]);
      expect(line).toBe(`[ID: ${longShotIds[index]}] SH${index}00 "Shot ${index}"`);
    }
  });
});

describe("shot.insertDirected — chain refusal", () => {
  it("refuses a Sequence belonging to a different Project chain", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId: otherProjectId, sequenceId },
      {}
    );
    expect(result).toEqual({ ok: false, error: "Sequence not found." });
  });

  it("refuses a Project that does not exist", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId: projectId + 9000, sequenceId },
      {}
    );
    expect(result).toEqual({ ok: false, error: "Project not found." });
  });

  it("otherSequenceId is a real chain of its own, unaffected by the primary fixtures", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId: otherProjectId, sequenceId: otherSequenceId },
      {}
    );
    expect(result.ok).toBe(true);
  });
});

describe("shot.insertDirected — output parsing", () => {
  it("a complete model response produces all ten fields, durationSeconds as a number", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({
        title: "Hero enters and exits frame",
        description: "A low-angle shot as the hero crosses the frame.",
        duration_seconds: 4,
        action_pitch: "The hero runs in from screen left and exits right.",
        camera_pitch: "Ground-level static camera, hero crosses the whole frame.",
        continuity_notes: "Hero is still being chased by Vex.",
        framing: "WS",
        camera_movement: "static",
        continuity_in: "Vex is one rooftop behind the hero.",
        continuity_out: "The hero has crossed the rooftop, Vex not yet visible.",
      })
    );
    const result = await runOperation(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result).toEqual({
      ok: true,
      kind: "object",
      values: {
        title: "Hero enters and exits frame",
        description: "A low-angle shot as the hero crosses the frame.",
        durationSeconds: 4,
        actionPitch: "The hero runs in from screen left and exits right.",
        cameraPitch: "Ground-level static camera, hero crosses the whole frame.",
        continuityNotes: "Hero is still being chased by Vex.",
        framing: "WS",
        cameraMovement: "static",
        continuityIn: "Vex is one rooftop behind the hero.",
        continuityOut: "The hero has crossed the rooftop, Vex not yet visible.",
      },
    });
  });

  it("a duration outside (0, 120] is omitted, matching normalizeProposedShot's own bound", async () => {
    mockedLLM().mockResolvedValueOnce(
      JSON.stringify({ title: "Too long a shot", duration_seconds: 121 })
    );
    const result = await runOperation(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "object") throw new Error("unreachable");
    expect(result.values.durationSeconds).toBeUndefined();
    expect(result.values.title).toBe("Too long a shot");
  });

  it("an unparsable response gives the declared error", async () => {
    mockedLLM().mockResolvedValueOnce("not json {{{");
    const result = await runOperation(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result).toEqual({ ok: false, error: "The model returned an unexpected format. Try again." });
  });

  it("an empty response gives the declared error", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({}));
    const result = await runOperation(shotInsertDirectedDescriptor, { projectId, sequenceId }, {});
    expect(result).toEqual({ ok: false, error: "The model returned no shot data. Try again." });
  });
});
