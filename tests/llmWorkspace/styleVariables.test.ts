import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// PROJECT.STYLE.DRAFT — STYLE.LLM.VARS.1.
//
// On the model of lightingVariables.test.ts: a disposable database, a
// resolver imported dynamically after setupTempDb() so "@/db" binds to the
// temp file, not data/mikailab.db.
//
// Four cases (the ticket's own list):
//   - a project with no Working Draft at all -> mode: "none";
//   - a draft row that exists but is entirely empty -> mode: "draft",
//     compiledText: "" (a real, sparse-compilation product state, never
//     folded into mode: "none");
//   - a draft filled with a brief, one section per pillar and two approved
//     rules -> compiledText contains both sections and both rules;
//   - a rule whose status is not "approved" does not appear in compiledText
//     — verified directly against compileStyleSnapshot.ts rather than
//     assumed: StyleRuleStatus is the closed union "approved" | "disabled"
//     (src/lib/projectStyle/styleSnapshot.ts), and compileStyleSnapshot
//     filters out exactly `rule.status !== "disabled"` — so the only
//     non-approved status this schema can express, "disabled", is in fact
//     the one compileStyleSnapshot omits. The case below uses a "disabled"
//     rule.
//
// Plus the render form `styleAdjust.draftLines` on both modes.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveProjectStyleDraft: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectStyleDraft;
let renderProjectStyleDraftLines: typeof import("@/lib/llmWorkspace/variables/registry").renderProjectStyleDraftLines;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveProjectStyleDraft, renderProjectStyleDraftLines } = await import(
    "@/lib/llmWorkspace/variables/registry"
  ));
});

afterAll(() => ctx.cleanup());

async function insertDraft(
  projectId: number,
  values: Partial<typeof ctx.schema.projectStyleDrafts.$inferInsert> = {}
): Promise<number> {
  const [row] = await ctx.db
    .insert(ctx.schema.projectStyleDrafts)
    .values({ projectId, ...values })
    .returning({ id: ctx.schema.projectStyleDrafts.id });
  return row.id;
}

async function insertSection(
  draftId: number,
  values: Partial<typeof ctx.schema.projectStyleSections.$inferInsert> & {
    pillar: "world" | "visual";
    heading: string;
    content: string;
  }
): Promise<void> {
  await ctx.db.insert(ctx.schema.projectStyleSections).values({ draftId, ...values });
}

async function insertRule(
  draftId: number,
  values: Partial<typeof ctx.schema.projectStyleRules.$inferInsert> & { instruction: string }
): Promise<void> {
  await ctx.db.insert(ctx.schema.projectStyleRules).values({ draftId, ...values });
}

describe("resolveProjectStyleDraft — resolver contract", () => {
  it("returns mode: \"none\" when the project has no Working Draft", async () => {
    const projectId = await insertProject(ctx, "STYLE.DRAFT no-draft project");

    expect(await resolveProjectStyleDraft(projectId)).toEqual({ mode: "none" });
  });

  it("returns mode: \"draft\" with compiledText: \"\" for an entirely empty draft", async () => {
    const projectId = await insertProject(ctx, "STYLE.DRAFT empty project");
    await insertDraft(projectId);

    expect(await resolveProjectStyleDraft(projectId)).toEqual({
      mode: "draft",
      revision: 1,
      directionBrief: null,
      compiledText: "",
    });
  });

  it("compiles a brief, one section per pillar and two approved rules", async () => {
    const projectId = await insertProject(ctx, "STYLE.DRAFT filled project");
    const draftId = await insertDraft(projectId, { directionBrief: "A weathered, hand-painted look." });
    await insertSection(draftId, { pillar: "world", heading: "Costume language", content: "Layered, patched fabrics." });
    await insertSection(draftId, { pillar: "visual", heading: "Palette", content: "Desaturated earth tones." });
    await insertRule(draftId, { instruction: "Never render clean, unweathered surfaces.", orderIndex: 0 });
    await insertRule(draftId, { instruction: "Keep silhouettes readable at a distance.", orderIndex: 1 });

    const result = await resolveProjectStyleDraft(projectId);
    expect(result.mode).toBe("draft");
    if (result.mode !== "draft") throw new Error("unreachable");
    expect(result.revision).toBe(1);
    expect(result.directionBrief).toBe("A weathered, hand-painted look.");
    expect(result.compiledText).toContain("Costume language:\nLayered, patched fabrics.");
    expect(result.compiledText).toContain("Palette:\nDesaturated earth tones.");
    expect(result.compiledText).toContain("- Never render clean, unweathered surfaces.");
    expect(result.compiledText).toContain("- Keep silhouettes readable at a distance.");
  });

  it("a disabled rule does not appear in compiledText", async () => {
    const projectId = await insertProject(ctx, "STYLE.DRAFT disabled-rule project");
    const draftId = await insertDraft(projectId);
    await insertRule(draftId, { instruction: "Should not appear.", status: "disabled" });

    const result = await resolveProjectStyleDraft(projectId);
    if (result.mode !== "draft") throw new Error("unreachable");
    expect(result.compiledText).toBe("");
    expect(result.compiledText).not.toContain("Should not appear.");
  });
});

describe("styleAdjust.draftLines — render form", () => {
  it("renders an explicit line when there is no Working Draft", () => {
    expect(renderProjectStyleDraftLines({ mode: "none" })).toBe("No Working Draft exists yet for this project.");
  });

  it("renders the brief and compiled text when a draft exists", () => {
    const rendered = renderProjectStyleDraftLines({
      mode: "draft",
      revision: 3,
      directionBrief: "A weathered, hand-painted look.",
      compiledText: "Style Rules:\n- Keep silhouettes readable at a distance.",
    });
    expect(rendered).toBe(
      [
        "Direction brief: A weathered, hand-painted look.",
        "Current Working Draft:\nStyle Rules:\n- Keep silhouettes readable at a distance.",
      ].join("\n")
    );
  });

  it("renders \"(empty)\" for a draft with no brief and no compiled content", () => {
    const rendered = renderProjectStyleDraftLines({
      mode: "draft",
      revision: 1,
      directionBrief: null,
      compiledText: "",
    });
    expect(rendered).toBe("Current Working Draft: (empty)");
  });
});
