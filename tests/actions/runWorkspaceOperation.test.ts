import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, insertSequence, insertShot } from "./helpers/fixtures";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// LLMW.UNIFY.ACTION.1 (C1, step 1) — one server action for every workspace
// operation, standing beside the fifteen per-operation adapters.
//
// This is the provable half of the unification. The generic *panel* cannot be
// tested here (no DOM harness, the author's standing decision, re-confirmed by
// a beta that surfaced no interface bug), which is exactly why it goes last —
// see `docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3.
//
// Run against REAL built-in descriptors, not synthetic ones: the point of this
// action is that it works for whatever the registry declares, so a fabricated
// descriptor would prove the wrong thing. `@/lib/llm` is mocked, as every
// runner test does.
// ---------------------------------------------------------------------------
vi.mock("@/lib/llm", () => ({ callLLMJson: vi.fn(), callLLMText: vi.fn() }));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let callLLMText: typeof import("@/lib/llm").callLLMText;

let projectId: number;
let sequenceId: number;
let shotId: number;
let assetId: number;

function mockedJson() {
  return callLLMJson as unknown as ReturnType<typeof vi.fn>;
}
function mockedText() {
  return callLLMText as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
  ({ callLLMJson, callLLMText } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Unify action project");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A courier runs the last mile through a flooded city." })
    .where(eq(ctx.schema.projects.id, projectId));
  sequenceId = await insertSequence(ctx, projectId, { title: "Rooftop" });
  shotId = await insertShot(ctx, sequenceId, { title: "Wide establishing" });
  assetId = await insertAsset(ctx, projectId, { name: "Mara" });
});

afterAll(() => ctx.cleanup());

