// ---------------------------------------------------------------------------
// templateEditor.ts — LLMW.EDITOR.CORE.1 (E1a)
//
// The pure decision layer under the template editor screen (E1b, not built
// here). No React, no database access, no `server-only`: functions on data,
// same discipline as `variableLibrary.ts` and `templateStorage.ts`.
//
// LLMW.EDITOR.SCREEN.1 (E1b) retake: the closed-vocabulary catalogue
// functions this module used to export (`renderFormsForVariable`,
// `multiVariableRenderForms`, `parameterRenderForms`,
// `variableParameterRenderForms`, `modeRenderForms`, `freeTextRenderForms`,
// `availableVariableIds`) moved out to `templateEditorCatalogues.ts`. They
// were the only reason this file imported `variables/registry.ts` — and that
// module is `import "server-only"` (it reads `VARIABLE_REGISTRY` and the
// render-form tables, and dynamically imports `@/db` for two of its
// resolvers). A module-level `import "server-only"` is a build-time sentinel,
// not merely a runtime guard: any file that statically imports it — even
// transitively, even when the importer itself calls none of the affected
// exports — makes the *whole* importing module unbuildable for a client
// bundle (confirmed by `npm run build`, not assumed: E1b's screen imports
// this module's block/variable manipulation functions from a Client
// Component, and the build failed with `Module not found: Can't resolve
// 'fs'` inside `better-sqlite3`, pulled in through
// `variables/registry.ts`'s own dynamic `@/db` import). The functions this
// file still exports below (block-list and `context.variables` manipulation,
// the patch parser and merge) need no registry data and have no such
// constraint — moving the six registry-derived catalogue functions out is
// the smaller of the two fixes available (the other being to duplicate their
// trivial callers' logic inside the Client Component, which would leave two
// implementations of the same rule to keep in sync). Every existing consumer
// of the moved functions (this file's own former exports, and
// `tests/llmWorkspace/templateEditor.test.ts`) is repointed at
// `templateEditorCatalogues.ts`; no behaviour of any moved function changes.
//
// `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md` §3 is the general rule
// `templateEditorCatalogues.ts` exists to serve: the editor composes only
// existing vocabulary. See that file for the catalogue functions themselves.
//
// The central decision, per `.agents/supervised_task.md` §1: the save action
// does not accept a whole descriptor, only a patch of the editable surface
// (`name`, `expertise.role`, `expertise.system.blocks`, `template.blocks`,
// `context.variables`, `intent.mode`, `intent.parameters`,
// `intent.freeText`). `parseEditableTemplatePatch` is the one place untrusted
// JSON is narrowed into that shape — it reads *only* those eight property
// names off whatever object it is given, so an input that also carries
// `commit` / `output` / `anchor` (the coupled triangle, out of scope per the
// scoping doc §4's argument) never has those keys read, by construction:
// there is no code path in this module, or in `applyEditablePatch` below,
// that ever looks at `patch.commit`, `patch.output` or `patch.anchor`.
// `applyEditablePatch` is the second half of the same guarantee: it starts
// from the stored descriptor (spread first) and overwrites only the eight
// editable fields — the triangle passes through untouched, whatever the
// patch's own extra properties happened to contain.
//
// Basic shape correctness of the *merged* result (is `name` really a string,
// is every `context.variables[].id` a real `VariableId`, does every
// referenced render form exist) is left entirely to
// `validateLlmTemplateJson` (`templateStorage.ts`) — the one portal, per the
// ticket. This module does not re-validate; it only narrows (best-effort,
// dropping a field whose runtime shape is obviously wrong so the stored
// value is kept instead) and merges.
// ---------------------------------------------------------------------------

import type { Block, OperationDescriptor, VariableId } from "./types";

