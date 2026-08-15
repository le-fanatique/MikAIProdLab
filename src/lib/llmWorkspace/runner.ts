// ---------------------------------------------------------------------------
// runner.ts — LLMW.RUNNER.1a (B2a)
//
// The §2.1 invariant pipeline as one function, driven by an
// `OperationDescriptor` (`docs/LLM_WORKSPACE_ARCHITECTURE.md`):
//
//   1. validate anchor identifiers
//   2. getLLMConfig(), refuse if absent
//   3. load the anchor and verify the ownership chain
//   4. resolve variables declared via the registry
//   5. assemble {system, user} from blocks
//   6. callLLMJson
//   7. strip the code fence and parse per `output`
//   8. map the error
//
// Proven, byte-for-byte, against `story.generate`, `outline.generate` and
// `sequencePrompt.assist` (`tests/llmWorkspace/*.runner.test.ts`). The other
// five descriptors already carry a corrected `output`/`messages` shape for
// type coherence, but are not exercised by this ticket's proof — see
// `.agents/executor_report.md`.
//
// No `@/db` import at module scope (the B1c / B1b discipline this file must
// not regress): `@/db`, `@/db/schema`, `drizzle-orm`, and `@/lib/settings`
// (which itself imports `@/db` at its own module top) are all imported
// dynamically, inside function bodies, exactly like `variables/registry.ts`.
// `@/lib/llm` (`callLLMJson`) is imported dynamically for the same reason —
// it transitively reaches `@/lib/vramManager.ts`, which imports `@/db` at
// module scope.
// ---------------------------------------------------------------------------

import type { EntityKind, OperationDescriptor, VariableId } from "./types";
import {
  assembleDescriptorMessages,
  type RenderFreeText,
  type RenderMode,
  type RenderParameter,
  type RenderVariable,
  type RenderVariables,
} from "./assembleDescriptorMessages";
import {
  FREE_TEXT_RENDER_FORMS,
  MODE_RENDER_FORMS,
  MULTI_VARIABLE_RENDER_FORMS,
  PARAMETER_RENDER_FORMS,
  VARIABLE_REGISTRY,
  VARIABLE_RENDER_FORMS,
} from "./variables/registry";
import type { LLMConfig, LLMPrompt } from "@/types/llm";

// ---------------------------------------------------------------------------
// Public input/output shapes
// ---------------------------------------------------------------------------

/**
 * The runner's own identifier input — one uniform shape regardless of the
 * original action's calling convention (`generateStory(projectId: number)`
 * vs. the `FormData`-based actions). Which keys are required depends on
 * `descriptor.anchor.entity` (see `requiredIdKeys`).
 */
export type AnchorIds = {
  projectId?: number;
  sequenceId?: number;
  shotId?: number;
  assetId?: number;
};

export type OperationIntentInput = {
  freeText?: string;
  mode?: string;
  parameters?: Record<string, number | string>;
};

export type PromptResolutionResult =
  | { ok: true; prompt: LLMPrompt }
  | { ok: false; error: string };

// LLMW.OUTPUT.LIST.1 (B7a): discriminated on `kind`, following
// `descriptor.output`'s own split. Every one of the eight adapters in
// `src/actions/llm/` (plus the bench's `runBenchOperation` /
// `commitBenchProposal`, forced by the same type change) is narrowed by
// `kind === "object"` before reading `.values` — `tsc` enforces it, on
// purpose (§3.2 of the ticket).
export type RunOperationResult =
  | { ok: true; kind: "object"; values: Record<string, string> }
  | { ok: true; kind: "list"; items: Array<Record<string, string>> }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Step 1 — validate anchor identifiers
// ---------------------------------------------------------------------------

/**
 * Exported as `requiredAnchorIdKeys` (renamed, §4 of `LLMW.BENCH.READ.1`,
 * B6b) so the bench's entity selector (`src/lib/llmWorkspace/bench.ts`)
 * reads this one table instead of keeping a second copy that could drift.
 */
