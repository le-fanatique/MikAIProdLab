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
//      or `template.blocks` actually exists in one of the four render-form
//      tables of `./variables/registry.ts`.
//
// `runner.ts:307-341` throws on an unknown render form (§3 of the ticket) —
// this is the one place that refusal happens before Run, provable without a
// database and without an LLM.
//
// No optional-field business rule is invented beyond this: an absent
// optional field is valid.
// ---------------------------------------------------------------------------

import type { ActionId, EntityKind, OperationDescriptor, VariableId } from "./types";
import {
  MODE_RENDER_FORMS,
  MULTI_VARIABLE_RENDER_FORMS,
  PARAMETER_RENDER_FORMS,
  VARIABLE_REGISTRY,
  VARIABLE_RENDER_FORMS,
} from "./variables/registry";
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

  return `${path}: block matches none of the known shapes (text/variable/variables/parameter/mode).`;
}

function validateBlockList(value: unknown, path: string): string | null {
  if (!Array.isArray(value)) return `${path}: must be an array of blocks.`;
  for (let i = 0; i < value.length; i++) {
    const err = validateBlock(value[i], `${path}[${i}]`);
    if (err) return err;
  }
  return null;
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
  if (!isPlainObject(d.output.target)) return fail('"output.target" is required and must be an object.');
  if (!isEntityKind(d.output.target.entity)) {
    return fail(`"output.target.entity" references an unknown entity kind "${String(d.output.target.entity)}".`);
  }
  if (!Array.isArray(d.output.fields)) return fail('"output.fields" is required and must be an array.');
  if (d.output.require !== "all" && d.output.require !== "any") return fail('"output.require" must be "all" or "any".');
  if (!isPlainObject(d.output.errors)) return fail('"output.errors" is required and must be an object.');
  if (typeof d.output.errors.unparsable !== "string") return fail('"output.errors.unparsable" is required and must be a string.');
  if (typeof d.output.errors.empty !== "string") return fail('"output.errors.empty" is required and must be a string.');

  if (!Array.isArray(d.commit)) return fail('"commit" is required and must be an array.');
  for (const actionId of d.commit) {
    if (!isActionId(actionId)) return fail(`"commit" references an unknown action id "${String(actionId)}".`);
  }

  if (d.executor !== "inProcess" && d.executor !== "n8n") return fail('"executor" must be "inProcess" or "n8n".');

  return { ok: true, descriptor: parsed as OperationDescriptor };
}
