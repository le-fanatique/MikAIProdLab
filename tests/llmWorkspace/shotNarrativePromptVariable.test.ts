import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SHOT.NARRATIVE_PROMPT — LLMW.JAR.1 (B12a). Mirrors SHOT.CURRENT_PROMPT
// exactly, over the sibling `narrativePrompt` column. Proven on the model of
// `seqIdentityVariable.test.ts` (SEQ.IDENTITY): a value present, a null
// value, and a clean refusal on a shot that does not exist.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveShotNarrativePrompt: typeof import("@/lib/llmWorkspace/variables/registry").resolveShotNarrativePrompt;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveShotNarrativePrompt } = await import("@/lib/llmWorkspace/variables/registry"));
});

afterAll(() => ctx.cleanup());

describe("resolveShotNarrativePrompt — resolver contract", () => {
  it("returns the stored narrative prompt when present", async () => {
    const projectId = await insertProject(ctx, "SHOT.NARRATIVE_PROMPT project");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId, {
      narrativePrompt: "A generated, narratively sexy prompt.",
      shotPrompt: "The human-written shot prompt — never read by this resolver.",
    });

    const result = await resolveShotNarrativePrompt(shotId);
    expect(result).toEqual({ narrativePrompt: "A generated, narratively sexy prompt." });
    expect(Object.keys(result).sort()).toEqual(["narrativePrompt"]);
  });

  it("returns null when the jar is empty", async () => {
    const projectId = await insertProject(ctx, "SHOT.NARRATIVE_PROMPT empty project");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);

    const result = await resolveShotNarrativePrompt(shotId);
    expect(result).toEqual({ narrativePrompt: null });
  });

  it("refuses on a shot that does not exist, on the same model as resolveShotCurrentPrompt", async () => {
    await expect(resolveShotNarrativePrompt(999999)).rejects.toThrow(
      "resolveShotNarrativePrompt: shot 999999 not found."
    );
  });
});