export function requiredAnchorIdKeys(entity: EntityKind): Array<keyof AnchorIds> {
  switch (entity) {
    case "project":
      return ["projectId"];
    case "sequence":
      return ["projectId", "sequenceId"];
    case "shot":
      return ["projectId", "sequenceId", "shotId"];
    case "asset":
      return ["projectId", "assetId"];
  }
}

function validateAnchorIds(entity: EntityKind, ids: AnchorIds): boolean {
  return requiredAnchorIdKeys(entity).every((key) => {
    const value = ids[key];
    return typeof value === "number" && Number.isInteger(value) && value > 0;
  });
}

// ---------------------------------------------------------------------------
// Step 3 — load the anchor and verify the ownership chain. Dynamic imports
// throughout, per this module's own module-scope-`@/db` ban.
// ---------------------------------------------------------------------------

/**
 * Exported as `verifyAnchorChain` (§4.2 of `LLMW.BENCH.RUN.1`, B6c1) — the
 * fourth authorized change to this file since B2, and the only one this
 * ticket makes. The bench's Approve (`src/actions/llmWorkspace/bench.ts`) is
 * a request distinct from Run, and `.claude/rules/database.md` requires
 * validating untrusted Server Action inputs before a write; two of the seven
 * commit actions (`applyGeneratedStory`, `applyGeneratedOutline`) verify
 * nothing themselves (`ACTION_REGISTRY`, behaviour 5), so the bench must run
 * this same check itself rather than trust the client's ids — using the one
 * ownership-chain table that already exists, not a second copy of it.
 */
async function loadAndVerifyChain(
  entity: EntityKind,
  ids: AnchorIds,
  chainNotFound: OperationDescriptor["messages"]["chainNotFound"]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { db } = await import("@/db");
  const { projects, sequences, shots, assets } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, ids.projectId as number));
  if (!project) return { ok: false, error: chainNotFound.project ?? "Project not found." };
  if (entity === "project") return { ok: true };

  if (entity === "sequence" || entity === "shot") {
    const [sequence] = await db
      .select({ id: sequences.id, projectId: sequences.projectId })
      .from(sequences)
      .where(eq(sequences.id, ids.sequenceId as number));
    if (!sequence || sequence.projectId !== ids.projectId) {
      return { ok: false, error: chainNotFound.sequence ?? "Sequence not found." };
    }
    if (entity === "sequence") return { ok: true };

    const [shot] = await db
      .select({ id: shots.id, sequenceId: shots.sequenceId })
      .from(shots)
      .where(eq(shots.id, ids.shotId as number));
    if (!shot || shot.sequenceId !== ids.sequenceId) {
      return { ok: false, error: chainNotFound.shot ?? "Shot not found." };
    }
    return { ok: true };
  }

  // entity === "asset"
  const [asset] = await db
    .select({ id: assets.id, projectId: assets.projectId })
    .from(assets)
    .where(eq(assets.id, ids.assetId as number));
  if (!asset || asset.projectId !== ids.projectId) {
    return { ok: false, error: chainNotFound.asset ?? "Asset not found." };
  }
  return { ok: true };
}

export { loadAndVerifyChain as verifyAnchorChain };

// ---------------------------------------------------------------------------
// Step 4 — resolve declared variables via the registry.
// ---------------------------------------------------------------------------

/**
 * A `VariableId`'s anchor id is derived from its own namespace prefix
 * (`PROJECT.*` -> `projectId`, `SEQ.*` -> `sequenceId`, `SHOT.*` ->
 * `shotId`, `ASSET.*` -> `assetId`) rather than from `descriptor.anchor`:
 * `sequencePrompt.assist` anchors on `sequence` but still declares
 * `PROJECT.IDENTITY`, resolved against `projectId`, not `sequenceId`.
 */
function anchorIdForVariable(variableId: VariableId, ids: AnchorIds): number {
  const prefix = variableId.split(".")[0];
  const value =
    prefix === "PROJECT"
      ? ids.projectId
      : prefix === "SEQ"
        ? ids.sequenceId
        : prefix === "SHOT"
          ? ids.shotId
          : prefix === "ASSET"
            ? ids.assetId
            : undefined;
  if (value == null) {
    throw new Error(`anchorIdForVariable: no id available for variable ${variableId}`);
  }
  return value;
}