// ---------------------------------------------------------------------------
// Block list manipulation. Order is signifying — it is the prompt — so
// reordering is a first-class operation, not an incidental one. An
// out-of-bounds move or removal never throws: it returns the list unchanged,
// per the ticket's own instruction, since the editor screen (E1b) will call
// these directly off user clicks that can legally be at either end of the
// list.
// ---------------------------------------------------------------------------

/** Appends a block to the end of the list. */
export function addBlock(blocks: Block[], block: Block): Block[] {
  return [...blocks, block];
}

/** Removes the block at `index`. Out of bounds: the list is returned unchanged. */
export function removeBlockAt(blocks: Block[], index: number): Block[] {
  if (index < 0 || index >= blocks.length) return blocks;
  return blocks.filter((_, i) => i !== index);
}

/** Moves the block at `index` one position earlier. Already first, or out of
 * bounds: the list is returned unchanged, never thrown on. */
export function moveBlockUp(blocks: Block[], index: number): Block[] {
  if (index <= 0 || index >= blocks.length) return blocks;
  return swapBlocks(blocks, index, index - 1);
}

/** Moves the block at `index` one position later. Already last, or out of
 * bounds: the list is returned unchanged, never thrown on. */
export function moveBlockDown(blocks: Block[], index: number): Block[] {
  if (index < 0 || index >= blocks.length - 1) return blocks;
  return swapBlocks(blocks, index, index + 1);
}

function swapBlocks(blocks: Block[], i: number, j: number): Block[] {
  const next = [...blocks];
  const tmp = next[i];
  next[i] = next[j];
  next[j] = tmp;
  return next;
}

/**
 * A one-line, human-readable description of a `Block` — the seven variants
 * `types.ts` declares, in the order this `switch`-shaped chain of `if`s
 * checks them.
 *
 * R1 retake (LLMW.EDITOR.SCREEN.1): this function used to be duplicated,
 * byte for byte, between `TemplateContentEditorForm.tsx` (Client Component,
 * needs it for the block-list editor) and the workbench page
 * `src/app/settings/llm-workflows/[templateId]/page.tsx` (Server Component,
 * needs it for the read-only Template pane). It lives here rather than in
 * `templateEditorCatalogues.ts` because it reads only the *shape* of a
 * `Block` value it is handed — no registry, no `variables/registry.ts`, none
 * of what makes that other module `server-only` — so it must stay reachable
 * from a Client Component, exactly as the rest of this file already is.
 *
 * "parameters" must be tested before "variables": the mixed
 * `{variables, parameters, render}` variant carries both keys, and testing
 * "variables" first would match it and hide the `parameters` half it also
 * reads.
 */
export function describeBlock(block: Block): string {
  if ("text" in block) return `text: "${block.text}"`;
  if ("variable" in block) return `variable: ${block.variable} :: ${block.render}`;
  if ("parameters" in block) {
    return `variables: [${block.variables.join(", ")}], parameters: [${block.parameters.join(", ")}] :: ${block.render}`;
  }
  if ("variables" in block) return `variables: [${block.variables.join(", ")}] :: ${block.render}`;
  if ("parameter" in block) return `parameter: ${block.parameter} :: ${block.render}`;
  if ("mode" in block) return `mode :: ${block.render}`;
  return `freeText :: ${block.render}`;
}

// ---------------------------------------------------------------------------
// `context.variables` manipulation — add / remove / toggle `userAdjustable`.
// Adding an id already present is a no-op (never a duplicate entry); toggling
// or removing an id not present is a no-op (never a synthesized entry).
// ---------------------------------------------------------------------------

export type ContextVariableEntry = OperationDescriptor["context"]["variables"][number];

/** Adds `id` to the list with the given `userAdjustable`, unless it is
 * already present — in which case the list is returned unchanged (this
 * module never produces two entries for the same variable). */
export function addContextVariable(
  variables: ContextVariableEntry[],
  id: VariableId,
  userAdjustable: boolean
): ContextVariableEntry[] {
  if (variables.some((v) => v.id === id)) return variables;
  return [...variables, { id, userAdjustable }];
}

