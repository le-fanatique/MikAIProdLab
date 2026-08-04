// ---------------------------------------------------------------------------
// verifyWorkflowMutations.ts — GEN.ASSET.INPUT.ISOLATION.1
//
// Fail-closed, structural (never textual-search) proof that a queued
// workflow only changed the fields it was allowed to change. Two callers:
// src/actions/generation.ts (runAssetGeneration) and
// src/lib/comfy/runShotGeneration.ts (runShotGenerationCore) — both call
// this instead of re-implementing their own ad-hoc diff.
//
// Deliberately does NOT re-verify Dynamic Batch / Direct Repeatable node
// add/remove — that expansion contract is already proven elsewhere
// (expandDynamicBatch.ts / expandDirectRepeatableInputs.ts, WFBUILD.1.B-FIX1).
// This module only guards the next step: expanded workflow -> patched
// payload (must match patch records exactly), and patched payload ->
// uploaded payload (must only rewrite `inputs.image` on uploaded LoadImage
// nodes, to the exact recorded provider filename).
//
// Round 2 (Codex REVISE, P1) — the diff is a genuine recursive walk of the
// FULL workflow JSON tree (every node key: `class_type`, `_meta`, `inputs`
// and any other property, plus whole-node add/remove), not just
// `inputs.*`. `class_type`/`_meta` mutation, an added empty node, a removed
// node, an added/removed node key, or a changed nested array/object all
// produce a violation unless the exact structural path matches an allowed
// one.
// ---------------------------------------------------------------------------

import type { WorkflowPayloadPatch } from "@/lib/comfy/patchWorkflowPayload";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type MutationDiffEntry = {
  /** Structural path, e.g. `"3.inputs.image"`, `"1.class_type"`, `"1._meta.title"`, `"5"` (whole node), `"1.inputs.images[0]"`. */
  path: string;
  before: unknown;
  after: unknown;
};

/**
 * Genuine recursive diff: objects are compared key-by-key (recursing),
 * arrays index-by-index (recursing), anything else (primitives, or a
 * type/shape mismatch such as object-vs-array) is compared by value and
 * reported as a single leaf diff at the current path. Every reachable leaf
 * that differs is reported — nothing is skipped because a parent object
 * "looked equal enough".
 */
function deepDiff(before: unknown, after: unknown, path: string, out: MutationDiffEntry[]): void {
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      deepDiff(before[key], after[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i++) {
      deepDiff(before[i], after[i], `${path}[${i}]`, out);
    }
    return;
  }

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    out.push({ path, before, after });
  }
}

function diffWorkflowJson(before: Record<string, unknown>, after: Record<string, unknown>): MutationDiffEntry[] {
  const diffs: MutationDiffEntry[] = [];
  deepDiff(before, after, "", diffs);
  return diffs;
}

export type MutationVerificationResult =
  | { ok: true }
  | { ok: false; error: string; violations: MutationDiffEntry[] };

function sanitizedViolationError(prefix: string, violations: MutationDiffEntry[]): string {
  // Never echo `before`/`after` values (may contain asset paths, prompt
  // text, or other internal detail) — only the structural location.
  const locations = violations.map((v) => `node field '${v.path}'`).join(", ");
  return `${prefix}: unexpected workflow field mutation(s) detected (${locations}). No prompt was submitted.`;
}

/**
 * Pre-upload gate. `beforePatchJson` must be the workflow JSON exactly as it
 * stood after Dynamic Batch / Direct Repeatable expansion (already-trusted
 * contract, not re-verified) and before `patchWorkflowPayload` ran. Every
 * diff against `patchedJson`, anywhere in the tree, must correspond to a
 * real patch record's exact `<nodeId>.inputs.<inputKey>` path and
 * `nextValue` — anything else (a different path, an extra/missing node, a
 * `class_type`/`_meta` change, a nested value that only partially matches)
 * refuses.
 */
export function verifyPrePatchMutations(params: {
  beforePatchJson: string;
  patchedJson: Record<string, unknown>;
  patches: WorkflowPayloadPatch[];
}): MutationVerificationResult {
  let before: Record<string, unknown>;
  try {
    const parsed = JSON.parse(params.beforePatchJson) as unknown;
    if (!isRecord(parsed)) {
      return { ok: false, error: "Workflow JSON could not be parsed for mutation verification.", violations: [] };
    }
    before = parsed;
  } catch {
    return { ok: false, error: "Workflow JSON could not be parsed for mutation verification.", violations: [] };
  }

  const allowed = new Map(
    params.patches.map((p) => [`${p.nodeId}.inputs.${p.inputKey}`, p.nextValue])
  );

  const diffs = diffWorkflowJson(before, params.patchedJson);
  const violations = diffs.filter((d) => {
    if (!allowed.has(d.path)) return true;
    return JSON.stringify(allowed.get(d.path)) !== JSON.stringify(d.after);
  });

  if (violations.length > 0) {
    return { ok: false, error: sanitizedViolationError("Generation refused before queueing", violations), violations };
  }
  return { ok: true };
}

