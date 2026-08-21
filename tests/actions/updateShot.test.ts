import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot, readShot } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// updateShot — LLMW.LIGHTING.SURFACE.1 (B15b). `updateShot` is the Edit Shot
// form's own action
// (src/app/projects/[projectId]/sequences/[sequenceId]/shots/[shotId]/edit/page.tsx),
// widened by this ticket to also write `lighting`. `updateShot` redirects
// unconditionally on success — captured directly here, not through the
// shared `captureRedirect` helper, since this file needs no other part of
// that module.
//
// The proof that counts, per this ticket's own instruction: a save that
// resubmits every field of the real Edit Shot form at its own current
// (unedited) value — exactly what a browser submit sends when the user only
// changes one field, since `<FormField defaultValue={...} />` pre-fills
// every input — must not clear `lighting`. This is the S4 trap in reverse:
// `updateShot` rewrites every declared column on every call, so `lighting`
// only survives an untouched save because it is now genuinely present in
// the form, not because the action special-cases it.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateShot: typeof import("@/actions/shots").updateShot;
let projectId: number;
let sequenceId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Every field the real Edit Shot form submits, at the row's own current
 * values — the FormData shape a resubmit-without-editing produces. */
function fullShotForm(shot: Awaited<ReturnType<typeof readShot>>, overrides: Record<string, string> = {}) {
  return form({
    shot_code: shot.shotCode ?? "",
    title: shot.title,
    description: shot.description ?? "",
    duration_seconds: shot.durationSeconds != null ? String(shot.durationSeconds) : "",
    action_pitch: shot.actionPitch ?? "",
    camera_pitch: shot.cameraPitch ?? "",
    continuity_notes: shot.continuityNotes ?? "",
    framing: shot.shotSize ?? "",
    camera_movement: shot.cameraMovement ?? "",
    continuity_in: shot.continuityIn ?? "",
    continuity_out: shot.continuityOut ?? "",
    lighting: shot.lighting ?? "",
    ...overrides,
  });
}

async function captureShotRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2];
    }
    throw err;
  }
  throw new Error("Expected updateShot to redirect, but it returned normally.");
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateShot } = await import("@/actions/shots"));
  projectId = await insertProject(ctx, "Owner project");
  sequenceId = await insertSequence(ctx, projectId);
});

afterAll(() => ctx.cleanup());