/** Removes the entry for `id`. Absent: the list is returned unchanged. */
export function removeContextVariable(variables: ContextVariableEntry[], id: VariableId): ContextVariableEntry[] {
  return variables.filter((v) => v.id !== id);
}

/** Flips `userAdjustable` on the entry for `id`. Absent: the list is
 * returned unchanged. */
export function toggleContextVariableAdjustable(
  variables: ContextVariableEntry[],
  id: VariableId
): ContextVariableEntry[] {
  return variables.map((v) => (v.id === id ? { ...v, userAdjustable: !v.userAdjustable } : v));
}

// ---------------------------------------------------------------------------
// The editable patch, and the merge that is this ticket's central proof.
// ---------------------------------------------------------------------------

/** The only fields a save can touch — mirrors `.agents/supervised_task.md`
 * §1's list exactly, field for field. Every field is optional: an absent
 * field means "keep the stored value", not "clear it".
 *
 * R1.3 (retake): the three `intent.*` fields — `mode`, `parameters`,
 * `freeText` — are the exception, because all three are themselves optional
 * on `OperationDescriptor["intent"]` (`types.ts`), so "editable" has to be
 * able to say "there is none" as well as "there is one". They carry an
 * explicit three-state convention `applyEditablePatch` reads literally:
 *   - the key is **absent** from the patch object -> unchanged (kept as the
 *     stored descriptor already has it — the behaviour every other field
 *     above already has, unchanged by this retake);
 *   - the key is **present, value `null`** -> the field is **removed** from
 *     the merged descriptor;
 *   - the key is **present, a value** -> the field is **set** to that value.
 * `name`, `expertiseRole`, the two block lists and `contextVariables` are not
 * optional on the stored descriptor, so "remove" has no meaning for them —
 * they keep the plain "absent -> unchanged, present -> set" rule `??` already
 * gave them, and `null` is not a value `parseEditableTemplatePatch` accepts
 * for any of them. */
