import { createReadStream } from "node:fs";
import fs from "fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolveEditorSidecarCorsHeaders } from "@/lib/cors/editorSidecarCors";

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
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
  };
  return map[ext] ?? "application/octet-stream";
}

function isSafePath(segments: string[]): boolean {
  for (const seg of segments) {
    if (!seg || seg.includes("..") || /[/\\ ]/.test(seg)) return false;
    if (/%(2f|5c)/i.test(seg)) return false;
  }
  return true;
}

/** Parses a `bytes=start-end` Range header against a file size. */
function parseRange(
  rangeHeader: string,
  size: number
): { start: number; end: number } | "invalid" {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return "invalid";
  const [, rawStart, rawEnd] = match;

  if (rawStart === "" && rawEnd === "") return "invalid";

  if (rawStart === "") {
    // Suffix range: last N bytes
    const suffix = parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const start = parseInt(rawStart, 10);
  const end = rawEnd === "" ? size - 1 : parseInt(rawEnd, 10);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}

function streamFile(filePath: string, start?: number, end?: number): ReadableStream {
  const nodeStream =
    start !== undefined && end !== undefined
      ? createReadStream(filePath, { start, end })
      : createReadStream(filePath);
  return Readable.toWeb(nodeStream) as ReadableStream;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"));
  const { path: segments } = await params;

  if (!Array.isArray(segments) || segments.length === 0 || !isSafePath(segments)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders ?? undefined });
  }

  const cwd = process.cwd();
  const relPath = segments.join(path.sep);

  const candidates = [
    path.resolve(cwd, "storage", "uploads", relPath),
    path.resolve(cwd, "public", "uploads", relPath),
  ];

  const allowedRoots = [
    path.resolve(cwd, "storage", "uploads"),
    path.resolve(cwd, "public", "uploads"),
  ];

  let resolvedPath: string | null = null;
  let fileSize = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const root = allowedRoots[i];

    if (!candidate.startsWith(root + path.sep)) continue;

    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      resolvedPath = candidate;
      fileSize = stat.size;
      break;
    } catch {
      continue;
    }
  }

  if (!resolvedPath || fileSize === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders ?? undefined });
  }

  const filename = segments[segments.length - 1];
  const contentType = getContentType(filename);

  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize);
    if (range === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          ...corsHeaders,
        },
      });
    }

    const chunkSize = range.end - range.start + 1;
    return new NextResponse(streamFile(resolvedPath, range.start, range.end), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
        ...corsHeaders,
      },
    });
  }

  return new NextResponse(streamFile(resolvedPath), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
      ...corsHeaders,
    },
  });
}

/**
 * Preflight for cross-origin GET/HEAD requests (e.g. a local sidecar
 * editor's fetch()). Never resolves or stats the requested file — a
 * preflight response must not reveal whether a given path exists.
 */
export async function OPTIONS(request: Request) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders ?? undefined,
  });
}
