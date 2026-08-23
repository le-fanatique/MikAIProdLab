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

import type { EntityKind, ListItemField, ObjectOutputField, OperationDescriptor, PreconditionRef, VariableId } from "./types";
import {
  assembleDescriptorMessages,
  type RenderFreeText,
  type RenderMode,
  type RenderParameter,
  type RenderVariable,
  type RenderImages,
  type RenderVariables,
  type RenderVariablesParameters,
} from "./assembleDescriptorMessages";
import {
  FREE_TEXT_RENDER_FORMS,
  MODE_RENDER_FORMS,
  MULTI_VARIABLE_RENDER_FORMS,
  PARAMETER_RENDER_FORMS,
  POST_RESPONSE_FORMS,
  VARIABLE_PARAMETER_RENDER_FORMS,
  VARIABLE_REGISTRY,
  VARIABLE_RENDER_FORMS,
  type PostResponseFormInput,
  type VariableParameterRenderInput,
} from "./variables/registry";
import { IMAGE_RENDER_FORMS, IMAGE_SOURCE_REGISTRY } from "./images/registry";
import { prepareWorkspaceImages, type PreparedWorkspaceImage } from "./images/prepare";
import type { ChatMessage, LLMConfig, LLMPrompt } from "@/types/llm";

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
  // STYLE.LLM.LOOKFEEDBACK.CORE.1 — the `lookResult` anchor's own id, a
  // `look_test_results` row.
  lookResultId?: number;
};

export type OperationIntentInput = {
  freeText?: string;
  mode?: string;
  // Widened `number | string` -> `number | string | boolean | string[]`
  // (LLMW.DESCRIPTOR.ASSETS.1, B7f) for `"boolean"` / `"multiEnum"`
  // `intent.parameters` entries — see `types.ts`'s own widening note.
  parameters?: Record<string, number | string | boolean | string[]>;
};

/**
 * LLMW.DESCRIPTOR.IMAGE.1 (B16a). Which stored images this run attaches, and
 * in which order — user input, sitting beside `intent` rather than inside
 * `context.variables`, because a variable resolves from the anchor and the
 * database with no user choice in it. `docs/LLM_WORKSPACE_ARCHITECTURE.md`
 * §11.3 named this exact gap when B8 dissolved: "No variable can express 'the
 * ordered subset the user just ticked'."
 *
 * The order given here is the order the images are attached and keyed
 * (`R1..Rn`), and it is never re-sorted anywhere downstream.
 */
