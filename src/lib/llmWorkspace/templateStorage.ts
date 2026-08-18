// ---------------------------------------------------------------------------
// templateStorage.ts — LLMW.STORAGE.1 (B6a)
//
// Pure validator for a stored/imported `llm_templates` row's JSON payload.
// No `"use server"`, no database access, no React import — the precedent of
// shape is `validateComfyWorkflowJson`
// (`src/lib/comfy/parseWorkflow.ts:199-221`), used the same way by
// `src/actions/comfyWorkflows.ts:79`.
//
// What it checks — nothing less, nothing more (ticket §3):
//   1. the JSON parses;
//   2. `OperationDescriptor`'s (`./types.ts`) required top-level fields are
//      present and of the right basic type;
//   3. membership in the closed registries: every `context.variables[].id`
//      is a known `VariableId`, every `commit` entry a declared `ActionId`,
//      every `anchor.entity` / `output.target.entity` an `EntityKind`, and
//      every render form referenced by a block in `expertise.system.blocks`
//      or `template.blocks` actually exists in one of the six render-form
//      tables (widened from four by LLMW.BLOCK.VARPARAM.1, B7c-n4's
//      `VARIABLE_PARAMETER_RENDER_FORMS`, and from five by
//      LLMW.DESCRIPTOR.IMAGE.1, B16a's `IMAGE_RENDER_FORMS` — the first table
//      that does not live in `./variables/registry.ts`, since an attached
//      image is not a variable), plus `images.source` in the closed
//      `IMAGE_SOURCE_REGISTRY`.
//
// `runner.ts:307-341` throws on an unknown render form (§3 of the ticket) —
// this is the one place that refusal happens before Run, provable without a
// database and without an LLM.
//
// No optional-field business rule is invented beyond this: an absent
// optional field is valid.
//
// Supervisor review retake, post-LLMW.OUTPUT.LIST.1 (B7a): `output` widened
// into a `kind`-discriminated union (`./types.ts`) without this validator
// following — it kept checking the `"object"` shape unconditionally and
// never looked at `kind`, reopening exactly the gap this module exists to
// close (an import that only detonates inside `parseListOutput` at Run, not
// here). `validateOutput` now dispatches on `output.kind` first, refusing an
// absent or unrecognised `kind` outright rather than falling back to
// `"object"` silently.
// ---------------------------------------------------------------------------

import type { ActionId, EntityKind, ImageSourceId, OperationDescriptor, VariableId } from "./types";
import {
  FREE_TEXT_RENDER_FORMS,
  MODE_RENDER_FORMS,
  MULTI_VARIABLE_RENDER_FORMS,
  PARAMETER_RENDER_FORMS,
  VARIABLE_PARAMETER_RENDER_FORMS,
  VARIABLE_REGISTRY,
  VARIABLE_RENDER_FORMS,
} from "./variables/registry";
import { IMAGE_RENDER_FORMS, IMAGE_SOURCE_REGISTRY } from "./images/registry";
import { ACTION_REGISTRY } from "./actions/registry";

// `EntityKind` (`./types.ts`) is a string-literal union with no runtime
// array anywhere else in this codebase to read from — unlike `VariableId`
// (`VARIABLE_REGISTRY`'s keys) and `ActionId` (`ACTION_REGISTRY`'s keys),
// both `satisfies Record<...>` against their type so they cannot drift. This
// mirrors the type literally, on the same precedent as `WORKFLOW_KINDS` in
// `src/actions/comfyWorkflows.ts:8`.
const ENTITY_KINDS = ["project", "sequence", "shot", "asset"] as const;

function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === "string" && (ENTITY_KINDS as readonly string[]).includes(value);
}

function isVariableId(value: unknown): value is VariableId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(VARIABLE_REGISTRY, value);
}

function isImageSourceId(value: unknown): value is ImageSourceId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(IMAGE_SOURCE_REGISTRY, value);
}

function isActionId(value: unknown): value is ActionId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, value);
}

export type TemplateValidationResult =
  | { ok: true; descriptor: OperationDescriptor }
  | { ok: false; reason: string };