async function resolveVariables(
  descriptor: OperationDescriptor,
  ids: AnchorIds
): Promise<Partial<Record<VariableId, unknown>>> {
  const entries = await Promise.all(
    descriptor.context.variables.map(async (declared) => {
      const resolver = VARIABLE_REGISTRY[declared.id];
      const data = await resolver(anchorIdForVariable(declared.id, ids));
      return [declared.id, data] as const;
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Flattens every resolved variable's plain-object data into one record, so
 * `preconditions` (naming fields on the anchor entity, e.g. `"pitch"` or
 * `["description", "notes"]`) can look them up without knowing which
 * declared variable happens to carry them. Array-shaped variable data
 * (`SHOT.CAST`, `SHOT.REFERENCES`, the `ASSET.*_APPEARANCES` variables) is
 * skipped — no current precondition names a field living on one of those.
 */
function mergeAnchorFields(resolved: Partial<Record<VariableId, unknown>>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const data of Object.values(resolved)) {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      Object.assign(merged, data as Record<string, unknown>);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// `preconditions` (§4.1 correction 6) — checked after variable resolution,
// before assembly, using the anchor fields resolution already produced.
// ---------------------------------------------------------------------------

function isFieldNonEmpty(mergedAnchorFields: Record<string, unknown>, field: string): boolean {
  const value = mergedAnchorFields[field];
  return typeof value === "string" && value.trim().length > 0;
}

function checkPreconditions(
  preconditions: OperationDescriptor["preconditions"],
  mergedAnchorFields: Record<string, unknown>,
  selectedMode: string | undefined
): { ok: true } | { ok: false; error: string } {
  for (const precondition of preconditions ?? []) {
    if (precondition.modes && (selectedMode == null || !precondition.modes.includes(selectedMode))) {
      continue;
    }
    // `require` mirrors `output.require`'s own vocabulary (§4.1 correction
    // 5): every declared field non-empty, or at least one. A single-field
    // entry behaves identically under either value, which is why migrating
    // every existing precondition to `require: "all"` changes nothing
    // observable.
    const satisfied =
      precondition.require === "all"
        ? precondition.fields.every((field) => isFieldNonEmpty(mergedAnchorFields, field))
        : precondition.fields.some((field) => isFieldNonEmpty(mergedAnchorFields, field));
    if (!satisfied) {
      return { ok: false, error: precondition.message };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// `intent.mode` resolution. §3.1's second-round correction adds
// `messages.invalidMode` (optional): an unrecognised, explicitly-requested
// `mode` is now refused with that message when the descriptor declares one
// — `generateSequencePromptDraft` / `generateShotPromptDraft`'s own
// "Invalid assist mode.". A descriptor without `invalidMode` declared falls
// back to `defaultMode` rather than inventing a visible message for a path
// it never named. No requested mode at all (`requestedMode == null`) is not
// an invalid mode — it is the normal "use the default" case and is never
// refused.
// ---------------------------------------------------------------------------

function resolveSelectedMode(
  descriptor: OperationDescriptor,
  requestedMode: string | undefined
): { ok: true; mode: string | undefined } | { ok: false; error: string } {
  if (!descriptor.intent.mode) return { ok: true, mode: undefined };
  if (requestedMode == null) return { ok: true, mode: descriptor.intent.mode.defaultMode };

  const isKnown = descriptor.intent.mode.modes.some((m) => m.id === requestedMode);
  if (isKnown) return { ok: true, mode: requestedMode };

  if (descriptor.messages.invalidMode) {
    return { ok: false, error: descriptor.messages.invalidMode };
  }
  return { ok: true, mode: descriptor.intent.mode.defaultMode };
}

// ---------------------------------------------------------------------------
// Step 5 — assemble {system, user}. `assembleDescriptorMessages` (moved to
// production by the previous round) takes four render dispatchers; this
// section builds them generically from the resolved variable data plus
// `variables/registry.ts`'s four render-form tables
// (`VARIABLE_RENDER_FORMS`, `MULTI_VARIABLE_RENDER_FORMS`,
// `PARAMETER_RENDER_FORMS`, `MODE_RENDER_FORMS`) — the runner imports no
// operation's module and holds no local table of its own (§3.1's
// correction, reported by the previous round and fixed here: mode and
// parameter render forms now live beside the resolvers, on the same model
// as the two variable tables that already did).
// ---------------------------------------------------------------------------

/**
 * The evidenced calling convention for `{variable}` / `{variables}` render
 * forms: every declared variable's resolved data, in the block's own order,
 * followed by the descriptor's selected mode when `intent.mode` exists.
 * Read off every render-form signature that currently exists, not assumed —
 * `renderProjectIdentitySequencePromptGenerateLines(data, mode)`,
 * `renderSeqCurrentPromptTransformBlock(currentPromptData, contextData,
 * mode)`, `renderShotPromptGenerateContextLines(...six data args, mode)` —
 * every one of them matches "declared variables, then mode", with no
 * counter-example among the render forms this codebase actually has. A
 * render form that does not need the trailing argument ignores it, per
 * ordinary JS call semantics (`renderProjectIdentityStoryContextLines`,
 * `renderOutlineTargetSectionsBullet`'s sibling variable forms, etc.).
 */
function buildVariableDispatchers(
  resolved: Partial<Record<VariableId, unknown>>,
  selectedMode: string | undefined
): { renderVariable: RenderVariable; renderVariables: RenderVariables } {
  const renderVariable: RenderVariable = (variableId, render) => {
    const table = VARIABLE_RENDER_FORMS as unknown as Record<string, Record<string, (...args: unknown[]) => string>>;
    const fn = table[variableId]?.[render];
    if (!fn) throw new Error(`runner: no variable render form ${variableId}::${render}`);
    return fn(resolved[variableId as VariableId], selectedMode);
  };

  const renderVariables: RenderVariables = (variableIds, render) => {
    const table = MULTI_VARIABLE_RENDER_FORMS as unknown as Record<string, (...args: unknown[]) => string>;
    const fn = table[render];
    if (!fn) throw new Error(`runner: no multi-variable render form ${render}`);
    const args = variableIds.map((id) => resolved[id]);
    return fn(...args, selectedMode);
  };

  return { renderVariable, renderVariables };
}

function buildIntentDispatchers(
  parameters: Record<string, number | string> | undefined,
  selectedMode: string | undefined
): { renderParameter: RenderParameter; renderMode: RenderMode } {
  const renderParameter: RenderParameter = (parameterId, render) => {
    const table = PARAMETER_RENDER_FORMS as unknown as Record<string, (value: unknown) => string>;
    const fn = table[render];
    if (!fn) throw new Error(`runner: no parameter render form ${render}`);
    return fn(parameters?.[parameterId]);
  };

  const renderMode: RenderMode = (render) => {
    const table = MODE_RENDER_FORMS as unknown as Record<string, (mode: string) => string>;
    const fn = table[render];
    if (!fn) throw new Error(`runner: no mode render form ${render}`);
    if (selectedMode == null) throw new Error(`runner: mode render form ${render} requires a selected mode`);
    return fn(selectedMode);
  };

  return { renderParameter, renderMode };
}

/**
 * `intent.freeText` dispatcher — LLMW.INTENT.FREETEXT.1 (B9a), same model as
 * `buildIntentDispatchers` above, kept separate since it does not depend on
 * `selectedMode`.
 */
function buildFreeTextDispatcher(freeText: string | undefined): { renderFreeText: RenderFreeText } {
  const renderFreeText: RenderFreeText = (render) => {
    const table = FREE_TEXT_RENDER_FORMS as unknown as Record<string, (value: string | undefined) => string>;
    const fn = table[render];
    if (!fn) throw new Error(`runner: no free text render form ${render}`);
    return fn(freeText);
  };

  return { renderFreeText };
}

// ---------------------------------------------------------------------------
// Steps 7-8 — strip the code fence, parse per `output`, map the error.
// `extractCodeFence` reproduced verbatim from the three copies in
// `src/actions/llm/{story,sequencePrompt,shotPrompt}.ts` (identical
// regex in all seven parsers read for this ticket) — this is the runner's
// one implementation, per the ticket; the three existing copies are left in
// place, to be removed by B3 with their actions.
// ---------------------------------------------------------------------------

function extractCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : trimmed;
}

function parseObjectOutput(
  raw: string,
  output: Extract<OperationDescriptor["output"], { kind: "object" }>
): RunOperationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractCodeFence(raw));
  } catch {
    return { ok: false, error: output.errors.unparsable };
  }

  if (output.exactKeysOnly) {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: output.errors.unparsable };
    }
    const declaredKeys = output.fields.map((f) => f.jsonKey);
    const actualKeys = Object.keys(parsed as Record<string, unknown>);
    if (actualKeys.length !== declaredKeys.length || !declaredKeys.every((k) => actualKeys.includes(k))) {
      return { ok: false, error: output.errors.unparsable };
    }
  }

  const obj: Record<string, unknown> =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};

  const values: Record<string, string> = {};
  for (const field of output.fields) {
    const rawValue = obj[field.jsonKey];
    let value = typeof rawValue === "string" ? rawValue.trim() : "";
    // `truncateTo` (§4.1): silently cut, distinct from `maxLength`'s reject.
    // Generic — no branch names an operation. 800 on the Asset Bible
    // fields, reproducing `cleanAssetBibleField`'s `.trim().slice(0, 800)`
    // (`src/lib/prompts/assetBibleDraft.ts`) now that the descriptor
    // declares it instead of the adapter.
    if (field.truncateTo != null) {
      value = value.slice(0, field.truncateTo);
    }
    if (field.maxLength != null && value.length > field.maxLength) {
      return { ok: false, error: output.errors.empty };
    }
    values[field.field] = value;
  }

  const nonEmptyCount = Object.values(values).filter((v) => v.length > 0).length;
  const satisfied = output.require === "all" ? nonEmptyCount === output.fields.length : nonEmptyCount > 0;
  if (!satisfied) {
    return { ok: false, error: output.errors.empty };
  }

  return { ok: true, kind: "object", values };
}

// ---------------------------------------------------------------------------
// The list branch (LLMW.OUTPUT.LIST.1, B7a). Read verbatim off
// `sequenceShots.ts`, `assetExtraction.ts`, `sequenceGeneration.ts` and
// `castingSuggestions.ts` — see `types.ts`'s `output` field and
// `.agents/executor_report.md` (§2) for exactly what is and is not
// reproduced, and why `castingSuggestions` cannot be modelled by this shape
// at all.
// ---------------------------------------------------------------------------

function parseListOutput(
  raw: string,
  output: Extract<OperationDescriptor["output"], { kind: "list" }>
): RunOperationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractCodeFence(raw));
  } catch {
    return { ok: false, error: output.errors.unparsable };
  }

  // Matches all four parsers' own `(parsed as Record<string, unknown>)?.<key>`
  // read: no separate "wrong top-level shape" check exists in any of them —
  // a non-object `parsed` simply produces `undefined` here, which fails the
  // `Array.isArray` test the same way a present-but-non-array value does,
  // collapsing to the one declared message.
  const arr = (parsed as Record<string, unknown> | null | undefined)?.[output.arrayKey];
  if (!Array.isArray(arr)) {
    return { ok: false, error: output.errors.notArray };
  }

  const { fields: validityFields, require } = output.item.validity;
  const items: Array<Record<string, string>> = [];

  for (const rawItem of arr) {
    // Matches every one of the four `normalizeXxx(raw: unknown)` functions'
    // own `if (!raw || typeof raw !== "object") return null;` guard — an
    // invalid item is filtered, not refused.
    if (!rawItem || typeof rawItem !== "object") continue;
    const obj = rawItem as Record<string, unknown>;

    const values: Record<string, string> = {};
    for (const field of output.item.fields) {
      const rawValue = obj[field.jsonKey];
      let value = typeof rawValue === "string" ? rawValue.trim() : "";
      // Every one of the four parsers' `str(value, maxLen)` helper always
      // trims to `maxLen` — none of them ever refuses an oversized item
      // field, so there is no reject variant here (contrast `ObjectOutput`'s
      // `maxLength`).
      if (field.truncateTo != null) {
        value = value.slice(0, field.truncateTo);
      }
      values[field.field] = value;
    }

    const satisfied =
      require === "all"
        ? validityFields.every((f) => (values[f] ?? "").length > 0)
        : validityFields.some((f) => (values[f] ?? "").length > 0);
    if (!satisfied) continue;

    items.push(values);
  }

  // Matches all four parsers: the "no valid items" refusal is checked
  // against the filtered array, *before* `maxItems` truncation — moot in
  // practice (truncating a non-empty array cannot make it empty), but kept
  // in the same order for fidelity.
  if (items.length === 0) {
    return { ok: false, error: output.errors.empty };
  }

  const truncated = output.maxItems != null ? items.slice(0, output.maxItems) : items;
  return { ok: true, kind: "list", items: truncated };
}

