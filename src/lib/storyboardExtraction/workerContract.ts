// ---------------------------------------------------------------------------
// storyboardExtraction/workerContract.ts — SEQGEN.STORYBOARD.EXTRACT.1
//
// Pure parsing/validation of scripts/opencv_storyboard_extract.py's stdout
// JSON contract. No subprocess invocation, no filesystem/DB access — fully
// unit-testable in isolation. Every function either returns a typed value or
// throws a WorkerContractError with a message safe to surface to the caller;
// nothing here ever trusts the worker's shape without checking it field by
// field (a compromised/buggy worker must never produce a value that silently
// passes through as valid).
// ---------------------------------------------------------------------------

export class WorkerContractError extends Error {}

export type DetectedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  detectionMode: "border";
  illustrationHeight: number | null;
  textSeparationDetected: boolean;
};

export type DetectResult = {
  sourceWidth: number;
  sourceHeight: number;
  regions: DetectedRegion[];
};

export type CropResultFile = {
  index: number;
  filename: string;
};

export type CropResult = {
  files: CropResultFile[];
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonNegativeInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 0;
}

/** Parses raw worker stdout as JSON, rejecting anything that isn't a single well-formed object with an "ok" boolean — the one invariant every worker response (detect, crop, or error) must satisfy. */
export function parseWorkerStdout(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WorkerContractError("Worker output was not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new WorkerContractError("Worker output was not a JSON object.");
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.ok !== "boolean") {
    throw new WorkerContractError('Worker output is missing a boolean "ok" field.');
  }
  return obj;
}

/** Extracts the worker's own error message when `ok: false`, falling back to a generic message when the worker didn't provide one (still never silently succeeds). */
export function extractWorkerError(obj: Record<string, unknown>): string {
  if (obj.ok !== false) {
    throw new WorkerContractError("extractWorkerError called on a successful worker response.");
  }
  const err = obj.error;
  return typeof err === "string" && err.trim() ? err : "Worker reported an unspecified error.";
}

function validateRegion(raw: unknown, index: number): DetectedRegion {
  if (typeof raw !== "object" || raw === null) {
    throw new WorkerContractError(`Region ${index} is not an object.`);
  }
  const r = raw as Record<string, unknown>;
  if (!isNonNegativeInt(r.x) || !isNonNegativeInt(r.y)) {
    throw new WorkerContractError(`Region ${index} has invalid x/y.`);
  }
  if (!isNonNegativeInt(r.width) || r.width <= 0 || !isNonNegativeInt(r.height) || r.height <= 0) {
    throw new WorkerContractError(`Region ${index} has invalid width/height.`);
  }
  if (!isFiniteNumber(r.confidence) || r.confidence < 0 || r.confidence > 1) {
    throw new WorkerContractError(`Region ${index} has an invalid confidence.`);
  }
  if (r.detectionMode !== "border") {
    throw new WorkerContractError(`Region ${index} has an unsupported detectionMode.`);
  }
  if (r.illustrationHeight !== null && !isNonNegativeInt(r.illustrationHeight)) {
    throw new WorkerContractError(`Region ${index} has an invalid illustrationHeight.`);
  }
  if (typeof r.textSeparationDetected !== "boolean") {
    throw new WorkerContractError(`Region ${index} has an invalid textSeparationDetected.`);
  }
  return {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    confidence: r.confidence,
    detectionMode: "border",
    illustrationHeight: r.illustrationHeight as number | null,
    textSeparationDetected: r.textSeparationDetected,
  };
}

/**
 * Validates a successful `detect` response. Regions are trusted to already
 * be in reading order as produced by the worker, but callers that need a
 * guarantee (e.g. before persisting orderIndex) should still sort via
 * `sortRegionsReadingOrder` below rather than assume it blindly.
 */
export function validateDetectResult(obj: Record<string, unknown>): DetectResult {
  if (obj.ok !== true) {
    throw new WorkerContractError("validateDetectResult called on a failed worker response.");
  }
  if (!isNonNegativeInt(obj.sourceWidth) || obj.sourceWidth <= 0) {
    throw new WorkerContractError("Worker output has an invalid sourceWidth.");
  }
  if (!isNonNegativeInt(obj.sourceHeight) || obj.sourceHeight <= 0) {
    throw new WorkerContractError("Worker output has an invalid sourceHeight.");
  }
  if (!Array.isArray(obj.regions)) {
    throw new WorkerContractError("Worker output is missing a regions array.");
  }
  const regions = obj.regions.map((r, i) => validateRegion(r, i));
  for (const r of regions) {
    if (r.x + r.width > obj.sourceWidth || r.y + r.height > obj.sourceHeight) {
      throw new WorkerContractError("Worker returned a region outside the source image bounds.");
    }
  }
  return { sourceWidth: obj.sourceWidth, sourceHeight: obj.sourceHeight, regions };
}

/** Sorts regions in reading order: top-to-bottom, then left-to-right within a row. Pure, deterministic, safe to reapply at any point (detect output, after manual edits, before persisting orderIndex). */
export function sortRegionsReadingOrder<T extends { x: number; y: number }>(regions: T[]): T[] {
  return [...regions].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
}

/** Validates a successful `crop` response. */
export function validateCropResult(obj: Record<string, unknown>): CropResult {
  if (obj.ok !== true) {
    throw new WorkerContractError("validateCropResult called on a failed worker response.");
  }
  if (!Array.isArray(obj.files)) {
    throw new WorkerContractError("Worker output is missing a files array.");
  }
  const files = obj.files.map((f, i): CropResultFile => {
    if (typeof f !== "object" || f === null) {
      throw new WorkerContractError(`Crop file ${i} is not an object.`);
    }
    const entry = f as Record<string, unknown>;
    if (!isNonNegativeInt(entry.index)) {
      throw new WorkerContractError(`Crop file ${i} has an invalid index.`);
    }
    if (typeof entry.filename !== "string" || !/^region-\d+\.png$/.test(entry.filename)) {
      throw new WorkerContractError(`Crop file ${i} has an invalid filename.`);
    }
    return { index: entry.index, filename: entry.filename };
  });
  return { files };
}

export type MappableRegion = { orderIndex: number };

/** Proposes a Shot for each region purely by reading-order position (region i → shots[i]), never fabricating a mapping when counts differ — regions past the last Shot, and Shots past the last region, are simply left unmapped (null / not covered), matching the ticket's explicit "aucun rattachement silencieux". */
export function proposeShotMapping<R extends MappableRegion>(
  regions: R[],
  shotIdsInOrder: number[]
): Map<number, number | null> {
  const byOrder = [...regions].sort((a, b) => a.orderIndex - b.orderIndex);
  const map = new Map<number, number | null>();
  byOrder.forEach((region, i) => {
    map.set(region.orderIndex, shotIdsInOrder[i] ?? null);
  });
  return map;
}
