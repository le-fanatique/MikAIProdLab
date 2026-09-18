import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertProjectStyleReferenceImage } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// INVOKE.STYLE.1 — ticket §3's own proof floor: the ownership guard for the
// fifth push action (a Project Style reference belongs to the project it
// claims, never trusted on a bare id), mirroring the same test shape as
// tests/actions/pushStoryboardImageToInvoke.test.ts for INVOKE.PUSH.2's two
// push actions. Every case below is refused BEFORE any network call to
// InvokeAI is attempted, so this needs no InvokeAI server and no network
// mock.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let pushProjectStyleReferenceImageToInvoke: typeof import("@/actions/invoke")["pushProjectStyleReferenceImageToInvoke"];

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ pushProjectStyleReferenceImageToInvoke } = await import("@/actions/invoke"));
});

afterAll(() => {
  ctx.cleanup();
});

describe("pushProjectStyleReferenceImageToInvoke — ownership chain", () => {
  it("refuses a reference image that belongs to a different project than claimed", async () => {
    const projectId = await insertProject(ctx);
    const otherProjectId = await insertProject(ctx);
    const referenceId = await insertProjectStyleReferenceImage(ctx, otherProjectId); // real owner: otherProjectId

    const url = await captureRedirect(() =>
      pushProjectStyleReferenceImageToInvoke(
        formData({
          projectId: String(projectId), // claimed, wrong
          referenceId: String(referenceId),
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Reference image does not belong to this project.");
  });

  it("refuses a reference id that does not exist at all", async () => {
    const projectId = await insertProject(ctx);

    const url = await captureRedirect(() =>
      pushProjectStyleReferenceImageToInvoke(
        formData({
          projectId: String(projectId),
          referenceId: "999999",
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Reference image not found.");
  });

  it("refuses a project id that does not exist at all", async () => {
    const projectId = await insertProject(ctx);
    const referenceId = await insertProjectStyleReferenceImage(ctx, projectId);

    const url = await captureRedirect(() =>
      pushProjectStyleReferenceImageToInvoke(
        formData({
          projectId: "999999", // claimed, wrong
          referenceId: String(referenceId),
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Project not found.");
  });

  it("refuses a non-integer request before touching the database", async () => {
    const url = await captureRedirect(() =>
      pushProjectStyleReferenceImageToInvoke(
        formData({
          projectId: "not-a-number",
          referenceId: "1",
        })
      )
    );

    expect(url).toContain("invokeError=");
    expect(decodeURIComponent(url)).toContain("Invalid request.");
  });
});