function fail(reason: string): TemplateValidationResult {
  return { ok: false, reason };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBlock(block: unknown, path: string): string | null {
  if (!isPlainObject(block)) return `${path}: block must be an object.`;

  if ("text" in block) {
    if (typeof block.text !== "string") return `${path}: "text" must be a string.`;
    return null;
  }

  if ("variable" in block) {
    if (!isVariableId(block.variable)) return `${path}: unknown variable id "${String(block.variable)}".`;
    if (typeof block.render !== "string") return `${path}: "render" must be a string.`;
    const table = VARIABLE_RENDER_FORMS as unknown as Record<string, Record<string, unknown>>;
    if (!table[block.variable]?.[block.render]) {
      return `${path}: unknown render form "${block.render}" for variable "${block.variable}".`;
    }
    return null;
  }

  // Checked before the plain `"variables" in block` branch below: the
  // `{variables, parameters, render}` variant (LLMW.BLOCK.VARPARAM.1,
  // B7c-n4) also carries a `variables` key, so it must be discriminated on
  // its unique key (`parameters`) first — the same order
  // `assembleDescriptorMessages.ts`'s runtime dispatch uses, for the same
  // reason (see that file's own comment).
  if ("parameters" in block) {
    if (!Array.isArray(block.variables) || block.variables.length === 0) {
      return `${path}: "variables" must be a non-empty array.`;
    }
    for (const id of block.variables) {
      if (!isVariableId(id)) return `${path}: unknown variable id "${String(id)}".`;
    }
    if (!Array.isArray(block.parameters) || block.parameters.length === 0) {
      return `${path}: "parameters" must be a non-empty array.`;
    }
    for (const p of block.parameters) {
      if (typeof p !== "string") return `${path}: "parameters" entries must be strings.`;
    }
    if (typeof block.render !== "string") return `${path}: "render" must be a string.`;
    const table = VARIABLE_PARAMETER_RENDER_FORMS as unknown as Record<string, unknown>;
    if (!table[block.render]) return `${path}: unknown variable-parameter render form "${block.render}".`;
    return null;
  }

  if ("variables" in block) {
    if (!Array.isArray(block.variables) || block.variables.length === 0) {
      return `${path}: "variables" must be a non-empty array.`;
    }
    for (const id of block.variables) {
      if (!isVariableId(id)) return `${path}: unknown variable id "${String(id)}".`;
    }
    if (typeof block.render !== "string") return `${path}: "render" must be a string.`;
    const table = MULTI_VARIABLE_RENDER_FORMS as unknown as Record<string, unknown>;
    if (!table[block.render]) return `${path}: unknown multi-variable render form "${block.render}".`;
    return null;
  }

  if ("parameter" in block) {
    if (typeof block.parameter !== "string") return `${path}: "parameter" must be a string.`;
    if (typeof block.render !== "string") return `${path}: "render" must be a string.`;
    const table = PARAMETER_RENDER_FORMS as unknown as Record<string, unknown>;
    if (!table[block.render]) return `${path}: unknown parameter render form "${block.render}".`;
    return null;
  }

  if ("mode" in block) {
    if (block.mode !== true) return `${path}: "mode" must be true.`;
    if (typeof block.render !== "string") return `${path}: "render" must be a string.`;
    const table = MODE_RENDER_FORMS as unknown as Record<string, unknown>;
    if (!table[block.render]) return `${path}: unknown mode render form "${block.render}".`;
    return null;
  }

  if ("freeText" in block) {
    if (block.freeText !== true) return `${path}: "freeText" must be true.`;
    if (typeof block.render !== "string") return `${path}: "render" must be a string.`;
    const table = FREE_TEXT_RENDER_FORMS as unknown as Record<string, unknown>;
    if (!table[block.render]) return `${path}: unknown free text render form "${block.render}".`;
    return null;
  }

  // LLMW.DESCRIPTOR.IMAGE.1 (B16a) — the eighth `Block` variant. Added here in
  // the same diff as the variant itself, on B12b-2's lesson: a stored
  // descriptor declaring a shape this validator does not know is refused at
  // import, so a format widening that skips this file ships a template that
  // cannot be re-read.
  if ("images" in block) {
    if (block.images !== true) return `${path}: "images" must be true.`;
    if (typeof block.render !== "string") return `${path}: "render" must be a string.`;
    const table = IMAGE_RENDER_FORMS as unknown as Record<string, unknown>;
    if (!table[block.render]) return `${path}: unknown images render form "${block.render}".`;
    return null;
  }

  return `${path}: block matches none of the known shapes (text/variable/variables/variables+parameters/parameter/mode/freeText/images).`;
}

function validateBlockList(value: unknown, path: string): string | null {
  if (!Array.isArray(value)) return `${path}: must be an array of blocks.`;
  for (let i = 0; i < value.length; i++) {
    const err = validateBlock(value[i], `${path}[${i}]`);
    if (err) return err;
  }
  return null;
}

// ---------------------------------------------------------------------------
// `output` — widened by LLMW.OUTPUT.LIST.1 (B7a) into a `kind`-discriminated
// union (`./types.ts`). This validator must dispatch on `kind` the same way
// `runner.ts:515`'s own `parseOutput` does — an imported template that
// declares `kind: "list"` but has enough top-level object-shaped fields to
// pass the pre-B7a checks would otherwise validate clean and only detonate
// inside `parseListOutput` at Run, exactly the failure mode B6a's header
// comment (and `docs/PROJECT_STATE.md`) describes this module as existing to
// close. No silent fallback to `"object"` on an absent/unknown `kind` — an
// undeclared kind is refused, not guessed.
// ---------------------------------------------------------------------------

function validateObjectOutput(output: Record<string, unknown>): string | null {
  if (!isPlainObject(output.target)) return '"output.target" is required and must be an object.';
  if (!isEntityKind(output.target.entity)) {
    return `"output.target.entity" references an unknown entity kind "${String(output.target.entity)}".`;
  }
  if (!Array.isArray(output.fields)) return '"output.fields" is required and must be an array.';
  if (output.require !== "all" && output.require !== "any") return '"output.require" must be "all" or "any".';
  if (!isPlainObject(output.errors)) return '"output.errors" is required and must be an object.';
  if (typeof output.errors.unparsable !== "string") return '"output.errors.unparsable" is required and must be a string.';
  if (typeof output.errors.empty !== "string") return '"output.errors.empty" is required and must be a string.';
  return null;
}

// LLMW.OUTPUT.LIST.2 (B7b), §4 rule 1-5: one item field entry, discriminated
// on `type`. Returns the declared field's `type` on success (needed by the
// caller to type-check `validity.fields` — rule 6 — and `output.sort` —
// rule 7), or an error message.
function validateListItemField(entry: Record<string, unknown>, path: string): { type: "string" | "number" | "enum"; fallback?: "omit" | "index" } | string {
  if (entry.type !== "string" && entry.type !== "number" && entry.type !== "enum") {
    return `"${path}.type" must be "string", "number" or "enum" (was ${entry.type === undefined ? "absent" : `"${String(entry.type)}"`}).`;
  }
  if (typeof entry.field !== "string" || !entry.field) {
    return `"${path}.field" is required and must be a non-empty string.`;
  }
  if (typeof entry.jsonKey !== "string" || !entry.jsonKey) {
    return `"${path}.jsonKey" is required and must be a non-empty string.`;
  }
  // Rule 2 — jsonKeyFallback, when present.
  if (entry.jsonKeyFallback != null) {
    if (typeof entry.jsonKeyFallback !== "string" || !entry.jsonKeyFallback) {
      return `"${path}.jsonKeyFallback" must be a non-empty string when present.`;
    }
    if (entry.jsonKeyFallback === entry.jsonKey) {
      return `"${path}.jsonKeyFallback" must differ from "${path}.jsonKey".`;
    }
  }

  if (entry.type === "string") {
    // Rule 3.
    if (entry.truncateTo != null && (typeof entry.truncateTo !== "number" || !Number.isInteger(entry.truncateTo) || entry.truncateTo <= 0)) {
      return `"${path}.truncateTo" must be an integer greater than 0 when present.`;
    }
    return { type: "string" };
  }

  if (entry.type === "number") {
    // Rule 4.
    if (entry.exclusiveMin != null && (typeof entry.exclusiveMin !== "number" || !Number.isFinite(entry.exclusiveMin))) {
      return `"${path}.exclusiveMin" must be a finite number when present.`;
    }
    if (entry.max != null && (typeof entry.max !== "number" || !Number.isFinite(entry.max))) {
      return `"${path}.max" must be a finite number when present.`;
    }
    if (entry.fallback !== "omit" && entry.fallback !== "index") {
      return `"${path}.fallback" is required and must be "omit" or "index".`;
    }
    return { type: "number", fallback: entry.fallback };
  }

  // entry.type === "enum" — rule 5.
  if (!Array.isArray(entry.values) || entry.values.length === 0 || entry.values.some((v) => typeof v !== "string" || !v)) {
    return `"${path}.values" is required and must be a non-empty array of non-empty strings.`;
  }
  if (typeof entry.default !== "string" || !(entry.values as string[]).includes(entry.default)) {
    return `"${path}.default" is required and must be a member of "${path}.values".`;
  }
  return { type: "enum" };
}

function validateListOutput(output: Record<string, unknown>): string | null {
  if (typeof output.arrayKey !== "string" || !output.arrayKey) {
    return '"output.arrayKey" is required and must be a non-empty string.';
  }

  if (!isPlainObject(output.item)) return '"output.item" is required and must be an object.';
  const item = output.item;

  if (!Array.isArray(item.fields) || item.fields.length === 0) {
    return '"output.item.fields" is required and must be a non-empty array.';
  }
  const declaredFields = new Map<string, { type: "string" | "number" | "enum"; fallback?: "omit" | "index" }>();
  for (let i = 0; i < item.fields.length; i++) {
    const entry = item.fields[i];
    if (!isPlainObject(entry)) return `"output.item.fields[${i}]" must be an object.`;
    const result = validateListItemField(entry, `output.item.fields[${i}]`);
    if (typeof result === "string") return result;
    declaredFields.set(entry.field as string, result);
  }

  if (!isPlainObject(item.validity)) return '"output.item.validity" is required and must be an object.';
  if (!Array.isArray(item.validity.fields) || item.validity.fields.length === 0) {
    return '"output.item.validity.fields" is required and must be a non-empty array.';
  }
  // Membership, not mere presence — the same principle B6a already applies
  // to render forms (`validateBlock`): a validity field that names something
  // `item.fields` never declared would otherwise pass validation and then
  // silently never gate anything at Run (`parseListOutput` looks it up in
  // the mapped `values`, which never has that key). Rule 6, widened by B7b:
  // a declared-but-non-string field is a distinct author error from an
  // undeclared one.
  for (const field of item.validity.fields) {
    if (typeof field !== "string" || !declaredFields.has(field)) {
      return `"output.item.validity.fields" references "${String(field)}", which "output.item.fields" does not declare.`;
    }
    if (declaredFields.get(field)!.type !== "string") {
      return `"output.item.validity.fields" references "${field}", which "output.item.fields" declares as a non-string field.`;
    }
  }
  if (item.validity.require !== "all" && item.validity.require !== "any") {
    return '"output.item.validity.require" must be "all" or "any".';
  }

  if (output.maxItems != null && (typeof output.maxItems !== "number" || !Number.isInteger(output.maxItems) || output.maxItems <= 0)) {
    return '"output.maxItems" must be an integer greater than 0 when present.';
  }

  // Rule 7. A field in `"omit"` may be absent from some items; sorting on a
  // key that can be missing would silently produce `NaN` comparisons.
  // `sequenceGeneration`, the only real sorter, is `"index"`.
  if (output.sort != null) {
    if (!isPlainObject(output.sort)) return '"output.sort" must be an object when present.';
    if (output.sort.direction !== "asc") return '"output.sort.direction" must be "asc".';
    if (typeof output.sort.field !== "string" || !output.sort.field) {
      return '"output.sort.field" is required and must be a non-empty string.';
    }
    const sortField = declaredFields.get(output.sort.field);
    if (!sortField || sortField.type !== "number") {
      return `"output.sort.field" references "${String(output.sort.field)}", which "output.item.fields" does not declare as a number field.`;
    }
    if (sortField.fallback !== "index") {
      return `"output.sort.field" references "${String(output.sort.field)}", whose "fallback" must be "index" to be sortable.`;
    }
  }

  // Rule 8.
  if (!isPlainObject(output.selection)) return '"output.selection" is required and must be an object.';
  if (typeof output.selection.formDataKey !== "string" || !output.selection.formDataKey) {
    return '"output.selection.formDataKey" is required and must be a non-empty string.';
  }

  if (!isPlainObject(output.errors)) return '"output.errors" is required and must be an object.';
  if (typeof output.errors.unparsable !== "string") return '"output.errors.unparsable" is required and must be a string.';
  if (typeof output.errors.notArray !== "string") return '"output.errors.notArray" is required and must be a string.';
  if (typeof output.errors.empty !== "string") return '"output.errors.empty" is required and must be a string.';

  return null;
}

// LLMW.NARRATIVE.1 (B12b-2) — the `kind: "text"` branch (LLMW.TEXT.1, B12b-1)
// had no validator branch of its own until `narrativePrompt.compose` became
// the first descriptor to declare it: this module's own round-trip test
// (`templateStorage.test.ts`, "round-trips all eight built-in descriptors")
// widened to import/export every `DESCRIPTORS` entry, including this one,
// and an unrecognised `"text"` `kind` fell into the same catch-all refusal
// `"list"` used to fall into before B7a gave it its own branch — exactly the
// gap this module's own header exists to close. Mirrors `validateObjectOutput`
// above, minus `fields`/`require`/`exactKeysOnly`/`errors.unparsable` — a text
// output has no fields to decode and nothing that can fail to parse
// (`types.ts`'s own `kind: "text"` comment).
function validateTextOutput(output: Record<string, unknown>): string | null {
  if (!isPlainObject(output.target)) return '"output.target" is required and must be an object.';
  if (!isEntityKind(output.target.entity)) {
    return `"output.target.entity" references an unknown entity kind "${String(output.target.entity)}".`;
  }
  if (typeof output.field !== "string" || !output.field) {
    return '"output.field" is required and must be a non-empty string.';
  }
  if (!isPlainObject(output.errors)) return '"output.errors" is required and must be an object.';
  if (typeof output.errors.empty !== "string") return '"output.errors.empty" is required and must be a string.';
  return null;
}

/**
 * LLMW.OUTPUT.COMPOSITE.1 (B20a). Added in the same diff as the format
 * widening, on B12b-2's lesson: a stored descriptor declaring a `kind` this
 * validator does not know is refused at import, so a widening that skips this
 * file ships a template that cannot be re-read.
 *
 * Reuses `validateListItemField` per list rather than a second item validator
 * — the `"stringList"` variant is the only thing a composite list's item can
 * carry that a plain list's cannot.
 */
function validateCompositeOutput(output: Record<string, unknown>): string | null {
  if (!Array.isArray(output.scalars) || output.scalars.length === 0) {
    return '"output.scalars" must be a non-empty array.';
  }
  for (let i = 0; i < output.scalars.length; i++) {
    const entry = output.scalars[i];
    if (!isPlainObject(entry)) return `"output.scalars[${i}]" must be an object.`;
    if (entry.type !== "string" && entry.type !== "number") {
      return `"output.scalars[${i}].type" must be "string" or "number".`;
    }
    if (typeof entry.field !== "string" || !entry.field) return `"output.scalars[${i}].field" is required.`;
    if (typeof entry.jsonKey !== "string" || !entry.jsonKey) return `"output.scalars[${i}].jsonKey" is required.`;
  }
  if (output.require !== "all" && output.require !== "any") {
    return '"output.require" must be "all" or "any".';
  }

  if (!Array.isArray(output.lists) || output.lists.length === 0) {
    return '"output.lists" must be a non-empty array.';
  }
  const seenKeys = new Set<string>();
  for (let i = 0; i < output.lists.length; i++) {
    const list = output.lists[i];
    if (!isPlainObject(list)) return `"output.lists[${i}]" must be an object.`;
    if (typeof list.key !== "string" || !list.key) return `"output.lists[${i}].key" is required.`;
    if (seenKeys.has(list.key)) return `"output.lists[${i}].key" duplicates "${list.key}".`;
    seenKeys.add(list.key);
    if (typeof list.arrayKey !== "string" || !list.arrayKey) return `"output.lists[${i}].arrayKey" is required.`;
    if (!isPlainObject(list.item)) return `"output.lists[${i}].item" must be an object.`;
    if (!Array.isArray(list.item.fields) || list.item.fields.length === 0) {
      return `"output.lists[${i}].item.fields" must be a non-empty array.`;
    }

    const declaredFields = new Set<string>();
    for (let j = 0; j < list.item.fields.length; j++) {
      const field = list.item.fields[j];
      const path = `output.lists[${i}].item.fields[${j}]`;
      if (!isPlainObject(field)) return `"${path}" must be an object.`;
      if (field.type === "stringList") {
        if (typeof field.field !== "string" || !field.field) return `"${path}.field" is required.`;
        if (typeof field.jsonKey !== "string" || !field.jsonKey) return `"${path}.jsonKey" is required.`;
        declaredFields.add(field.field);
        continue;
      }
      const result = validateListItemField(field, path);
      if (typeof result === "string") return result;
      declaredFields.add(field.field as string);
    }

    if (!isPlainObject(list.item.validity)) return `"output.lists[${i}].item.validity" must be an object.`;
    if (!Array.isArray(list.item.validity.fields) || list.item.validity.fields.length === 0) {
      return `"output.lists[${i}].item.validity.fields" must be a non-empty array.`;
    }
    for (const f of list.item.validity.fields) {
      if (typeof f !== "string" || !declaredFields.has(f)) {
        return `"output.lists[${i}].item.validity.fields" references an undeclared field "${String(f)}".`;
      }
    }
    if (list.item.validity.require !== "all" && list.item.validity.require !== "any") {
      return `"output.lists[${i}].item.validity.require" must be "all" or "any".`;
    }
  }

  if (!isPlainObject(output.errors)) return '"output.errors" must be an object.';
  for (const key of ["unparsable", "notArray", "empty"] as const) {
    if (typeof output.errors[key] !== "string") return `"output.errors.${key}" is required and must be a string.`;
  }
  return null;
}

function validateOutput(output: Record<string, unknown>): string | null {
  if (output.kind === "object") return validateObjectOutput(output);
  if (output.kind === "list") return validateListOutput(output);
  if (output.kind === "text") return validateTextOutput(output);
  if (output.kind === "composite") return validateCompositeOutput(output);
  return `"output.kind" must be "object", "list", "text" or "composite" (was ${output.kind === undefined ? "absent" : `"${String(output.kind)}"`}).`;
}

export function validateLlmTemplateJson(raw: string): TemplateValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("The file is not valid JSON.");
  }

  if (!isPlainObject(parsed)) return fail("The template must be a JSON object.");
  const d = parsed;

  // --- Step 2: required top-level fields, present and of the right basic type ---

  if (typeof d.id !== "string" || !d.id) return fail('"id" is required and must be a string.');
  if (typeof d.name !== "string" || !d.name) return fail('"name" is required and must be a string.');

  if (!isPlainObject(d.anchor)) return fail('"anchor" is required and must be an object.');
  const anchor = d.anchor;
  if (anchor.kind !== "entity" && anchor.kind !== "insertionPoint" && anchor.kind !== "entitySet") {
    return fail('"anchor.kind" must be one of "entity", "insertionPoint", "entitySet".');
  }
  if (!isEntityKind(anchor.entity)) return fail(`"anchor.entity" references an unknown entity kind "${String(anchor.entity)}".`);
  if (anchor.kind === "entitySet" && typeof anchor.maxSize !== "number") {
    return fail('"anchor.maxSize" is required and must be a number when "anchor.kind" is "entitySet".');
  }

  if (!isPlainObject(d.context)) return fail('"context" is required and must be an object.');
  if (!Array.isArray(d.context.variables)) return fail('"context.variables" is required and must be an array.');
  for (const entry of d.context.variables) {
    if (!isPlainObject(entry)) return fail('"context.variables" entries must be objects.');
    if (!isVariableId(entry.id)) return fail(`"context.variables" references an unknown variable id "${String(entry.id)}".`);
    if (typeof entry.userAdjustable !== "boolean") return fail('"context.variables" entries require a boolean "userAdjustable".');
  }

  // LLMW.DESCRIPTOR.IMAGE.1 (B16a). Optional, like `preconditions` and
  // `postResponse` — but unlike those two it is validated, because it names a
  // CLOSED registry (`ImageSourceId`), which is precisely what this module's
  // own header says it exists to check. An unrecognised source would reach the
  // runner as an undefined registry entry and crash on a property access,
  // instead of being refused here with a sentence the user can act on.
  if (d.images !== undefined) {
    if (!isPlainObject(d.images)) return fail('"images" must be an object when present.');
    const images = d.images;
    if (!isImageSourceId(images.source)) {
      return fail(`"images.source" references an unknown image source "${String(images.source)}".`);
    }
    for (const key of ["minCount", "maxCount", "maxTotalBytes"] as const) {
      if (typeof images[key] !== "number") return fail(`"images.${key}" is required and must be a number.`);
    }
    if (typeof images.keyPrefix !== "string" || !images.keyPrefix) {
      return fail('"images.keyPrefix" is required and must be a non-empty string.');
    }
    if (!isPlainObject(images.messages)) return fail('"images.messages" is required and must be an object.');
    for (const key of ["noneSelected", "tooMany", "unavailable"] as const) {
      if (typeof images.messages[key] !== "string") return fail(`"images.messages.${key}" is required and must be a string.`);
    }
  }

  if (!isPlainObject(d.expertise)) return fail('"expertise" is required and must be an object.');
  if (typeof d.expertise.role !== "string") return fail('"expertise.role" is required and must be a string.');
  if (!isPlainObject(d.expertise.system)) return fail('"expertise.system" is required and must be an object.');
  if (typeof d.expertise.system.separator !== "string") return fail('"expertise.system.separator" is required and must be a string.');
  {
    const err = validateBlockList(d.expertise.system.blocks, "expertise.system.blocks");
    if (err) return fail(err);
  }
  if (!Array.isArray(d.expertise.knowledge)) return fail('"expertise.knowledge" is required and must be an array.');

  if (!isPlainObject(d.intent)) return fail('"intent" is required and must be an object.');

  if (!isPlainObject(d.template)) return fail('"template" is required and must be an object.');
  if (typeof d.template.separator !== "string") return fail('"template.separator" is required and must be a string.');
  {
    const err = validateBlockList(d.template.blocks, "template.blocks");
    if (err) return fail(err);
  }

  if (!isPlainObject(d.messages)) return fail('"messages" is required and must be an object.');
  if (typeof d.messages.notConfigured !== "string") return fail('"messages.notConfigured" is required and must be a string.');
  if (!isPlainObject(d.messages.chainNotFound)) return fail('"messages.chainNotFound" is required and must be an object.');

  if (!isPlainObject(d.output)) return fail('"output" is required and must be an object.');
  {
    const err = validateOutput(d.output);
    if (err) return fail(err);
  }

  if (!Array.isArray(d.commit)) return fail('"commit" is required and must be an array.');
  for (const actionId of d.commit) {
    if (!isActionId(actionId)) return fail(`"commit" references an unknown action id "${String(actionId)}".`);
  }

  if (d.executor !== "inProcess" && d.executor !== "n8n") return fail('"executor" must be "inProcess" or "n8n".');

  return { ok: true, descriptor: parsed as OperationDescriptor };
}
