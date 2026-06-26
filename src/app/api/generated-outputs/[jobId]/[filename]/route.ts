import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

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
  };
  return map[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function isSafeToken(token: string): boolean {
  // Reject path separators, null bytes, and URL-encoded variants
  if (/[/\\\u0000]/.test(token)) return false;
  if (/%(2f|2F|5c|5C)/i.test(token)) return false;
  // Reject path traversal (.. anywhere)
  if (token.includes("..")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/generated-outputs/[jobId]/[filename]
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
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

  for (const candidate of candidates) {
    // Check exists
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
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

  // --- 4. Read and return file ---
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