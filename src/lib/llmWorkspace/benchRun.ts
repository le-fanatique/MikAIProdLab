// ---------------------------------------------------------------------------
// benchRun.ts — LLMW.BENCH.RUN.1 (B6c1), §4.3
//
// Pure decision logic for the bench's Run/Approve surface — no database
// access, no LLM call, no component import. Same discipline as `bench.ts`
// (B6b): every decision this ticket makes lives here, where it is testable
// in isolation (`tests/llmWorkspace/benchRun.test.ts`).
// ---------------------------------------------------------------------------

import { ACTION_REGISTRY } from "./actions/registry";
import type { BenchSearchParams } from "./bench";
import type { ActionId, OperationDescriptor } from "./types";

// ---------------------------------------------------------------------------
// `planBenchCommit` — decides how (or whether) the bench's Approve can write
// for a given descriptor, per §4.3's ordered rules.
// ---------------------------------------------------------------------------

// `RedirectOnlyActionId` — narrows `BenchCommitPlan`'s two committing
// branches to exactly the `ActionId`s each can carry. Without this,
// `actionId` types as the full `ActionId` on both branches, and
// `bench.ts`'s dispatch switch (exhaustive over `ActionId`, no `default`
// by design — see its Step 5 comment) stops being exhaustive the moment
// `ActionId` grows: TS2366, "not all code paths return a value". The three
// insert `ActionId`s added by this ticket (LLMW.ACTION.INSERT.1, B7c-w) are
// all `response: "redirectOnly"`, and `planBenchCommit` already routes
// `redirectOnly` actions out of `commitBenchProposal` before its switch
// runs (Step 2) — so the switch only ever needs to be exhaustive over the
// non-`redirectOnly` `ActionId`s, and this type says so.
//
// This fixes the TS2366 the ticket named, but exposes a second, narrower
// mismatch this file alone cannot close: `bench.ts`'s switch still carries
// two explicit `case` branches (`updateShotPrompt`, `updateSequencePrompt`)
// kept only for exhaustiveness against the old, unnarrowed `ActionId`. Once
// `plan.actionId` (returnValue branch) excludes every `redirectOnly` id,
// those two case labels are no longer comparable to the switch's own
// discriminant type (TS2678) — see `.agents/executor_report.md` C.1.
export type RedirectOnlyActionId = {
  [K in ActionId]: (typeof ACTION_REGISTRY)[K]["response"] extends "redirectOnly" ? K : never;
}[ActionId];

export type BenchCommitPlan =
  | { kind: "returnValue"; actionId: Exclude<ActionId, RedirectOnlyActionId> }
  | { kind: "redirectOnly"; actionId: RedirectOnlyActionId }
  | { kind: "unsupported"; reason: string };

// A type predicate, not an inline `.response === "redirectOnly"` check: only
// a predicate lets `tsc` narrow `actionId` itself (to `RedirectOnlyActionId`
// on the true branch, to `Exclude<ActionId, RedirectOnlyActionId>` on the
// false branch) from the ternary below.
function isRedirectOnlyAction(actionId: ActionId): actionId is RedirectOnlyActionId {
  return ACTION_REGISTRY[actionId].response === "redirectOnly";
}

export function planBenchCommit(descriptor: OperationDescriptor): BenchCommitPlan {
  if (descriptor.anchor.kind === "entitySet") {
    return { kind: "unsupported", reason: "Batch operations cannot be approved from the bench." };
  }

  if (descriptor.commit.length !== 1) {
    return { kind: "unsupported", reason: "This template declares no single commit action." };
  }

  const actionId = descriptor.commit[0];

  if (actionId === "applyBatchAssetDescriptionDraftsInline") {
    return { kind: "unsupported", reason: "Batch operations cannot be approved from the bench." };
  }

  return isRedirectOnlyAction(actionId) ? { kind: "redirectOnly", actionId } : { kind: "returnValue", actionId };
}

