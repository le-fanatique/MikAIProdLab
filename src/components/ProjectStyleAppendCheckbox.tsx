import {
  APPEND_PROJECT_STYLE_CHECKBOX_ID,
  APPEND_PROJECT_STYLE_FIELD_NAME,
  APPEND_PROJECT_STYLE_FIELD_VALUE,
} from "@/lib/projectStyle/appendProjectStyleFormField";

type Props = {
  /**
   * The `id` of the `<form>` this checkbox belongs to (native `form`
   * attribute) — lets this control live outside that `<form>` element (e.g.
   * above a resolver-failure block that must stay interactive even while the
   * Generate form/error area is conditionally hidden) while remaining part
   * of its submitted `FormData`.
   */
  formId: string;
};

/**
 * GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — checked by default on every mount, one
 * shared control across all four Generate Content surfaces (embedded Asset/
 * Shot panels, dedicated Asset/Shot generate pages). Purely native markup:
 * no client JS is needed for the checkbox itself (checking/unchecking,
 * keyboard, focus) or for it to submit. The honest, live preview swap is
 * done entirely with a `group-has-[#appendProjectStyle:not(:checked)]` CSS
 * selector against a `group/style`-classed ancestor — see
 * `ProjectStyleGenerationPreview` and each surface's own Generate section.
 */
export default function ProjectStyleAppendCheckbox({ formId }: Props) {
  return (
    <label
      htmlFor={APPEND_PROJECT_STYLE_CHECKBOX_ID}
      className="flex items-center gap-2 text-xs text-[#a4abb2] cursor-pointer select-none w-fit"
    >
      <input
        type="checkbox"
        id={APPEND_PROJECT_STYLE_CHECKBOX_ID}
        name={APPEND_PROJECT_STYLE_FIELD_NAME}
        value={APPEND_PROJECT_STYLE_FIELD_VALUE}
        form={formId}
        defaultChecked
        className="h-3.5 w-3.5 rounded border-[#3a3f45] bg-[#141619] accent-[#5b93d6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5b93d6]"
      />
      Append Project Style
    </label>
  );
}
