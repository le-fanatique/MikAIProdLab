import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, readSequence } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// updateSequence — LLMW.LIGHTING.SURFACE.1 (B15b). `updateSequence` is the
// Edit Sequence form's own action
// (src/app/projects/[projectId]/sequences/[sequenceId]/edit/page.tsx),
// widened by this ticket to also write `lighting`. Redirects unconditionally
// on success — captured directly, no other part of the shared helper
// needed.
//
// The proof that counts: a full-form resubmit (every field at its own
// current value, the shape a browser submit produces when only one field is
// edited) must not clear `lighting` — the S4 trap in reverse.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateSequence: typeof import("@/actions/sequences").updateSequence;
let projectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function fullSequenceForm(
  sequence: Awaited<ReturnType<typeof readSequence>>,
  overrides: Record<string, string> = {}
) {
  return form({
    title: sequence.title,
    summary: sequence.summary ?? "",
    description: sequence.description ?? "",
    narrative_purpose: sequence.narrativePurpose ?? "",
    mood: sequence.mood ?? "",
    location_hint: sequence.locationHint ?? "",
    lighting: sequence.lighting ?? "",
    ...overrides,
  });
}

async function captureSequenceRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2];
    }
    throw err;
  }
  throw new Error("Expected updateSequence to redirect, but it returned normally.");
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateSequence } = await import("@/actions/sequences"));
  projectId = await insertProject(ctx, "Owner project");
});

afterAll(() => ctx.cleanup());

describe("updateSequence — lighting joins the existing multi-column form/action", () => {
  it("writes lighting when the form submits a new value for it", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq A", lighting: "Old lighting" });
    const before = await readSequence(ctx, sequenceId);

    await captureSequenceRedirect(() =>
      updateSequence(
        sequenceId,
        projectId,
        fullSequenceForm(before, { lighting: "Overcast daylight, diffused" })
      )
    );

    expect((await readSequence(ctx, sequenceId)).lighting).toBe("Overcast daylight, diffused");
  });

  it("preserves lighting on a full-form resubmit that only changes the title — the S4 proof", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Seq B",
      lighting: "At the start the character is in shadow, at the end lit by the screens",
      mood: "Untouched mood",
    });
    const before = await readSequence(ctx, sequenceId);

    await captureSequenceRedirect(() =>
      updateSequence(sequenceId, projectId, fullSequenceForm(before, { title: "Seq B renamed" }))
    );

    const after = await readSequence(ctx, sequenceId);
    expect(after.lighting).toBe(
      "At the start the character is in shadow, at the end lit by the screens"
    );
    expect(after.title).toBe("Seq B renamed");
    expect(after.mood).toBe("Untouched mood");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["title"]);
  });

  it("clears lighting to null on a blank submission, same as the other free-text fields", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq C", lighting: "Old lighting" });
    const before = await readSequence(ctx, sequenceId);

    await captureSequenceRedirect(() =>
      updateSequence(sequenceId, projectId, fullSequenceForm(before, { lighting: "" }))
    );

    expect((await readSequence(ctx, sequenceId)).lighting).toBeNull();
  });
});
