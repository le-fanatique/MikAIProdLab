import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, readSequence } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// updateSequenceLighting — LLMW.LIGHTING.1 (B15a). Mirrors
// tests/actions/updateSequencePrompt.test.ts exactly, over `lighting`
// instead of `sequencePrompt`. The assertion that counts: writing `lighting`
// touches no other column, including the sibling `sequencePrompt`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateSequenceLighting: typeof import("@/actions/sequences").updateSequenceLighting;
let projectId: number;
let otherProjectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateSequenceLighting } = await import("@/actions/sequences"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("updateSequenceLighting — exact write", () => {
  it("writes lighting, touches no other column, and leaves sequencePrompt unchanged", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      lighting: "Old lighting",
      sequencePrompt: "Untouched prompt",
      summary: "Untouched summary",
      mood: "Untouched mood",
    });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateSequenceLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          lighting: "Overcast daylight, diffused",
        })
      )
    );

    const after = await readSequence(ctx, sequenceId);
    expect(target).toBe(`/projects/${projectId}/sequences/${sequenceId}?sequenceLightingSaved=1`);
    expect(after.lighting).toBe("Overcast daylight, diffused");
    expect(after.sequencePrompt).toBe("Untouched prompt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["lighting"]);
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("stores null for a blank lighting value rather than an empty string", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "Old lighting" });

    await captureRedirect(() =>
      updateSequenceLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          lighting: "  \n ",
        })
      )
    );

    expect((await readSequence(ctx, sequenceId)).lighting).toBeNull();
  });

  it("honours returnTo and appends its parameter with the right separator", async () => {
    const sequenceId = await insertSequence(ctx, projectId);

    const target = await captureRedirect(() =>
      updateSequenceLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          lighting: "Lighting",
          returnTo: "/projects/1/prompt-compiler?tab=sequence",
        })
      )
    );

    expect(target).toBe("/projects/1/prompt-compiler?tab=sequence&sequenceLightingSaved=1");
  });
});

describe("updateSequenceLighting — foreign chain refusal", () => {
  it("refuses a sequence owned by another project and writes nothing", async () => {
    const sequenceId = await insertSequence(ctx, otherProjectId, { lighting: "Protected" });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateSequenceLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          lighting: "Injected",
        })
      )
    );

    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}` +
        `?sequenceLightingError=${encodeURIComponent(
          "Sequence not found or does not belong to this project."
        )}`
    );
    expect(await readSequence(ctx, sequenceId)).toEqual(before);
  });

  it("refuses a sequence that does not exist", async () => {
    const target = await captureRedirect(() =>
      updateSequenceLighting(
        form({
          projectId: String(projectId),
          sequenceId: "999999",
          lighting: "Injected",
        })
      )
    );

    expect(target).toContain(
      `sequenceLightingError=${encodeURIComponent(
        "Sequence not found or does not belong to this project."
      )}`
    );
  });
});

describe("updateSequenceLighting — input validation", () => {
  it("refuses a non-numeric identifier without writing", async () => {
    const sequenceId = await insertSequence(ctx, projectId, { lighting: "Kept" });
    const before = await readSequence(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateSequenceLighting(
        form({
          projectId: "abc",
          sequenceId: String(sequenceId),
          lighting: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toBe(
      `/projects/1/prompt-compiler?sequenceLightingError=${encodeURIComponent("Invalid request.")}`
    );
    expect(await readSequence(ctx, sequenceId)).toEqual(before);
  });

  it("refuses a non-positive identifier", async () => {
    const target = await captureRedirect(() =>
      updateSequenceLighting(
        form({
          projectId: String(projectId),
          sequenceId: "0",
          lighting: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toContain(`sequenceLightingError=${encodeURIComponent("Invalid request.")}`);
  });
});
