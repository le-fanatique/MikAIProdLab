// ---------------------------------------------------------------------------
// templateEditorCatalogues.ts — LLMW.EDITOR.CORE.1 (E1a), split out by
// LLMW.EDITOR.SCREEN.1 (E1b)
//
// The closed-vocabulary catalogue functions originally shipped in
// `templateEditor.ts`, moved here so `templateEditor.ts`'s block-list and
// `context.variables` manipulation functions can be imported by a Client
// Component without pulling in `variables/registry.ts` — which is
// `import "server-only"` and dynamically imports `@/db` for two of its
// resolvers. See `templateEditor.ts`'s own header comment for why the split
// was necessary (a real build failure, not a preemptive one) and what did
// and did not move. Server-only by construction: any consumer of this file
// is therefore a Server Component or a Server Action, never a Client
// Component — `templateEditorCatalogues.test.ts` and the editor screen's own
// page (`[templateId]/edit/page.tsx`, a Server Component) are today's two
// consumers.
//
// `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md` §3 is the general rule this
// module exists to serve: the editor composes only existing vocabulary. Every
// catalogue below is *derived* from the registries `variables/registry.ts`
// already declares — `VARIABLE_RENDER_FORMS`, `MULTI_VARIABLE_RENDER_FORMS`,
// `PARAMETER_RENDER_FORMS`, `VARIABLE_PARAMETER_RENDER_FORMS`,
// `MODE_RENDER_FORMS`, `FREE_TEXT_RENDER_FORMS` for render forms (the six
// tables backing `Block`'s six `render`-carrying variants — `{ text }` is the
// seventh and carries no render form of its own), `VARIABLE_REGISTRY` for
// available variables — never a second, hand-written list. A hand-written
// list would drift the first time a ticket adds a form or a variable to the
// registry without anyone remembering to update a copy here; deriving it
// makes that drift structurally impossible.
// ---------------------------------------------------------------------------

import type { VariableId } from "./types";
import {
  FREE_TEXT_RENDER_FORMS,
  MODE_RENDER_FORMS,
  MULTI_VARIABLE_RENDER_FORMS,
  PARAMETER_RENDER_FORMS,
  VARIABLE_PARAMETER_RENDER_FORMS,
  VARIABLE_REGISTRY,
  VARIABLE_RENDER_FORMS,
} from "./variables/registry";

// ---------------------------------------------------------------------------
// The render-form catalogue — derived, never recopied. Each function reads
// the keys of the matching table in `variables/registry.ts` at call time, so
// a form added to a table tomorrow is visible here tomorrow, with no second
// edit. `validateBlock` (`templateStorage.ts`) is the proof these are the
// *same* tables the storage portal itself checks against — this module and
// that validator can never disagree about what is legal, because both read
// the one set of tables.
// ---------------------------------------------------------------------------

/** Named render forms legal for a `{variable: id, render}` block — the forms
 * declared for that specific variable, and no other variable's. An id with
 * no entry in `VARIABLE_RENDER_FORMS` (a real `VariableId` that simply has
 * no single-variable render form yet) answers `[]`, not an error. */
export function renderFormsForVariable(id: VariableId): string[] {
  const table = VARIABLE_RENDER_FORMS as Partial<Record<VariableId, Record<string, unknown>>>;
  return Object.keys(table[id] ?? {});
}

/** Named render forms legal for a `{variables: [...], render}` block — a
 * form that reads more than one variable and therefore has no single owning
 * `VariableId`, kept in its own table. */
export function multiVariableRenderForms(): string[] {
  return Object.keys(MULTI_VARIABLE_RENDER_FORMS);
}

/** Named render forms legal for a `{parameter: id, render}` block — an
 * `intent.parameters` entry's render form. */
export function parameterRenderForms(): string[] {
  return Object.keys(PARAMETER_RENDER_FORMS);
}

/** Named render forms legal for a `{variables, parameters, render}` block —
 * the sixth `Block` variant that carries a `render` form, missed by the
 * ticket's own §3.1 (retake R1.1: it named five tables, `Block` has six).
 * Reads both a set of variables and a set of `intent.parameters` entries
 * together, backed by `VARIABLE_PARAMETER_RENDER_FORMS`. */
export function variableParameterRenderForms(): string[] {
  return Object.keys(VARIABLE_PARAMETER_RENDER_FORMS);
}

/** Named render forms legal for a `{mode: true, render}` block — the
 * operation's selected `intent.mode`. */
export function modeRenderForms(): string[] {
  return Object.keys(MODE_RENDER_FORMS);
}

/** Named render forms legal for a `{freeText: true, render}` block — the
 * operation's `intent.freeText` director's note. */
export function freeTextRenderForms(): string[] {
  return Object.keys(FREE_TEXT_RENDER_FORMS);
}

/** Every declared `VariableId`, derived from `VARIABLE_REGISTRY`'s own keys —
 * the "which variables exist" half of §3's closed vocabulary, never a second
 * hand-written list beside the resolver table. */
export function availableVariableIds(): VariableId[] {
  return Object.keys(VARIABLE_REGISTRY) as VariableId[];
}
