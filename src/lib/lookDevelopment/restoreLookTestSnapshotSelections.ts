// ---------------------------------------------------------------------------
// restoreLookTestSnapshotSelections.ts — STYLE.1.G.UI.2 (Retake Round 1)
//
// Pure, client-safe (no DB/network, no "server-only"). Given the source Look
// Test's own job payload snapshot, decides whether the exact reference
// mapping and overrides it recorded can be restored onto a duplicate whose
// references were just cloned from that same source — never a silent guess
// from node/reference ORDER, only an exact, validated reconstruction of the
// `LookWorkflowInputSelections` the CORE contract already accepts.
//
// A restoration is only ever offered when ALL of the following hold:
// - the snapshot parses AND its nested `selections` shape is exactly what
//   `GenerationSnapshot` requires — every field is defensively type-checked
//   before being read; a legacy/corrupt/incomplete object (e.g. one missing
//   `selections` entirely) is refused, never dereferenced;
// - `contextType === "look-test"`;
// - `contextId` matches the source Look Test whose snapshot this is, AND
//   `workflowId` matches the duplicate's (== source's) workflow;
// - every referenced `look-ref-<id>` belongs to the duplicate's current,
//   ordered reference set;
// - every restored node id still exists in the CURRENTLY PARSED workflow
//   with a COMPATIBLE kind (an ordinary image node not part of any Dynamic
//   Batch template chain; a text node; a scalar/select/seed/boolean/string
//   node) — a workflow edited in place since the snapshot was recorded can
//   therefore never produce a false "restored" claim for a node id that no
//   longer means the same thing, or means nothing at all.
//
// Any mismatch is refused with a specific reason instead of a partial or
// best-effort mapping — the caller must then require explicit configuration
// before Run, per the ticket's contract.
// ---------------------------------------------------------------------------