// ---------------------------------------------------------------------------
// `buildBenchDraftFields` — the draft's initial state and the textareas'
// render order, both driven by the descriptor's `output.fields`, in their
// own order.
//
// Takes `descriptor.output.fields` directly (not the whole descriptor):
// `BenchRunPanel` (§4.5) receives only `outputFields` as a prop — the
// declared fields, in order — not the full `OperationDescriptor`, so this
// is the shape its one caller actually has in hand. Kept as `descriptor`'s
// own sub-type, not a hand-typed duplicate, so the two stay in lockstep.
//
// Narrowed to the `"object"` branch of `output` (LLMW.OUTPUT.LIST.1, B7a):
// this function only ever builds the flat-field draft. The `"list"` branch
// has its own selection state and its own rebuild function
// (`buildListSelectionPayload`, below) — the bench's Run/Approve surface now
// serves both output kinds (LLMW.PROPOSAL.LIST.1, B7d).
// ---------------------------------------------------------------------------

export type ObjectOutputFields = Extract<OperationDescriptor["output"], { kind: "object" }>["fields"];

export function buildBenchDraftFields(
  fields: ObjectOutputFields,
  values: Record<string, string>
): Array<{ field: string; value: string }> {
  return fields.map((f) => ({ field: f.field, value: values[f.field] ?? "" }));
}

// ---------------------------------------------------------------------------
// `buildListSelectionPayload` — LLMW.PROPOSAL.LIST.1 (B7d). Rebuilds the
// JSON array a list-kind commit action (`createGeneratedShots` today)
// expects on its `selection.formDataKey` field, from the bench's own
// selection state.
//
// The runner produces items keyed by entity field name (`shotCode`,
// `durationSeconds` — `RunOperationResult`'s `kind: "list"` branch,
// `runner.ts`); the write action re-normalizes via its own `normalizeShot`
// and expects the model's own JSON keys (`shot_code`, `duration_seconds`,
// per `descriptor.output.item.fields[].jsonKey`). This function is the one
// place that bridges the two — driven entirely by `fields`, so no operation
// name or literal entity-model key ever appears in its body (types.ts:384-394).
// ---------------------------------------------------------------------------

export type ListOutputItemFields = Extract<OperationDescriptor["output"], { kind: "list" }>["item"]["fields"];

// `mapListItemToModelKeys` — LLMW.MIGRATE.LIST.1 (B7e). The per-item
// translation `buildListSelectionPayload` (below) already did inline,
// extracted so `generateShotsFromSequenceDraft`
// (`src/actions/llm/sequenceShots.ts`) can reuse the same runner-item ->
// model-key mapping in object form (it serializes its own array itself, per
// its return type, rather than taking a pre-serialized JSON string).
export function mapListItemToModelKeys(
  fields: ListOutputItemFields,
  item: Record<string, string | number>
): Record<string, string | number> {
  const entry: Record<string, string | number> = {};
  for (const field of fields) {
    // A field absent from the item (an "omit"-fallback numeric field the
    // model left out, per `readNumberField` in `runner.ts`) is omitted
    // from the emitted object too — never written as `null` or `""` — so
    // that `normalizeShot`'s own absence handling applies unchanged.
    if (field.field in item) {
      entry[field.jsonKey] = item[field.field];
    }
  }
  return entry;
}

