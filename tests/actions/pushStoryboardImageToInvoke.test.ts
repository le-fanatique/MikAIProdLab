import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import {
  insertProject,
  insertSequence,
  insertShot,
  insertStoryboardImage,
  insertSequenceStoryboardImage,
} from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// INVOKE.PUSH.2 — the floor of the ticket's own proof requirement: ownership
// verification up to the project, never on a bare id, for the two storyboard
// push actions this ticket adds (mirrors the same guard already proven by
// pushShotReferenceImageToInvoke/pushAssetReferenceImageToInvoke in
// src/actions/invoke.ts). Every case below is refused BEFORE any network
// call to InvokeAI is attempted — the ownership check always runs first and
// `errRedirect`s immediately, so these tests need no InvokeAI server and no
// network mock.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let pushShotStoryboardImageToInvoke: typeof import("@/actions/invoke")["pushShotStoryboardImageToInvoke"];
let pushSequenceStoryboardImageToInvoke: typeof import("@/actions/invoke")["pushSequenceStoryboardImageToInvoke"];

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ pushShotStoryboardImageToInvoke, pushSequenceStoryboardImageToInvoke } = await import("@/actions/invoke"));
});

afterAll(() => {
  ctx.cleanup();
});

describe("pushShotStoryboardImageToInvoke — ownership chain up to the project", () => {
  it("refuses a shot that belongs to a different sequence than claimed", async () => {
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const otherSequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, otherSequenceId); // real owner: otherSequenceId
    const imageId = await insertStoryboardImage(ctx, shotId);

    const url = await captureRedirect(() =>
      pushShotStoryboardImageToInvoke(
        formData({
          projectId: String(projectId),
          sequenceId: String(sequenceId), // claimed, wrong
          shotId: String(shotId),
          imageId: String(imageId),
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Shot does not belong to this sequence.");
  });

  it("refuses a storyboard draft that belongs to a different shot than claimed", async () => {
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const otherShotId = await insertShot(ctx, sequenceId);
    const imageId = await insertStoryboardImage(ctx, otherShotId); // real owner: otherShotId

    const url = await captureRedirect(() =>
      pushShotStoryboardImageToInvoke(
        formData({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId), // claimed, wrong
          imageId: String(imageId),
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Storyboard draft does not belong to this shot.");
  });

  it("refuses a sequence that belongs to a different project than claimed", async () => {
    const projectId = await insertProject(ctx);
    const otherProjectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, otherProjectId); // real owner: otherProjectId
    const shotId = await insertShot(ctx, sequenceId);
    const imageId = await insertStoryboardImage(ctx, shotId);

    const url = await captureRedirect(() =>
      pushShotStoryboardImageToInvoke(
        formData({
          projectId: String(projectId), // claimed, wrong
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          imageId: String(imageId),
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Sequence does not belong to this project.");
  });
});

describe("pushSequenceStoryboardImageToInvoke — ownership chain up to the project", () => {
  it("refuses a sequence that belongs to a different project than claimed", async () => {
    const projectId = await insertProject(ctx);
    const otherProjectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, otherProjectId); // real owner: otherProjectId
    const imageId = await insertSequenceStoryboardImage(ctx, sequenceId);

    const url = await captureRedirect(() =>
      pushSequenceStoryboardImageToInvoke(
        formData({
          projectId: String(projectId), // claimed, wrong
          sequenceId: String(sequenceId),
          imageId: String(imageId),
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Sequence does not belong to this project.");
  });

  it("refuses a Sequence Storyboard draft that belongs to a different sequence than claimed", async () => {
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const otherSequenceId = await insertSequence(ctx, projectId);
    const imageId = await insertSequenceStoryboardImage(ctx, otherSequenceId); // real owner: otherSequenceId

    const url = await captureRedirect(() =>
      pushSequenceStoryboardImageToInvoke(
        formData({
          projectId: String(projectId),
          sequenceId: String(sequenceId), // claimed, wrong
          imageId: String(imageId),
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Sequence Storyboard draft does not belong to this sequence.");
  });
});
