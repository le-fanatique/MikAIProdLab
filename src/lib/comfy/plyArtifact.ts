// CAMLAB.PLY.1 — pure helpers for detecting and validating Gaussian Splat PLY
// artifacts published by ComfyUI history outputs. No I/O in this module except
// the explicit file validators at the bottom; everything else is pure and
// deterministic so it can be tested without a ComfyUI server.

import fs from "fs/promises";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const PLY_MAX_BYTES = 512 * 1024 * 1024; // 512 MiB hard cap
export const PLY_HEADER_MAX_BYTES = 64 * 1024; // header must fit in 64 KiB
export const PLY_MAX_VERTICES = 100_000_000; // sanity bound, far above real scenes
export const PLY_MAX_PROPERTIES = 64; // sanity bound on vertex properties

// ---------------------------------------------------------------------------
// Filename safety
// ---------------------------------------------------------------------------

// Strict basename: letters, digits, dot, underscore, hyphen only. This
// excludes path separators, NUL bytes, percent-encoding, spaces, and any
// shell/URL metacharacter. Must end in ".ply" (case-insensitive) and must
// not contain "..".
const SAFE_PLY_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

export function isSafePlyFilename(filename: string): boolean {
  if (typeof filename !== "string") return false;
  if (filename.length === 0 || filename.length > 255) return false;
  if (!SAFE_PLY_FILENAME_RE.test(filename)) return false;
  if (filename.includes("..")) return false;
  if (!/\.ply$/i.test(filename)) return false;
  // Reject bare ".ply" and dotfiles like ".foo.ply"
  if (filename.startsWith(".")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// History metadata extraction
// ---------------------------------------------------------------------------

export type PlyArtifactExtraction =
  | { status: "none" }
  | { status: "found"; filename: string }
  | { status: "invalid"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === "string")) return null;
  return value as string[];
}

/**
 * Detects a PLY artifact in a single history output node.
 *
 * Structural contract (from CAMLAB.SPIKE.1, real payload):
 *   outputs[nodeId].ply_file:  ["sharp_<ts>.ply"]
 *   outputs[nodeId].filename:  ["sharp_<ts>.ply"]
 * No subfolder, no storage type (implicit "output").
 *
 * Rules:
 * - A node "declares" a PLY when `ply_file` is a non-empty string array, or
 *   `filename` is a non-empty string array whose entries end in ".ply".
 * - A declared PLY must resolve to exactly one distinct safe basename across
 *   both keys; anything ambiguous or unsafe is "invalid", never guessed.
 * - An explicit `type` other than "output", or a non-empty `subfolder`, is
 *   refused for this MVP rather than interpreted.
 */
export function extractPlyFromOutputNode(node: unknown): PlyArtifactExtraction {
  if (!isRecord(node)) return { status: "none" };

  const plyFileArr = asStringArray(node["ply_file"]);
  const filenameArr = asStringArray(node["filename"]);

  const declaresPly =
    (plyFileArr !== null && plyFileArr.length > 0) ||
    (filenameArr !== null &&
      filenameArr.length > 0 &&
      filenameArr.some((f) => /\.ply$/i.test(f)));

  if (!declaresPly) return { status: "none" };

  // Collect candidates from both keys
  const candidates = new Set<string>();
  for (const arr of [plyFileArr, filenameArr]) {
    if (arr) for (const f of arr) candidates.add(f);
  }

  if (candidates.size !== 1) {
    return {
      status: "invalid",
      reason: `PLY output metadata is ambiguous: ${candidates.size} distinct filenames.`,
    };
  }

  const [filename] = [...candidates];

  if (!isSafePlyFilename(filename)) {
    return {
      status: "invalid",
      reason: "PLY output filename is not a safe .ply basename.",
    };
  }

  // Explicit storage type must be "output" when present. Any malformed shape
  // (not a string / string array) is refused, never coerced to "absent".
  const rawType = node["type"];
  if (rawType !== undefined) {
    const typeValues =
      typeof rawType === "string" ? [rawType] : asStringArray(rawType);
    if (typeValues === null || typeValues.some((t) => t !== "output")) {
      return {
        status: "invalid",
        reason:
          "PLY output declares a malformed storage type or a type other than 'output'.",
      };
    }
  }

  // A subfolder is not part of the observed contract — refuse rather than
  // interpret. Malformed shapes are refused too.
  const rawSubfolder = node["subfolder"];
  if (rawSubfolder !== undefined) {
    const subfolderValues =
      typeof rawSubfolder === "string"
        ? [rawSubfolder]
        : asStringArray(rawSubfolder);
    if (subfolderValues === null || subfolderValues.some((s) => s !== "")) {
      return {
        status: "invalid",
        reason:
          "PLY output declares a malformed or non-empty subfolder, which is not supported.",
      };
    }
  }

  return { status: "found", filename };
}

