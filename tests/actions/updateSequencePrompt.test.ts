import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, readSequence } from "./helpers/fixtures";

let ctx: TempDb;
let updateSequencePrompt: typeof import("@/actions/sequences").updateSequencePrompt;
let projectId: number;
let otherProjectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateSequencePrompt } = await import("@/actions/sequences"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("updateSequencePrompt — exact write", () => {
  it("writes sequencePrompt, touches no other column, and redirects to the success target", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      sequencePrompt: "Old prompt",
      summary: "Untouched summary",
      mood: "Untouched mood",
    });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateSequencePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          sequencePrompt: "New prompt",
        })
      )
    );

    const after = await readSequence(ctx, sequenceId);
    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}?sequencePromptSaved=1`
    );
    expect(after.sequencePrompt).toBe("New prompt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "sequencePrompt",
    ]);
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("stores null for a blank prompt rather than an empty string", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { sequencePrompt: "Old prompt" });

    await captureRedirect(() =>
      updateSequencePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          sequencePrompt: "  \n ",
        })
      )
    );

    expect((await readSequence(ctx, sequenceId)).sequencePrompt).toBeNull();
  });

  it("honours returnTo and appends its parameter with the right separator", async () => {
    const sequenceId = await insertSequence(ctx, projectId);

    const target = await captureRedirect(() =>
      updateSequencePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          sequencePrompt: "Prompt",
          returnTo: "/projects/1/prompt-compiler?tab=sequence",
        })
      )
    );

    expect(target).toBe("/projects/1/prompt-compiler?tab=sequence&sequencePromptSaved=1");
  });
});

describe("updateSequencePrompt — foreign chain refusal", () => {
  it("refuses a sequence owned by another project and writes nothing", async () => {
    const sequenceId = await insertSequence(ctx, otherProjectId, {
      sequencePrompt: "Protected",
    });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateSequencePrompt(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          sequencePrompt: "Injected",
        })
      )
    );

    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}` +
        `?sequencePromptError=${encodeURIComponent(
          "Sequence not found or does not belong to this project."
        )}`
    );
    expect(await readSequence(ctx, sequenceId)).toEqual(before);
  });

  it("refuses a sequence that does not exist", async () => {
    const target = await captureRedirect(() =>
      updateSequencePrompt(
        form({
          projectId: String(projectId),
          sequenceId: "999999",
          sequencePrompt: "Injected",
        })
      )
    );

    expect(target).toContain(
      `sequencePromptError=${encodeURIComponent(
        "Sequence not found or does not belong to this project."
      )}`
    );
  });
});

describe("updateSequencePrompt — input validation", () => {
  it("refuses a non-numeric identifier without writing", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { sequencePrompt: "Kept" });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateSequencePrompt(
        form({
          projectId: "abc",
          sequenceId: String(sequenceId),
          sequencePrompt: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toBe(
      `/projects/1/prompt-compiler?sequencePromptError=${encodeURIComponent("Invalid request.")}`
    );
    expect(await readSequence(ctx, sequenceId)).toEqual(before);
  });

  it("refuses a non-positive identifier", async () => {
    const target = await captureRedirect(() =>
      updateSequencePrompt(
        form({
          projectId: String(projectId),
          sequenceId: "0",
          sequencePrompt: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toContain(`sequencePromptError=${encodeURIComponent("Invalid request.")}`);
  });
});
