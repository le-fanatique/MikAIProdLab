import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, readProject } from "./helpers/fixtures";

let ctx: TempDb;
let applyGeneratedOutline: typeof import("@/actions/llm/outlineGeneration").applyGeneratedOutline;
let projectId: number;

// Full initial state so a diff against `before` can prove which columns move
// and which do not, including the sibling narrative column (`story`).
const INITIAL = {
  pitch: "A pitch",
  story: "A story",
  description: "A description",
  status: "active" as const,
};

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ applyGeneratedOutline } = await import("@/actions/llm/outlineGeneration"));
  projectId = await insertProject(ctx, "Outline project");
  await ctx.db.update(ctx.schema.projects).set(INITIAL).where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("applyGeneratedOutline — exact write", () => {
  it("writes only outline and updatedAt, leaving every other column untouched", async () => {
    const before = await readProject(ctx, projectId);

    const result = await applyGeneratedOutline(projectId, "A brand new outline");

    const after = await readProject(ctx, projectId);
    expect(result).toEqual({ ok: true });
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["outline"]);
    expect(after.outline).toBe("A brand new outline");
    // Sibling narrative column and unrelated fields are untouched.
    expect(after.story).toBe(before.story);
    expect(after.name).toBe(before.name);
    expect(after.pitch).toBe(before.pitch);
    expect(after.description).toBe(before.description);
    expect(after.status).toBe(before.status);
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("trims the outline before writing it", async () => {
    await applyGeneratedOutline(projectId, "  padded outline  \n");

    const after = await readProject(ctx, projectId);
    expect(after.outline).toBe("padded outline");
  });
});

describe("applyGeneratedOutline — empty outline refusal", () => {
  it("refuses an empty string and writes nothing", async () => {
    const before = await readProject(ctx, projectId);

    const result = await applyGeneratedOutline(projectId, "");

    expect(result).toEqual({ ok: false, error: "Outline cannot be empty." });
    expect(await readProject(ctx, projectId)).toEqual(before);
  });

  it("refuses a whitespace-only string and writes nothing", async () => {
    const before = await readProject(ctx, projectId);

    const result = await applyGeneratedOutline(projectId, "   \n\t  ");

    expect(result).toEqual({ ok: false, error: "Outline cannot be empty." });
    expect(await readProject(ctx, projectId)).toEqual(before);
  });
});

describe("applyGeneratedOutline — nonexistent project", () => {
  it(
    "returns ok:true without touching any row — the action never checks " +
      "project existence before writing; this is the observed behavior, " +
      "deliberately frozen here, not a corrected one",
    async () => {
      const before = await readProject(ctx, projectId);

      const result = await applyGeneratedOutline(
        999999,
        "Outline for a project that does not exist"
      );

      expect(result).toEqual({ ok: true });
      // The only real project in this database is unaffected: the update's
      // WHERE clause matched zero rows and drizzle-orm does not throw when a
      // sqlite UPDATE affects nothing.
      expect(await readProject(ctx, projectId)).toEqual(before);
    }
  );
});
