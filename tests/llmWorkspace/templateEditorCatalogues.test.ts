import { describe, expect, it } from "vitest";
import {
  availableVariableIds,
  freeTextRenderForms,
  modeRenderForms,
  multiVariableRenderForms,
  parameterRenderForms,
  renderFormsForVariable,
  variableParameterRenderForms,
} from "@/lib/llmWorkspace/templateEditorCatalogues";
import {
  MODE_RENDER_FORMS,
  MULTI_VARIABLE_RENDER_FORMS,
  PARAMETER_RENDER_FORMS,
  VARIABLE_PARAMETER_RENDER_FORMS,
  VARIABLE_REGISTRY,
  VARIABLE_RENDER_FORMS,
} from "@/lib/llmWorkspace/variables/registry";

// ---------------------------------------------------------------------------
// LLMW.EDITOR.CORE.1 (E1a), moved here by LLMW.EDITOR.SCREEN.1 (E1b) — see
// `templateEditorCatalogues.ts`'s own header comment for why these functions
// (and this test file) moved out of `templateEditor.ts` /
// `templateEditor.test.ts`. No assertion changed in the move.
// ---------------------------------------------------------------------------

describe("the render-form catalogue is derived from the registry tables, not recopied", () => {
  it("every variable's render forms are exactly the keys of its own VARIABLE_RENDER_FORMS entry", () => {
    const table = VARIABLE_RENDER_FORMS as Record<string, Record<string, unknown>>;
    expect(renderFormsForVariable("PROJECT.IDENTITY").sort()).toEqual(
      Object.keys(table["PROJECT.IDENTITY"] ?? {}).sort()
    );
  });

  it("a variable with no single-variable render form answers an empty catalogue, not an error", () => {
    // PROJECT.SHOTS has no entry in VARIABLE_RENDER_FORMS. (Until
    // LOOK.FROMSTORY.LLM.1, this example was PROJECT.OUTLINE_SECTIONS —
    // `lookTest.subjectActionFromStory` gave it a render form, so this proof
    // needed a different still-orphan variable, not a different behaviour.)
    expect(renderFormsForVariable("PROJECT.SHOTS")).toEqual([]);
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
