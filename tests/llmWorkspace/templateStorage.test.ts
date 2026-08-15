import { describe, expect, it } from "vitest";
import { validateLlmTemplateJson } from "@/lib/llmWorkspace/templateStorage";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";
import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.STORAGE.1 (B6a) — §3's central proof: a real code descriptor passes,
// and each of the three registry-membership refusals (unknown VariableId,
// unknown ActionId, unknown render form) is caught before it could ever
// reach `runner.ts`, which throws on exactly the render-form case
// (runner.ts:307-341).
// ---------------------------------------------------------------------------

function clone(): OperationDescriptor {
  return JSON.parse(JSON.stringify(storyGenerateDescriptor));
}

describe("validateLlmTemplateJson", () => {
  it("accepts a real code descriptor, serialized, unchanged", () => {
    const result = validateLlmTemplateJson(JSON.stringify(storyGenerateDescriptor));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.descriptor.id).toBe("story.generate");
      expect(result.descriptor.commit).toEqual(["applyGeneratedStory"]);
    }
  });

  it("refuses JSON that does not parse", () => {
    const result = validateLlmTemplateJson("{ not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not valid JSON/i);
  });

  it("refuses a JSON value that is not an object", () => {
    const result = validateLlmTemplateJson("[1,2,3]");
    expect(result.ok).toBe(false);
  });

  it("refuses a missing required field", () => {
    const descriptor = clone() as unknown as Record<string, unknown>;
    delete descriptor.executor;
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"executor"/);
  });

  it("refuses an unknown VariableId in context.variables", () => {
    const descriptor = clone();
    descriptor.context.variables = [{ id: "NOT.A.REAL.VARIABLE" as never, userAdjustable: false }];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown variable id/i);
  });

  it("refuses an unknown ActionId in commit", () => {
    const descriptor = clone();
    descriptor.commit = ["notARealAction" as never];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown action id/i);
  });

  it("refuses an unknown entity kind on anchor.entity", () => {
    const descriptor = clone();
    (descriptor.anchor as { entity: unknown }).entity = "spaceship";
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown entity kind/i);
  });

  it("refuses a block referencing a render form that does not exist — the case runner.ts throws on", () => {
    const descriptor = clone();
    descriptor.template.blocks = [{ variable: "PROJECT.IDENTITY", render: "totally.made.up" }];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown render form/i);
  });

  it("refuses an unknown multi-variable render form", () => {
    const descriptor = clone();
    descriptor.template.blocks = [
      { variables: ["PROJECT.IDENTITY", "SEQ.CONTEXT"], render: "made.up.multi" },
    ];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown multi-variable render form/i);
  });

  it("refuses an unknown parameter render form", () => {
    const descriptor = clone();
    descriptor.template.blocks = [{ parameter: "targetSections", render: "made.up.param" }];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown parameter render form/i);
  });

  it("refuses an unknown mode render form", () => {
    const descriptor = clone();
    descriptor.template.blocks = [{ mode: true, render: "made.up.mode" }];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown mode render form/i);
  });

  it("accepts an absent optional field — messages.invalidRequest is not required", () => {
    const descriptor = clone() as unknown as Record<string, unknown>;
    // storyGenerateDescriptor already omits invalidRequest/invalidMode; the
    // real-descriptor pass above already proves this, but assert directly
    // that removing preconditions (also optional) still validates.
    delete descriptor.preconditions;
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Supervisor review retake, post-LLMW.OUTPUT.LIST.1 (B7a): `output.kind`
// must gate which shape the rest of `output` is checked against — an
// imported template declaring `kind: "list"` with a malformed `item` must be
// refused here, not at Run inside `parseListOutput`.
// ---------------------------------------------------------------------------

describe("validateLlmTemplateJson — output.kind (LLMW.OUTPUT.LIST.1, B7a)", () => {
  it("round-trips all eight built-in descriptors — the format and its validator do not diverge", () => {
    for (const [id, descriptor] of Object.entries(DESCRIPTORS)) {
      const result = validateLlmTemplateJson(JSON.stringify(descriptor));
      expect(result.ok, `${id} should validate`).toBe(true);
    }
  });

  it("refuses an object without output.kind, rather than assuming \"object\"", () => {
    const descriptor = clone() as unknown as { output: Record<string, unknown> };
    delete descriptor.output.kind;
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"output\.kind"/);
  });

  it("refuses an unknown output.kind", () => {
    const descriptor = clone() as unknown as { output: Record<string, unknown> };
    descriptor.output.kind = "table";
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"output\.kind"/);
  });

  function syntheticListDescriptor(): Record<string, unknown> {
    const base = clone() as unknown as Record<string, unknown>;
    base.output = {
      kind: "list",
      arrayKey: "items",
      item: {
        fields: [
          { field: "title", jsonKey: "title" },
          { field: "note", jsonKey: "note", truncateTo: 5 },
        ],
        validity: { fields: ["title"], require: "all" },
      },
      maxItems: 20,
      errors: {
        unparsable: "Unparsable response.",
        notArray: "No items array.",
        empty: "No valid items.",
      },
    };
    return base;
  }

  it("accepts a fully valid kind: \"list\" output", () => {
    const result = validateLlmTemplateJson(JSON.stringify(syntheticListDescriptor()));
    expect(result.ok).toBe(true);
  });

  it("refuses kind: \"list\" with output.item.fields missing", () => {
    const descriptor = syntheticListDescriptor();
    delete (descriptor.output as Record<string, unknown> & { item: Record<string, unknown> }).item.fields;
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"output\.item\.fields"/);
  });

  it("refuses kind: \"list\" with output.item.validity.fields naming an undeclared field", () => {
    const descriptor = syntheticListDescriptor();
    (descriptor.output as { item: { validity: { fields: string[] } } }).item.validity.fields = ["notDeclared"];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"output\.item\.validity\.fields".*notDeclared/);
  });

  it("refuses kind: \"list\" with a non-integer maxItems", () => {
    const descriptor = syntheticListDescriptor();
    (descriptor.output as Record<string, unknown>).maxItems = 1.5;
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"output\.maxItems"/);
  });
});