describe("updateShot — lighting joins the existing multi-column form/action", () => {
  it("writes lighting when the form submits a new value for it", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A", lighting: "Old lighting" });
    const before = await readShot(ctx, shotId);

    await captureShotRedirect(() =>
      updateShot(shotId, sequenceId, projectId, fullShotForm(before, { lighting: "Backlit, hard shadows" }))
    );

    expect((await readShot(ctx, shotId)).lighting).toBe("Backlit, hard shadows");
  });

  it("preserves lighting on a full-form resubmit that only changes the title — the S4 proof", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Shot B",
      lighting: "At the start the character is in shadow, at the end lit by the screens",
      description: "Untouched description",
      // `updateShot` recomputes `shotPrompt` from description/actionPitch/
      // cameraPitch whenever the existing `shotPrompt` is blank
      // (resolveShotPromptWithDefault) — pre-existing behaviour, unrelated
      // to this ticket. Set to the value that recomputation would produce so
      // this test's changedColumns assertion is about `lighting` alone, not
      // a pre-existing quirk of that unrelated function.
      shotPrompt: "Untouched description",
      shotSize: "MS",
    });
    const before = await readShot(ctx, shotId);

    // Exactly what the Edit Shot form submits when the user edits only the
    // Title field and saves: every other input carries its own
    // `defaultValue`, including Lighting.
    await captureShotRedirect(() =>
      updateShot(shotId, sequenceId, projectId, fullShotForm(before, { title: "Shot B renamed" }))
    );

    const after = await readShot(ctx, shotId);
    expect(after.lighting).toBe(
      "At the start the character is in shadow, at the end lit by the screens"
    );
    expect(after.title).toBe("Shot B renamed");
    expect(after.description).toBe("Untouched description");
    expect(after.shotSize).toBe("MS");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["title"]);
  });

  it("clears lighting to null on a blank submission, same as the other free-text fields", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot C", lighting: "Old lighting" });
    const before = await readShot(ctx, shotId);

    await captureShotRedirect(() =>
      updateShot(shotId, sequenceId, projectId, fullShotForm(before, { lighting: "" }))
    );

    expect((await readShot(ctx, shotId)).lighting).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B19c — camera_pitch is now a read-only legacy field: the Edit Shot form no
// longer has an `<input name="camera_pitch">` to submit at all (unlike
// `lighting` above, this is not "submitted blank", the field is simply
// absent from the FormData a real browser POST produces). `updateShot`'s
// `.set()` deliberately omits `cameraPitch` so the column survives every
// save — this guards that omission: it is the only trace of angle/position
// on 88 pre-B19b shots, and a `cameraPitch: null` (or any other value) added
// back to that `.set()` would silently wipe it with no test failure to catch
// it, since every other test in this file goes through `fullShotForm`, which
// happens to always resend the field's own current value and would hide
// exactly this regression.
// ---------------------------------------------------------------------------

describe("updateShot — camera_pitch survives a save that no longer submits it (B19c)", () => {
  it("does not clear camera_pitch when the submitted FormData has no camera_pitch field at all", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Shot D",
      cameraPitch: "35mm, low angle, slight tilt",
      // Non-blank so `updateShot`'s own resolveShotPromptWithDefault keeps
      // it as-is rather than recomputing a proposal from cameraPitch — an
      // unrelated pre-existing behaviour this test must not become about.
      shotPrompt: "Shot D unedited prompt",
    });
    const before = await readShot(ctx, shotId);
    expect(before.cameraPitch).toBe("35mm, low angle, slight tilt");

    // The exact shape of a real Edit Shot form submit today: every field
    // below except camera_pitch, since that input no longer exists on the
    // page. Built by hand rather than through fullShotForm/`form()` with an
    // override, precisely so nothing appends a `camera_pitch` key (even an
    // empty one) to this FormData.
    const submitted = new FormData();
    submitted.append("shot_code", before.shotCode ?? "");
    submitted.append("title", before.title);
    submitted.append("description", before.description ?? "");
    submitted.append("duration_seconds", before.durationSeconds != null ? String(before.durationSeconds) : "");
    submitted.append("action_pitch", before.actionPitch ?? "");
    submitted.append("continuity_notes", before.continuityNotes ?? "");
    submitted.append("framing", before.shotSize ?? "");
    submitted.append("camera_movement", before.cameraMovement ?? "");
    submitted.append("camera_position", before.cameraPosition ?? "");
    submitted.append("movement_speed", before.movementSpeed ?? "");
    submitted.append("camera_subject", before.cameraSubject ?? "");
    submitted.append("continuity_in", before.continuityIn ?? "");
    submitted.append("continuity_out", before.continuityOut ?? "");
    submitted.append("lighting", before.lighting ?? "");

    await captureShotRedirect(() => updateShot(shotId, sequenceId, projectId, submitted));

    const after = await readShot(ctx, shotId);
    expect(after.cameraPitch).toBe("35mm, low angle, slight tilt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B19c — the three camera vocabulary axes opened by B19b (camera_position,
// movement_speed, camera_subject) must actually reach the database: this was
// so far only proven by `tsc`, never by a test that writes a FormData and
// reads the row back.
// ---------------------------------------------------------------------------

describe("updateShot — the three new camera vocabulary axes are written (B19c)", () => {
  it("saves camera_position, movement_speed and camera_subject", async () => {
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot E" });
    const before = await readShot(ctx, shotId);

    await captureShotRedirect(() =>
      updateShot(
        shotId,
        sequenceId,
        projectId,
        fullShotForm(before, {
          camera_position: "Low Angle",
          movement_speed: "Slow",
          camera_subject: "Follows the protagonist from the door to the window",
        })
      )
    );

    const after = await readShot(ctx, shotId);
    expect(after.cameraPosition).toBe("Low Angle");
    expect(after.movementSpeed).toBe("Slow");
    expect(after.cameraSubject).toBe("Follows the protagonist from the door to the window");
  });
});
