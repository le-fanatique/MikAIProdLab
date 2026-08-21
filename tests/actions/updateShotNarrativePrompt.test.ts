import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot, readShot } from "./helpers/fixtures";

let ctx: TempDb;
let updateShotNarrativePrompt: typeof import("@/actions/shots").updateShotNarrativePrompt;
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
  ({ updateShotNarrativePrompt } = await import("@/actions/shots"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
  sequenceId = await insertSequence(ctx, projectId);
  otherSequenceId = await insertSequence(ctx, otherProjectId);
});

afterAll(() => ctx.cleanup());

describe("updateShotNarrativePrompt — exact write", () => {
  it("writes narrativePrompt, touches no other column, and leaves shotPrompt unchanged", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      shotPrompt: "Human-written shot prompt",
      narrativePrompt: "Old narrative prompt",
      description: "Untouched description",
      shotSize: "Untouched framing",
    });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          narrativePrompt: "New narrative prompt",
        })
      )
    );

    const after = await readShot(ctx, shotId);
    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}?narrativePromptSaved=1`
    );
    expect(after.narrativePrompt).toBe("New narrative prompt");
    // This is the assertion that counts: shotPrompt is unchanged by a call
    // that only ever writes narrativePrompt.
    expect(after.shotPrompt).toBe("Human-written shot prompt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "narrativePrompt",
    ]);
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("stores null for a blank narrative prompt rather than an empty string", async () => {
    const shotId = await insertShot(ctx, sequenceId, { narrativePrompt: "Old narrative prompt" });

    await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          narrativePrompt: "   ",
        })
      )
    );

    expect((await readShot(ctx, shotId)).narrativePrompt).toBeNull();
  });

  it("honours returnTo and appends its parameter with the right separator", async () => {
    const shotId = await insertShot(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          narrativePrompt: "Narrative",
          returnTo: "/projects/1/prompt-compiler?tab=shot",
        })
      )
    );

    expect(target).toBe("/projects/1/prompt-compiler?tab=shot&narrativePromptSaved=1");
  });
});

describe("updateShotNarrativePrompt — foreign chain refusal", () => {
  it("refuses a shot that belongs to another sequence and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { narrativePrompt: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          narrativePrompt: "Injected",
        })
      )
    );

    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}` +
        `?narrativePromptError=${encodeURIComponent(
          "Shot not found or does not belong to this sequence."
        )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a sequence that belongs to another project and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { narrativePrompt: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(otherSequenceId),
          shotId: String(shotId),
          narrativePrompt: "Injected",
        })
      )
    );

    expect(target).toContain(
      `narrativePromptError=${encodeURIComponent(
        "Sequence not found or does not belong to this project."
      )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a shot that does not exist", async () => {
    const target = await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: "999999",
          narrativePrompt: "Injected",
        })
      )
    );

    expect(target).toContain(
      `narrativePromptError=${encodeURIComponent(
        "Shot not found or does not belong to this sequence."
      )}`
    );
  });
});

describe("updateShotNarrativePrompt — input validation", () => {
  it("refuses a non-numeric identifier without writing", async () => {
    const shotId = await insertShot(ctx, sequenceId, { narrativePrompt: "Kept" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: "abc",
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          narrativePrompt: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toBe(
      `/projects/1/prompt-compiler?narrativePromptError=${encodeURIComponent("Invalid request.")}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a non-positive identifier", async () => {
    const target = await captureRedirect(() =>
      updateShotNarrativePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: "0",
          narrativePrompt: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toContain(`narrativePromptError=${encodeURIComponent("Invalid request.")}`);
  });
});
