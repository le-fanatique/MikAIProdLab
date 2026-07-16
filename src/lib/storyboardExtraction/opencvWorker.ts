// ---------------------------------------------------------------------------
// storyboardExtraction/opencvWorker.ts — SEQGEN.STORYBOARD.EXTRACT.1
//
// Owns the actual subprocess invocation of scripts/opencv_storyboard_extract.py
// (child_process.execFile — never a shell, so no shell-injection surface
// regardless of path contents). Mirrors the timeout/maxBuffer pattern already
// used for the bundled ffmpeg/ffprobe binaries in src/lib/ffmpeg.ts.
//
// Server-only. NEVER import from a Client Component.
//
// The worker itself never writes to public/uploads — `runCrop` always writes
// into a caller-supplied scratch directory; copying a result into permanent
// storage is exclusively the server action's job (see
// src/actions/storyboardExtraction.ts), matching the ticket's explicit
// constraint.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseWorkerStdout,
  extractWorkerError,
  validateDetectResult,
  validateCropResult,
  WorkerContractError,
  ADVANCED_PARAM_SPECS,
  type DetectResult,
  type CropResult,
  type DetectionEngine,
  type Sensitivity,
  type AdvancedDetectionParams,
} from "./workerContract";

const execFileAsync = promisify(execFile);

const DETECT_TIMEOUT_MS = 30_000;
const CROP_TIMEOUT_MS = 30_000;
const MAX_STDOUT_BUFFER_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_CELLS = 60;

/** Extensions the worker is ever invoked against. Mirrors the allowlist already used for storyboard image outputs elsewhere in the codebase. */
export const OPENCV_INPUT_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export class OpenCvWorkerError extends Error {}

function getPythonBin(): string {
  return process.env.OPENCV_PYTHON_BIN?.trim() || "python3";
}

function getScriptPath(): string {
  return path.join(process.cwd(), "scripts", "opencv_storyboard_extract.py");
}

/** Validates size/extension before ever spawning the subprocess — an oversized or wrong-format file is refused with a clear error, never silently truncated or passed through. */
async function validateInputImage(absolutePath: string): Promise<void> {
  const ext = path.extname(absolutePath).toLowerCase();
  if (!OPENCV_INPUT_IMAGE_EXTS.has(ext)) {
    throw new OpenCvWorkerError(`Unsupported image format: ${ext || "(none)"}`);
  }
  let stat;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    throw new OpenCvWorkerError("Input image not found on disk.");
  }
  if (!stat.isFile()) {
    throw new OpenCvWorkerError("Input path is not a file.");
  }
  if (stat.size > MAX_INPUT_IMAGE_BYTES) {
    throw new OpenCvWorkerError(
      `Input image is too large (${Math.round(stat.size / 1024 / 1024)}MB, max ${MAX_INPUT_IMAGE_BYTES / 1024 / 1024}MB).`
    );
  }
}

function wrapWorkerFailure(e: unknown): never {
  if (e instanceof WorkerContractError) {
    throw new OpenCvWorkerError(e.message);
  }
  const err = e as { code?: unknown; killed?: boolean; stdout?: string };
  if (err?.killed) {
    throw new OpenCvWorkerError("OpenCV worker timed out.");
  }
  // execFile rejects with the child's non-zero exit still carrying stdout —
  // try to recover the worker's own {"ok": false, "error": "..."} message.
  // Parsing happens inside its own try (falling through to the generic
  // message on any parse failure) but the recovered error is thrown OUTSIDE
  // that try — throwing inside would just be caught by the same catch below.
  if (typeof err?.stdout === "string" && err.stdout.trim()) {
    let recoveredMessage: string | null = null;
    try {
      const obj = parseWorkerStdout(err.stdout);
      if (obj.ok === false) {
        recoveredMessage = extractWorkerError(obj);
      }
    } catch {
      /* fall through to generic message below */
    }
    if (recoveredMessage !== null) {
      throw new OpenCvWorkerError(recoveredMessage);
    }
  }
  throw new OpenCvWorkerError("OpenCV worker failed to run.");
}

