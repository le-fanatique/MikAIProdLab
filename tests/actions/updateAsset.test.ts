import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// updateAsset — LLMW.LIGHTING.SURFACE.1 (B15b). `updateAsset` is the Edit
// Asset form's own action
// (src/app/projects/[projectId]/assets/[assetId]/edit/page.tsx), widened by
// this ticket to also write `lighting`. Redirects unconditionally on
// success — captured directly.
//
// The proof that counts: a full-form resubmit (every field at its own
// current value) must not clear `lighting` — the S4 trap in reverse.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateAsset: typeof import("@/actions/assets").updateAsset;
let projectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function fullAssetForm(
  asset: Awaited<ReturnType<typeof readAsset>>,
  overrides: Record<string, string> = {}
) {
  return form({
    name: asset.name,
    type: asset.type,
    description: asset.description ?? "",
    notes: asset.notes ?? "",
    lighting: asset.lighting ?? "",
    ...overrides,
  });
}

async function captureAssetRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2];
    }
    throw err;
  }
  throw new Error("Expected updateAsset to redirect, but it returned normally.");
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateAsset } = await import("@/actions/assets"));
  projectId = await insertProject(ctx, "Owner project");
});

afterAll(() => ctx.cleanup());

describe("updateAsset — lighting joins the existing multi-column form/action", () => {
  it("writes lighting when the form submits a new value for it", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Rooftop",
      lighting: "Old lighting",
    });
    const before = await readAsset(ctx, assetId);

    await captureAssetRedirect(() =>
      updateAsset(assetId, projectId, fullAssetForm(before, { lighting: "Overcast daylight, diffused" }))
    );

    expect((await readAsset(ctx, assetId)).lighting).toBe("Overcast daylight, diffused");
  });

  it("preserves lighting on a full-form resubmit that only changes the name — the S4 proof", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Alley",
      lighting: "Sodium streetlight, orange",
      notes: "Untouched notes",
    });
    const before = await readAsset(ctx, assetId);

    await captureAssetRedirect(() =>
      updateAsset(assetId, projectId, fullAssetForm(before, { name: "Alley renamed" }))
    );

    const after = await readAsset(ctx, assetId);
    expect(after.lighting).toBe("Sodium streetlight, orange");
    expect(after.name).toBe("Alley renamed");
    expect(after.notes).toBe("Untouched notes");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["name"]);
  });

  it("clears lighting to null on a blank submission, same as description/notes", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      type: "environment",
      name: "Bridge",
      lighting: "Old lighting",
    });
    const before = await readAsset(ctx, assetId);

    await captureAssetRedirect(() =>
      updateAsset(assetId, projectId, fullAssetForm(before, { lighting: "" }))
    );

    expect((await readAsset(ctx, assetId)).lighting).toBeNull();
  });
});
