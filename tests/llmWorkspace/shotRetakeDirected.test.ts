import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, readShot } from "../actions/helpers/fixtures";
import { shotRetakeDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotRetakeDirected";

// ---------------------------------------------------------------------------
// `shot.retakeDirected` — LLMW.UC2.RETAKE.1 (B9b). §3 of the ticket: this is
// the first descriptor with no oracle to compare against — no equality test
// exists here on purpose. Proof is: runner-level assembly (every declared
// variable's fragment actually appears, the free consigne appears once and
// disappears when blank), chain refusal (same discipline as every other
// descriptor), output parsing, and — the test that matters most (§4.3 /
// §5 of the ticket) — a real commit through `generateShotRetakeDraft` +
// `buildShotRetakeCommitArgs` + `updateShotNarrativeContext`, re-reading the
// row from the database afterward, proving an unproposed field survives.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ description: "", action_pitch: "New action.", camera_pitch: "" })),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let updateShotNarrativeContext: typeof import("@/actions/shots").updateShotNarrativeContext;
let buildShotRetakeCommitArgs: typeof import("@/lib/llmWorkspace/actions/proposalCommit").buildShotRetakeCommitArgs;

let projectId: number;
let sequenceId: number;
let shotId: number;
let otherProjectId: number;
let otherSequenceId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));
  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
  ({ updateShotNarrativeContext } = await import("@/actions/shots"));
  ({ buildShotRetakeCommitArgs } = await import("@/lib/llmWorkspace/actions/proposalCommit"));

  projectId = await insertProject(ctx, "Retake project");
  otherProjectId = await insertProject(ctx, "A different project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A courier races across a rain-soaked megacity.", story: "A long story text.".repeat(20) })
    .where(eq(ctx.schema.projects.id, projectId));

  sequenceId = await insertSequence(ctx, projectId, {
    title: "Rooftop chase",
    summary: "A pursuit across the rooftops.",
    mood: "Tense",
    locationHint: "Downtown rooftops",
  });
  otherSequenceId = await insertSequence(ctx, otherProjectId, { title: "Unrelated sequence" });

  shotId = await insertShot(ctx, sequenceId, {
    title: "Hero enters",
    shotCode: "SH01",
    orderIndex: 0,
    description: "The hero steps into frame, cold and distant.",
    actionPitch: "Walks forward, looks up.",
    cameraPitch: "Slow push-in.",
  });
  await insertShot(ctx, sequenceId, {
    title: "Sibling shot",
    shotCode: "SH02",
    orderIndex: 1,
    description: "A rooftop establishing shot.",
    actionPitch: "Wind blows across the rooftop.",
  });
});

afterAll(() => ctx.cleanup());

