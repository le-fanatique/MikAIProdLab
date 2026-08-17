import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SEQ.IDENTITY — LLMW.DESCRIPTOR.CASTING.1 (B7h-b2), §3bis of the ticket. No
// oracle exists for this variable (new, not migrated) — a unit proof of the
// resolver's own contract, on the model of `castingVariables.test.ts`'s three
// siblings: content, exact projection (assertion on keys, not just values),
// and a clean refusal on a sequence that does not exist.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveSeqIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqIdentity;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveSeqIdentity } = await import("@/lib/llmWorkspace/variables/registry"));
});

afterAll(() => ctx.cleanup());

describe("resolveSeqIdentity — resolver contract", () => {
  it("returns exactly id and title, matching the sequence row", async () => {
    const projectId = await insertProject(ctx, "SEQ.IDENTITY project");
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "The Rooftop Chase",
      summary: "Not part of SEQ.IDENTITY's projection.",
    });

    const result = await resolveSeqIdentity(sequenceId);
    expect(result).toEqual({ id: sequenceId, title: "The Rooftop Chase" });
    expect(Object.keys(result).sort()).toEqual(["id", "title"]);
  });

  it("refuses on a sequence that does not exist, on the same model as resolveSeqContext / resolveSeqCurrentPrompt", async () => {
    await expect(resolveSeqIdentity(999999)).rejects.toThrow(
      "resolveSeqIdentity: sequence 999999 not found."
    );
  });

  it("isolation: a second, populated sequence's identity never leaks into the first's result", async () => {
    const projectId = await insertProject(ctx, "Iso — SEQ.IDENTITY");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq A" });
    await insertSequence(ctx, projectId, { title: "Seq B" });

    const result = await resolveSeqIdentity(sequenceId);
    expect(result).toEqual({ id: sequenceId, title: "Seq A" });
  });
});
