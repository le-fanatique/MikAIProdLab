import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject } from "./helpers/fixtures";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// LLMW.STORAGE.1 (B6a) — write-side proof on a disposable database, migrated
// through `drizzle/` by `setupTempDb()` (which therefore also proves the
// ticket's migration applies cleanly). Covers §7's three required cases:
// creation from a code descriptor, an import refused on invalid JSON, and
// deletion of an id that does not exist.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let createLlmTemplateFromDescriptor: typeof import("@/actions/llmTemplates").createLlmTemplateFromDescriptor;
let importLlmTemplate: typeof import("@/actions/llmTemplates").importLlmTemplate;
let updateLlmTemplateMetadata: typeof import("@/actions/llmTemplates").updateLlmTemplateMetadata;
let deleteLlmTemplate: typeof import("@/actions/llmTemplates").deleteLlmTemplate;
let storyGenerateDescriptor: typeof import("@/lib/llmWorkspace/descriptors/story").storyGenerateDescriptor;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ createLlmTemplateFromDescriptor, importLlmTemplate, updateLlmTemplateMetadata, deleteLlmTemplate } =
    await import("@/actions/llmTemplates"));
  ({ storyGenerateDescriptor } = await import("@/lib/llmWorkspace/descriptors/story"));
});

afterAll(() => ctx.cleanup());

function fileFormData(field: string, content: string, filename: string): FormData {
  const formData = new FormData();
  const file = new File([content], filename, { type: "application/json" });
  formData.set(field, file);
  return formData;
}

describe("createLlmTemplateFromDescriptor", () => {
  it("duplicates a known code descriptor into an editable row", async () => {
    const target = await captureRedirect(() => createLlmTemplateFromDescriptor("story.generate"));
    expect(target).toBe("/settings/llm-workflows");

    const [row] = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(row.name).toBe(storyGenerateDescriptor.name);
    expect(row.anchorKind).toBe("project");
    expect(row.projectId).toBeNull();
    expect(row.sourceFilename).toBeNull();
    expect(JSON.parse(row.templateJson)).toEqual(storyGenerateDescriptor);
  });

  it("refuses an unknown descriptor id and writes nothing", async () => {
    const before = await ctx.db.select().from(ctx.schema.llmTemplates);
    const target = await captureRedirect(() => createLlmTemplateFromDescriptor("not.a.real.descriptor"));
    expect(target).toBe("/settings/llm-workflows?error=unknown_descriptor");
    const after = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(after.length).toBe(before.length);
  });
});

describe("importLlmTemplate", () => {
  it("refuses invalid JSON and writes nothing", async () => {
    const before = await ctx.db.select().from(ctx.schema.llmTemplates);
    const formData = fileFormData("templateFile", "{ not json", "broken.json");

    const target = await captureRedirect(() => importLlmTemplate(formData));
    expect(target).toBe("/settings/llm-workflows?error=invalid_json");

    const after = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(after.length).toBe(before.length);
  });

  it("refuses a well-formed JSON object that fails registry validation", async () => {
    const before = await ctx.db.select().from(ctx.schema.llmTemplates);
    const broken = { ...storyGenerateDescriptor, commit: ["notARealAction"] };
    const formData = fileFormData("templateFile", JSON.stringify(broken), "broken2.json");

    const target = await captureRedirect(() => importLlmTemplate(formData));
    expect(target).toBe("/settings/llm-workflows?error=invalid_json");

    const after = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(after.length).toBe(before.length);
  });

  it("imports a valid template file and records its source filename", async () => {
    const formData = fileFormData("templateFile", JSON.stringify(storyGenerateDescriptor), "my-story.json");

    const target = await captureRedirect(() => importLlmTemplate(formData));
    expect(target).toBe("/settings/llm-workflows");

    const rows = await ctx.db.select().from(ctx.schema.llmTemplates);
    const imported = rows.find((r) => r.sourceFilename === "my-story.json");
    expect(imported).toBeDefined();
    expect(imported?.anchorKind).toBe("project");
  });

  it("refuses a missing file and writes nothing", async () => {
    const before = await ctx.db.select().from(ctx.schema.llmTemplates);
    const target = await captureRedirect(() => importLlmTemplate(new FormData()));
    expect(target).toBe("/settings/llm-workflows?error=missing_json");
    const after = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(after.length).toBe(before.length);
  });
});