describe("shot.retakeDirected — assembly (no oracle, §3 of the ticket)", () => {
  it("every declared variable's fragment appears in the resolved user prompt", async () => {
    const result = await resolveOperationPrompt(
      shotRetakeDirectedDescriptor,
      { projectId, sequenceId, shotId },
      {}
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    // SHOT.CORE
    expect(result.prompt.user).toContain("SH01 — Hero enters");
    expect(result.prompt.user).toContain("The hero steps into frame, cold and distant.");
    // SHOT.CAST is empty for this shot (no cast assigned) — no assertion,
    // its render form returns "" and is dropped, proven separately below.
    // SEQ.SHOTS (other shots), current shot excluded — "SH01" appears exactly
    // once (in the SHOT.CORE line above), never repeated in the SEQ.SHOTS block.
    expect(result.prompt.user).toContain("Other shots in this sequence:");
    expect(result.prompt.user).toContain("SH02");
    expect((result.prompt.user.match(/SH01/g) ?? []).length).toBe(1);
    // SEQ.CONTEXT
    expect(result.prompt.user).toContain("Sequence: Rooftop chase");
    expect(result.prompt.user).toContain("Mood: Tense");
    // PROJECT.IDENTITY
    expect(result.prompt.user).toContain("Project pitch: A courier races across a rain-soaked megacity.");
  });

  it("SHOT.CAST's fragment appears once cast is assigned", async () => {
    const { eq } = await import("drizzle-orm");
    const [asset] = await ctx.db
      .insert(ctx.schema.assets)
      .values({ projectId, name: "Courier", type: "character", description: "Weathered jacket." })
      .returning({ id: ctx.schema.assets.id });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId: asset.id });

    const result = await resolveOperationPrompt(shotRetakeDirectedDescriptor, { projectId, sequenceId, shotId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("Cast in this shot: Courier (character: Weathered jacket.)");

    // Cleanup so later assertions in this file are unaffected.
    await ctx.db.delete(ctx.schema.shotAssets).where(eq(ctx.schema.shotAssets.shotId, shotId));
  });

  it("the free consigne appears exactly once when given, and not at all when absent", async () => {
    const withoutNote = await resolveOperationPrompt(
      shotRetakeDirectedDescriptor,
      { projectId, sequenceId, shotId },
      {}
    );
    expect(withoutNote.ok).toBe(true);
    if (!withoutNote.ok) throw new Error("unreachable");
    expect(withoutNote.prompt.user).not.toMatch(/Director's direction/);

    const withNote = await resolveOperationPrompt(
      shotRetakeDirectedDescriptor,
      { projectId, sequenceId, shotId },
      { freeText: "more empathy with the character" }
    );
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) throw new Error("unreachable");
    expect(withNote.prompt.user).toContain("Director's direction: more empathy with the character");
    expect((withNote.prompt.user.match(/Director's direction:/g) ?? []).length).toBe(1);
  });

  it("with an empty consigne, the prompt makes no reference to an absent directive (supervisor review regression)", async () => {
    // The bug this test exists to catch: the closing instruction used to say
    // "per the director's direction above", but the `freeText` block right
    // above it disappears entirely (§4.1 of B9a's ticket) when the consigne
    // is blank — leaving the model pointed at a directive that was not in
    // the prompt at all.
    const result = await resolveOperationPrompt(shotRetakeDirectedDescriptor, { projectId, sequenceId, shotId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).not.toMatch(/Director's direction/);
    expect(result.prompt.user).not.toMatch(/direction above/i);
    expect(result.prompt.user).toContain(
      "Propose an updated description, action pitch and/or camera pitch for this shot."
    );
  });

  it("a whitespace-only consigne behaves like an absent one", async () => {
    const base = await resolveOperationPrompt(shotRetakeDirectedDescriptor, { projectId, sequenceId, shotId }, {});
    const blank = await resolveOperationPrompt(
      shotRetakeDirectedDescriptor,
      { projectId, sequenceId, shotId },
      { freeText: "   " }
    );
    expect(blank).toEqual(base);
  });

  it("the system message carries the fixed role/rules text and JSON schema, unaffected by the consigne", async () => {
    const result = await resolveOperationPrompt(shotRetakeDirectedDescriptor, { projectId, sequenceId, shotId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toContain("shot-direction supervisor");
    expect(result.prompt.system).toContain('"description"');
    expect(result.prompt.system).toContain('"action_pitch"');
    expect(result.prompt.system).toContain('"camera_pitch"');
  });
});

describe("shot.retakeDirected — chain refusal", () => {
  it("refuses a Shot belonging to a different Sequence chain", async () => {
    const result = await resolveOperationPrompt(
      shotRetakeDirectedDescriptor,
      { projectId: otherProjectId, sequenceId: otherSequenceId, shotId },
      {}
    );
    expect(result).toEqual({ ok: false, error: "Shot not found." });
  });

  it("refuses a Project that does not exist", async () => {
    const result = await resolveOperationPrompt(
      shotRetakeDirectedDescriptor,
      { projectId: projectId + 9000, sequenceId, shotId },
      {}
    );
    expect(result).toEqual({ ok: false, error: "Project not found." });
  });
});

describe("shot.retakeDirected — output parsing", () => {
  it("valid, unparsable and empty responses give the declared output.errors messages", async () => {
    const mocked = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mocked.mockResolvedValueOnce(
      JSON.stringify({ description: "", action_pitch: "New action.", camera_pitch: "" })
    );
    const valid = await runOperation(shotRetakeDirectedDescriptor, { projectId, sequenceId, shotId }, {});
    expect(valid).toEqual({
      ok: true,
      kind: "object",
      values: { description: "", actionPitch: "New action.", cameraPitch: "" },
    });

    mocked.mockResolvedValueOnce("not json {{{");
    const unparsable = await runOperation(shotRetakeDirectedDescriptor, { projectId, sequenceId, shotId }, {});
    expect(unparsable).toEqual({ ok: false, error: "The model returned an unexpected format. Try again." });

    mocked.mockResolvedValueOnce(JSON.stringify({ description: "", action_pitch: "", camera_pitch: "" }));
    const empty = await runOperation(shotRetakeDirectedDescriptor, { projectId, sequenceId, shotId }, {});
    expect(empty).toEqual({ ok: false, error: "The model returned no changes. Try again with more direction." });
  });
});

describe("shot.retakeDirected — end-to-end commit preservation (§4.3 / §5 of the ticket, the test that matters most)", () => {
  it("a retake that only proposes actionPitch leaves description and cameraPitch unchanged in the database", async () => {
    const retakeShotId = await insertShot(ctx, sequenceId, {
      title: "Retake target",
      description: "Original description.",
      actionPitch: "Original action.",
      cameraPitch: "Original camera.",
    });

    const mocked = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mocked.mockResolvedValueOnce(
      JSON.stringify({ description: "", action_pitch: "A brand new action.", camera_pitch: "" })
    );

    const draft = await runWorkspaceOperation({
      descriptorId: "shot.retakeDirected",
      ids: { projectId, sequenceId, shotId: retakeShotId },
    });
    // LLMW.UNIFY.PANEL.2 — the shape is the generic action's now, not the
    // deleted adapter's. The VALUE is unchanged.
    expect(draft).toEqual({
      ok: true,
      kind: "object",
      values: { description: "", actionPitch: "A brand new action.", cameraPitch: "" },
    });
    if (!draft.ok || draft.kind !== "object") throw new Error("unreachable");
    const { description: draftDescription, actionPitch: draftActionPitch, cameraPitch: draftCameraPitch } = draft.values;
    if (
      typeof draftDescription !== "string" ||
      typeof draftActionPitch !== "string" ||
      typeof draftCameraPitch !== "string"
    ) {
      throw new Error("unreachable");
    }

    const before = await readShot(ctx, retakeShotId);
    const args = buildShotRetakeCommitArgs({
      shotId: retakeShotId,
      sequenceId,
      projectId,
      existing: { description: before.description, actionPitch: before.actionPitch, cameraPitch: before.cameraPitch },
      applied: { description: draftDescription, actionPitch: draftActionPitch, cameraPitch: draftCameraPitch },
    });
    const commitResult = await updateShotNarrativeContext(...args);
    expect(commitResult).toEqual({ ok: true });

    const after = await readShot(ctx, retakeShotId);
    expect(after.description).toBe("Original description.");
    expect(after.actionPitch).toBe("A brand new action.");
    expect(after.cameraPitch).toBe("Original camera.");
  });

  it("a shotId belonging to another sequence is refused by updateShotNarrativeContext and writes nothing", async () => {
    const before = await readShot(ctx, shotId);
    const result = await updateShotNarrativeContext(shotId, otherSequenceId, otherProjectId, {
      description: "Should not be written.",
      actionPitch: null,
      cameraPitch: null,
    });
    expect(result).toEqual({ ok: false, error: "Shot not found." });
    const after = await readShot(ctx, shotId);
    expect(after).toEqual(before);
  });
});
