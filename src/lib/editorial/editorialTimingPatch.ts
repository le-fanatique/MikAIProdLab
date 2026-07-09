// ---------------------------------------------------------------------------
// mikai-editorial-timing-patch-v1 — shape validation + apply planning
// (NLE.PLUGIN.SYNC)
//
// Pure, DB-agnostic. Two responsibilities:
//   1. validateEditorialTimingPatchShape — structural validation of an
//      arbitrary JSON payload against the patch contract (no DB access).
//   2. planEditorialTimingPatch — given already-loaded sequence_editorial_
//      items rows and a shape-valid patch, decides whether the patch is
//      safe to apply and what it would change. Never touches the DB
//      itself — the caller (the API route) owns loading rows and, on
//      apply, running the actual transaction.
//
// V1 scope, deliberately narrow: only startSeconds may change.
// durationSeconds in the patch is validated against the item's current
// effective duration (getEditorialItemEffectiveDuration) and the whole
// patch is rejected if any item's duration disagrees beyond an epsilon —
// duration/trim edits are out of scope until a future ticket.
// orderIndex is never touched or reconciled — reorder/intercalation
// remains a separate, future concern (see docs/NLE_PLUGIN_A_AUDIT.md).
// ---------------------------------------------------------------------------

import { getEditorialItemEffectiveDuration } from "./editorialDocument";

export const EDITORIAL_TIMING_PATCH_SCHEMA_VERSION = "mikai-editorial-timing-patch-v1";
const EXPECTED_SOURCE_SCHEMA_VERSION = "mikai-editorial-export-v1";

/** Two intervals separated by less than this are treated as touching, not overlapping — matches moveEditorialItem. */
export const TIMING_EPSILON_SECONDS = 0.05;

export type MikAIEditorialTimingPatchV1 = {
  schemaVersion: "mikai-editorial-timing-patch-v1";
  sourceSchemaVersion: "mikai-editorial-export-v1";
  projectId: number;
  sequenceId: number;
  createdAt: string;
  items: Array<{
    id: number;
    shotId: number;
    startSeconds: number;
    durationSeconds: number;
  }>;
};

export type PatchShapeError = { itemId?: number; message: string };

export type PatchShapeValidationResult =
  | { ok: true; patch: MikAIEditorialTimingPatchV1 }
  | { ok: false; errors: PatchShapeError[] };

/**
 * Structural validation only — no DB access, no ownership check, no
 * duration/overlap logic. Rejects anything that isn't shaped like a
 * mikai-editorial-timing-patch-v1 document.
 */
