import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot, readShot } from "./helpers/fixtures";

let ctx: TempDb;
let updateShotPrompt: typeof import("@/actions/shots").updateShotPrompt;
let projectId: number;
let otherProjectId: number;
let sequenceId: number;
let otherSequenceId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateShotPrompt } = await import("@/actions/shots"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
  sequenceId = await insertSequence(ctx, projectId);
  otherSequenceId = await insertSequence(ctx, otherProjectId);
});

afterAll(() => ctx.cleanup());

describe("updateShotPrompt — exact write", () => {
  it("writes shotPrompt, touches no other column, and redirects to the success target", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      shotPrompt: "Old prompt",
      description: "Untouched description",
      framing: "Untouched framing",
    });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          shotPrompt: "New prompt",
        })
      )
    );

    const after = await readShot(ctx, shotId);
    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}?shotPromptSaved=1`
    );
    expect(after.shotPrompt).toBe("New prompt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "shotPrompt",
    ]);
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("stores null for a blank prompt rather than an empty string", async () => {
    const shotId = await insertShot(ctx, sequenceId, { shotPrompt: "Old prompt" });

    await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          shotPrompt: "   ",
        })
      )
    );

    expect((await readShot(ctx, shotId)).shotPrompt).toBeNull();
  });

  it("honours returnTo and appends its parameter with the right separator", async () => {
    const shotId = await insertShot(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          shotPrompt: "Prompt",
          returnTo: "/projects/1/prompt-compiler?tab=shot",
        })
      )
    );

    expect(target).toBe("/projects/1/prompt-compiler?tab=shot&shotPromptSaved=1");
  });
});

describe("updateShotPrompt — foreign chain refusal", () => {
  it("refuses a shot that belongs to another sequence and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { shotPrompt: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          shotPrompt: "Injected",
        })
      )
    );

    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}` +
        `?shotPromptError=${encodeURIComponent(
          "Shot not found or does not belong to this sequence."
        )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a sequence that belongs to another project and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { shotPrompt: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(otherSequenceId),
          shotId: String(shotId),
          shotPrompt: "Injected",
        })
      )
    );

    expect(target).toContain(
      `shotPromptError=${encodeURIComponent(
        "Sequence not found or does not belong to this project."
      )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a shot that does not exist", async () => {
    const target = await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: "999999",
          shotPrompt: "Injected",
        })
      )
    );

    expect(target).toContain(
      `shotPromptError=${encodeURIComponent(
        "Shot not found or does not belong to this sequence."
      )}`
    );
  });
});

describe("updateShotPrompt — input validation", () => {
  it("refuses a non-numeric identifier without writing", async () => {
    const shotId = await insertShot(ctx, sequenceId, { shotPrompt: "Kept" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: "abc",
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          shotPrompt: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toBe(
      `/projects/1/prompt-compiler?shotPromptError=${encodeURIComponent("Invalid request.")}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a non-positive identifier", async () => {
    const target = await captureRedirect(() =>
      updateShotPrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: "0",
          shotPrompt: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toContain(`shotPromptError=${encodeURIComponent("Invalid request.")}`);
  });
});
