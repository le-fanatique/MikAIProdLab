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
let updateLlmTemplateContent: typeof import("@/actions/llmTemplates").updateLlmTemplateContent;
let deleteLlmTemplate: typeof import("@/actions/llmTemplates").deleteLlmTemplate;
let storyGenerateDescriptor: typeof import("@/lib/llmWorkspace/descriptors/story").storyGenerateDescriptor;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ createLlmTemplateFromDescriptor, importLlmTemplate, updateLlmTemplateMetadata, updateLlmTemplateContent, deleteLlmTemplate } =
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
    expect(target).toBe(
      `/settings/llm-workflows?error=invalid_json&detail=${encodeURIComponent("The file is not valid JSON.")}`
    );

    const after = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(after.length).toBe(before.length);
  });

  it("refuses a well-formed JSON object that fails registry validation", async () => {
    const before = await ctx.db.select().from(ctx.schema.llmTemplates);
    const broken = { ...storyGenerateDescriptor, commit: ["notARealAction"] };
    const formData = fileFormData("templateFile", JSON.stringify(broken), "broken2.json");

    const target = await captureRedirect(() => importLlmTemplate(formData));
    expect(target).toBe(
      `/settings/llm-workflows?error=invalid_json&detail=${encodeURIComponent(
        '"commit" references an unknown action id "notARealAction".'
      )}`
    );

    const after = await ctx.db.select().from(ctx.schema.llmTemplates);
    expect(after.length).toBe(before.length);
  });

  // LLMW.IMPORT.DETAIL.1 (§2.1) — the redirected `detail` must decode to
  // exactly `result.reason` (`validateLlmTemplateJson`'s failure branch),
  // not merely contain a fragment of it: this is the proof that the message
  // arrives at the screen whole.
  it("carries the exact validator message in the redirect's detail param", async () => {
    const formData = fileFormData("templateFile", "{ not json", "broken3.json");

    const target = await captureRedirect(() => importLlmTemplate(formData));
    const url = new URL(target, "http://localhost");
    expect(url.searchParams.get("error")).toBe("invalid_json");
    expect(url.searchParams.get("detail")).toBe("The file is not valid JSON.");
  });

  // §2.2 — the validator's field-type rule message contains quotes and
  // brackets (`"output.item.fields[0].type"`); prove the encode/decode
  // round-trip preserves it without loss.
  it("round-trips a detail message containing quotes and brackets", async () => {
    const broken = {
      ...storyGenerateDescriptor,
      output: {
        kind: "list",
        arrayKey: "items",
        item: {
          fields: [{ field: "name", jsonKey: "name" }],
          validity: { fields: [], require: "all" },
        },
        selection: { formDataKey: "selected" },
        errors: { unparsable: "x", notArray: "x", empty: "x" },
      },
    };
    const formData = fileFormData("templateFile", JSON.stringify(broken), "broken4.json");

    const target = await captureRedirect(() => importLlmTemplate(formData));
    const url = new URL(target, "http://localhost");
    expect(url.searchParams.get("error")).toBe("invalid_json");
    expect(url.searchParams.get("detail")).toBe(
      '"output.item.fields[0].type" must be "string", "number" or "enum" (was absent).'
    );
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

// ---------------------------------------------------------------------------
// LLMW.EDITOR.CORE.1 (E1a) — the one path that touches `templateJson` after
// creation. §"Validation attendue" of the ticket names two required proofs
// on a disposable database, both here:
//   - a patch that tries to change `commit` / `output` / `anchor` does not
//     change them — a read-after-write shows the coupled triangle identical;
//   - an invalid patch (unknown variable id, unknown render form) is refused
//     by `validateLlmTemplateJson` and nothing is written.
// ---------------------------------------------------------------------------

async function insertEditableTemplate() {
  const [row] = await ctx.db
    .insert(ctx.schema.llmTemplates)
    .values({
      name: "Editable story",
      description: null,
      anchorKind: "project",
      projectId: null,
      templateJson: JSON.stringify(storyGenerateDescriptor),
      sourceFilename: null,
    })
    .returning();
  return row;
}

function patchFormData(patch: unknown): FormData {
  const formData = new FormData();
  formData.set("patch", JSON.stringify(patch));
  return formData;
}

describe("updateLlmTemplateContent", () => {
  it("refuses an id that does not exist", async () => {
    const target = await captureRedirect(() =>
      updateLlmTemplateContent(999999, patchFormData({ name: "Whatever" }))
    );
    expect(target).toBe("/settings/llm-workflows?error=not_found");
  });

  it("applies an editable-field patch (name, template.blocks) and touches updatedAt", async () => {
    const row = await insertEditableTemplate();

    const target = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          name: "My custom story prompt",
          templateBlocks: [{ text: "Write a story synopsis, my own way." }],
        })
      )
    );
    expect(target).toBe(`/settings/llm-workflows/${row.id}`);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    const descriptor = JSON.parse(after.templateJson);
    expect(descriptor.name).toBe("My custom story prompt");
    expect(descriptor.template.blocks).toEqual([{ text: "Write a story synopsis, my own way." }]);
    expect(after.updatedAt >= row.updatedAt).toBe(true);
  });

  // THE assertion the whole ticket rests on.
  it("a patch that tries to change commit, output or anchor does not change them", async () => {
    const row = await insertEditableTemplate();
    const before = JSON.parse(row.templateJson);

    const target = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          name: "Renamed, but the triangle should not move",
          commit: ["applyGeneratedOutline"],
          output: {
            kind: "text",
            target: { entity: "shot" },
            field: "hacked",
            errors: { empty: "x" },
          },
          anchor: { kind: "entity", entity: "asset" },
          messages: { notConfigured: "hacked", chainNotFound: {} },
          preconditions: [{ refs: [], require: "all", message: "hacked" }],
        })
      )
    );
    expect(target).toBe(`/settings/llm-workflows/${row.id}`);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    const descriptor = JSON.parse(after.templateJson);

    // The read-after-write proof: the coupled triangle is byte-for-byte what
    // it was before the patch, whatever the patch itself tried to say.
    expect(descriptor.commit).toEqual(before.commit);
    expect(descriptor.output).toEqual(before.output);
    expect(descriptor.anchor).toEqual(before.anchor);
    expect(descriptor.messages).toEqual(before.messages);
    expect(descriptor.preconditions).toEqual(before.preconditions);
    // The one field the patch legitimately named did apply.
    expect(descriptor.name).toBe("Renamed, but the triangle should not move");
  });

  it("refuses a patch naming an unknown variable id and writes nothing", async () => {
    const row = await insertEditableTemplate();

    const target = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          contextVariables: [{ id: "NOT.A.REAL.VARIABLE", userAdjustable: false }],
        })
      )
    );
    const url = new URL(target, "http://localhost");
    expect(url.searchParams.get("error")).toBe("invalid_json");
    expect(url.searchParams.get("detail")).toMatch(/unknown variable id/i);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.templateJson).toBe(row.templateJson);
  });

  it("refuses a patch referencing an unknown render form and writes nothing", async () => {
    const row = await insertEditableTemplate();

    const target = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          templateBlocks: [{ variable: "PROJECT.IDENTITY", render: "totally.made.up" }],
        })
      )
    );
    const url = new URL(target, "http://localhost");
    expect(url.searchParams.get("error")).toBe("invalid_json");
    expect(url.searchParams.get("detail")).toMatch(/unknown render form/i);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.templateJson).toBe(row.templateJson);
  });

  it("refuses a missing patch field and writes nothing", async () => {
    const row = await insertEditableTemplate();
    const target = await captureRedirect(() => updateLlmTemplateContent(row.id, new FormData()));
    expect(target).toBe(`/settings/llm-workflows/${row.id}?error=missing_patch`);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.templateJson).toBe(row.templateJson);
  });

  it("refuses a patch field that is not valid JSON and writes nothing", async () => {
    const row = await insertEditableTemplate();
    const formData = new FormData();
    formData.set("patch", "{ not json");
    const target = await captureRedirect(() => updateLlmTemplateContent(row.id, formData));
    expect(target).toBe(`/settings/llm-workflows/${row.id}?error=invalid_patch_json`);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.templateJson).toBe(row.templateJson);
  });

  it("can add and remove a context variable via the patch", async () => {
    const row = await insertEditableTemplate();

    const added = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          contextVariables: [
            { id: "PROJECT.IDENTITY", userAdjustable: false },
            { id: "PROJECT.STYLE", userAdjustable: true },
          ],
        })
      )
    );
    expect(added).toBe(`/settings/llm-workflows/${row.id}`);
    let [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(JSON.parse(after.templateJson).context.variables).toEqual([
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.STYLE", userAdjustable: true },
    ]);

    const removed = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          contextVariables: [{ id: "PROJECT.IDENTITY", userAdjustable: false }],
        })
      )
    );
    expect(removed).toBe(`/settings/llm-workflows/${row.id}`);
    [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(JSON.parse(after.templateJson).context.variables).toEqual([{ id: "PROJECT.IDENTITY", userAdjustable: false }]);
  });

  it("can declare intent.freeText through the patch", async () => {
    const row = await insertEditableTemplate();

    const target = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          intentFreeText: { label: "Director's note" },
        })
      )
    );
    expect(target).toBe(`/settings/llm-workflows/${row.id}`);
    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(JSON.parse(after.templateJson).intent.freeText).toEqual({ label: "Director's note" });
  });

  // R1.2 (retake): `updateLlmTemplateContent` used to write only
  // `templateJson`, so the `name` column desynced from `descriptor.name`
  // whenever a patch renamed the template. The list at
  // `/settings/llm-workflows` reads the column.
  it("R1.2: writes the name column from the validated descriptor when a patch renames the template", async () => {
    const row = await insertEditableTemplate();

    const target = await captureRedirect(() =>
      updateLlmTemplateContent(row.id, patchFormData({ name: "Renamed via patch" }))
    );
    expect(target).toBe(`/settings/llm-workflows/${row.id}`);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    // The column and the stored descriptor's own `name` agree.
    expect(after.name).toBe("Renamed via patch");
    expect(JSON.parse(after.templateJson).name).toBe("Renamed via patch");
  });

  it("R1.2: a patch that does not touch name leaves the column at the descriptor's current name", async () => {
    const row = await insertEditableTemplate();

    const target = await captureRedirect(() =>
      updateLlmTemplateContent(row.id, patchFormData({ templateBlocks: [{ text: "unrelated change" }] }))
    );
    expect(target).toBe(`/settings/llm-workflows/${row.id}`);

    const [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(after.name).toBe(storyGenerateDescriptor.name);
    expect(JSON.parse(after.templateJson).name).toBe(storyGenerateDescriptor.name);
  });

  // R1.3 (retake): `null` on an intent.* field removes it from the merged
  // descriptor — proved end to end through the action, not just the pure
  // module, and specifically that the removal does not reopen the coupled
  // triangle.
  it("R1.3: null removes intent.freeText after it was added, and the triangle stays untouched", async () => {
    const row = await insertEditableTemplate();
    const before = JSON.parse(row.templateJson);

    const added = await captureRedirect(() =>
      updateLlmTemplateContent(row.id, patchFormData({ intentFreeText: { label: "Director's note" } }))
    );
    expect(added).toBe(`/settings/llm-workflows/${row.id}`);
    let [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    expect(JSON.parse(after.templateJson).intent.freeText).toEqual({ label: "Director's note" });

    const removed = await captureRedirect(() =>
      updateLlmTemplateContent(
        row.id,
        patchFormData({
          intentFreeText: null,
          // A backdoor attempt riding along the same removal patch: null
          // must never touch anything outside the three intent fields.
          commit: ["applyGeneratedOutline"],
          anchor: { kind: "entity", entity: "asset" },
        })
      )
    );
    expect(removed).toBe(`/settings/llm-workflows/${row.id}`);
    [after] = await ctx.db.select().from(ctx.schema.llmTemplates).where(eq(ctx.schema.llmTemplates.id, row.id));
    const descriptor = JSON.parse(after.templateJson);
    expect(descriptor.intent.freeText).toBeUndefined();
    expect(descriptor.commit).toEqual(before.commit);
    expect(descriptor.anchor).toEqual(before.anchor);
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
