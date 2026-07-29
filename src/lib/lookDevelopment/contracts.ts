// ---------------------------------------------------------------------------
// contracts.ts — STYLE.1.G.CORE.1
//
// Pure, DB/network-free types, enums and bounds shared by every module in
// src/lib/lookDevelopment/ and src/actions/lookDevelopment.ts.
// ---------------------------------------------------------------------------

export const LOOK_TEST_SOURCES = ["from-story", "neutral-benchmark", "custom"] as const;
export type LookTestSource = (typeof LOOK_TEST_SOURCES)[number];
export function isLookTestSource(value: unknown): value is LookTestSource {
  return typeof value === "string" && (LOOK_TEST_SOURCES as readonly string[]).includes(value);
}

export const LOOK_MODES = ["image", "video"] as const;
export type LookMode = (typeof LOOK_MODES)[number];
export function isLookMode(value: unknown): value is LookMode {
  return typeof value === "string" && (LOOK_MODES as readonly string[]).includes(value);
}

export const LOOK_STYLE_SOURCE_KINDS = ["working-draft", "published-version"] as const;
export type LookStyleSourceKind = (typeof LOOK_STYLE_SOURCE_KINDS)[number];
export function isLookStyleSourceKind(value: unknown): value is LookStyleSourceKind {
  return typeof value === "string" && (LOOK_STYLE_SOURCE_KINDS as readonly string[]).includes(value);
}

export const LOOK_RESULT_STATUSES = ["candidate", "rejected", "look-target"] as const;
export type LookResultStatus = (typeof LOOK_RESULT_STATUSES)[number];
export function isLookResultStatus(value: unknown): value is LookResultStatus {
  return typeof value === "string" && (LOOK_RESULT_STATUSES as readonly string[]).includes(value);
}

export const MAX_SUBJECT_LENGTH = 500;
export const MAX_ACTION_LENGTH = 1_000;
export const MAX_NOTES_LENGTH = 2_000;
export const MAX_REFERENCES_PER_TEST = 12;

const MAX_ID = 2_147_483_647;

export function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_ID;
}

export function isBoundedNonEmptyText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function isBoundedOptionalText(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

/**
 * Discriminated Style source a caller must supply explicitly when creating
 * a Look Test — never an implicit active pointer. Exactly one branch's
 * fields are populated.
 */
export type LookStyleSourceRequest =
  | { kind: "working-draft"; expectedRevision: number }
  | { kind: "published-version"; versionId: number };

export function isValidLookStyleSourceRequest(value: unknown): value is LookStyleSourceRequest {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.kind === "working-draft") {
    return typeof obj.expectedRevision === "number" && Number.isInteger(obj.expectedRevision) && obj.expectedRevision >= 1;
  }
  if (obj.kind === "published-version") {
    return isValidId(obj.versionId);
  }
  return false;
}

// ---------------------------------------------------------------------------
// STYLE.1.G.CORE.1 Round 3 — explicit workflow-input contract.
//
// Replaces the implicit "zip references onto image nodes in array order"
// behavior. A caller (today: the two Look runners' own defaulting; tomorrow:
// the future Bench UI) must state EXACTLY which node receives which
// reference, and any override it wants — every provided node id is
// validated against the real parsed workflow before any mutation, and any
// selected reference that cannot be mapped anywhere causes a refusal, never
// a silent drop.
// ---------------------------------------------------------------------------

export const MAX_TEXT_OVERRIDE_LENGTH = 20_000;
export const MAX_SCALAR_OVERRIDE_LENGTH = 500;

/** One ordinary (non-Dynamic-Batch) image input node explicitly assigned a resolved reference. */
export type LookImageAssignment = { nodeId: string; referenceId: number };