export type EditableTemplatePatch = {
  name?: string;
  expertiseRole?: string;
  expertiseSystemBlocks?: Block[];
  templateBlocks?: Block[];
  contextVariables?: ContextVariableEntry[];
  intentMode?: OperationDescriptor["intent"]["mode"] | null;
  intentParameters?: OperationDescriptor["intent"]["parameters"] | null;
  intentFreeText?: OperationDescriptor["intent"]["freeText"] | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows an untrusted, already-`JSON.parse`d value into an
 * `EditableTemplatePatch` — the boundary between the Server Action's raw
 * request body and this module's typed merge. Reads *only* the eight
 * property names `EditableTemplatePatch` declares; every other property the
 * input object might carry (in particular `commit`, `output`, `anchor` — the
 * coupled triangle this ticket must not let through) is never looked at, and
 * therefore can never reach `applyEditablePatch`. A field whose runtime shape
 * is obviously wrong (not the type the field needs) is dropped rather than
 * coerced — "absent" already means "keep the stored value", so an
 * unreadable field degrades to the same safe outcome instead of writing
 * something malformed forward for `validateLlmTemplateJson` to catch later.
 *
 * R1.3 (retake): for the three `intent.*` fields only, this function also
 * reads the removal state — `raw.intentMode === null` (etc.) sets
 * `patch.intentMode = null`, distinct from leaving the key off `patch`
 * entirely (unchanged) and distinct from a well-shaped value (set). A value
 * that is neither `null` nor the field's own well-shaped object/array is
 * dropped exactly as before — degrading to "unchanged", never to "removed":
 * removal is only ever reached by an explicit `null`, never by a malformed
 * value that merely resembles one.
 */
export function parseEditableTemplatePatch(raw: unknown): EditableTemplatePatch {
  if (!isPlainObject(raw)) return {};

  const patch: EditableTemplatePatch = {};

  if (typeof raw.name === "string") patch.name = raw.name;
  if (typeof raw.expertiseRole === "string") patch.expertiseRole = raw.expertiseRole;
  if (Array.isArray(raw.expertiseSystemBlocks)) patch.expertiseSystemBlocks = raw.expertiseSystemBlocks as Block[];
  if (Array.isArray(raw.templateBlocks)) patch.templateBlocks = raw.templateBlocks as Block[];
  if (Array.isArray(raw.contextVariables)) patch.contextVariables = raw.contextVariables as ContextVariableEntry[];

  if (raw.intentMode === null) {
    patch.intentMode = null;
  } else if (isPlainObject(raw.intentMode)) {
    patch.intentMode = raw.intentMode as unknown as OperationDescriptor["intent"]["mode"];
  }

  if (raw.intentParameters === null) {
    patch.intentParameters = null;
  } else if (Array.isArray(raw.intentParameters)) {
    patch.intentParameters = raw.intentParameters as unknown as OperationDescriptor["intent"]["parameters"];
  }

  if (raw.intentFreeText === null) {
    patch.intentFreeText = null;
  } else if (isPlainObject(raw.intentFreeText)) {
    patch.intentFreeText = raw.intentFreeText as unknown as OperationDescriptor["intent"]["freeText"];
  }

  return patch;
}

/**
 * Builds the merged descriptor the save action will serialize and validate.
 * This is the one place the ticket's safety property is tenable: `stored` is
 * spread first, so every field `EditableTemplatePatch` does not name —
 * `anchor`, `output`, `commit`, `messages`, `preconditions`, `executor`,
 * `variation`, `commitAdvisory`, `postResponse`, `id` — passes through
 * unchanged, and the eight editable fields are then set explicitly from the
 * patch, falling back to the stored value when the patch did not supply one.
 * There is no code path here that reads `patch.commit`, `patch.output` or
 * `patch.anchor` — `EditableTemplatePatch` has no such properties to read.
 *
 * R1.3 (retake): the three `intent.*` fields resolve on the three-state
 * convention `EditableTemplatePatch`'s own doc comment declares, checked with
 * `in` rather than `??` because `??` cannot tell "key absent" from "key
 * present, value `null`" apart — both read as `undefined` through `??`, which
 * is exactly the bug this retake fixes (a patch could add an `intent.*` field
 * but never remove one). `"intentMode" in patch` is `false` only when
 * `parseEditableTemplatePatch` never set the key at all (raw input had
 * neither a well-shaped value nor an explicit `null`) — the untouched case.
 * When the key *is* in `patch`, `patch.intentMode ?? undefined` collapses an
 * explicit `null` to `undefined` (removed) and passes a real value through
 * unchanged (set) — the other two states. No other field uses this rule:
 * `name`, `expertiseRole`, the block lists and `contextVariables` are not
 * optional on `OperationDescriptor`, so they keep the plain `??` fallback.
 */
export function applyEditablePatch(
  stored: OperationDescriptor,
  patch: EditableTemplatePatch
): OperationDescriptor {
  return {
    ...stored,
    name: patch.name ?? stored.name,
    context: {
      ...stored.context,
      variables: patch.contextVariables ?? stored.context.variables,
    },
    expertise: {
      ...stored.expertise,
      role: patch.expertiseRole ?? stored.expertise.role,
      system: {
        ...stored.expertise.system,
        blocks: patch.expertiseSystemBlocks ?? stored.expertise.system.blocks,
      },
    },
    intent: {
      ...stored.intent,
      mode: "intentMode" in patch ? (patch.intentMode ?? undefined) : stored.intent.mode,
      parameters: "intentParameters" in patch ? (patch.intentParameters ?? undefined) : stored.intent.parameters,
      freeText: "intentFreeText" in patch ? (patch.intentFreeText ?? undefined) : stored.intent.freeText,
    },
    template: {
      ...stored.template,
      blocks: patch.templateBlocks ?? stored.template.blocks,
    },
  };
}
