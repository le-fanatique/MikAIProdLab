// ---------------------------------------------------------------------------
// benchRun.ts — LLMW.BENCH.RUN.1 (B6c1), §4.3
//
// Pure decision logic for the bench's Run/Approve surface — no database
// access, no LLM call, no component import. Same discipline as `bench.ts`
// (B6b): every decision this ticket makes lives here, where it is testable
// in isolation (`tests/llmWorkspace/benchRun.test.ts`).
// ---------------------------------------------------------------------------

import { ACTION_REGISTRY } from "./actions/registry";
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
type RedirectOnlyActionId = {
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
// the bench's Run/Approve draft only knows how to render flat fields today —
// a list-output template has no bench UI yet (B7c).
// ---------------------------------------------------------------------------

export type ObjectOutputFields = Extract<OperationDescriptor["output"], { kind: "object" }>["fields"];

export function buildBenchDraftFields(
  fields: ObjectOutputFields,
  values: Record<string, string>
): Array<{ field: string; value: string }> {
  return fields.map((f) => ({ field: f.field, value: values[f.field] ?? "" }));
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
// `isBenchReturnToQueryKey` — supervisor review retake (post-B6c1). The
// bench rebuilds its own `returnTo` from the current query string
// (`src/app/settings/llm-workflows/[templateId]/page.tsx`), and the two
// `redirectOnly` commit actions append their own confirmation parameter to
// that same `returnTo` on redirect, on *both* the success and the error
// path:
//
//   - `updateShotPrompt` (`src/actions/shots.ts:594,628`):
//     `shotPromptError`, `shotPromptSaved`
//   - `updateSequencePrompt` (`src/actions/sequences.ts:283,306`):
//     `sequencePromptError`, `sequencePromptSaved`
//
// Left unfiltered, that parameter rides along into the *next* `returnTo`
// the bench builds after the redirect lands — the query string grows by one
// parameter on every Approve. Excluded here, once, so the page's `returnTo`
// construction stays a one-line loop over this predicate rather than a
// hard-coded exclusion list repeated at the call site.
// ---------------------------------------------------------------------------

const BENCH_RETURN_TO_EXCLUDED_KEYS = [
  "shotPromptError",
  "shotPromptSaved",
  "sequencePromptError",
  "sequencePromptSaved",
] as const;

export function isBenchReturnToQueryKey(key: string): boolean {
  return !(BENCH_RETURN_TO_EXCLUDED_KEYS as readonly string[]).includes(key);
}
