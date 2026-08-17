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
    // SEQ.SHOT_TARGETS
    expect(result.prompt.user).toContain("SH020 — Vex gives chase");
    expect(result.prompt.user).toContain("SH030 — Hero looks back");
  });

  it("the position is named in clear when afterShotId names a real shot of this sequence", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { parameters: { afterShotId: firstShotId } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("Insert the new shot after SH020 — Vex gives chase.");
  });

  it("the position is named in clear for a second shot of the same sequence too — not just the first", async () => {
    const result = await resolveOperationPrompt(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      { parameters: { afterShotId: secondShotId } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("Insert the new shot after SH030 — Hero looks back.");
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