describe("runWorkspaceOperation — the operation is named, never supplied", () => {
  it("refuses an unknown descriptor id", async () => {
    const result = await runWorkspaceOperation({ descriptorId: "nope.notAnOperation", ids: { projectId } });
    expect(result).toEqual({ ok: false, error: "Unknown operation." });
  });

  it("does not echo the requested id back into the message", async () => {
    const result = await runWorkspaceOperation({
      descriptorId: "<script>alert(1)</script>",
      ids: { projectId },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("script");
  });

  it("refuses before calling the provider", async () => {
    mockedJson().mockReset();
    mockedText().mockReset();
    await runWorkspaceOperation({ descriptorId: "nope", ids: { projectId } });
    expect(mockedJson()).not.toHaveBeenCalled();
    expect(mockedText()).not.toHaveBeenCalled();
  });
});

describe("runWorkspaceOperation — it runs what the registry declares", () => {
  it("runs a real object-kind descriptor and relays its parsed values", async () => {
    mockedJson().mockReset().mockResolvedValue(JSON.stringify({ story: "A courier, a city, a deadline." }));

    const result = await runWorkspaceOperation({ descriptorId: "story.generate", ids: { projectId } });

    expect(result).toEqual({ ok: true, kind: "object", values: { story: "A courier, a city, a deadline." } });
  });

  it("relays a text-kind descriptor through the non-JSON call", async () => {
    mockedText().mockReset().mockResolvedValue("  Rain on the rooftop, seen wide.  ");
    mockedJson().mockReset();

    const result = await runWorkspaceOperation({
      descriptorId: "narrativePrompt.compose",
      ids: { projectId, sequenceId, shotId },
    });

    expect(result).toEqual({ ok: true, kind: "text", text: "Rain on the rooftop, seen wide." });
    // The text branch must not borrow the JSON call — the whole point of B12b-1.
    expect(mockedJson()).not.toHaveBeenCalled();
  });

  it("carries the director's note into the operation", async () => {
    mockedJson().mockReset().mockResolvedValue(JSON.stringify({ shotPrompt: "Lower the camera." }));

    await runWorkspaceOperation({
      descriptorId: "shot.retakeDirected",
      ids: { projectId, sequenceId, shotId },
      intent: { freeText: "Put the camera on the floor." },
    });

    const [prompt] = mockedJson().mock.calls[0];
    expect(prompt.user).toContain("Put the camera on the floor.");
  });

  it("returns the descriptor's own declared refusal, not a generic one", async () => {
    mockedJson().mockReset();
    // `story.generate` declares a precondition on a non-empty pitch.
    const emptyProject = await insertProject(ctx, "No pitch here");

    const result = await runWorkspaceOperation({ descriptorId: "story.generate", ids: { projectId: emptyProject } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The message comes from the descriptor, and the provider was never called.
    expect(result.error.length).toBeGreaterThan(0);
    expect(mockedJson()).not.toHaveBeenCalled();
  });

  it("returns a refusal rather than throwing when a chain identifier is wrong", async () => {
    mockedJson().mockReset();
    const result = await runWorkspaceOperation({
      descriptorId: "shot.retakeDirected",
      ids: { projectId, sequenceId, shotId: 999999 },
    });

    expect(result.ok).toBe(false);
    expect(mockedJson()).not.toHaveBeenCalled();
  });

  it("survives a provider that throws, as a refusal", async () => {
    mockedJson().mockReset().mockRejectedValue(new Error("provider exploded"));

    const result = await runWorkspaceOperation({ descriptorId: "story.generate", ids: { projectId } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("provider exploded");
  });
});

describe("runWorkspaceOperation — a list comes back in the model's own keys", () => {
  // LLMW.UNIFY.LIST.1. The runner parses into entity FIELD names; every
  // consumer needs the model's JSON keys back, because the write actions
  // re-parse the approved payload through their own normalizers. Doing that
  // translation here is what lets the four list panels stop importing
  // descriptor internals.
  it("returns shots keyed as the model wrote them, not as the runner parsed them", async () => {
    mockedJson()
      .mockReset()
      .mockResolvedValue(
        JSON.stringify({
          shots: [
            { shot_code: "SH010", title: "Wide establishing", duration_seconds: 4 },
            { shot_code: "SH020", title: "Push in" },
          ],
        })
      );

    const result = await runWorkspaceOperation({
      descriptorId: "shots.fromSequence",
      ids: { projectId, sequenceId },
      intent: { parameters: { targetShotCount: 2 } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("expected a list result");

    // The model's keys, not `shotCode` / `durationSeconds`.
    expect(Object.keys(result.items[0])).toContain("shot_code");
    expect(Object.keys(result.items[0])).not.toContain("shotCode");
    expect(result.items[0].title).toBe("Wide establishing");

    // A field the model omitted stays omitted — never filled with null or ""
    // — so each write action's own absence handling still applies.
    expect("duration_seconds" in result.items[1]).toBe(false);
  });

  it("keeps a field a postResponse form attached, which no descriptor declares", async () => {
    // `casting.fromSequence` computes `alreadyAssigned` in its postResponse
    // stage; it is not in `output.item.fields`, and the key translation used
    // to drop it silently. A panel's success assertion would have changed
    // VALUE — the one thing this migration forbids.
    mockedJson()
      .mockReset()
      .mockResolvedValue(
        JSON.stringify({
          suggestions: [
            { targetType: "shot", targetId: shotId, targetLabel: "SH010", assetId, assetName: "Mara", assetType: "character" },
          ],
        })
      );

    const result = await runWorkspaceOperation({
      descriptorId: "casting.fromSequence",
      ids: { projectId, sequenceId },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("expected a list result");
    expect(result.items).toHaveLength(1);
    expect("alreadyAssigned" in result.items[0]).toBe(true);
  });
});

describe("runWorkspaceOperation — it is generic by construction", () => {
  it("serves descriptors of different anchors and different output kinds through one entry point", async () => {
    mockedJson().mockReset().mockResolvedValue(JSON.stringify({ story: "s" }));
    const project = await runWorkspaceOperation({ descriptorId: "story.generate", ids: { projectId } });

    mockedText().mockReset().mockResolvedValue("a narrative prompt");
    const shot = await runWorkspaceOperation({
      descriptorId: "narrativePrompt.compose",
      ids: { projectId, sequenceId, shotId },
    });

    // Same call shape, different anchor, different output kind, no branch on
    // the id anywhere in the action.
    expect(project.ok && project.kind).toBe("object");
    expect(shot.ok && shot.kind).toBe("text");
  });
});