function parseOutput(raw: string, output: OperationDescriptor["output"]): RunOperationResult {
  return output.kind === "list" ? parseListOutput(raw, output) : parseObjectOutput(raw, output);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * `requireLlmConfig` (§5a of `LLMW.BENCH.READ.1`, B6b) defaults to `true` —
 * production's own behaviour, unchanged. The read-only bench passes `false`
 * (via `resolveOperationPreview` below) so a panel that never calls the
 * model is not refused for the one precondition that only matters once it
 * does; `config` becomes `LLMConfig | null` on the shared return type to
 * carry that.
 */
type ResolvePromptInternalOptions = { requireLlmConfig?: boolean };

async function resolvePromptInternal(
  descriptor: OperationDescriptor,
  ids: AnchorIds,
  intent: OperationIntentInput,
  options: ResolvePromptInternalOptions = {}
): Promise<
  | {
      ok: true;
      prompt: LLMPrompt;
      config: LLMConfig | null;
      resolved: Partial<Record<VariableId, unknown>>;
    }
  | { ok: false; error: string }
> {
  const requireLlmConfig = options.requireLlmConfig ?? true;

  // Step 1 — validate anchor identifiers. `messages.invalidRequest` is
  // optional (§3.1's second-round correction): `story.generate` has no
  // verbatim source for it (`generateStory(projectId: number)` never
  // validates its argument), so an undeclared message is not replaced by an
  // invented one — the ids simply flow through to step 3, where a
  // missing/malformed anchor naturally produces `messages.chainNotFound`'s
  // own declared message, matching what the action itself actually
  // produces for a bad id (its `db.select()` just finds no row).
  if (!validateAnchorIds(descriptor.anchor.entity, ids) && descriptor.messages.invalidRequest) {
    return { ok: false, error: descriptor.messages.invalidRequest };
  }

  // Step 2 — getLLMConfig(), refuse if absent unless the caller declared it
  // does not need one. Dynamic import: `@/lib/settings` imports `@/db` at its
  // own module top.
  const { getLLMConfig } = await import("@/lib/settings");
  const config = await getLLMConfig();
  if (!config && requireLlmConfig) {
    return { ok: false, error: descriptor.messages.notConfigured };
  }

  // Step 3 — load the anchor and verify the ownership chain.
  const chain = await loadAndVerifyChain(descriptor.anchor.entity, ids, descriptor.messages.chainNotFound);
  if (!chain.ok) return chain;

  const selectedModeResult = resolveSelectedMode(descriptor, intent.mode);
  if (!selectedModeResult.ok) return selectedModeResult;
  const selectedMode = selectedModeResult.mode;

  // Step 4 — resolve variables declared via the registry.
  const resolved = await resolveVariables(descriptor, ids);

  const precondition = checkPreconditions(descriptor.preconditions, mergeAnchorFields(resolved), selectedMode);
  if (!precondition.ok) return precondition;

  // Step 5 — assemble {system, user} from blocks.
  const { renderVariable, renderVariables } = buildVariableDispatchers(resolved, selectedMode);
  const { renderParameter, renderMode } = buildIntentDispatchers(intent.parameters, selectedMode);
  const { renderFreeText } = buildFreeTextDispatcher(intent.freeText);
  const prompt = assembleDescriptorMessages(
    descriptor,
    renderVariable,
    renderParameter,
    renderMode,
    renderVariables,
    renderFreeText
  );

  return { ok: true, prompt, config: config ?? null, resolved };
}

/**
 * Steps 1-5 only — the dry, read-only part of the pipeline. Used directly by
 * the prompt-equality and chain-refusal proofs, and internally by
 * `runOperation`.
 */
export async function resolveOperationPrompt(
  descriptor: OperationDescriptor,
  ids: AnchorIds,
  intent: OperationIntentInput = {}
): Promise<PromptResolutionResult> {
  const result = await resolvePromptInternal(descriptor, ids, intent);
  if (!result.ok) return result;
  return { ok: true, prompt: result.prompt };
}

/**
 * The full pipeline, steps 1-8: resolves the prompt, calls the model, parses
 * its response per `descriptor.output`, and maps any failure to the
 * matching error message. Nothing here is wired into a production path.
 */
export async function runOperation(
  descriptor: OperationDescriptor,
  ids: AnchorIds,
  intent: OperationIntentInput = {}
): Promise<RunOperationResult> {
  const resolved = await resolvePromptInternal(descriptor, ids, intent);
  if (!resolved.ok) return resolved;

  // `config` is typed `LLMConfig | null` on `resolvePromptInternal`'s shared
  // return shape (§5a of `LLMW.BENCH.READ.1`, B6b) so that
  // `resolveOperationPreview` below can reuse it with `config: null`.
  // `runOperation` always calls with the implicit default
  // (`requireLlmConfig: true`), so step 2 has already refused with
  // `descriptor.messages.notConfigured` when no config exists — `config` is
  // guaranteed non-null here. This is a type narrowing that reuses that same
  // declared message, not a new refusal path.
  if (!resolved.config) {
    return { ok: false, error: descriptor.messages.notConfigured };
  }

  // Step 6 — callLLMJson. Dynamic import: `@/lib/llm` transitively imports
  // `@/db` via `@/lib/vramManager.ts`.
  const { callLLMJson } = await import("@/lib/llm");
  const raw = await callLLMJson(resolved.prompt, resolved.config);

  // Steps 7-8 — strip the fence, parse, map the error.
  return parseOutput(raw, descriptor.output);
}

// ---------------------------------------------------------------------------
// `resolveOperationPreview` — LLMW.BENCH.READ.1 (B6b), §5b. The read-only
// bench's centre pane: steps 1-5 with no LLM configuration required, every
// resolved variable surfaced in `descriptor.context.variables`'s own order
// alongside the assembled prompt. A variable resolver that throws
// (`resolveProjectIdentity` on a project row not found, for example) must
// not become an unhandled exception in the bench's render (§7 of the
// ticket) — caught here, once, rather than at every call site.
// ---------------------------------------------------------------------------

export type OperationPreviewResult =
  | { ok: true; prompt: LLMPrompt; variables: Array<{ id: VariableId; data: unknown }> }
  | { ok: false; error: string };

export async function resolveOperationPreview(
  descriptor: OperationDescriptor,
  ids: AnchorIds,
  intent: OperationIntentInput = {}
): Promise<OperationPreviewResult> {
  try {
    const result = await resolvePromptInternal(descriptor, ids, intent, { requireLlmConfig: false });
    if (!result.ok) return result;
    const variables = descriptor.context.variables.map((declared) => ({
      id: declared.id,
      data: result.resolved[declared.id],
    }));
    return { ok: true, prompt: result.prompt, variables };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
