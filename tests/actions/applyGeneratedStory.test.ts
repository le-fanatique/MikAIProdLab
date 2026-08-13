import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, readProject } from "./helpers/fixtures";

let ctx: TempDb;
let applyGeneratedStory: typeof import("@/actions/llm/story").applyGeneratedStory;
let projectId: number;

// Full initial state so a diff against `before` can prove which columns move
// and which do not, including the sibling narrative column (`outline`).
const INITIAL = {
  pitch: "A pitch",
  outline: "An outline",
  description: "A description",
  status: "active" as const,
};

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ applyGeneratedStory } = await import("@/actions/llm/story"));
  projectId = await insertProject(ctx, "Story project");
  await ctx.db.update(ctx.schema.projects).set(INITIAL).where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("applyGeneratedStory — exact write", () => {
  it("writes only story and updatedAt, leaving every other column untouched", async () => {
    const before = await readProject(ctx, projectId);

    const result = await applyGeneratedStory(projectId, "A brand new story");

    const after = await readProject(ctx, projectId);
    expect(result).toEqual({ ok: true });
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["story"]);
    expect(after.story).toBe("A brand new story");
    // Sibling narrative column and unrelated fields are untouched.
    expect(after.outline).toBe(before.outline);
    expect(after.name).toBe(before.name);
    expect(after.pitch).toBe(before.pitch);
    expect(after.description).toBe(before.description);
    expect(after.status).toBe(before.status);
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("trims the story before writing it", async () => {
    await applyGeneratedStory(projectId, "  padded story  \n");

    const after = await readProject(ctx, projectId);
    expect(after.story).toBe("padded story");
  });
});

describe("applyGeneratedStory — empty story refusal", () => {
  it("refuses an empty string and writes nothing", async () => {
    const before = await readProject(ctx, projectId);

    const result = await applyGeneratedStory(projectId, "");

    expect(result).toEqual({ ok: false, error: "Story cannot be empty." });
    expect(await readProject(ctx, projectId)).toEqual(before);
  });

  it("refuses a whitespace-only string and writes nothing", async () => {
    const before = await readProject(ctx, projectId);

    const result = await applyGeneratedStory(projectId, "   \n\t  ");

    expect(result).toEqual({ ok: false, error: "Story cannot be empty." });
    expect(await readProject(ctx, projectId)).toEqual(before);
  });
});

describe("applyGeneratedStory — nonexistent project", () => {
  it(
    "returns ok:true without touching any row — the action never checks " +
      "project existence before writing; this is the observed behavior, " +
      "deliberately frozen here, not a corrected one",
    async () => {
      const before = await readProject(ctx, projectId);

      const result = await applyGeneratedStory(999999, "Story for a project that does not exist");

      expect(result).toEqual({ ok: true });
      // The only real project in this database is unaffected: the update's
      // WHERE clause matched zero rows and drizzle-orm does not throw when a
      // sqlite UPDATE affects nothing.
      expect(await readProject(ctx, projectId)).toEqual(before);
    }
  );
});