/**
 * Post-upload gate. The only allowed diff, anywhere in the tree, between the
 * payload handed to `prepareComfyPayloadForQueue` and its output is
 * `<nodeId>.inputs.image` on a node present in `uploadedImages`, rewritten
 * to that exact recorded provider filename.
 */
export function verifyPostUploadMutations(params: {
  prePatchedJson: Record<string, unknown>;
  uploadedJson: Record<string, unknown>;
  uploadedImages: { nodeId: string; comfyFilename: string }[];
}): MutationVerificationResult {
  const uploadedByNode = new Map(params.uploadedImages.map((u) => [`${u.nodeId}.inputs.image`, u.comfyFilename]));

  const diffs = diffWorkflowJson(params.prePatchedJson, params.uploadedJson);
  const violations = diffs.filter((d) => {
    if (!uploadedByNode.has(d.path)) return true;
    return d.after !== uploadedByNode.get(d.path);
  });

  if (violations.length > 0) {
    return { ok: false, error: sanitizedViolationError("Generation refused after upload", violations), violations };
  }
  return { ok: true };
}

/**
 * Round 2 (Codex REVISE, P1) — `promptText` must reflect the REAL final
 * queued value(s), never a separately-computed "compiled prompt" string
 * that may have been superseded by an Advanced Payload Override. Reads the
 * actual string sitting at each real `kind: "text"` patch's exact
 * `<nodeId>.inputs.<inputKey>` location in `finalPatchedJson` (the payload
 * actually queued — the override itself when one is active, the canonical
 * payload otherwise):
 *
 * - no override, or an override that leaves every real text input
 *   unchanged: reads back exactly the value `patchWorkflowPayload` wrote —
 *   identical to before this fix for the non-override path;
 * - an override that changes, restores, or otherwise rewrites a real text
 *   input's value: reads that real final value, never a stale one;
 * - an override that only touches a `prompt`-named field that is NOT one of
 *   the workflow's declared `(Input)` text nodes: contributes nothing here
 *   (it was never in `textPatches` to begin with) — `promptText` is
 *   correctly omitted for it, `queuedWorkflow` remains the sole source of
 *   truth for that field;
 * - two or more real text inputs whose final values diverge: omitted rather
 *   than collapsing multiple distinct queued prompts into one misleading
 *   string.
 *
 * Round 3 (Codex REVISE, P1) — EVERY unique `<nodeId>.<inputKey>` path named
 * by `textPatches` must resolve, in `finalPatchedJson`, to a string, and
 * every one of those strings must be identical — otherwise `undefined` is
 * returned, full stop. Previously only the paths that HAPPENED to still
 * resolve to a string were collected, so an Advanced Override that removed
 * one of two real text inputs (deleted the node, deleted the input key, or
 * replaced its value with a number/null/object) silently published the
 * *other* real input's text as if it described the whole queued prompt.
 * There is no longer any such silent partial-credit path: a duplicate path
 * (the same node+inputKey patched twice) is deduplicated first so it can
 * never be mistaken for two independently-diverging inputs.
 */
export function deriveQueuedPromptText(
  textPatches: Pick<WorkflowPayloadPatch, "nodeId" | "inputKey">[],
  finalPatchedJson: Record<string, unknown>
): string | undefined {
  if (textPatches.length === 0) return undefined;

  const uniquePaths = new Map<string, { nodeId: string; inputKey: string }>();
  for (const patch of textPatches) {
    uniquePaths.set(`${patch.nodeId}.${patch.inputKey}`, patch);
  }

  let value: string | undefined;
  for (const { nodeId, inputKey } of uniquePaths.values()) {
    const node = finalPatchedJson[nodeId];
    const inputs = isRecord(node) ? node["inputs"] : undefined;
    if (!isRecord(inputs) || !(inputKey in inputs)) return undefined;

    const actual = inputs[inputKey];
    if (typeof actual !== "string") return undefined;

    if (value === undefined) {
      value = actual;
    } else if (value !== actual) {
      return undefined;
    }
  }

  return value;
}
