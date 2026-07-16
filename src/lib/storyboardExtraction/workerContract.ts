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

/** "grid-fallback" — a region proposed from an equal-cell grid sized to the expected Shot count, used only when primary border/gutter detection was ambiguous (0 or 1 region found). Always low confidence; never silently extracted without explicit reassignment (see startStoryboardExtraction). */
export type DetectionMode = "border" | "grid-fallback";

export type DetectedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  detectionMode: DetectionMode;
  illustrationHeight: number | null;
  textSeparationDetected: boolean;
};

/** FIX6 — structured diagnostics the worker always emits alongside `regions`. Never derived by parsing free-text logs: every field here comes straight from the worker's own typed JSON contract. */
export type DetectionDiagnostics = {
  primaryEngine: DetectionEngine;
  detectedCount: number;
  confidence: number;
  threshold: number | null;
  fallbackTriggered: boolean;
  fallbackReason: string | null;
  finalEngine: DetectionEngine | "grid-fallback";
};

export type DetectResult = {
  sourceWidth: number;
  sourceHeight: number;
  regions: DetectedRegion[];
  diagnostics: DetectionDiagnostics;
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
  if (r.detectionMode !== "border" && r.detectionMode !== "grid-fallback") {
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
    detectionMode: r.detectionMode,
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
  const diagnostics = validateDiagnostics(obj.diagnostics);
  return { sourceWidth: obj.sourceWidth, sourceHeight: obj.sourceHeight, regions, diagnostics };
}

/** Validates the FIX6 structured diagnostics object — required on every successful `detect` response. */
function validateDiagnostics(raw: unknown): DetectionDiagnostics {
  if (typeof raw !== "object" || raw === null) {
    throw new WorkerContractError("Worker output is missing a diagnostics object.");
  }
  const d = raw as Record<string, unknown>;
  if (typeof d.primaryEngine !== "string" || !isDetectionEngine(d.primaryEngine)) {
    throw new WorkerContractError("Diagnostics has an invalid primaryEngine.");
  }
  if (!isNonNegativeInt(d.detectedCount)) {
    throw new WorkerContractError("Diagnostics has an invalid detectedCount.");
  }
  if (!isFiniteNumber(d.confidence) || d.confidence < 0 || d.confidence > 1) {
    throw new WorkerContractError("Diagnostics has an invalid confidence.");
  }
  if (d.threshold !== null && (!isFiniteNumber(d.threshold) || d.threshold < 0 || d.threshold > 1)) {
    throw new WorkerContractError("Diagnostics has an invalid threshold.");
  }
  if (typeof d.fallbackTriggered !== "boolean") {
    throw new WorkerContractError("Diagnostics has an invalid fallbackTriggered.");
  }
  if (d.fallbackReason !== null && typeof d.fallbackReason !== "string") {
    throw new WorkerContractError("Diagnostics has an invalid fallbackReason.");
  }
  if (typeof d.finalEngine !== "string" || !(isDetectionEngine(d.finalEngine) || d.finalEngine === "grid-fallback")) {
    throw new WorkerContractError("Diagnostics has an invalid finalEngine.");
  }
  return {
    primaryEngine: d.primaryEngine,
    detectedCount: d.detectedCount,
    confidence: d.confidence,
    threshold: d.threshold as number | null,
    fallbackTriggered: d.fallbackTriggered,
    fallbackReason: d.fallbackReason as string | null,
    finalEngine: d.finalEngine as DetectionEngine | "grid-fallback",
  };
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

// ---------------------------------------------------------------------------
// FIX3 — Detection parameters (mode/columns/rows/sensitivity). Pure bounds
// validation shared between the server action (raw form strings) and any
// future caller; mirrors the worker's own bounds exactly so a rejected
// value here is refused before ever spawning the subprocess.
// ---------------------------------------------------------------------------

// FIX6 — `DetectionEngine` replaces the old two-valued "auto"/"grid" mode:
// `otsu` and `canny` are two genuinely distinct PRIMARY detection algorithms
// (never both called "auto"); `grid` is explicit geometric slicing and is
// never labeled "Auto" in the UI. Both `otsu` and `canny` can still fall
// back to the same grid proposal the old "auto" mode used (see
// DetectionDiagnostics.fallbackTriggered/finalEngine).
export type DetectionEngine = "otsu" | "canny" | "grid";
export const DETECTION_ENGINES: readonly DetectionEngine[] = ["otsu", "canny", "grid"];

export type Sensitivity = "low" | "medium" | "high";
export const SENSITIVITY_VALUES: readonly Sensitivity[] = ["low", "medium", "high"];

export const MIN_GRID_DIMENSION = 1;
export const MAX_GRID_DIMENSION = 12;

export function isDetectionEngine(value: string): value is DetectionEngine {
  return (DETECTION_ENGINES as readonly string[]).includes(value);
}

export function isSensitivity(value: string): value is Sensitivity {
  return (SENSITIVITY_VALUES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// FIX6 — Advanced detection parameters. Pure bounds validation, mirroring
// scripts/opencv_storyboard_extract.py's PARAM_BOUNDS exactly (see
// resolve_params() there) so a value rejected here would also be rejected by
// the worker — the server is still the trust boundary, the worker's own
// check is defense in depth for anyone invoking it directly.
// ---------------------------------------------------------------------------

export type AdvancedDetectionParams = {
  minCellAreaFraction?: number;
  gutterDensityThreshold?: number;
  colorDistanceThreshold?: number;
  minGutterWidthPx?: number;
  minGutterFraction?: number;
  gutterMergeGapPx?: number;
  cannySigma?: number;
  houghMinLineFraction?: number;
  houghVoteThreshold?: number;
  houghMaxLineGap?: number;
  maxHoughLines?: number;
  captionUniformityThreshold?: number;
  captionMinRunPx?: number;
  minIllustrationFraction?: number;
};

/** [min, max] per field, and the exact `--flag-name` the worker expects. */
export const ADVANCED_PARAM_SPECS: {
  key: keyof AdvancedDetectionParams;
  flag: string;
  min: number;
  max: number;
  integer: boolean;
  /** Which primary engine(s) this parameter actually affects — used only to gray out/hide irrelevant controls in the UI; the server accepts any of them regardless of the selected engine (a value simply goes unused). */
  engines: readonly DetectionEngine[];
}[] = [
  { key: "minCellAreaFraction", flag: "--min-cell-area-fraction", min: 0, max: 1, integer: false, engines: ["otsu", "canny"] },
  { key: "gutterDensityThreshold", flag: "--gutter-density-threshold", min: 0, max: 1, integer: false, engines: ["otsu", "canny"] },
  { key: "colorDistanceThreshold", flag: "--color-distance-threshold", min: 0, max: 255, integer: false, engines: ["canny"] },
  { key: "minGutterWidthPx", flag: "--min-gutter-width-px", min: 0, max: 2000, integer: true, engines: ["otsu", "canny"] },
  { key: "minGutterFraction", flag: "--min-gutter-fraction", min: 0, max: 1, integer: false, engines: ["otsu", "canny"] },
  { key: "gutterMergeGapPx", flag: "--gutter-merge-gap-px", min: 0, max: 500, integer: true, engines: ["otsu", "canny"] },
  { key: "cannySigma", flag: "--canny-sigma", min: 0, max: 2, integer: false, engines: ["canny"] },
  { key: "houghMinLineFraction", flag: "--hough-min-line-fraction", min: 0, max: 1, integer: false, engines: ["canny"] },
  { key: "houghVoteThreshold", flag: "--hough-vote-threshold", min: 1, max: 5000, integer: true, engines: ["canny"] },
  { key: "houghMaxLineGap", flag: "--hough-max-line-gap", min: 0, max: 2000, integer: true, engines: ["canny"] },
  { key: "maxHoughLines", flag: "--max-hough-lines", min: 1, max: 2000, integer: true, engines: ["canny"] },
  { key: "captionUniformityThreshold", flag: "--caption-uniformity-threshold", min: 0, max: 1, integer: false, engines: ["otsu", "canny"] },
  { key: "captionMinRunPx", flag: "--caption-min-run-px", min: 0, max: 2000, integer: true, engines: ["otsu", "canny"] },
  { key: "minIllustrationFraction", flag: "--min-illustration-fraction", min: 0, max: 1, integer: false, engines: ["otsu", "canny"] },
];

export const CUSTOM_THRESHOLD_MIN = 0;
export const CUSTOM_THRESHOLD_MAX = 1;

/**
 * Strict decimal parsing for an advanced-parameter form field: rejects
 * anything that isn't a plain, whole-or-decimal, non-negative-sign number
 * end to end (no "20abc", no "1e5", no leading "+"), then checks bounds.
 * Returns null for empty/whitespace-only input (meaning "use the default")
 * or any invalid/out-of-range value — the caller must reject the whole
 * submission on null when the field was actually present with non-empty
 * text, exactly as parseStrictContentCropPercent does.
 */
export function parseStrictBoundedFloat(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Same as `parseStrictBoundedFloat` but additionally requires a whole number (no decimal point at all). */
export function parseStrictBoundedInt(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** A grid dimension (Columns or Rows) must be a whole number within [MIN_GRID_DIMENSION, MAX_GRID_DIMENSION] — matches MAX_GRID_DIMENSION in scripts/opencv_storyboard_extract.py exactly, so a value rejected here would also be rejected by the worker. */
export function isValidGridDimension(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_GRID_DIMENSION && n <= MAX_GRID_DIMENSION;
}

/**
 * Pure TS port of the worker's `best_fit_factorization`: chooses the
 * (rows, cols) factor pair of `count` whose aspect ratio (cols/rows) best
 * matches `imageAspect`. Used only to power the "Use Shot count" button's
 * suggested Columns/Rows — the worker recomputes its own factorization
 * independently at detection time (this never has to be trusted for
 * correctness, only for a helpful pre-filled suggestion).
 */
export function computeGridFactorization(
  count: number,
  imageAspect: number
): { rows: number; columns: number } | null {
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(imageAspect) || imageAspect <= 0) {
    return null;
  }
  let best: { rows: number; columns: number } | null = null;
  let bestDiff = Infinity;
  for (let rows = 1; rows <= count; rows++) {
    if (count % rows !== 0) continue;
    const columns = count / rows;
    const diff = Math.abs(columns / rows - imageAspect);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { rows, columns };
    }
  }
  return best;
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