describe("updateLlmTemplateMetadata", () => {
  it("updates name, description and projectId, and updatedAt, without touching templateJson", async () => {
    const projectId = await insertProject(ctx, "Assignable project");
    const [row] = await ctx.db
      .insert(ctx.schema.llmTemplates)
      .values({
        name: "Original name",
        description: null,
        anchorKind: "project",
        projectId: null,
        templateJson: JSON.stringify(storyGenerateDescriptor),
        sourceFilename: null,
      })
      .returning();

    const formData = new FormData();
    formData.set("name", "Renamed");
    formData.set("description", "A new description");
    formData.set("projectId", String(projectId));

    const target = await captureRedirect(() => updateLlmTemplateMetadata(row.id, formData));
    expect(target).toBe("/settings/llm-workflows");

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.name).toBe("Renamed");
    expect(after.description).toBe("A new description");
    expect(after.projectId).toBe(projectId);
    expect(after.templateJson).toBe(row.templateJson);
    expect(after.updatedAt >= row.updatedAt).toBe(true);
  });

  it("refuses an id that does not exist", async () => {
    const formData = new FormData();
    formData.set("name", "Whatever");
    const target = await captureRedirect(() => updateLlmTemplateMetadata(999999, formData));
    expect(target).toBe("/settings/llm-workflows?error=not_found");
  });

  // R2 (supervisor review, tour 1): projectId is an untrusted foreign key —
  // a non-integer value or a nonexistent project id must redirect with
  // ?error=invalid_project, never let SQLite's foreign_keys=ON raise.
  it("refuses a non-integer projectId and writes nothing", async () => {
    const [row] = await ctx.db
      .insert(ctx.schema.llmTemplates)
      .values({
        name: "Scope target",
        description: null,
        anchorKind: "project",
        projectId: null,
        templateJson: JSON.stringify(storyGenerateDescriptor),
        sourceFilename: null,
      })
      .returning();

    const formData = new FormData();
    formData.set("name", "Scope target");
    formData.set("projectId", "not-a-number");

    const target = await captureRedirect(() => updateLlmTemplateMetadata(row.id, formData));
    expect(target).toBe("/settings/llm-workflows?error=invalid_project");

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.projectId).toBeNull();
    expect(after.name).toBe("Scope target");
  });

  it("refuses a projectId that does not reference an existing project", async () => {
    const [row] = await ctx.db
      .insert(ctx.schema.llmTemplates)
      .values({
        name: "Scope target 2",
        description: null,
        anchorKind: "project",
        projectId: null,
        templateJson: JSON.stringify(storyGenerateDescriptor),
        sourceFilename: null,
      })
      .returning();

    const formData = new FormData();
    formData.set("name", "Scope target 2");
    formData.set("projectId", "999999");

    const target = await captureRedirect(() => updateLlmTemplateMetadata(row.id, formData));
    expect(target).toBe("/settings/llm-workflows?error=invalid_project");

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.projectId).toBeNull();
  });
});

describe("deleteLlmTemplate", () => {
  it("refuses to delete an id that does not exist", async () => {
    const before = await ctx.db.select().from(ctx.schema.llmTemplates);
    const target = await captureRedirect(() => deleteLlmTemplate(999999));
    expect(target).toBe("/settings/llm-workflows?error=not_found");
    const after = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(after.length).toBe(before.length);
  });

  it("deletes an existing row", async () => {
    const [row] = await ctx.db
      .insert(ctx.schema.llmTemplates)
      .values({
        name: "To delete",
        description: null,
        anchorKind: "project",
        projectId: null,
        templateJson: JSON.stringify(storyGenerateDescriptor),
        sourceFilename: null,
      })
      .returning();

    const target = await captureRedirect(() => deleteLlmTemplate(row.id));
    expect(target).toBe("/settings/llm-workflows");

    const after = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.length).toBe(0);
  });
});
