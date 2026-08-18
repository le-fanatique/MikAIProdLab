import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { shotInsertDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotInsertDirected";

/**
 * `InsertShotDirectedButton.tsx` — LLMW.UC1.SURFACE.1 (S6), the surface that
 * hands `shot.insertDirected`'s Sequence-page draft to `createShotAtPosition`.
 * Proves this specific caller — not `buildShotJsonPayload` or
 * `buildCreateShotAtPositionHiddenFields` themselves, both already proven by
 * `benchRun.test.ts` (B11-b3) and reused here unmodified — actually feeds
 * them what they need:
 *
 *  - `afterShotId` is the id of the shot the user clicked (implicit, never a
 *    typed field, per `.agents/supervised_task.md` §1) and reaches
 *    `createShotAtPosition`'s hidden fields unchanged;
 *  - a numeric field (`durationSeconds`) survives the round trip as a real
 *    JSON number in `shotJson`, not a string — the defect B11-b1/B11-b3
 *    already named and repaired once for the bench; this proves the
 *    Sequence-page caller does not reintroduce it.
 *
 * `InsertShotDirectedButton.tsx` imports `ACTION_BINDINGS` (`bindings.ts`),
 * which imports the seven-plus action modules at module scope
 * (`@/db`-touching) — per this repository's convention
 * (`tests/actions/proposalCommit.test.ts`), it is imported dynamically in
 * `beforeAll`, after `setupTempDb()` has set `DB_PATH`, even though the
 * function under test never touches the database itself.
 */

let ctx: TempDb;
let buildInsertShotDirectedHiddenFields: typeof import("@/components/InsertShotDirectedButton")["buildInsertShotDirectedHiddenFields"];

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ buildInsertShotDirectedHiddenFields } = await import("@/components/InsertShotDirectedButton"));
});

afterAll(() => ctx.cleanup());

describe("buildInsertShotDirectedHiddenFields — shot.insertDirected surface (S6)", () => {
  const output = shotInsertDirectedDescriptor.output;
  if (output.kind !== "object") throw new Error("unreachable");
  const fields = output.fields;

  const draft: Record<string, string | number> = {
    title: "Hero enters frame",
    description: "A low shot of the hero stepping into view.",
    durationSeconds: 4,
    actionPitch: "Hero walks in, pauses, walks out.",
    cameraPitch: "Low angle, static.",
    continuityNotes: "Picks up from the previous shot's exit direction.",
    framing: "WS",
    cameraMovement: "static",
    continuityIn: "Hero was off-frame, entering left.",
    continuityOut: "Hero exits right, into the next shot.",
  };

  it("carries the clicked shot's id through as afterShotId, unchanged", () => {
    const result = buildInsertShotDirectedHiddenFields({
      projectId: 1,
      sequenceId: 2,
      afterShotId: 42,
      returnTo: "/projects/1/sequences/2",
      fields,
      draft,
    });
    expect(result.afterShotId).toBe("42");
  });

  it("emits an empty afterShotId (insert at the start) when the caller supplies none", () => {
    const result = buildInsertShotDirectedHiddenFields({
      projectId: 1,
      sequenceId: 2,
      afterShotId: undefined,
      returnTo: "/projects/1/sequences/2",
      fields,
      draft,
    });
    expect(result.afterShotId).toBe("");
  });

  it("emits durationSeconds as a real JSON number inside shotJson, not a string — the defect a second serialization would lose silently", () => {
    const result = buildInsertShotDirectedHiddenFields({
      projectId: 1,
      sequenceId: 2,
      afterShotId: 42,
      returnTo: "/projects/1/sequences/2",
      fields,
      draft,
    });
    const parsed = JSON.parse(result.shotJson);
    expect(parsed.durationSeconds).toBe(4);
    expect(typeof parsed.durationSeconds).toBe("number");
  });

  it("re-parses a duration re-typed as decimal text (the textarea round trip) back into a real number", () => {
    const result = buildInsertShotDirectedHiddenFields({
      projectId: 1,
      sequenceId: 2,
      afterShotId: 42,
      returnTo: "/projects/1/sequences/2",
      fields,
      draft: { ...draft, durationSeconds: "4" },
    });
    const parsed = JSON.parse(result.shotJson);
    expect(parsed.durationSeconds).toBe(4);
    expect(typeof parsed.durationSeconds).toBe("number");
  });

  it("carries projectId, sequenceId and returnTo through unchanged", () => {
    const result = buildInsertShotDirectedHiddenFields({
      projectId: 7,
      sequenceId: 9,
      afterShotId: 42,
      returnTo: "/projects/7/sequences/9",
      fields,
      draft,
    });
    expect(result.projectId).toBe("7");
    expect(result.sequenceId).toBe("9");
    expect(result.returnTo).toBe("/projects/7/sequences/9");
  });
});
