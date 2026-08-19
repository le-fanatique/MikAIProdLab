"use server";

// ---------------------------------------------------------------------------
// runOperationAction.ts — LLMW.UNIFY.ACTION.1 (C1, step 1)
//
// **One server action for every workspace operation**, standing beside the
// fifteen per-operation adapters in `src/actions/llm/` rather than replacing
// them in one move. Panels migrate onto it one at a time, each deleting its
// own adapter as it goes (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3, "The
// unification, scoped 2026-08-19").
//
// **Why this exists rather than fifteen near-identical files.** Read against
// the nine assist panels, everything they hard-code is already declared by
// their descriptor: which operation to run, whether it takes a director's note
// or parameters, what shape the answer has, and what Approve does. The
// adapters translate `FormData` into ids and back — nothing operation-specific
// survives in them since B3b made them thin.
//
// And this is not a new design: `runBenchOperation`
// (`src/actions/llmWorkspace/bench.ts`) already runs all nineteen descriptors
// through one action. This is that prototype promoted to the product, with the
// one thing the bench does not need — a caller that is a component rather than
// a URL.
//
// **The client names an operation, never supplies one.** `descriptorId` is
// looked up in the closed `DESCRIPTORS` registry and refused if unknown. A
// descriptor is code, and no request may introduce one.
// ---------------------------------------------------------------------------

import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";
import { mapListItemToModelKeys } from "@/lib/llmWorkspace/benchRun";
import {
  runOperation,
  type AnchorIds,
  type OperationImagesInput,
  type OperationIntentInput,
} from "@/lib/llmWorkspace/runner";

/**
 * The serializable result a client component receives. Mirrors
 * `RunOperationResult` one branch for one branch — including `"composite"`,
 * so a future consumer of B20a's output kind is not silently dropped — with
 * the same `kind` discriminant, so a panel narrows exactly as the runner does.
 */
export type RunWorkspaceOperationResult =
  | { ok: true; kind: "object"; values: Record<string, string | number> }
  /** Items keyed by the model's own JSON keys (`shot_code`, `assetType`…), never by entity field names — see the list branch below for why. */
  | { ok: true; kind: "list"; items: Array<Record<string, string | number | boolean>> }
  | { ok: true; kind: "text"; text: string }
  | {
      ok: true;
      kind: "composite";
      values: Record<string, string | number>;
      lists: Record<string, Array<Record<string, string | number | string[]>>>;
    }
  | { ok: false; error: string };

export type RunWorkspaceOperationInput = {
  /** A key of the closed `DESCRIPTORS` registry. Anything else is refused. */
  descriptorId: string;
  ids: AnchorIds;
  /** The director's note, the selected mode and any declared parameters — user input, validated by the runner (`normalizeIntentParameters`), never trusted as-is. */
  intent?: OperationIntentInput;
  /** Which stored images to attach, in the user's own order (LLMW.DESCRIPTOR.IMAGE.1). Ignored by an operation that declares no `images`. */
  images?: OperationImagesInput;
};

/**
 * Runs one declared operation and returns its parsed result.
 *
 * Everything that used to live in a per-operation adapter now happens inside
 * the runner, against the descriptor's own declarations: id validation and
 * ownership (`messages.invalidRequest` / `chainNotFound`), the pre-call gates
 * (`preconditions`), the provider call, and the parse with its declared
 * refusals. There is no operation-specific logic here, and there must never
 * be — a branch on `descriptorId` in this file would mean the format failed to
 * express something, which is a brick to build rather than a special case to
 * add (§11.3's governing rule).
 */
export async function runWorkspaceOperation(
  input: RunWorkspaceOperationInput
): Promise<RunWorkspaceOperationResult> {
  const descriptor = (DESCRIPTORS as Record<string, (typeof DESCRIPTORS)[keyof typeof DESCRIPTORS]>)[
    input.descriptorId
  ];
  if (!descriptor) {
    // Deliberately not echoing the requested id back: it came from the
    // client, and reflecting caller-supplied text into a user-facing message
    // is a habit worth not having.
    return { ok: false, error: "Unknown operation." };
  }

  try {
    const result = await runOperation(descriptor, input.ids, input.intent ?? {}, input.images);
    if (!result.ok) return result;

    // Relayed branch by branch rather than returned wholesale, so that adding
    // a sixth `RunOperationResult` variant fails `tsc` here instead of
    // reaching a panel as an unrecognised shape — the discipline B11-b1 and
    // B12b-1 both used for their own widenings.
    if (result.kind === "object") return { ok: true, kind: "object", values: result.values };
    if (result.kind === "list") {
      // LLMW.UNIFY.LIST.1 — **keyed by the model's own JSON keys, not by
      // entity field names.**
      //
      // The runner parses into field names (`assetType`, `durationSeconds`).
      // Every consumer needs the model's keys back: the four write actions
      // re-parse the approved payload through their own `normalize*`, which
      // reads `shot_code` / `duration_seconds` / `assetType` — B7b settled
      // that when it added `selection.formDataKey`, and each deleted list
      // adapter did this translation itself.
      //
      // Doing it here is what lets a panel stop importing descriptor
      // internals. The translation needs `output.item.fields`, and a client
      // component reaching into a descriptor is a line this codebase has
      // never crossed — it is why the four list panels could not migrate
      // (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3). One gap, four panels
      // waiting: §11.3's own rule for when a brick is worth building.
      //
      // Only the translation moves. Truncation, null-filling and shaping into
      // a panel's own display type are presentation and stay where they are.
      if (descriptor.output.kind !== "list") {
        throw new Error("runWorkspaceOperation: a list result from a non-list descriptor.");
      }
      const fields = descriptor.output.item.fields;
      return { ok: true, kind: "list", items: result.items.map((item) => mapListItemToModelKeys(fields, item)) };
    }
    if (result.kind === "text") return { ok: true, kind: "text", text: result.text };
    return { ok: true, kind: "composite", values: result.values, lists: result.lists };
  } catch (err) {
    // A thrown resolver (a row vanishing mid-run, an unknown render form) must
    // reach the panel as a refusal, not as an unhandled Server Action
    // rejection — the same treatment `runBenchOperation` gives it.
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
