import fs from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { NextResponse } from "next/server";
import {
  PLY_HEADER_MAX_BYTES,
  parsePlyHeader,
} from "@/lib/comfy/plyArtifact";

// ---------------------------------------------------------------------------
// Content-type by extension
// ---------------------------------------------------------------------------

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    // CAMLAB.PLY.1 — Gaussian Splat artifacts
    ".ply": "application/octet-stream",
  };
  return map[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function isSafeToken(token: string): boolean {
  // Reject path separators, null bytes, and URL-encoded variants
  if (/[/\\]/.test(token)) return false;
  if (token.includes(String.fromCharCode(0))) return false;
  if (/%(2f|2F|5c|5C|00)/i.test(token)) return false;
  // Reject path traversal (.. anywhere)
  if (token.includes("..")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Range parsing (CAMLAB.PLY.1 — used for .ply responses only)
// ---------------------------------------------------------------------------

type ParsedRange =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "range"; start: number; end: number };

function parseRangeHeader(header: string | null, size: number): ParsedRange {
  if (!header) return { kind: "none" };

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return { kind: "invalid" };
  const [, rawStart, rawEnd] = m;

  if (rawStart === "" && rawEnd === "") return { kind: "invalid" };

  if (rawStart === "") {
    // Suffix range: last N bytes
    const suffix = parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return { kind: "invalid" };
    const start = Math.max(0, size - suffix);
    return start >= size ? { kind: "invalid" } : { kind: "range", start, end: size - 1 };
  }

  const start = parseInt(rawStart, 10);
  const end = rawEnd === "" ? size - 1 : parseInt(rawEnd, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { kind: "invalid" };
  if (start > end || start >= size) return { kind: "invalid" };
  return { kind: "range", start, end: Math.min(end, size - 1) };
}

// ---------------------------------------------------------------------------
// PLY revalidation before serving (bounded header check + size consistency)
// ---------------------------------------------------------------------------

async function isServablePly(filePath: string, size: number): Promise<boolean> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(Math.min(size, PLY_HEADER_MAX_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const info = parsePlyHeader(buffer.subarray(0, bytesRead));
    return info !== null && info.expectedTotalBytes === size;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// GET /api/generated-outputs/[jobId]/[filename]
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string; filename: string }> }
) {
  const { jobId, filename } = await params;

  // --- 1. Validate tokens ---
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSafeToken(filename)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // --- 2. Build candidate paths ---
  const cwd = process.cwd();
  const candidates: string[] = [
    // Primary: storage/outputs/jobs/{jobId}/{filename}
    path.resolve(cwd, "storage", "outputs", "jobs", jobId, filename),
    // Fallback: public/outputs/jobs/{jobId}/{filename}
    path.resolve(cwd, "public", "outputs", "jobs", jobId, filename),
  ];

  // --- 3. Verify each candidate against allowed root ---
  const allowedRoots = [
    path.resolve(cwd, "storage", "outputs", "jobs", jobId),
    path.resolve(cwd, "public", "outputs", "jobs", jobId),
  ];

  let resolvedPath: string | null = null;
  let resolvedSize = 0;

  for (const candidate of candidates) {
    // Check exists
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      resolvedSize = stat.size;
    } catch {
      continue; // Does not exist or not accessible
    }

    // Check within allowed root
    const idx = candidates.indexOf(candidate);
    const root = allowedRoots[idx];
    if (candidate.startsWith(root + path.sep) || candidate === root) {
      resolvedPath = candidate;
      break;
    }
  }

  if (!resolvedPath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isPly = path.extname(filename).toLowerCase() === ".ply";

  // --- 4a. PLY: revalidate, then serve with Range support ---
  if (isPly) {
    if (!(await isServablePly(resolvedPath, resolvedSize))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const range = parseRangeHeader(request.headers.get("range"), resolvedSize);

    if (range.kind === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${resolvedSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const start = range.kind === "range" ? range.start : 0;
    const end = range.kind === "range" ? range.end : resolvedSize - 1;
    const length = end - start + 1;

    const nodeStream = createReadStream(resolvedPath, { start, end });
    const body = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": getContentType(filename),
      "Content-Length": String(length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    };
    if (range.kind === "range") {
      headers["Content-Range"] = `bytes ${start}-${end}/${resolvedSize}`;
    }

    return new NextResponse(body, {
      status: range.kind === "range" ? 206 : 200,
      headers,
    });
  }

  // --- 4b. Other extensions: unchanged full-read behavior ---
  try {
    const buffer = await fs.readFile(resolvedPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": getContentType(filename),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
