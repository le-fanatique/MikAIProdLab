import { describe, expect, it } from "vitest";
import { validateLlmTemplateJson } from "@/lib/llmWorkspace/templateStorage";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";
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