// ---------------------------------------------------------------------------
// LLMW.INTENT.FREETEXT.1 (B9a) — the sixth `Block` shape (`freeText`),
// membership-checked against `FREE_TEXT_RENDER_FORMS` the same way the other
// five are already checked (§4.5 of the ticket): a stored/imported template
// declaring a `freeText` block naming an unknown render form must be refused
// here, not left to detonate inside `runner.ts` at Run — the same B7a
// discipline this module's own header describes.
// ---------------------------------------------------------------------------

describe("validateLlmTemplateJson — freeText blocks (LLMW.INTENT.FREETEXT.1, B9a)", () => {
  it("accepts a real code descriptor declaring intent.freeText and a freeText block — shotPrompt.assist itself", () => {
    const result = validateLlmTemplateJson(JSON.stringify(DESCRIPTORS["shotPrompt.assist"]));
    expect(result.ok).toBe(true);
  });

  it("accepts a descriptor whose template declares a freeText block naming a real render form", () => {
    const descriptor = clone();
    descriptor.template.blocks = [{ freeText: true, render: "shotPrompt.freeTextDirective" }];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(true);
  });

  it("refuses a freeText block naming a render form that does not exist", () => {
    const descriptor = clone();
    descriptor.template.blocks = [{ freeText: true, render: "totally.made.up" }];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown free text render form/i);
  });

  it("refuses a freeText block whose \"freeText\" field is not literally true", () => {
    const descriptor = clone() as unknown as { template: { blocks: unknown[] } };
    descriptor.template.blocks = [{ freeText: "yes", render: "shotPrompt.freeTextDirective" }];
    const result = validateLlmTemplateJson(JSON.stringify(descriptor));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"freeText" must be true/);
  });
});