export type LookWorkflowInputSelections = {
  /** Ordinary image input nodes -> reference id. Never used for Dynamic Batch / direct-repeatable template-chain nodes. */
  imageAssignments?: LookImageAssignment[];
  /** Ordered reference ids to clone into a Dynamic Batch / direct-repeatable expansion, in clone order. Only meaningful when the workflow has such a node. */
  dynamicBatchReferenceIds?: number[];
  /** Text input node id -> literal override text, replacing the compiled Look prompt for that specific node only. */
  textOverrideByNodeId?: Record<string, string>;
  /** Scalar/select/seed input node id -> literal override value (stringified — coercion/validation happens in patchWorkflowPayload, the canonical patcher). */
  scalarOverrideByNodeId?: Record<string, string>;
};

function isPlainStringRecord(value: unknown, maxValueLength: number): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0 || k.length > 200) return false;
    if (typeof v !== "string" || v.length > maxValueLength) return false;
  }
  return true;
}

const LOOK_WORKFLOW_INPUT_SELECTIONS_KEYS = new Set([
  "imageAssignments",
  "dynamicBatchReferenceIds",
  "textOverrideByNodeId",
  "scalarOverrideByNodeId",
]);
const LOOK_IMAGE_ASSIGNMENT_KEYS = new Set(["nodeId", "referenceId"]);

function hasOnlyKeys(obj: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(obj).every((k) => allowed.has(k));
}

/**
 * STYLE.1.G.CORE.1 Round 4 — every object level rejects unknown keys
 * outright (Codex reproduced `{ bogus: true }` and a `bogus` field inside
 * an `imageAssignments` entry both being silently accepted). A caller
 * (today the two Look runners' own defaulting; tomorrow the future Bench
 * UI) must match this contract exactly — no forward-compatible passthrough
 * of unrecognized fields.
 *
 * Also refuses two contradictions the resolver itself used to allow
 * through: the same reference id assigned to more than one ordinary image
 * node, and the same reference id present in BOTH `imageAssignments` and
 * `dynamicBatchReferenceIds` (two different, incompatible mapping paths
 * for one reference). Every selected reference must be reachable through
 * EXACTLY one path.
 */
export function isValidLookWorkflowInputSelections(value: unknown): value is LookWorkflowInputSelections {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (!hasOnlyKeys(obj, LOOK_WORKFLOW_INPUT_SELECTIONS_KEYS)) return false;

  const imageAssignedReferenceIds: number[] = [];

  if (obj.imageAssignments !== undefined) {
    if (!Array.isArray(obj.imageAssignments) || obj.imageAssignments.length > MAX_REFERENCES_PER_TEST) return false;
    for (const entry of obj.imageAssignments) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
      const e = entry as Record<string, unknown>;
      if (!hasOnlyKeys(e, LOOK_IMAGE_ASSIGNMENT_KEYS)) return false;
      if (typeof e.nodeId !== "string" || e.nodeId.length === 0 || e.nodeId.length > 200) return false;
      if (!isValidId(e.referenceId)) return false;
      imageAssignedReferenceIds.push(e.referenceId);
    }
    // A reference assigned to more than one ordinary image node is a
    // contradiction, not a valid fan-out — refuse it explicitly.
    if (new Set(imageAssignedReferenceIds).size !== imageAssignedReferenceIds.length) return false;
  }

  const dynamicBatchIds: number[] = [];
  if (obj.dynamicBatchReferenceIds !== undefined) {
    if (!Array.isArray(obj.dynamicBatchReferenceIds) || obj.dynamicBatchReferenceIds.length > MAX_REFERENCES_PER_TEST) return false;
    for (const id of obj.dynamicBatchReferenceIds) {
      if (!isValidId(id)) return false;
      dynamicBatchIds.push(id);
    }
  }

  // A reference present in BOTH mapping paths is a contradiction — every
  // reference must be reachable through exactly one path.
  if (imageAssignedReferenceIds.some((id) => dynamicBatchIds.includes(id))) return false;

  if (obj.textOverrideByNodeId !== undefined && !isPlainStringRecord(obj.textOverrideByNodeId, MAX_TEXT_OVERRIDE_LENGTH)) return false;
  if (obj.scalarOverrideByNodeId !== undefined && !isPlainStringRecord(obj.scalarOverrideByNodeId, MAX_SCALAR_OVERRIDE_LENGTH)) return false;

  return true;
}