import type { GenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import type { WorkflowInput } from "@/lib/comfy/parseWorkflow";
import type { DynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import { isValidLookWorkflowInputSelections, type LookWorkflowInputSelections } from "./contracts";

export type RestoreLookTestSnapshotSelectionsArgs = {
  snapshot: GenerationSnapshot | null;
  /** The Look Test id the snapshot was recorded against — the SOURCE test, never the not-yet-run duplicate. */
  expectedContextId: number;
  /** The duplicate's (== source's, frozen at duplication time) workflow id. */
  expectedWorkflowId: number;
  /** Reference ids currently attached to the duplicate, in order. */
  availableReferenceIds: number[];
  /** The CURRENTLY parsed workflow's inputs — a restored node id must still exist here with a compatible kind. */
  workflowInputs: WorkflowInput[];
  /** The CURRENTLY detected Dynamic Batch / direct-repeatable info — restoring `dynamicBatchReferenceIds` requires an actual batch node today. */
  batchInfo: DynamicBatchUiInfo;
};

export type RestoreLookTestSnapshotSelectionsResult =
  | { ok: true; selections: LookWorkflowInputSelections; textOverrideEnabledNodeIds: string[] }
  | { ok: false; reason: string };

const LOOK_REF_PREFIX = "look-ref-";
const SCALAR_KINDS = new Set<WorkflowInput["kind"]>(["integer", "float", "boolean", "select", "seed", "string"]);

function parseLookRefId(runtimeId: unknown): number | null {
  if (typeof runtimeId !== "string" || !runtimeId.startsWith(LOOK_REF_PREFIX)) return null;
  const rest = runtimeId.slice(LOOK_REF_PREFIX.length);
  if (!/^\d+$/.test(rest)) return null;
  const id = Number(rest);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Retake Round 2 — every canonical `selections.*` field is REQUIRED. The real
 * `serializeGenerationSnapshot` always populates all four fields (empty
 * object/array when nothing applies, never omitted) — see
 * `runLookTestGeneration.ts`/`runExistingLookTest.ts`. `undefined` therefore
 * means a legacy/corrupt/incomplete snapshot (Codex reproduced
 * `selections: {}` being wrongly accepted as "restored") and must be refused,
 * never treated as "nothing to restore, so trivially valid".
 */
function isRequiredStringToStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([k, v]) => typeof k === "string" && typeof v === "string");
}

function isRequiredStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function restoreLookTestSnapshotSelections(
  args: RestoreLookTestSnapshotSelectionsArgs
): RestoreLookTestSnapshotSelectionsResult {
  const { snapshot, expectedContextId, expectedWorkflowId, availableReferenceIds, workflowInputs, batchInfo } = args;

  if (snapshot === null || typeof snapshot !== "object") {
    return { ok: false, reason: "No prior generation snapshot is available to restore from." };
  }
  if (snapshot.contextType !== "look-test") {
    return { ok: false, reason: "The prior snapshot was not recorded for a Look Test — refusing to guess a mapping." };
  }
  if (snapshot.contextId !== expectedContextId) {
    return { ok: false, reason: "The prior snapshot belongs to a different Look Test — refusing to restore it here." };
  }
  if (snapshot.workflowId !== expectedWorkflowId) {
    return { ok: false, reason: "The prior snapshot was recorded against a different workflow — refusing to restore it here." };
  }

  // Defensive shape check — a legacy/corrupt row can carry only a subset of
  // top-level fields (Codex reproduced one with just contextType/contextId/
  // workflowId). Never destructure `snapshot.selections.*` before this.
  const rawSelections: unknown = (snapshot as { selections?: unknown }).selections;
  if (typeof rawSelections !== "object" || rawSelections === null || Array.isArray(rawSelections)) {
    return { ok: false, reason: "The prior snapshot is missing its selections data — it may be legacy or corrupted." };
  }
  const sel = rawSelections as Record<string, unknown>;
  if (
    !isRequiredStringToStringRecord(sel.selectedImageByNodeId) ||
    !isRequiredStringToStringRecord(sel.scalarOverrideByNodeId) ||
    !isRequiredStringToStringRecord(sel.textOverrideByNodeId) ||
    !isRequiredStringArray(sel.batchSelectedImageIds)
  ) {
    return { ok: false, reason: "The prior snapshot's selections data is incomplete or has an unexpected shape — it may be legacy or corrupted." };
  }

  const availableSet = new Set(availableReferenceIds);
  const foreignIds: string[] = [];

  const templateChainNodeIds = new Set(batchInfo.kind === "ready" ? batchInfo.templateChainNodeIds : []);
  const currentImageNodeIds = new Set(workflowInputs.filter((i) => i.kind === "image" && !templateChainNodeIds.has(i.nodeId)).map((i) => i.nodeId));
  const currentTextNodeIds = new Set(workflowInputs.filter((i) => i.kind === "text").map((i) => i.nodeId));
  const currentScalarNodeIds = new Set(workflowInputs.filter((i) => SCALAR_KINDS.has(i.kind)).map((i) => i.nodeId));

  const obsoleteNodeIds: string[] = [];

  const imageAssignments: { nodeId: string; referenceId: number }[] = [];
  for (const [nodeId, runtimeId] of Object.entries((sel.selectedImageByNodeId as Record<string, string> | undefined) ?? {})) {
    if (!currentImageNodeIds.has(nodeId)) {
      obsoleteNodeIds.push(nodeId);
      continue;
    }
    const refId = parseLookRefId(runtimeId);
    if (refId === null || !availableSet.has(refId)) {
      foreignIds.push(runtimeId);
      continue;
    }
    imageAssignments.push({ nodeId, referenceId: refId });
  }

  const dynamicBatchReferenceIds: number[] = [];
  const batchIdsInSnapshot = (sel.batchSelectedImageIds as string[] | undefined) ?? [];
  if (batchIdsInSnapshot.length > 0 && batchInfo.kind !== "ready") {
    return { ok: false, reason: "The prior snapshot used a Dynamic Batch mapping, but this workflow no longer has one — refusing to restore it." };
  }
  for (const runtimeId of batchIdsInSnapshot) {
    const refId = parseLookRefId(runtimeId);
    if (refId === null || !availableSet.has(refId)) {
      foreignIds.push(runtimeId);
      continue;
    }
    dynamicBatchReferenceIds.push(refId);
  }

  const textOverrideByNodeId: Record<string, string> = {};
  for (const [nodeId, text] of Object.entries((sel.textOverrideByNodeId as Record<string, string> | undefined) ?? {})) {
    if (!currentTextNodeIds.has(nodeId)) {
      obsoleteNodeIds.push(nodeId);
      continue;
    }
    textOverrideByNodeId[nodeId] = text;
  }

  const scalarOverrideByNodeId: Record<string, string> = {};
  for (const [nodeId, val] of Object.entries((sel.scalarOverrideByNodeId as Record<string, string> | undefined) ?? {})) {
    if (!currentScalarNodeIds.has(nodeId)) {
      obsoleteNodeIds.push(nodeId);
      continue;
    }
    scalarOverrideByNodeId[nodeId] = val;
  }

  if (obsoleteNodeIds.length > 0) {
    return {
      ok: false,
      reason: `The prior snapshot references node id(s) that no longer exist (or no longer have a compatible role) in the current workflow: ${obsoleteNodeIds.join(", ")}. The workflow may have been edited since — refusing a partial restoration.`,
    };
  }
  if (foreignIds.length > 0) {
    return {
      ok: false,
      reason: `The prior snapshot references reference id(s) that are not part of this duplicate's current references: ${foreignIds.join(", ")}.`,
    };
  }

  const selections: LookWorkflowInputSelections = {
    imageAssignments: imageAssignments.length > 0 ? imageAssignments : undefined,
    dynamicBatchReferenceIds: dynamicBatchReferenceIds.length > 0 ? dynamicBatchReferenceIds : undefined,
    textOverrideByNodeId: Object.keys(textOverrideByNodeId).length > 0 ? textOverrideByNodeId : undefined,
    scalarOverrideByNodeId: Object.keys(scalarOverrideByNodeId).length > 0 ? scalarOverrideByNodeId : undefined,
  };

  if (!isValidLookWorkflowInputSelections(selections)) {
    return { ok: false, reason: "The prior snapshot's mapping is contradictory (e.g. a reference reachable through two paths) — refusing to restore it." };
  }

  return { ok: true, selections, textOverrideEnabledNodeIds: Object.keys(textOverrideByNodeId) };
}