export type OperationImagesInput = {
  selectedIds: number[];
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
//
// LLMW.OUTPUT.LIST.2 (B7b), §2.3: list items widen from `Record<string,
// string>` to `Record<string, string | number>` — the point B7a's own
// comment signalled without being able to model: a plain `string` record
// cannot honestly carry `duration_seconds` or `order_index`. The `"object"`
// variant is untouched.
//
// LLMW.DESCRIPTOR.CASTING.1 (B7h-b2), §1: widened again to `string | number |
// boolean` — never parsed from the model (`ListItemField` itself does not
// gain a `"boolean"` variant; see `types.ts`), but a `postResponse` form may
// now compute and attach a boolean field after parsing (`alreadyAssigned`,
// the first case). `parseListOutput`'s own items are still only ever `string
// | number` at the moment they leave `output` parsing — this widening is
// entirely about what a `postResponse` form is allowed to hand back.
//
// LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1): the `"object"` branch's `values`
// widens the same way the `"list"` branch's `items` already did for the same
// reason — `output.fields` now admits `ObjectOutputField`'s `"number"`
// variant (`types.ts`), so a parsed object value can honestly be a number,
// not just a string. Still no `boolean` here: unlike the list branch, no
// `postResponse` form runs over an `"object"` result.
//
// LLMW.TEXT.1 (B12b-1): a third, deliberately breaking variant —
// `{ok:true, kind:"text", text:string}` — forcing `tsc` to make every
// declared consumer of this union recognise the new `kind`, exactly the
// discipline B11-b1 already applied to its own widening. See
// `.agents/executor_report.md` for the two consumers this broke
// (`src/actions/llmWorkspace/bench.ts`'s serializable copy,
// `src/app/settings/llm-workflows/[templateId]/page.tsx`'s bench render) and
// how each was resolved.
export type RunOperationResult =
  | { ok: true; kind: "object"; values: Record<string, string | number> }
  | { ok: true; kind: "list"; items: Array<Record<string, string | number | boolean>> }
  | { ok: true; kind: "text"; text: string }
  // LLMW.OUTPUT.COMPOSITE.1 (B20a) — a fourth variant, broken deliberately on
  // the same discipline B11-b1 and B12b-1 applied to their own widenings:
  // every declared consumer must recognise the new `kind` or fail `tsc`.
  //
  // `values` is the scalar part (same shape as the `"object"` variant's own),
  // `lists` is keyed by each declared list's `key`. List items admit
  // `string[]` here and nowhere else — see `CompositeListItemField` in
  // `types.ts` for why that widening is not pushed onto the `"list"` variant.
  | {
      ok: true;
      kind: "composite";
      values: Record<string, string | number>;
      lists: Record<string, Array<Record<string, string | number | string[]>>>;
    }
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
    // STYLE.LLM.LOOKFEEDBACK.CORE.1 — same two-level shape as `asset`: the
    // owning Project plus the entity's own id, no intermediate level.
    case "lookResult":
      return ["projectId", "lookResultId"];
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
  const { projects, sequences, shots, assets, lookTestResults } = await import("@/db/schema");
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

  // STYLE.LLM.LOOKFEEDBACK.CORE.1 — same two-level shape as `asset` below,
  // but against `look_test_results.project_id`: a deliberately denormalized
  // column (§ of `src/db/schema/lookDevelopment.ts`), so this is a straight
  // comparison, never a join through `look_tests`. This is the check that
  // refuses a `lookResultId` belonging to another project.
  if (entity === "lookResult") {
    const [lookResult] = await db
      .select({ id: lookTestResults.id, projectId: lookTestResults.projectId })
      .from(lookTestResults)
      .where(eq(lookTestResults.id, ids.lookResultId as number));
    if (!lookResult || lookResult.projectId !== ids.projectId) {
      return { ok: false, error: chainNotFound.lookResult ?? "Look Test result not found." };
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
            // STYLE.LLM.LOOKFEEDBACK.CORE.1 — `LOOK.RESULT`'s own prefix.
            : prefix === "LOOK"
              ? ids.lookResultId
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
// `preconditions` (§4.1 correction 6) — checked after variable resolution and
// parameter normalization, before assembly, using the anchor-field merge, the
// raw resolved variables, and the already-normalized parameters the pipeline
// has by this point. Widened from `fields: FieldRef[]` to `refs:
// PreconditionRef[]` by LLMW.DESCRIPTOR.ASSETS.1 (B7f) — see `PreconditionRef`
// (`types.ts`) for what each ref variant means and how its own "non-empty" is
// defined.
// ---------------------------------------------------------------------------

function isAnchorFieldNonEmpty(mergedAnchorFields: Record<string, unknown>, field: string): boolean {
  const value = mergedAnchorFields[field];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * `parameter` ref: present after normalization AND non-empty. `false` is
 * empty, `""` is empty, `[]` is empty; `0` is **not** empty (a declared
 * numeric parameter of `0` is a real value, not an absence) — the exact rule
 * frozen by the ticket (§3 of `.agents/supervised_task.md`).
 */
function isParameterNonEmpty(
  normalizedParameters: NormalizedIntentParameters | undefined,
  parameterId: string
): boolean {
  const value = normalizedParameters?.[parameterId];
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true; // number, including 0
}

/**
 * `variable` ref: the resolved value must be an array — the only shape a
 * `preconditions` consumer has today (`PROJECT.SEQUENCES`). Any other shape
 * has no consumer and is refused loudly rather than guessed at, per the
 * ticket (§3).
 */
function isVariableNonEmpty(resolved: Partial<Record<VariableId, unknown>>, variableId: VariableId): boolean {
  const value = resolved[variableId];
  if (!Array.isArray(value)) {
    throw new Error(`checkPreconditions: variable ref "${variableId}" did not resolve to an array.`);
  }
  return value.length > 0;
}

function isPreconditionRefSatisfied(
  ref: PreconditionRef,
  mergedAnchorFields: Record<string, unknown>,
  resolved: Partial<Record<VariableId, unknown>>,
  normalizedParameters: NormalizedIntentParameters | undefined
): boolean {
  if ("anchorField" in ref) return isAnchorFieldNonEmpty(mergedAnchorFields, ref.anchorField);
  if ("parameter" in ref) return isParameterNonEmpty(normalizedParameters, ref.parameter);
  return isVariableNonEmpty(resolved, ref.variable);
}

function checkPreconditions(
  preconditions: OperationDescriptor["preconditions"],
  mergedAnchorFields: Record<string, unknown>,
  resolved: Partial<Record<VariableId, unknown>>,
  normalizedParameters: NormalizedIntentParameters | undefined,
  selectedMode: string | undefined
): { ok: true } | { ok: false; error: string } {
  for (const precondition of preconditions ?? []) {
    if (precondition.modes && (selectedMode == null || !precondition.modes.includes(selectedMode))) {
      continue;
    }
    // `require` mirrors `output.require`'s own vocabulary (§4.1 correction
    // 5): every declared ref non-empty, or at least one. A single-ref entry
    // behaves identically under either value, which is why migrating every
    // existing precondition to `require: "all"` changes nothing observable.
    const satisfied =
      precondition.require === "all"
        ? precondition.refs.every((ref) => isPreconditionRefSatisfied(ref, mergedAnchorFields, resolved, normalizedParameters))
        : precondition.refs.some((ref) => isPreconditionRefSatisfied(ref, mergedAnchorFields, resolved, normalizedParameters));
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
// production by the previous round) takes seven render dispatchers; this
// section builds them generically from the resolved variable data plus
// `variables/registry.ts`'s five render-form tables
// (`VARIABLE_RENDER_FORMS`, `MULTI_VARIABLE_RENDER_FORMS`,
// `PARAMETER_RENDER_FORMS`, `MODE_RENDER_FORMS`,
// `VARIABLE_PARAMETER_RENDER_FORMS` — the last added by
// LLMW.BLOCK.VARPARAM.1, B7c-n4) — the runner imports no operation's module
// and holds no local table of its own (§3.1's correction, reported by the
// previous round and fixed here: mode and parameter render forms now live
// beside the resolvers, on the same model as the two variable tables that
// already did).
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

// ---------------------------------------------------------------------------
// `normalizeIntentParameters` — LLMW.PARAM.BOUNDS.1 (B7e-n). The runner's own
// enforcement of `intent.parameters`' `type`/`min`/`max`/`default`, absent
// since B2a: `buildIntentDispatchers` and `buildVariableParameterDispatcher`
// below used to pass `intent.parameters` straight through, so an
// out-of-bounds value reached the prompt unchanged (the `c6ad874` regression
// this ticket closes) and a bench-forged URL could send anything at all
// (`bench.ts`'s `parseIntentInputFromSearchParams`, out of this ticket's
// scope — it also calls through `runOperation`, so this one normalization
// point covers it without being touched).
//
// The rule, frozen by the supervisor from the two real parameters' own
// pre-migration behaviour (`targetCount`, `f892850:sequenceShots.ts:85-87`;
// `targetSections`, `outlineGeneration.ts:21-30`): a declared entry's
// provided value is valid if it satisfies its `type` (`"integer"` ->
// `Number.isInteger`; `"string"` -> `typeof === "string"`) and, for
// `"integer"`, its declared `min`/`max`. An invalid or missing value becomes
// the declared `default` when one exists, or is omitted otherwise — never
// clamped to `min`/`max`, matching what both actions actually did. A
// provided key not named by any declared entry is dropped: the descriptor is
// the whole contract of what it accepts.
//
// LLMW.DESCRIPTOR.ASSETS.1 (B7f) extends the rule with two more types,
// exactly the same shape ("valid -> kept; invalid or absent -> the declared
// default, or omission; never a partial correction"):
//   - `"boolean"`: valid iff `typeof value === "boolean"`;
//   - `"multiEnum"`: valid iff `value` is an **array** and **every** member
//     belongs to the declared `values`. An empty array is valid (an empty
//     choice, not a mistyped value). An array containing even one unknown
//     member is invalid **in its entirety** — no silent filtering of the
//     unknown members, which would mask a caller bug instead of surfacing
//     it. Order is preserved exactly as received: no sort, no dedup (the
//     builder joins members in the order it receives them).
//
// Called exactly once, in `resolvePromptInternal` below, before either
// dispatcher is built and before `checkPreconditions` (moved ahead of it by
// this same ticket, §3: a `{parameter: ...}` precondition ref needs the
// already-normalized value) — so the rule is applied a single time per
// resolution, not once per dispatcher.
// ---------------------------------------------------------------------------

export type NormalizedIntentParameters = Record<string, number | string | boolean | string[]>;

function isValidIntentParameterValue(
  entry: NonNullable<OperationDescriptor["intent"]["parameters"]>[number],
  value: number | string | boolean | string[] | undefined
): boolean {
  if (value === undefined) return false;
  switch (entry.type) {
    case "integer":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        (entry.min == null || value >= entry.min) &&
        (entry.max == null || value <= entry.max)
      );
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "multiEnum":
      return Array.isArray(value) && value.every((member) => (entry.values ?? []).includes(member));
  }
}

export function normalizeIntentParameters(
  declared: NonNullable<OperationDescriptor["intent"]["parameters"]> | undefined,
  provided: Record<string, number | string | boolean | string[]> | undefined
): NormalizedIntentParameters | undefined {
  if (!declared || declared.length === 0) return undefined;

  const normalized: NormalizedIntentParameters = {};
  for (const entry of declared) {
    const value = provided?.[entry.id];
    if (isValidIntentParameterValue(entry, value)) {
      normalized[entry.id] = value as number | string | boolean | string[];
    } else if (entry.default !== undefined) {
      normalized[entry.id] = entry.default;
    }
    // else: omitted — no default declared for an invalid/missing value.
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildIntentDispatchers(
  parameters: NormalizedIntentParameters | undefined,
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

/**
 * `{images: true, render}` dispatcher — LLMW.DESCRIPTOR.IMAGE.1 (B16a). Closes
 * over the already-prepared images exactly as the dispatchers above close over
 * their own resolved data, and hands the render form keys and metadata only:
 * `base64`, `imageSha256` and the row id are deliberately stripped here, so no
 * render form can put a byte or a path into the prompt text even by accident.
 */
function buildImagesDispatcher(images: PreparedWorkspaceImage[]): { renderImages: RenderImages } {
  const forRender = images.map((image) => ({ key: image.key, metadata: image.metadata }));
  const renderImages: RenderImages = (render) => {
    const table = IMAGE_RENDER_FORMS as unknown as Record<string, (input: typeof forRender) => string>;
    const fn = table[render];
    if (!fn) throw new Error(`runner: no images render form ${render}`);
    return fn(forRender);
  };
  return { renderImages };
}

// ---------------------------------------------------------------------------
// Step 4b — the declared image input (LLMW.DESCRIPTOR.IMAGE.1, B16a).
//
// Runs after the preconditions and before block assembly, because an
// `{images}` block renders from the prepared result. Three refusals, each
// with the descriptor's own declared message, on the same principle as every
// other pre-call refusal in this file: the runner never writes user-facing
// text of its own.
//
// A descriptor that declares no `images` skips this entirely and behaves
// exactly as it did before this ticket — including when a caller passes an
// images input anyway, which is then ignored rather than silently attached to
// an operation that never asked for one.
// ---------------------------------------------------------------------------
async function resolveDeclaredImages(
  descriptor: OperationDescriptor,
  ids: AnchorIds,
  images: OperationImagesInput | undefined
): Promise<{ ok: true; images: PreparedWorkspaceImage[] } | { ok: false; error: string }> {
  const declared = descriptor.images;
  if (!declared) return { ok: true, images: [] };

  const selectedIds = images?.selectedIds ?? [];
  if (selectedIds.length < declared.minCount) {
    return { ok: false, error: declared.messages.noneSelected };
  }
  if (selectedIds.length > declared.maxCount) {
    return { ok: false, error: declared.messages.tooMany };
  }

  const source = IMAGE_SOURCE_REGISTRY[declared.source];
  // A source anchored on an entity the operation is not anchored on has no
  // id to resolve against. This is a descriptor-authoring error, not a user
  // error, so it throws rather than borrowing a user-facing message — the
  // same treatment an unknown render form gets above.
  if (source.anchor !== descriptor.anchor.entity) {
    throw new Error(
      `runner: image source ${declared.source} anchors on ${source.anchor}, but the operation anchors on ${descriptor.anchor.entity}`
    );
  }
  // The entity's OWN id is the last of the chain `requiredAnchorIdKeys`
  // returns (`["projectId", "assetId"]` for an asset), never the first.
  const anchorKeys = requiredAnchorIdKeys(source.anchor);
  const anchorId = ids[anchorKeys[anchorKeys.length - 1]];
  if (typeof anchorId !== "number") {
    return { ok: false, error: declared.messages.unavailable };
  }

  const resolved = await source.resolve(anchorId, selectedIds);
  if (!resolved.ok) return { ok: false, error: `${declared.messages.unavailable} ${resolved.error}` };

  const prepared = await prepareWorkspaceImages(resolved.images, {
    isConfined: source.isConfined,
    maxFileBytes: source.maxFileBytes,
    maxTotalBytes: declared.maxTotalBytes,
    keyPrefix: declared.keyPrefix,
  });
  if (!prepared.ok) return { ok: false, error: `${declared.messages.unavailable} ${prepared.error}` };

  return { ok: true, images: prepared.images };
}

/**
 * `{variables, parameters, render}` dispatcher — LLMW.BLOCK.VARPARAM.1
 * (B7c-n4). Unlike `buildVariableDispatchers` / `buildIntentDispatchers`
 * above, `VARIABLE_PARAMETER_RENDER_FORMS` takes one object argument
 * (`VariableParameterRenderInput`), built here from exactly what the block
 * declares: the variables named in `variableIds`, looked up in `resolved`
 * (undefined when not resolved — a declared-but-absent variable is passed
 * through as `undefined`, same as `buildVariableDispatchers`'s
 * `resolved[variableId]` above, never a thrown error); the parameters named
 * in `parameterIds`, looked up in `parameters` (undefined when not supplied,
 * same as `buildIntentDispatchers`'s `parameters?.[parameterId]` — the render
 * form owns its own default, e.g. `?? 6`); and the operation's selected
 * mode.
 */
function buildVariableParameterDispatcher(
  resolved: Partial<Record<VariableId, unknown>>,
  parameters: NormalizedIntentParameters | undefined,
  selectedMode: string | undefined
): { renderVariablesParameters: RenderVariablesParameters } {
  const renderVariablesParameters: RenderVariablesParameters = (variableIds, parameterIds, render) => {
    const table = VARIABLE_PARAMETER_RENDER_FORMS as unknown as Record<
      string,
      (input: VariableParameterRenderInput) => string
    >;
    const fn = table[render];
    if (!fn) throw new Error(`runner: no variable-parameter render form ${render}`);

    const variables: Partial<Record<VariableId, unknown>> = {};
    for (const id of variableIds) variables[id] = resolved[id];

    const params: Record<string, number | string | boolean | string[] | undefined> = {};
    for (const id of parameterIds) params[id] = parameters?.[id];

    return fn({ variables, parameters: params, mode: selectedMode });
  };

  return { renderVariablesParameters };
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

  // LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1): dispatches on `field.type` now that
  // `output.fields` is `ObjectOutputField[]`. `"string"` keeps exactly its
  // pre-existing behaviour and order of operations (`truncateTo` before
  // `maxLength`'s refusal) — nothing below this comment changed for it.
  // `"number"` is new: a present, in-bounds numeric value is stored as a
  // `number`; an absent/invalid/out-of-bounds one is omitted from `values`
  // entirely (`fallback: "omit"` is the only value the type admits — see
  // `ObjectOutputField` in `types.ts`), and — like every existing
  // `"string"` field — never counts as satisfying `require` when omitted.
  const values: Record<string, string | number> = {};
  for (const field of output.fields) {
    const rawValue = obj[field.jsonKey];
    if (field.type === "number") {
      const result = readObjectNumberField(rawValue, field);
      if (result.present) values[field.field] = result.value;
      continue;
    }
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

  // `require`'s own "non-empty" rule is unchanged for `"string"` fields
  // (length > 0) and, by the same standard, a present `"number"` field is
  // always non-empty — an omitted one (never `0`, per `fallback: "omit"`)
  // is not. No existing descriptor declares a `"number"` field yet (§2 of
  // `.agents/supervised_task.md`), so this only changes behaviour for a
  // future descriptor that does.
  const nonEmptyCount = Object.values(values).filter((v) => (typeof v === "number" ? true : v.length > 0)).length;
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

// LLMW.OUTPUT.LIST.2 (B7b), §3.1: reading a raw field value off the parsed
// item object. `??`, not `||` — `assetExtraction.ts:41,52,56,57`
// (`r.assetType ?? r.asset_type`) lets an empty string on the primary key
// win over the fallback; that nuance is observable and is reproduced as-is,
// not "improved".
function readRawField(obj: Record<string, unknown>, jsonKey: string, jsonKeyFallback: string | undefined): unknown {
  return jsonKeyFallback != null ? (obj[jsonKey] ?? obj[jsonKeyFallback]) : obj[jsonKey];
}

// §3.2 — `type: "string"`, unchanged from B7a except for the fallback read.
function readStringField(rawValue: unknown, truncateTo: number | undefined): string {
  let value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (truncateTo != null) {
    value = value.slice(0, truncateTo);
  }
  return value;
}

// LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1) — the numeric validation shared by
// `ListItemField`'s `"number"` variant (§3.3 below) and `ObjectOutputField`'s
// `"number"` variant (`parseObjectOutput`): `typeof === "number"`,
// `Number.isFinite`, `exclusiveMin` exclusive, `max` inclusive. Neither
// caller's own type (`Extract<ListItemField, {type:"number"}>` /
// `Extract<ObjectOutputField, {type:"number"}>`) is reused directly — both
// already carry `exclusiveMin?`/`max?` and nothing else this function reads,
// so a small structural type (`NumericFieldBounds`) is the shared surface,
// not `readNumberField`'s own signature. `readNumberField`'s `fallbackIndex`
// parameter has no meaning for an `"object"` output (no item position to
// seed from — `ObjectOutputField`'s `"number"` variant only ever declares
// `fallback: "omit"`), so it stays local to `readNumberField` rather than
// becoming a third parameter every caller must pass and only one ever uses.
type NumericFieldBounds = { exclusiveMin?: number; max?: number };

function isValidNumericValue(rawValue: unknown, bounds: NumericFieldBounds): rawValue is number {
  return (
    typeof rawValue === "number" &&
    Number.isFinite(rawValue) &&
    (bounds.exclusiveMin == null || rawValue > bounds.exclusiveMin) &&
    (bounds.max == null || rawValue <= bounds.max)
  );
}

// §3.3 — `type: "number"`. `fallbackIndex` is the item's position in the
// raw, *unfiltered* array (`sequenceGeneration.ts:88,189`'s
// `.map((item, i) => normalizeSequence(item, i))`), not in the filtered
// output — a descriptor whose first item is invalid must give the second
// item `order_index: 1`, not `0`.
function readNumberField(
  rawValue: unknown,
  field: Extract<ListItemField, { type: "number" }>,
  fallbackIndex: number
): { present: true; value: number } | { present: false } {
  if (isValidNumericValue(rawValue, field)) return { present: true, value: rawValue };
  if (field.fallback === "index") return { present: true, value: fallbackIndex };
  return { present: false }; // "omit" — the key is absent, not "" or 0
}

// LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1) — the `"object"`-output counterpart of
// `readNumberField` above, sharing `isValidNumericValue` rather than
// re-deriving the same four rules. No `fallbackIndex`: `ObjectOutputField`'s
// `"number"` variant only ever declares `fallback: "omit"` (`types.ts`), so
// there is exactly one outcome on an invalid/absent/out-of-bounds value — the
// key is omitted from `values`, never `"index"`, never `0`, never `""`.
function readObjectNumberField(
  rawValue: unknown,
  field: Extract<ObjectOutputField, { type: "number" }>
): { present: true; value: number } | { present: false } {
  return isValidNumericValue(rawValue, field) ? { present: true, value: rawValue } : { present: false };
}

// §3.4 — `type: "enum"`. No `trim()`: `normalizeAssetType`
// (`assetExtraction.ts:22-27`) and its `sourceLevel` sibling compare the raw
// value by identity, so `" hero "` is not `"hero"` and falls back to the
// default. Trimming first would change an observable behaviour.
function readEnumField(rawValue: unknown, field: Extract<ListItemField, { type: "enum" }>): string {
  return typeof rawValue === "string" && field.values.includes(rawValue) ? rawValue : field.default;
}

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
  const items: Array<Record<string, string | number>> = [];

  arr.forEach((rawItem, fallbackIndex) => {
    // Matches every one of the four `normalizeXxx(raw: unknown)` functions'
    // own `if (!raw || typeof raw !== "object") return null;` guard — an
    // invalid item is filtered, not refused. The fallback index is taken
    // from the raw array's own position (§3.3), before this filter runs.
    if (!rawItem || typeof rawItem !== "object") return;
    const obj = rawItem as Record<string, unknown>;

    const values: Record<string, string | number> = {};
    for (const field of output.item.fields) {
      const rawValue = readRawField(obj, field.jsonKey, field.jsonKeyFallback);
      if (field.type === "string") {
        values[field.field] = readStringField(rawValue, field.truncateTo);
      } else if (field.type === "number") {
        const result = readNumberField(rawValue, field, fallbackIndex);
        if (result.present) values[field.field] = result.value;
      } else {
        values[field.field] = readEnumField(rawValue, field);
      }
    }

    // §3.5 — validity only gates on declared string fields; written totally
    // (no `as string`) even though the validator (§4, rule 6) makes a
    // non-string validity field unreachable in practice.
    const isFieldSatisfied = (f: string) => {
      const v = values[f];
      return typeof v === "string" && v.length > 0;
    };
    const satisfied = require === "all" ? validityFields.every(isFieldSatisfied) : validityFields.some(isFieldSatisfied);
    if (!satisfied) return;

    items.push(values);
  });

  // Matches all four parsers: the "no valid items" refusal is checked
  // against the filtered array, *before* `sort` and `maxItems` (§3.6).
  if (items.length === 0) {
    return { ok: false, error: output.errors.empty };
  }

  // §3.6 — sort after the empty-refusal, before `maxItems`. Not evidenced by
  // any single parser combining both (none does): truncating first would
  // discard items the sort would otherwise have brought to the front, so
  // sort-then-truncate is the decision taken here, not an observed fact.
  const sortSpec = output.sort;
  const sorted = sortSpec != null ? [...items].sort((a, b) => (a[sortSpec.field] as number) - (b[sortSpec.field] as number)) : items;

  const truncated = output.maxItems != null ? sorted.slice(0, output.maxItems) : sorted;
  return { ok: true, kind: "list", items: truncated };
}

// ---------------------------------------------------------------------------
// The text branch (LLMW.TEXT.1, B12b-1). Deliberately not `extractCodeFence`:
// a strip that makes sense against corrupted JSON would corrupt legitimate
// prose that happens to contain backticks or braces of its own. `.trim()`,
// refuse empty-or-blank with `output.errors.empty`, and nothing else — no
// `require` (one value), no `unparsable` (nothing is parsed).
// ---------------------------------------------------------------------------

function parseTextOutput(
  raw: string,
  output: Extract<OperationDescriptor["output"], { kind: "text" }>
): RunOperationResult {
  const text = raw.trim();
  if (text.length === 0) {
    return { ok: false, error: output.errors.empty };
  }
  return { ok: true, kind: "text", text };
}

// ---------------------------------------------------------------------------
// The composite branch — LLMW.OUTPUT.COMPOSITE.1 (B20a).
//
// One scalar record and several named lists, parsed from a single JSON object.
// Every field reader is the one the `"object"` and `"list"` branches already
// use (`readRawField`, `readStringField`, `readNumberField`, `readEnumField`)
// — a composite answer is not a different kind of value, only a different
// arrangement of them, so a second set of readers would be pure divergence
// risk.
//
// Three rules, each matching what its single-shape sibling already does:
//   - a declared list whose `arrayKey` is missing or not an array refuses the
//     whole answer with `errors.notArray`, as `parseListOutput` does. It does
//     NOT degrade to an empty list: a composite answer missing half of itself
//     is a malformed answer, not a thin one;
//   - an invalid ITEM inside a present array is filtered, never refused —
//     `parseListOutput`'s own rule, unchanged;
//   - `errors.empty` gates on the SCALARS only. An analysis that observed
//     nothing is a legitimate answer; one with no summary is not.
// ---------------------------------------------------------------------------
function parseCompositeOutput(
  raw: string,
  output: Extract<OperationDescriptor["output"], { kind: "composite" }>,
  // LLMW.OUTPUT.REFVALIDITY.1 (B20b). The keys THIS run attached — not a
  // second declaration to keep in sync, but the very list `resolveDeclaredImages`
  // produced. Empty for an operation that declares no images, in which case a
  // list declaring `item.references` can satisfy nothing and says so.
  attachedKeys: string[] = []
): RunOperationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractCodeFence(raw));
  } catch {
    return { ok: false, error: output.errors.unparsable };
  }
  const root = parsed as Record<string, unknown> | null | undefined;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return { ok: false, error: output.errors.unparsable };
  }

  const values: Record<string, string | number> = {};
  for (const field of output.scalars) {
    const rawValue = root[field.jsonKey];
    if (field.type === "string") {
      const text = readStringField(rawValue, field.truncateTo);
      if (field.maxLength != null && text.length > field.maxLength) {
        return { ok: false, error: output.errors.empty };
      }
      values[field.field] = text;
    } else {
      const result = readNumberField(rawValue, field, 0);
      if (result.present) values[field.field] = result.value;
    }
  }

  const isScalarSatisfied = (field: ObjectOutputField) => {
    const v = values[field.field];
    return typeof v === "number" ? true : typeof v === "string" && v.length > 0;
  };
  const scalarsSatisfied =
    output.require === "all" ? output.scalars.every(isScalarSatisfied) : output.scalars.some(isScalarSatisfied);
  if (!scalarsSatisfied) {
    return { ok: false, error: output.errors.empty };
  }

  const lists: Record<string, Array<Record<string, string | number | string[]>>> = {};
  for (const list of output.lists) {
    const arr = root[list.arrayKey];
    if (!Array.isArray(arr)) {
      return { ok: false, error: output.errors.notArray };
    }

    const { fields: validityFields, require } = list.item.validity;
    const items: Array<Record<string, string | number | string[]>> = [];

    arr.forEach((rawItem, fallbackIndex) => {
      if (!rawItem || typeof rawItem !== "object") return;
      const obj = rawItem as Record<string, unknown>;

      const itemValues: Record<string, string | number | string[]> = {};
      for (const field of list.item.fields) {
        if (field.type === "stringList") {
          const rawValue = obj[field.jsonKey];
          const members = Array.isArray(rawValue)
            ? rawValue
                .filter((m): m is string => typeof m === "string")
                .map((m) => m.trim())
                .filter((m) => m.length > 0)
            : [];
          itemValues[field.field] = field.maxItems != null ? members.slice(0, field.maxItems) : members;
          continue;
        }
        const rawValue = readRawField(obj, field.jsonKey, field.jsonKeyFallback);
        if (field.type === "string") {
          itemValues[field.field] = readStringField(rawValue, field.truncateTo);
        } else if (field.type === "number") {
          const result = readNumberField(rawValue, field, fallbackIndex);
          if (result.present) itemValues[field.field] = result.value;
        } else {
          itemValues[field.field] = readEnumField(rawValue, field);
        }
      }

      // Same rule as `parseListOutput`: a validity field is satisfied by a
      // non-empty string. A `stringList` field is satisfied by a non-empty
      // list — the one addition, and the reason it is here rather than in
      // `parseListOutput` is that only a composite item can hold one.
      const isFieldSatisfied = (f: string) => {
        const v = itemValues[f];
        if (Array.isArray(v)) return v.length > 0;
        return typeof v === "string" && v.length > 0;
      };
      const satisfied =
        require === "all" ? validityFields.every(isFieldSatisfied) : validityFields.some(isFieldSatisfied);
      if (!satisfied) return;

      items.push(itemValues);
    });

    // LLMW.OUTPUT.REFVALIDITY.1 (B20b) — applied to the items that survived
    // `validity`, and REFUSING rather than filtering. See the field's own note
    // in `types.ts`: this reproduces what `validation.ts` does today, and a
    // model citing an image that was never attached has misread the request.
    const refSpec = list.item.references;
    if (refSpec) {
      const attached = new Set(attachedKeys);
      const citations = new Map<string, number>();

      for (const item of items) {
        const value = item[refSpec.field];
        const cited: string[] =
          refSpec.mode === "subset"
            ? Array.isArray(value)
              ? value
              : []
            : typeof value === "string" && value.length > 0
              ? [value]
              : [];

        // "single" wants exactly one; "subset" wants at least one.
        if (cited.length === 0) {
          return { ok: false, error: output.errors.unknownReference ?? output.errors.notArray };
        }
        if (refSpec.mode === "single" && cited.length !== 1) {
          return { ok: false, error: output.errors.unknownReference ?? output.errors.notArray };
        }
        for (const key of cited) {
          if (!attached.has(key)) {
            return { ok: false, error: output.errors.unknownReference ?? output.errors.notArray };
          }
          citations.set(key, (citations.get(key) ?? 0) + 1);
        }
      }

      if (refSpec.coverage) {
        for (const key of attachedKeys) {
          const count = citations.get(key) ?? 0;
          if (count < refSpec.coverage.min || count > refSpec.coverage.max) {
            return { ok: false, error: output.errors.coverage ?? output.errors.notArray };
          }
        }
      }
    }

    lists[list.key] = list.maxItems != null ? items.slice(0, list.maxItems) : items;
  }

  return { ok: true, kind: "composite", values, lists };
}

function parseOutput(
  raw: string,
  output: OperationDescriptor["output"],
  attachedKeys: string[] = []
): RunOperationResult {
  if (output.kind === "list") return parseListOutput(raw, output);
  if (output.kind === "text") return parseTextOutput(raw, output);
  if (output.kind === "composite") return parseCompositeOutput(raw, output, attachedKeys);
  return parseObjectOutput(raw, output);
}

// ---------------------------------------------------------------------------
// Step 9 — `postResponse` (LLMW.POSTRESPONSE.1, B7g). Applied after
// `parseOutput`, only when `result.ok`, `result.kind === "list"` and
// `descriptor.postResponse` is declared. The variables and parameters passed
// to the form are exactly the ones the pipeline already resolved/normalized
// upstream (`resolved`, `normalizedParameters`) — no re-read of the
// database, no re-run of `normalizeIntentParameters`. A `postResponse.form`
// absent from `POST_RESPONSE_FORMS` is a programming error, not a user
// error: it throws, on the same model the block dispatchers above already
// use for an unknown `render` name.
// ---------------------------------------------------------------------------

function applyPostResponseForm(
  postResponse: NonNullable<OperationDescriptor["postResponse"]>,
  parsed: Extract<RunOperationResult, { ok: true; kind: "list" }>,
  resolved: Partial<Record<VariableId, unknown>>,
  normalizedParameters: NormalizedIntentParameters | undefined,
  ids: AnchorIds
): RunOperationResult {
  const table = POST_RESPONSE_FORMS as unknown as Record<
    string,
    (input: PostResponseFormInput) => Array<Record<string, string | number | boolean>>
  >;
  const fn = table[postResponse.form];
  if (!fn) throw new Error(`runner: no post-response form ${postResponse.form}`);

  const variables: Record<string, unknown> = {};
  for (const id of postResponse.variables) variables[id] = resolved[id];

  const parameters: Record<string, number | string | boolean | string[] | undefined> = {};
  for (const id of postResponse.parameters ?? []) parameters[id] = normalizedParameters?.[id];

  // LLMW.DESCRIPTOR.CASTING.1 (B7h-b2), §2: the operation's own already-
  // validated anchor identifiers, carried through — necessary for
  // `castingFromSequence.filterAndEnrich`'s sequence-level filter, which
  // compares a `targetType: "sequence"` item's `targetId` to the *current*
  // sequence (`castingSuggestions.ts`'s own read-side gate,
  // `raw.targetId !== sequenceId`). No `postResponse` form before this one
  // needed the anchor at all.
  return { ok: true, kind: "list", items: fn({ items: parsed.items, variables, parameters, anchorIds: ids }) };
}

// ---------------------------------------------------------------------------
// Step 6, image path — the outbound multimodal message
// (LLMW.DESCRIPTOR.IMAGE.1, B16a).
//
// ONE `ChatMessage` in the shape the existing router already translates for
// both provider families: OpenAI-compatible/OpenRouter read the `content`
// array's `image_url` data-URL parts, Ollama reads the same message's
// top-level `images` (raw base64, no prefix) and only the text parts. Never a
// second per-provider payload builder — the same discipline
// `projectStyle/referenceAnalysis/provider.ts` states for its own copy.
//
// **The JSON forcing is lost on this path, and that is a real consequence, not
// an oversight.** `callLLMJson` sets `response_format: {type:"json_object"}`
// (OpenAI-compatible) / `format: "json"` (Ollama); `callLLMChat`, the only
// route that carries images at all, sets neither. So:
//
//   - `output.kind: "text"` is unaffected — it never wanted JSON. This is
//     B16b's case (a lighting description is prose);
//   - an image-bearing `"object"` or `"list"` operation must ask for its JSON
//     schema in the prompt itself and rely on `parseOutput`'s fence-stripping,
//     exactly as `referenceAnalysis/prompt.ts` already does at
//     `temperature: 0`. B20 will be the first such operation.
//
// `temperature: 0` is passed for the same reason that module passes it: a
// description of what is visible in an image is an observation, not a
// creative act.
// ---------------------------------------------------------------------------
function buildImageChatMessages(prompt: LLMPrompt, images: PreparedWorkspaceImage[]): ChatMessage[] {
  return [
    { role: "system", content: prompt.system },
    {
      role: "user",
      content: [
        { type: "text", text: prompt.user },
        ...images.map((image) => ({
          type: "image_url" as const,
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        })),
      ],
      images: images.map((image) => image.base64),
    },
  ];
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
  options: ResolvePromptInternalOptions = {},
  images?: OperationImagesInput
): Promise<
  | {
      ok: true;
      prompt: LLMPrompt;
      config: LLMConfig | null;
      resolved: Partial<Record<VariableId, unknown>>;
      // LLMW.POSTRESPONSE.1 (B7g): the exact value `normalizeIntentParameters`
      // already produced for this call, carried through so `runOperation`'s
      // post-response step reads it as-is instead of recomputing it — "the
      // parameters passed are those already normalized" (ticket §3).
      normalizedParameters: NormalizedIntentParameters | undefined;
      // LLMW.DESCRIPTOR.IMAGE.1 (B16a): the prepared images, carried through
      // so `runOperation` builds its outbound message from the same bytes
      // this resolution already read and re-validated — never a second read
      // that could straddle a file change. Empty for every descriptor that
      // declares no `images`, which is all of them today.
      images: PreparedWorkspaceImage[];
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

  // `intent.parameters` is normalized here, once, before `checkPreconditions`
  // — reordered ahead of it by LLMW.DESCRIPTOR.ASSETS.1 (B7f): a
  // `{parameter: id}` precondition ref (new in this ticket) reads the
  // already-normalized value, not the caller's raw, unvalidated one, on the
  // same "normalize once" discipline this function's header already states.
  // No observable change for any of the five pre-existing descriptors: none
  // of their preconditions references a parameter.
  const normalizedParameters = normalizeIntentParameters(descriptor.intent.parameters, intent.parameters);

  const precondition = checkPreconditions(
    descriptor.preconditions,
    mergeAnchorFields(resolved),
    resolved,
    normalizedParameters,
    selectedMode
  );
  if (!precondition.ok) return precondition;

  // Step 4b — the declared image input, before assembly: an `{images}` block
  // renders from the prepared result.
  const preparedImages = await resolveDeclaredImages(descriptor, ids, images);
  if (!preparedImages.ok) return preparedImages;

  // Step 5 — assemble {system, user} from blocks.
  const { renderVariable, renderVariables } = buildVariableDispatchers(resolved, selectedMode);
  const { renderParameter, renderMode } = buildIntentDispatchers(normalizedParameters, selectedMode);
  const { renderFreeText } = buildFreeTextDispatcher(intent.freeText);
  const { renderVariablesParameters } = buildVariableParameterDispatcher(resolved, normalizedParameters, selectedMode);
  const { renderImages } = buildImagesDispatcher(preparedImages.images);
  const prompt = assembleDescriptorMessages(
    descriptor,
    renderVariable,
    renderParameter,
    renderMode,
    renderVariables,
    renderFreeText,
    renderVariablesParameters,
    renderImages
  );

  return { ok: true, prompt, config: config ?? null, resolved, normalizedParameters, images: preparedImages.images };
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
  intent: OperationIntentInput = {},
  images?: OperationImagesInput
): Promise<RunOperationResult> {
  const resolved = await resolvePromptInternal(descriptor, ids, intent, {}, images);
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

  // Step 6 — callLLMJson, or callLLMText for a `kind: "text"` output
  // (LLMW.TEXT.1, B12b-1): `callLLMJson` forces JSON on both provider
  // families, which a free-text operation must not ask for. Dynamic import:
  // `@/lib/llm` transitively imports `@/db` via `@/lib/vramManager.ts`.
  //
  // Accessed off the module namespace rather than destructured: every
  // pre-existing runner test mocks `@/lib/llm` with a factory that returns
  // `callLLMJson` alone (`vi.mock("@/lib/llm", () => ({ callLLMJson:
  // vi.fn() }))`), and Vitest's mock proxy throws the moment an undeclared
  // export is *destructured*, even for an `"object"`/`"list"` descriptor
  // that never calls `callLLMText` at all. Property access on the namespace
  // object, read only inside the branch that actually needs it, does not
  // trigger that check — the exact regression `.agents/executor_report.md`
  // reports finding and fixing this way.
  const llm = await import("@/lib/llm");
  const raw = descriptor.images
    ? (await llm.callLLMChat(buildImageChatMessages(resolved.prompt, resolved.images), resolved.config, { temperature: 0 })).text
    : descriptor.output.kind === "text"
      ? await llm.callLLMText(resolved.prompt, resolved.config)
      : await llm.callLLMJson(resolved.prompt, resolved.config);

  // Steps 7-8 — strip the fence, parse, map the error.
  const parsed = parseOutput(
    raw,
    descriptor.output,
    resolved.images.map((image) => image.key)
  );

  // Step 9 — postResponse, only on a successful list result.
  if (parsed.ok && parsed.kind === "list" && descriptor.postResponse) {
    return applyPostResponseForm(descriptor.postResponse, parsed, resolved.resolved, resolved.normalizedParameters, ids);
  }
  return parsed;
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
  intent: OperationIntentInput = {},
  // LLMW.LIGHTING.FROMIMAGE.1 (B16b) — widened the same way `runOperation`
  // already was by B16a: a descriptor declaring `images` refuses at Step 4b
  // (`resolveDeclaredImages`) below `minCount` regardless of what the bench's
  // "Test Entity" pane resolved, so the read-only preview must see the same
  // selection the Run/Approve calls do, or the centre pane would show
  // `messages.noneSelected` forever, even after the user picks images —
  // never a second, independent image selection.
  images?: OperationImagesInput
): Promise<OperationPreviewResult> {
  try {
    const result = await resolvePromptInternal(descriptor, ids, intent, { requireLlmConfig: false }, images);
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
