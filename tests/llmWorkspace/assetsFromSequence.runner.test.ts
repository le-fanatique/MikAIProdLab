import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";
import { assetsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/assetsFromSequence";

// ---------------------------------------------------------------------------
// ASSET.EXTRACT.SEQ.1, §7 of the ticket — the filet for the new brick, run
// through the real runner dispatch (`resolveOperationPrompt` /
// `runOperation`), against a real seeded database, same discipline as
// `castingFromSequence.runner.test.ts` / `assetsFromProject.runner.test.ts`.
//
// What this file proves:
//   - the context carries the anchored sequence, its own shots, and the
//     project's existing assets — and NOT another sequence's title or shots
//     (filet entry 3);
//   - the closing instruction explicitly asks the model to propose only what
//     is missing from the existing asset list (filet entry 4);
//   - the guard (`assetTypes` non-empty) is exercised through the real
//     pipeline, mirroring `assetsFromProject`'s own precondition proof.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ assets: [] })),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));
});

afterAll(() => ctx.cleanup());

describe("assets.fromSequence — runner context-isolation and incremental-instruction proof", () => {
  it("carries the anchored sequence, its own shots, and the project's existing assets — never another sequence's title or shots", async () => {
    const projectId = await insertProject(ctx, "Neon Skyline");
    const otherSequenceId = await insertSequence(ctx, projectId, {
      title: "Rooftop chase — SHOULD NOT APPEAR",
      summary: "A different sequence entirely.",
    });
    await insertShot(ctx, otherSequenceId, {
      title: "Other sequence's shot — SHOULD NOT APPEAR",
      description: "Belongs to the wrong sequence.",
    });

    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Reactor breach",
      summary: "The crew breaches the reactor control room.",
      locationHint: "Interior reactor control room",
    });
    await insertShot(ctx, sequenceId, {
      title: "Wide of the control room",
      description: "Sparks fly from a ruptured console.",
    });
    await insertAsset(ctx, projectId, { name: "Kai the Courier", type: "character" });

    const runnerResult = await resolveOperationPrompt(
      assetsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { assetTypes: ["character", "environment"] } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const { system, user } = runnerResult.prompt;

    // The anchored sequence and its own shot are present.
    expect(user).toContain("Reactor breach");
    expect(user).toContain("Interior reactor control room");
    expect(user).toContain("Wide of the control room");
    expect(user).toContain("Sparks fly from a ruptured console.");
    // The existing asset is present, for incremental duplicate avoidance.
    expect(user).toContain("Kai the Courier");

    // The other sequence and its shot never appear, in either message.
    expect(system).not.toContain("SHOULD NOT APPEAR");
    expect(user).not.toContain("SHOULD NOT APPEAR");
    expect(user).not.toContain("Rooftop chase");
  });

  it("the closing instruction explicitly asks to propose only what is missing", async () => {
    const projectId = await insertProject(ctx, "Neon Skyline");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Only sequence" });

    const runnerResult = await resolveOperationPrompt(
      assetsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { assetTypes: ["character"] } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toContain("incremental extraction");
    expect(runnerResult.prompt.system).toMatch(/only propose assets that are missing/i);
    expect(runnerResult.prompt.user).toMatch(/missing from the existing project asset list/i);
  });

  it("no asset type selected is refused before the LLM call, with the exact precondition message", async () => {
    const projectId = await insertProject(ctx, "Guard project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Only sequence" });

    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockClear();

    const result = await runOperation(assetsFromSequenceDescriptor, { projectId, sequenceId }, { parameters: { assetTypes: [] } });
    expect(result).toEqual({ ok: false, error: "Select at least one asset type." });
    expect(mockedCallLLMJson).not.toHaveBeenCalled();
  });

  it("no parameters supplied: falls back to the declared default (assetTypes: character/environment/prop)", async () => {
    const projectId = await insertProject(ctx, "Default project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Only sequence" });

    const runnerResult = await resolveOperationPrompt(assetsFromSequenceDescriptor, { projectId, sequenceId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");
    expect(runnerResult.prompt.system).toContain("Asset types to extract: character, environment, prop");
  });

  it("unknown sequence id is refused with 'Sequence not found.'", async () => {
    const projectId = await insertProject(ctx, "Chain project");

    const result = await runOperation(assetsFromSequenceDescriptor, { projectId, sequenceId: 999999 });
    expect(result).toEqual({ ok: false, error: "Sequence not found." });
  });
});
