import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot, readShot } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// updateShotLighting — LLMW.LIGHTING.1 (B15a). Mirrors
// tests/actions/updateShotNarrativePrompt.test.ts exactly, over `lighting`
// instead of `narrativePrompt` — same FormData shape, same
// shot→sequence→project ownership chain, same redirect-only outcome. The
// assertion that counts: writing `lighting` touches no other column,
// including the sibling `narrativePrompt` and `shotPrompt` jars.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateShotLighting: typeof import("@/actions/shots").updateShotLighting;
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
  ({ updateShotLighting } = await import("@/actions/shots"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
  sequenceId = await insertSequence(ctx, projectId);
  otherSequenceId = await insertSequence(ctx, otherProjectId);
});

afterAll(() => ctx.cleanup());

describe("updateShotLighting — exact write", () => {
  it("writes lighting, touches no other column, and leaves shotPrompt/narrativePrompt unchanged", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      shotPrompt: "Human-written shot prompt",
      narrativePrompt: "Generated narrative prompt",
      lighting: "Old lighting",
      description: "Untouched description",
      shotSize: "Untouched framing",
    });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          lighting: "Golden hour, warm rim light from screen glow",
        })
      )
    );

    const after = await readShot(ctx, shotId);
    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}?shotLightingSaved=1`
    );
    expect(after.lighting).toBe("Golden hour, warm rim light from screen glow");
    // This is the assertion that counts: neither sibling jar is touched by a
    // call that only ever writes `lighting`.
    expect(after.shotPrompt).toBe("Human-written shot prompt");
    expect(after.narrativePrompt).toBe("Generated narrative prompt");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["lighting"]);
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("stores null for a blank lighting value rather than an empty string", async () => {
    const shotId = await insertShot(ctx, sequenceId, { lighting: "Old lighting" });

    await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          lighting: "   ",
        })
      )
    );

    expect((await readShot(ctx, shotId)).lighting).toBeNull();
  });

  it("honours returnTo and appends its parameter with the right separator", async () => {
    const shotId = await insertShot(ctx, sequenceId);

    const target = await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          lighting: "Lighting",
          returnTo: "/projects/1/prompt-compiler?tab=shot",
        })
      )
    );

    expect(target).toBe("/projects/1/prompt-compiler?tab=shot&shotLightingSaved=1");
  });
});

describe("updateShotLighting — foreign chain refusal", () => {
  it("refuses a shot that belongs to another sequence and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { lighting: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          lighting: "Injected",
        })
      )
    );

    expect(target).toBe(
      `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}` +
        `?shotLightingError=${encodeURIComponent(
          "Shot not found or does not belong to this sequence."
        )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a sequence that belongs to another project and writes nothing", async () => {
    const shotId = await insertShot(ctx, otherSequenceId, { lighting: "Protected" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(otherSequenceId),
          shotId: String(shotId),
          lighting: "Injected",
        })
      )
    );

    expect(target).toContain(
      `shotLightingError=${encodeURIComponent(
        "Sequence not found or does not belong to this project."
      )}`
    );
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a shot that does not exist", async () => {
    const target = await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: "999999",
          lighting: "Injected",
        })
      )
    );

    expect(target).toContain(
      `shotLightingError=${encodeURIComponent("Shot not found or does not belong to this sequence.")}`
    );
  });
});

describe("updateShotLighting — input validation", () => {
  it("refuses a non-numeric identifier without writing", async () => {
    const shotId = await insertShot(ctx, sequenceId, { lighting: "Kept" });
    const before = await readShot(ctx, shotId);

    const target = await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: "abc",
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          lighting: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toBe(`/projects/1/prompt-compiler?shotLightingError=${encodeURIComponent("Invalid request.")}`);
    expect(await readShot(ctx, shotId)).toEqual(before);
  });

  it("refuses a non-positive identifier", async () => {
    const target = await captureRedirect(() =>
      updateShotLighting(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: "0",
          lighting: "Injected",
          returnTo: "/projects/1/prompt-compiler",
        })
      )
    );

    expect(target).toContain(`shotLightingError=${encodeURIComponent("Invalid request.")}`);
  });
});
