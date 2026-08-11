// ---------------------------------------------------------------------------
// appendProjectStyleFormField.ts — GEN.PROJECT_STYLE.APPEND.TOGGLE.1
//
// The one closed, fail-closed contract for the "Append Project Style"
// checkbox shared by the four Asset/Shot Generate Content surfaces and their
// Server Actions. Pure — no DB/filesystem/network import — safe for both
// Server and Client Components.
// ---------------------------------------------------------------------------

export const APPEND_PROJECT_STYLE_FIELD_NAME = "appendProjectStyle";
export const APPEND_PROJECT_STYLE_FIELD_VALUE = "1";

/**
 * Shared DOM id for the checkbox across all four surfaces (never two of them
 * mounted on the same page at once, so this is never a duplicate-id
 * collision). Lets the checkbox live outside its `<form>` element via the
 * native `form="..."` attribute (see `ProjectStyleAppendCheckbox`'s `formId`
 * prop) while remaining part of that form's submitted `FormData`, and lets a
 * `group-has-[#appendProjectStyle:not(:checked)]` Tailwind selector target it
 * from a `group/style` ancestor for the live, JS-free preview swap.
 */
export const APPEND_PROJECT_STYLE_CHECKBOX_ID = "appendProjectStyle";

/**
 * Fail-closed: only a single explicit `"1"` value opts in. Missing (an
 * unchecked checkbox is never submitted by the browser), duplicated, or any
 * other value opts out. Never throws.
 */
export function parseAppendProjectStyleFormValue(formData: FormData): boolean {
  const values = formData.getAll(APPEND_PROJECT_STYLE_FIELD_NAME);
  return values.length === 1 && values[0] === APPEND_PROJECT_STYLE_FIELD_VALUE;
}