export function validateEditorialTimingPatchShape(input: unknown): PatchShapeValidationResult {
  const errors: PatchShapeError[] = [];

  if (!input || typeof input !== "object") {
    return { ok: false, errors: [{ message: "Patch must be a JSON object." }] };
  }
  const obj = input as Record<string, unknown>;

  if (obj.schemaVersion !== EDITORIAL_TIMING_PATCH_SCHEMA_VERSION) {
    errors.push({
      message: `Unexpected schemaVersion "${String(obj.schemaVersion)}" — expected "${EDITORIAL_TIMING_PATCH_SCHEMA_VERSION}".`,
    });
  }
  if (obj.sourceSchemaVersion !== EXPECTED_SOURCE_SCHEMA_VERSION) {
    errors.push({
      message: `Unexpected sourceSchemaVersion "${String(obj.sourceSchemaVersion)}" — expected "${EXPECTED_SOURCE_SCHEMA_VERSION}".`,
    });
  }
  if (typeof obj.projectId !== "number" || !Number.isFinite(obj.projectId)) {
    errors.push({ message: "projectId must be a number." });
  }
  if (typeof obj.sequenceId !== "number" || !Number.isFinite(obj.sequenceId)) {
    errors.push({ message: "sequenceId must be a number." });
  }
  if (!Array.isArray(obj.items)) {
    errors.push({ message: "items must be an array." });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const rawItems = obj.items as unknown[];
  const items: MikAIEditorialTimingPatchV1["items"] = [];

  rawItems.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      errors.push({ message: `items[${index}] must be an object.` });
      return;
    }
    const it = raw as Record<string, unknown>;
    const itemId = typeof it.id === "number" ? it.id : undefined;

    if (typeof it.id !== "number" || !Number.isFinite(it.id)) {
      errors.push({ itemId, message: `items[${index}].id must be a number.` });
      return;
    }
    if (typeof it.shotId !== "number" || !Number.isFinite(it.shotId)) {
      errors.push({ itemId, message: "shotId must be a number." });
      return;
    }
    if (typeof it.startSeconds !== "number" || !Number.isFinite(it.startSeconds) || it.startSeconds < 0) {
      errors.push({ itemId, message: "startSeconds must be a finite number >= 0." });
      return;
    }
    if (typeof it.durationSeconds !== "number" || !Number.isFinite(it.durationSeconds) || it.durationSeconds <= 0) {
      errors.push({ itemId, message: "durationSeconds must be a finite number > 0." });
      return;
    }

    items.push({
      id: it.id,
      shotId: it.shotId,
      startSeconds: it.startSeconds,
      durationSeconds: it.durationSeconds,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    patch: {
      schemaVersion: EDITORIAL_TIMING_PATCH_SCHEMA_VERSION,
      sourceSchemaVersion: EXPECTED_SOURCE_SCHEMA_VERSION,
      projectId: obj.projectId as number,
      sequenceId: obj.sequenceId as number,
      createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString(),
      items,
    },
  };
}

/** Minimal shape of a sequence_editorial_items row needed for planning — decoupled from Drizzle's inferred type. */
export type ExistingEditorialItemForPlan = {
  id: number;
  type: "shot" | "gap";
  shotId: number | null;
  trackIndex: number;
  startSeconds: number | null;
  durationSeconds: number | null;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
};

export type EditorialTimingPatchPlanItem = {
  id: number;
  shotId: number;
  currentStartSeconds: number;
  nextStartSeconds: number;
  currentDurationSeconds: number;
  patchDurationSeconds: number;
  willUpdateStartSeconds: boolean;
};

export type EditorialTimingPatchPlanResult = {
  ok: boolean;
  errors: PatchShapeError[];
  items: EditorialTimingPatchPlanItem[];
};

function effectiveDurationOf(row: ExistingEditorialItemForPlan): number {
  return getEditorialItemEffectiveDuration({
    type: row.type,
    durationSeconds: row.durationSeconds,
    trimInSeconds: row.trimInSeconds,
    trimOutSeconds: row.trimOutSeconds,
  } as unknown as Parameters<typeof getEditorialItemEffectiveDuration>[0]);
}

/**
 * Decides whether a shape-valid patch is safe to apply against the
 * sequence's current DB state, and produces a plan of what would change.
 * Pure — takes already-loaded rows, never queries the DB itself.
 *
 * V1 policy (deliberate, see module doc):
 *  - only startSeconds may change; durationSeconds must match the item's
 *    current effective duration within TIMING_EPSILON_SECONDS, or the
 *    whole patch is rejected;
 *  - no non-pass-through / immediate-neighbor clamp (unlike
 *    moveEditorialItem) — any startSeconds is accepted as long as the
 *    resulting arrangement has no shot-to-shot overlap on its track;
 *  - orderIndex is never read for validation or written on apply.
 */
export function planEditorialTimingPatch(args: {
  projectId: number;
  sequenceId: number;
  patch: MikAIEditorialTimingPatchV1;
  existingItems: ExistingEditorialItemForPlan[];
}): EditorialTimingPatchPlanResult {
  const { projectId, sequenceId, patch, existingItems } = args;
  const errors: PatchShapeError[] = [];

  if (patch.projectId !== projectId || patch.sequenceId !== sequenceId) {
    return {
      ok: false,
      errors: [
        {
          message: `Patch targets project ${patch.projectId}/sequence ${patch.sequenceId}, but this endpoint is for project ${projectId}/sequence ${sequenceId}.`,
        },
      ],
      items: [],
    };
  }

  const existingById = new Map(existingItems.map((row) => [row.id, row]));
  const planItems: EditorialTimingPatchPlanItem[] = [];

  // Track-scoped candidate positions after applying the patch — used for
  // the no-overlap check below. Only shot items with a known (non-null)
  // current startSeconds participate; unpositioned items are never
  // obstacles, matching moveEditorialItem's existing convention.
  const candidatesByTrack = new Map<
    number,
    Array<{ id: number; start: number; duration: number }>
  >();

  for (const row of existingItems) {
    if (row.type !== "shot" || row.startSeconds == null) continue;
    const patched = patch.items.find((p) => p.id === row.id);
    const start = patched ? patched.startSeconds : row.startSeconds;
    const duration = effectiveDurationOf(row);
    const bucket = candidatesByTrack.get(row.trackIndex);
    const entry = { id: row.id, start, duration };
    if (bucket) bucket.push(entry);
    else candidatesByTrack.set(row.trackIndex, [entry]);
  }

  for (const patchItem of patch.items) {
    const existing = existingById.get(patchItem.id);

    if (!existing) {
      errors.push({ itemId: patchItem.id, message: "Item not found in this sequence." });
      continue;
    }
    if (existing.type !== "shot") {
      errors.push({ itemId: patchItem.id, message: "Item is not a shot-backed item." });
      continue;
    }
    if (existing.shotId !== patchItem.shotId) {
      errors.push({
        itemId: patchItem.id,
        message: `shotId mismatch — item belongs to shot ${existing.shotId}, patch specifies ${patchItem.shotId}.`,
      });
      continue;
    }

    const currentDuration = effectiveDurationOf(existing);
    if (Math.abs(patchItem.durationSeconds - currentDuration) > TIMING_EPSILON_SECONDS) {
      errors.push({
        itemId: patchItem.id,
        message: "Duration changes are not supported by this importer yet.",
      });
      continue;
    }

    const currentStart = existing.startSeconds ?? 0;
    planItems.push({
      id: existing.id,
      shotId: existing.shotId!,
      currentStartSeconds: currentStart,
      nextStartSeconds: patchItem.startSeconds,
      currentDurationSeconds: currentDuration,
      patchDurationSeconds: patchItem.durationSeconds,
      willUpdateStartSeconds: Math.abs(patchItem.startSeconds - currentStart) > TIMING_EPSILON_SECONDS,
    });
  }

  // No-overlap check per track, semi-open intervals, touching edges OK —
  // only runs if every patch item passed the checks above (an item-level
  // failure already dooms the whole patch, so overlap noise on top of
  // that would just be confusing).
  if (errors.length === 0) {
    for (const [trackIndex, items] of candidatesByTrack) {
      const sorted = [...items].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevEnd = prev.start + prev.duration;
        if (curr.start < prevEnd - TIMING_EPSILON_SECONDS) {
          errors.push({
            message: `Overlap detected on track ${trackIndex} between item ${prev.id} and item ${curr.id}.`,
          });
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    items: errors.length === 0 ? planItems : [],
  };
}