/**
 * Scans all output nodes of a history entry for a PLY artifact.
 * First "invalid" declaration wins (fail loud); otherwise first "found".
 */
export function extractPlyFromHistoryOutputs(
  outputs: unknown
): PlyArtifactExtraction {
  if (!isRecord(outputs)) return { status: "none" };

  let found: PlyArtifactExtraction | null = null;
  for (const node of Object.values(outputs)) {
    const result = extractPlyFromOutputNode(node);
    if (result.status === "invalid") return result;
    if (result.status === "found" && !found) found = result;
  }
  return found ?? { status: "none" };
}

// ---------------------------------------------------------------------------
// PLY header parsing (bounded)
// ---------------------------------------------------------------------------

export type PlyHeaderInfo = {
  headerBytes: number;
  vertexCount: number;
  bytesPerVertex: number;
  expectedTotalBytes: number;
};

const PLY_PROPERTY_SIZES: Record<string, number> = {
  char: 1,
  int8: 1,
  uchar: 1,
  uint8: 1,
  short: 2,
  int16: 2,
  ushort: 2,
  uint16: 2,
  int: 4,
  int32: 4,
  uint: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8,
};

/**
 * Parses a binary_little_endian PLY header from the first bytes of the file.
 * Strict for this MVP: exactly one element ("vertex"), scalar properties only
 * (no lists), bounded counts. Returns null when anything is off.
 */
export function parsePlyHeader(headBuffer: Buffer): PlyHeaderInfo | null {
  const marker = "end_header\n";
  const search = headBuffer.subarray(
    0,
    Math.min(headBuffer.length, PLY_HEADER_MAX_BYTES)
  );
  const markerIndex = search.indexOf(marker, 0, "ascii");
  if (markerIndex < 0) return null;

  const headerBytes = markerIndex + marker.length;
  const headerText = search.subarray(0, markerIndex).toString("ascii");
  const lines = headerText.split("\n").map((l) => l.trim());

  if (lines[0] !== "ply") return null;
  if (lines[1] !== "format binary_little_endian 1.0") return null;

  let vertexCount = -1;
  let bytesPerVertex = 0;
  let propertyCount = 0;
  let sawVertexElement = false;

  for (const line of lines.slice(2)) {
    if (line === "" || line.startsWith("comment ")) continue;

    if (line.startsWith("element ")) {
      const m = /^element vertex (\d+)$/.exec(line);
      // Exactly one element, and it must be "vertex"
      if (!m || sawVertexElement) return null;
      const count = parseInt(m[1], 10);
      if (!Number.isInteger(count) || count <= 0 || count > PLY_MAX_VERTICES) {
        return null;
      }
      sawVertexElement = true;
      vertexCount = count;
      continue;
    }

    if (line.startsWith("property ")) {
      if (!sawVertexElement) return null;
      const parts = line.split(/\s+/);
      // Scalar properties only: "property <type> <name>"
      if (parts.length !== 3) return null;
      const size = PLY_PROPERTY_SIZES[parts[1]];
      if (!size) return null;
      propertyCount += 1;
      if (propertyCount > PLY_MAX_PROPERTIES) return null;
      bytesPerVertex += size;
      continue;
    }

    // Unknown header directive — refuse rather than guess
    return null;
  }

  if (!sawVertexElement || bytesPerVertex === 0) return null;

  const expectedTotalBytes = headerBytes + vertexCount * bytesPerVertex;
  if (expectedTotalBytes > PLY_MAX_BYTES) return null;

  return { headerBytes, vertexCount, bytesPerVertex, expectedTotalBytes };
}

// ---------------------------------------------------------------------------
// File validation (bounded I/O)
// ---------------------------------------------------------------------------

async function readFileHead(filePath: string, maxBytes: number): Promise<Buffer | null> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * Full validation before publishing into the MikAI cache: bounded header
 * parse + exact size consistency with the declared vertex layout.
 */
export async function validatePlyFile(
  filePath: string
): Promise<{ ok: true; info: PlyHeaderInfo } | { ok: false; reason: string }> {
  const head = await readFileHead(filePath, PLY_HEADER_MAX_BYTES);
  if (!head) return { ok: false, reason: "PLY file could not be read." };

  const info = parsePlyHeader(head);
  if (!info) return { ok: false, reason: "PLY header is invalid or unsupported." };

  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return { ok: false, reason: "PLY file could not be read." };
  }

  if (size !== info.expectedTotalBytes) {
    return {
      ok: false,
      reason: `PLY payload size mismatch: expected ${info.expectedTotalBytes} bytes, got ${size}.`,
    };
  }

  return { ok: true, info };
}
