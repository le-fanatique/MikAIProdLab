import { describe, expect, it } from "vitest";
import {
  addBlock,
  addContextVariable,
  applyEditablePatch,
  availableVariableIds,
  freeTextRenderForms,
  modeRenderForms,
  moveBlockDown,
  moveBlockUp,
  multiVariableRenderForms,
  parameterRenderForms,
  parseEditableTemplatePatch,
  removeBlockAt,
  removeContextVariable,
  renderFormsForVariable,
  toggleContextVariableAdjustable,
  variableParameterRenderForms,
} from "@/lib/llmWorkspace/templateEditor";
import {
  MODE_RENDER_FORMS,
  MULTI_VARIABLE_RENDER_FORMS,
  PARAMETER_RENDER_FORMS,
  VARIABLE_PARAMETER_RENDER_FORMS,
  VARIABLE_REGISTRY,
  VARIABLE_RENDER_FORMS,
} from "@/lib/llmWorkspace/variables/registry";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";
import type { Block, OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.EDITOR.CORE.1 (E1a) — the pure decision layer. No database: every
// assertion here is about data transformation, per `.agents/supervised_task.md`.
// ---------------------------------------------------------------------------

describe("block list manipulation", () => {
  const blocks: Block[] = [{ text: "a" }, { text: "b" }, { text: "c" }];

  it("adds a block to the end of the list", () => {
    expect(addBlock(blocks, { text: "d" })).toEqual([{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }]);
  });

  it("removes a block at an index", () => {
    expect(removeBlockAt(blocks, 1)).toEqual([{ text: "a" }, { text: "c" }]);
  });

  it("moves the first block up: no-op, list unchanged, never throws", () => {
    expect(moveBlockUp(blocks, 0)).toEqual(blocks);
  });

  it("moves a block up (not the head)", () => {
    expect(moveBlockUp(blocks, 2)).toEqual([{ text: "a" }, { text: "c" }, { text: "b" }]);
  });

  it("moves the last block down: no-op, list unchanged, never throws", () => {
    expect(moveBlockDown(blocks, 2)).toEqual(blocks);
  });

  it("moves a block down (not the tail)", () => {
    expect(moveBlockDown(blocks, 0)).toEqual([{ text: "b" }, { text: "a" }, { text: "c" }]);
  });

  it("an out-of-bounds move never throws and returns the list unchanged", () => {
    expect(moveBlockUp(blocks, -1)).toEqual(blocks);
    expect(moveBlockUp(blocks, 99)).toEqual(blocks);
    expect(moveBlockDown(blocks, -1)).toEqual(blocks);
    expect(moveBlockDown(blocks, 99)).toEqual(blocks);
  });

  it("an out-of-bounds removal never throws and returns the list unchanged", () => {
    expect(removeBlockAt(blocks, -1)).toEqual(blocks);
    expect(removeBlockAt(blocks, 99)).toEqual(blocks);
  });
});

describe("the render-form catalogue is derived from the registry tables, not recopied", () => {
  it("every variable's render forms are exactly the keys of its own VARIABLE_RENDER_FORMS entry", () => {
    const table = VARIABLE_RENDER_FORMS as Record<string, Record<string, unknown>>;
    expect(renderFormsForVariable("PROJECT.IDENTITY").sort()).toEqual(
      Object.keys(table["PROJECT.IDENTITY"] ?? {}).sort()
    );
  });

  it("a variable with no single-variable render form answers an empty catalogue, not an error", () => {
    // PROJECT.OUTLINE_SECTIONS has no entry in VARIABLE_RENDER_FORMS.
    expect(renderFormsForVariable("PROJECT.OUTLINE_SECTIONS")).toEqual([]);
  });

  it("THE assertion: the catalogue refuses a form belonging to another block type", () => {
    // A MODE_RENDER_FORMS key must never appear as a legal render form for a
    // {variable, render} block of any variable — proving the catalogue reads
    // its own table and does not fall back to a merged/hand-copied list.
    const aModeForm = Object.keys(MODE_RENDER_FORMS)[0];
    for (const id of availableVariableIds()) {
      expect(renderFormsForVariable(id)).not.toContain(aModeForm);
    }
    expect(multiVariableRenderForms()).not.toContain(aModeForm);
    expect(parameterRenderForms()).not.toContain(aModeForm);
    expect(freeTextRenderForms()).not.toContain(aModeForm);
    expect(variableParameterRenderForms()).not.toContain(aModeForm);

    // Symmetrically: a PARAMETER_RENDER_FORMS key must never appear in the
    // mode catalogue.
    const aParameterForm = Object.keys(PARAMETER_RENDER_FORMS)[0];
    expect(modeRenderForms()).not.toContain(aParameterForm);

    // And a MULTI_VARIABLE_RENDER_FORMS key must never appear as a
    // single-variable form for any variable.
    const aMultiForm = Object.keys(MULTI_VARIABLE_RENDER_FORMS)[0];
    for (const id of availableVariableIds()) {
      expect(renderFormsForVariable(id)).not.toContain(aMultiForm);
    }

    // R1.1 (retake): the sixth table, `VARIABLE_PARAMETER_RENDER_FORMS`, must
    // hold to the same rule — its own key never leaks into any other block
    // type's catalogue, and no other table's key leaks into it.
    const aVariableParameterForm = Object.keys(VARIABLE_PARAMETER_RENDER_FORMS)[0];
    for (const id of availableVariableIds()) {
      expect(renderFormsForVariable(id)).not.toContain(aVariableParameterForm);
    }
    expect(multiVariableRenderForms()).not.toContain(aVariableParameterForm);
    expect(parameterRenderForms()).not.toContain(aVariableParameterForm);
    expect(modeRenderForms()).not.toContain(aVariableParameterForm);
    expect(freeTextRenderForms()).not.toContain(aVariableParameterForm);
    expect(variableParameterRenderForms()).not.toContain(aModeForm);
    expect(variableParameterRenderForms()).not.toContain(aParameterForm);
    expect(variableParameterRenderForms()).not.toContain(aMultiForm);
  });

  it("multiVariableRenderForms / parameterRenderForms / modeRenderForms / freeTextRenderForms / variableParameterRenderForms mirror their tables exactly", () => {
    expect(multiVariableRenderForms().sort()).toEqual(Object.keys(MULTI_VARIABLE_RENDER_FORMS).sort());
    expect(parameterRenderForms().sort()).toEqual(Object.keys(PARAMETER_RENDER_FORMS).sort());
    expect(modeRenderForms().sort()).toEqual(Object.keys(MODE_RENDER_FORMS).sort());
    expect(variableParameterRenderForms().sort()).toEqual(Object.keys(VARIABLE_PARAMETER_RENDER_FORMS).sort());
  });

  it("availableVariableIds is exactly VARIABLE_REGISTRY's own keys", () => {
    expect(availableVariableIds().sort()).toEqual(Object.keys(VARIABLE_REGISTRY).sort());
  });
});

describe("context.variables manipulation", () => {
  it("adds a variable", () => {
    const result = addContextVariable([], "PROJECT.IDENTITY", true);
    expect(result).toEqual([{ id: "PROJECT.IDENTITY", userAdjustable: true }]);
  });

  it("adding an already-present variable is a no-op", () => {
    const start = [{ id: "PROJECT.IDENTITY" as const, userAdjustable: false }];
    expect(addContextVariable(start, "PROJECT.IDENTITY", true)).toEqual(start);
  });

  it("removes a variable", () => {
    const start = [
      { id: "PROJECT.IDENTITY" as const, userAdjustable: false },
      { id: "SEQ.CONTEXT" as const, userAdjustable: true },
    ];
    expect(removeContextVariable(start, "PROJECT.IDENTITY")).toEqual([{ id: "SEQ.CONTEXT", userAdjustable: true }]);
  });

  it("removing an absent variable is a no-op", () => {
    const start = [{ id: "PROJECT.IDENTITY" as const, userAdjustable: false }];
    expect(removeContextVariable(start, "SEQ.CONTEXT")).toEqual(start);
  });

  it("toggles userAdjustable", () => {
    const start = [{ id: "PROJECT.IDENTITY" as const, userAdjustable: false }];
    expect(toggleContextVariableAdjustable(start, "PROJECT.IDENTITY")).toEqual([
      { id: "PROJECT.IDENTITY", userAdjustable: true },
    ]);
  });

  it("toggling an absent variable is a no-op", () => {
    const start = [{ id: "PROJECT.IDENTITY" as const, userAdjustable: false }];
    expect(toggleContextVariableAdjustable(start, "SEQ.CONTEXT")).toEqual(start);
  });
});

describe("parseEditableTemplatePatch — the untrusted-input boundary", () => {
  it("reads the eight editable fields when present and well-shaped", () => {
    const raw = {
      name: "Renamed",
      expertiseRole: "editor",
      expertiseSystemBlocks: [{ text: "sys" }],
      templateBlocks: [{ text: "tpl" }],
      contextVariables: [{ id: "PROJECT.IDENTITY", userAdjustable: true }],
      intentMode: { modes: [{ id: "a" }], defaultMode: "a" },
      intentParameters: [{ id: "p", type: "string", label: "P" }],
      intentFreeText: { label: "Note" },
    };
    expect(parseEditableTemplatePatch(raw)).toEqual(raw);
  });

  it("drops a field whose runtime shape is wrong instead of throwing", () => {
    const raw = { name: 42, templateBlocks: "not an array" };
    expect(parseEditableTemplatePatch(raw)).toEqual({});
  });

  it("ignores every property outside the eight editable names — commit/output/anchor never read", () => {
    const raw = {
      name: "Renamed",
      commit: ["applyGeneratedStory", "applyGeneratedOutline"],
      output: { kind: "text", target: { entity: "shot" }, field: "x", errors: { empty: "x" } },
      anchor: { kind: "entity", entity: "asset" },
      messages: { notConfigured: "hacked", chainNotFound: {} },
      preconditions: [{ refs: [], require: "all", message: "hacked" }],
    };
    const patch = parseEditableTemplatePatch(raw);
    expect(patch).toEqual({ name: "Renamed" });
    expect(patch).not.toHaveProperty("commit");
    expect(patch).not.toHaveProperty("output");
    expect(patch).not.toHaveProperty("anchor");
  });

  it("a non-object input answers an empty patch", () => {
    expect(parseEditableTemplatePatch(null)).toEqual({});
    expect(parseEditableTemplatePatch("a string")).toEqual({});
    expect(parseEditableTemplatePatch([1, 2, 3])).toEqual({});
    expect(parseEditableTemplatePatch(42)).toEqual({});
  });

  // R1.3 (retake) — the three-state convention on the three intent.* fields:
  // absent key -> not on the patch at all; explicit `null` -> read as the
  // removal state; a well-shaped value -> read as the set state. Proved on
  // all three fields, since the ticket requires all three, not just one.
  describe("R1.3 — the intent.* three-state convention: absent / null / value", () => {
    it("an explicit null on each of the three intent fields is read as the removal state", () => {
      const patch = parseEditableTemplatePatch({ intentMode: null, intentParameters: null, intentFreeText: null });
      expect(patch).toEqual({ intentMode: null, intentParameters: null, intentFreeText: null });
      expect(patch).toHaveProperty("intentMode", null);
      expect(patch).toHaveProperty("intentParameters", null);
      expect(patch).toHaveProperty("intentFreeText", null);
    });

    it("an absent intent field never appears as a key on the patch at all", () => {
      const patch = parseEditableTemplatePatch({ name: "Renamed" });
      expect(patch).not.toHaveProperty("intentMode");
      expect(patch).not.toHaveProperty("intentParameters");
      expect(patch).not.toHaveProperty("intentFreeText");
    });

    it("a well-shaped intent value is still read as the set state, not confused with removal", () => {
      const raw = {
        intentMode: { modes: [{ id: "a" }], defaultMode: "a" },
        intentParameters: [{ id: "p", type: "string", label: "P" }],
        intentFreeText: { label: "Note" },
      };
      expect(parseEditableTemplatePatch(raw)).toEqual(raw);
    });
  });
});

describe("applyEditablePatch — THE safety property", () => {
  function clone(): OperationDescriptor {
    return JSON.parse(JSON.stringify(storyGenerateDescriptor));
  }

  it("an empty patch changes nothing", () => {
    const stored = clone();
    expect(applyEditablePatch(stored, {})).toEqual(stored);
  });

  it("overwrites only the editable fields the patch supplies", () => {
    const stored = clone();
    const merged = applyEditablePatch(stored, {
      name: "My Story Variant",
      templateBlocks: [{ text: "Custom template." }],
    });
    expect(merged.name).toBe("My Story Variant");
    expect(merged.template.blocks).toEqual([{ text: "Custom template." }]);
    // Everything else, including the rest of `template` (separator) and every
    // untouched top-level field, survives unchanged.
    expect(merged.template.separator).toBe(stored.template.separator);
    expect(merged.expertise).toEqual(stored.expertise);
  });

  it("THE assertion the whole ticket rests on: a patch cannot change anchor, output or commit", () => {
    const stored = clone();
    // EditableTemplatePatch has no `anchor` / `output` / `commit` property to
    // set in the first place — this proves it at the type level — but the
    // ticket's own proof is a round-trip: merge, then read back, and the
    // triangle is byte-for-byte the same as what was stored.
    const patch = parseEditableTemplatePatch({
      name: "Renamed",
      commit: ["applyGeneratedOutline"],
      output: { kind: "text", target: { entity: "shot" }, field: "hacked", errors: { empty: "x" } },
      anchor: { kind: "entity", entity: "asset" },
      messages: { notConfigured: "hacked", chainNotFound: {} },
      preconditions: [{ refs: [], require: "all", message: "hacked" }],
    });
    const merged = applyEditablePatch(stored, patch);

    expect(merged.anchor).toEqual(stored.anchor);
    expect(merged.output).toEqual(stored.output);
    expect(merged.commit).toEqual(stored.commit);
    expect(merged.messages).toEqual(stored.messages);
    expect(merged.preconditions).toEqual(stored.preconditions);
    // The one field the patch legitimately named did apply.
    expect(merged.name).toBe("Renamed");
  });

  // R1.3 (retake) — proved on all three intent.* fields: add (absent ->
  // value), remove (value -> null), and absence-preserves (already-set value
  // stays when the key is not on the patch at all).
  describe("R1.3 — intent.* add / remove / absence-preserves, on all three fields", () => {
    it("intent.mode: add, remove, and absence preserves", () => {
      const stored = clone(); // stored.intent.mode is undefined (intent: {})
      const modeValue = { modes: [{ id: "a" }], defaultMode: "a" };

      const added = applyEditablePatch(stored, { intentMode: modeValue });
      expect(added.intent.mode).toEqual(modeValue);

      const removed = applyEditablePatch(added, { intentMode: null });
      expect(removed.intent.mode).toBeUndefined();

      const preserved = applyEditablePatch(added, {});
      expect(preserved.intent.mode).toEqual(modeValue);
    });

    it("intent.parameters: add, remove, and absence preserves", () => {
      const stored = clone();
      const parametersValue = [{ id: "p", type: "string" as const, label: "P" }];

      const added = applyEditablePatch(stored, { intentParameters: parametersValue });
      expect(added.intent.parameters).toEqual(parametersValue);

      const removed = applyEditablePatch(added, { intentParameters: null });
      expect(removed.intent.parameters).toBeUndefined();

      const preserved = applyEditablePatch(added, {});
      expect(preserved.intent.parameters).toEqual(parametersValue);
    });

    it("intent.freeText: add, remove, and absence preserves", () => {
      const stored = clone();
      const freeTextValue = { label: "Director's note" };

      const added = applyEditablePatch(stored, { intentFreeText: freeTextValue });
      expect(added.intent.freeText).toEqual(freeTextValue);

      const removed = applyEditablePatch(added, { intentFreeText: null });
      expect(removed.intent.freeText).toBeUndefined();

      const preserved = applyEditablePatch(added, {});
      expect(preserved.intent.freeText).toEqual(freeTextValue);
    });

    it("R1.3 must not open a backdoor: null on intent.* still leaves commit/output/anchor/messages/preconditions untouched", () => {
      const stored = clone();
      const patch = parseEditableTemplatePatch({
        intentFreeText: null,
        commit: ["applyGeneratedOutline"],
        output: { kind: "text", target: { entity: "shot" }, field: "hacked", errors: { empty: "x" } },
        anchor: { kind: "entity", entity: "asset" },
        messages: { notConfigured: "hacked", chainNotFound: {} },
        preconditions: [{ refs: [], require: "all", message: "hacked" }],
      });
      const merged = applyEditablePatch(stored, patch);

      expect(merged.anchor).toEqual(stored.anchor);
      expect(merged.output).toEqual(stored.output);
      expect(merged.commit).toEqual(stored.commit);
      expect(merged.messages).toEqual(stored.messages);
      expect(merged.preconditions).toEqual(stored.preconditions);
      // The only field null legitimately named did get removed.
      expect(merged.intent.freeText).toBeUndefined();
    });
  });
});