export type RunDetectOptions = {
  /** Forwarded to the worker so it can propose a low-confidence `grid-fallback` grid when primary detection is ambiguous — a non-positive-integer value means "unknown", never forcing any fallback. */
  expectedShotCount?: number;
  /** FIX6 — explicit primary-detection engine: "otsu" | "canny" | "grid". Omitted defaults to the worker's own "canny" (byte-identical to the pre-FIX6 "auto" mode). */
  engine?: DetectionEngine;
  /** Explicit grid shape override — must be supplied together (both or neither); validated against expectedShotCount and geometric limits by the worker itself, which fails loudly on a mismatch. */
  columns?: number;
  rows?: number;
  /** How readily otsu/canny fall back to the proposed grid when their count already matches but confidence is low. Omitted defaults to the worker's own "medium". Ignored when customThreshold is given. */
  sensitivity?: Sensitivity;
  /** FIX6 — 0.00-1.00, takes priority over `sensitivity` for the fallback decision when present. */
  customThreshold?: number;
  /** FIX6 — advanced tunables, each forwarded verbatim as its own CLI flag; omitted fields keep the worker's own pre-FIX6 default constants. */
  advancedParams?: AdvancedDetectionParams;
};

/**
 * Runs `detect` against an already-validated absolute image path and returns
 * typed, bounds-checked regions in reading order.
 */
export async function runDetect(absoluteInputPath: string, options: RunDetectOptions = {}): Promise<DetectResult> {
  await validateInputImage(absoluteInputPath);

  const args = [getScriptPath(), "detect", "--input", absoluteInputPath, "--max-cells", String(MAX_CELLS)];
  if (Number.isInteger(options.expectedShotCount) && (options.expectedShotCount as number) > 0) {
    args.push("--expected-shots", String(options.expectedShotCount));
  }
  if (options.engine) {
    args.push("--engine", options.engine);
  }
  if (Number.isInteger(options.columns) && Number.isInteger(options.rows)) {
    args.push("--columns", String(options.columns), "--rows", String(options.rows));
  }
  if (options.sensitivity) {
    args.push("--sensitivity", options.sensitivity);
  }
  if (typeof options.customThreshold === "number") {
    args.push("--custom-threshold", String(options.customThreshold));
  }
  if (options.advancedParams) {
    for (const spec of ADVANCED_PARAM_SPECS) {
      const value = options.advancedParams[spec.key];
      if (typeof value === "number") {
        args.push(spec.flag, String(value));
      }
    }
  }

  let stdout: string;
  try {
    const result = await execFileAsync(getPythonBin(), args, {
      timeout: DETECT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: MAX_STDOUT_BUFFER_BYTES,
    });
    stdout = result.stdout;
  } catch (e) {
    wrapWorkerFailure(e);
  }

  const obj = parseWorkerStdout(stdout);
  if (obj.ok !== true) {
    throw new OpenCvWorkerError(extractWorkerError(obj));
  }
  return validateDetectResult(obj);
}

export type CropRequestRegion = { index: number; x: number; y: number; width: number; height: number };

/**
 * Runs `crop` against an already-validated absolute image path. Writes into
 * `scratchOutputDir` (caller-owned, must already exist or be creatable) —
 * never into public/uploads. Returns the worker's own file list; the caller
 * is responsible for validating+copying each file into permanent storage.
 */
export async function runCrop(
  absoluteInputPath: string,
  regions: CropRequestRegion[],
  scratchOutputDir: string
): Promise<CropResult> {
  await validateInputImage(absoluteInputPath);
  if (regions.length === 0) {
    throw new OpenCvWorkerError("No regions to crop.");
  }

  await fs.mkdir(scratchOutputDir, { recursive: true });
  const regionsFilePath = path.join(scratchOutputDir, `regions-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await fs.writeFile(regionsFilePath, JSON.stringify(regions), "utf-8");

  let stdout: string;
  try {
    const result = await execFileAsync(
      getPythonBin(),
      [
        getScriptPath(),
        "crop",
        "--input",
        absoluteInputPath,
        "--regions",
        regionsFilePath,
        "--output-dir",
        scratchOutputDir,
      ],
      { timeout: CROP_TIMEOUT_MS, windowsHide: true, maxBuffer: MAX_STDOUT_BUFFER_BYTES }
    );
    stdout = result.stdout;
  } catch (e) {
    wrapWorkerFailure(e);
  } finally {
    await fs.unlink(regionsFilePath).catch(() => {});
  }

  const obj = parseWorkerStdout(stdout);
  if (obj.ok !== true) {
    throw new OpenCvWorkerError(extractWorkerError(obj));
  }
  return validateCropResult(obj);
}