export function buildListSelectionPayload(
  fields: ListOutputItemFields,
  items: Array<Record<string, string | number>>,
  selected: number[]
): string {
  // Iterate `selected` in ascending index order, ignoring any out-of-bounds
  // index — the list's own order is the insertion order
  // (`ACTION_REGISTRY.createGeneratedShots.writeSemantics: "insertPerItem"`),
  // so the emitted array's order must be the list's order, not the
  // selection's own (possibly non-contiguous, unordered) click order.
  const orderedIndices = [...selected].filter((i) => i >= 0 && i < items.length).sort((a, b) => a - b);

  const payload = orderedIndices.map((index) => mapListItemToModelKeys(fields, items[index]));

  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------------
// `preservedAssetDetailColumns` — the `updateAssetDetailsInline` columns a
// descriptor does *not* declare in its own `output.fields`, derived from the
// registry rather than hard-coded. Registry behaviour 3:
// `updateAssetDetailsInline` replaces all five columns on every call, a
// blank one becoming null — so the Approve path must read these columns off
// the existing row and carry them through, or it silently erases them.
// ---------------------------------------------------------------------------

export function preservedAssetDetailColumns(descriptor: OperationDescriptor): string[] {
  // `updateAssetDetailsInline`-committing descriptors are `output.kind ===
  // "object"` in practice (no list descriptor commits through it — B7b/B7c);
  // narrowed defensively per the discriminant (LLMW.OUTPUT.LIST.1, B7a). A
  // hypothetical list descriptor declares no fields here, so every column is
  // "not declared" and preserved, rather than guessed.
  const declared = new Set(descriptor.output.kind === "object" ? descriptor.output.fields.map((f) => f.field) : []);
  return ACTION_REGISTRY.updateAssetDetailsInline.columns.written.filter((column) => !declared.has(column));
}

// ---------------------------------------------------------------------------
// `REDIRECT_CONFIRMATION_KEYS` — LLMW.BENCH.CONFIRM.1 (B7d-f). The single
// source for the query-string parameter each `redirectOnly` commit action
// appends to its own redirect target, read off the actions themselves:
//
//   - `updateShotPrompt` (`src/actions/shots.ts:594,628`):
//     `shotPromptError`, `shotPromptSaved`
//   - `updateSequencePrompt` (`src/actions/sequences.ts:283,306`):
//     `sequencePromptError`, `sequencePromptSaved`
//   - `createGeneratedShots` (`src/actions/llm/sequenceShots.ts:141,213`),
//     wired by LLMW.PROPOSAL.LIST.1 (B7d): `shotsCreateError`, `shotsCreated`
//   - `createGeneratedSequences` (`src/actions/llm/sequenceGeneration.ts:135,199`),
//     wired by LLMW.MIGRATE.LIST.2 (B7g-m), now that
//     `sequencesFromOutlineDescriptor.commit` names it: `sequencesCreateError`,
//     `sequencesCreated`
//
// `RedirectOnlyActionId` is wider than these four: `ACTION_REGISTRY` also
// declares `createSelectedAssets` (`src/actions/llm/assetExtraction.ts:207,258`
// — `assetsCreateError`, `assetsCreated`) as `response: "redirectOnly"`,
// though it is not wired to any descriptor's `commit` yet (registry.ts's own
// comment on `createGeneratedShots`: "future tickets") — out of this
// ticket's scope (§ "Hors scope"). `planBenchCommit` can therefore never
// actually produce a `redirectOnly` plan for it today — but the `satisfies`
// below is a type-level check, not a reachability one, so it still needs a
// real entry to compile. Keys verified against the action's own `redirect()`
// calls, not invented; `resolveBenchConfirmation` below deliberately renders
// nothing for it — no ticket has frozen wording for it yet.
//
// The `satisfies Record<RedirectOnlyActionId, …>` is the guardrail this
// ticket buys: a future `redirectOnly` action does not compile into this
// table until it declares its own two keys here, so it cannot redirect
// silently the way the bench did before this ticket. Both
// `BENCH_RETURN_TO_EXCLUDED_KEYS` (below) and `resolveBenchConfirmation`
// read this one table — neither keeps its own copy.
// ---------------------------------------------------------------------------

export const REDIRECT_CONFIRMATION_KEYS = {
  updateShotPrompt: { successKey: "shotPromptSaved", errorKey: "shotPromptError" },
  updateSequencePrompt: { successKey: "sequencePromptSaved", errorKey: "sequencePromptError" },
  createGeneratedShots: { successKey: "shotsCreated", errorKey: "shotsCreateError" },
  createSelectedAssets: { successKey: "assetsCreated", errorKey: "assetsCreateError" },
  createGeneratedSequences: { successKey: "sequencesCreated", errorKey: "sequencesCreateError" },
} as const satisfies Record<RedirectOnlyActionId, { successKey: string; errorKey: string }>;

// ---------------------------------------------------------------------------
// `isBenchReturnToQueryKey` — supervisor review retake (post-B6c1). The
// bench rebuilds its own `returnTo` from the current query string
// (`src/app/settings/llm-workflows/[templateId]/page.tsx`), and the
// `redirectOnly` commit actions append their own confirmation parameter to
// that same `returnTo` on redirect, on *both* the success and the error
// path (see `REDIRECT_CONFIRMATION_KEYS` above for the concrete keys and
// their source lines).
//
// Left unfiltered, that parameter rides along into the *next* `returnTo`
// the bench builds after the redirect lands — the query string grows by one
// parameter on every Approve. Excluded here, once, so the page's `returnTo`
// construction stays a one-line loop over this predicate rather than a
// hard-coded exclusion list repeated at the call site. Derived from
// `REDIRECT_CONFIRMATION_KEYS` (B7d-f) rather than kept as its own hand
// written list, so the two cannot drift apart.
// ---------------------------------------------------------------------------

const BENCH_RETURN_TO_EXCLUDED_KEYS: readonly string[] = Object.values(REDIRECT_CONFIRMATION_KEYS).flatMap(
  ({ successKey, errorKey }) => [successKey, errorKey]
);

export function isBenchReturnToQueryKey(key: string): boolean {
  return !BENCH_RETURN_TO_EXCLUDED_KEYS.includes(key);
}

// ---------------------------------------------------------------------------
// `resolveBenchConfirmation` — LLMW.BENCH.CONFIRM.1 (B7d-f). Decides the
// bench's confirmation banner from the current query string, for every
// `redirectOnly` commit action. Pure: no JSX, no component import — the page
// only renders what this returns.
//
// `BenchSearchParams` (`bench.ts`) types every value as
// `string | string[] | undefined`, because Next.js's `searchParams` allows a
// repeated query key to arrive as an array. The confirmation keys this
// function reads are each appended exactly once, by exactly one `redirect()`
// call, on one code path — but a client could still craft a URL with the key
// repeated. Read via the local `firstSearchValue` below, resolving a
// repeated key to its first occurrence rather than silently dropping it or
// crashing on `.startsWith`/`Number()` of an array — the same behaviour as
// `bench.ts`'s own `firstBenchParam`, but not reused from there: this file
// is imported by `BenchRunPanel.tsx` (`"use client"`), and importing a
// runtime binding from `bench.ts` pulls its whole module graph
// (`runner.ts` → `llm/index.ts` → `comfy/comfyServerClient.ts` →
// `comfy/plyArtifact.ts` → Node's `fs/promises`) into the client bundle —
// confirmed by `npm run build` failing with "Module not found: Can't
// resolve 'fs/promises'" when this file imported `firstBenchParam` as a
// value from `bench.ts`. Only `BenchSearchParams` is imported from there,
// as `import type`, which TypeScript erases entirely.
//
// The ticket's frozen table (B7d-f) named only three actions
// (`updateShotPrompt`, `updateSequencePrompt`, `createGeneratedShots`).
// LLMW.MIGRATE.LIST.2 (B7g-m) adds a fourth, `createGeneratedSequences`, now
// that `sequencesFromOutlineDescriptor` commits through it — same rules as
// `createGeneratedShots`: `N sequences created.`, singular
// `1 sequence created.`, a non-integer or `<= 0` count renders nothing, and
// an error takes precedence over a success value (checked first, above).
// `createSelectedAssets` remains unreachable from any descriptor (see
// `REDIRECT_CONFIRMATION_KEYS` above) and the ticket froze no wording for
// it; this function returns `null` for it rather than invent copy.
// ---------------------------------------------------------------------------

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveBenchConfirmation(
  plan: BenchCommitPlan,
  search: BenchSearchParams
): { kind: "success"; message: string } | { kind: "error"; message: string } | null {
  if (plan.kind !== "redirectOnly") return null;
  if (
    plan.actionId !== "updateShotPrompt" &&
    plan.actionId !== "updateSequencePrompt" &&
    plan.actionId !== "createGeneratedShots" &&
    plan.actionId !== "createGeneratedSequences"
  ) {
    return null;
  }

  const { successKey, errorKey } = REDIRECT_CONFIRMATION_KEYS[plan.actionId];
  const errorValue = firstSearchValue(search[errorKey]);
  if (errorValue != null && errorValue !== "") {
    // Next.js decodes the query string when it builds `searchParams`, so the
    // `encodeURIComponent`d message each action's `redirect()` call writes
    // arrives here already decoded — rendered verbatim, no re-decoding.
    return { kind: "error", message: errorValue };
  }

  const successValue = firstSearchValue(search[successKey]);
  if (successValue == null) return null;

  if (plan.actionId === "createGeneratedShots") {
    const count = Number(successValue);
    if (!Number.isInteger(count) || count <= 0) return null;
    return { kind: "success", message: `${count} shot${count === 1 ? "" : "s"} created.` };
  }

  if (plan.actionId === "createGeneratedSequences") {
    const count = Number(successValue);
    if (!Number.isInteger(count) || count <= 0) return null;
    return { kind: "success", message: `${count} sequence${count === 1 ? "" : "s"} created.` };
  }

  if (successValue !== "1") return null;

  return plan.actionId === "updateShotPrompt"
    ? { kind: "success", message: "Shot Prompt saved." }
    : { kind: "success", message: "Sequence Prompt saved." };
}
