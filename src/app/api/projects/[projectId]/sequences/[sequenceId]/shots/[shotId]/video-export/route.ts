// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/sequences/[sequenceId]/shots/[shotId]/video-export
// SHOT.VIDEO.LIBRARY.1, Lot D — Shot-local, read-only, multi-video export
// (mikai-editorial-export-v1, sourceMode: "shot-videos")
//
// Read-only: reads `?ids=1,2,3` (comma-separated `shot_videos.id`, order
// preserved verbatim — the caller's selection order), loads exactly those
// rows for this Shot, refuses an empty selection or a row whose file is
// missing on disk, and serializes via buildShotVideoLibraryExport. No
// writes, no Shot mutation, ever.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sequences, shots, shotVideos } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { refImageUrl } from "@/lib/refImageUrl";
import { resolveEditorSidecarCorsHeaders } from "@/lib/cors/editorSidecarCors";
import { buildShotVideoLibraryExport } from "@/lib/editorial/shotVideoExport";

export async function OPTIONS(request: Request) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: corsHeaders ?? undefined });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string; shotId: string }> }
) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"));
  const { projectId, sequenceId, shotId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);

  function fail(status: number, error: string) {
    return NextResponse.json({ ok: false, error }, { status, headers: corsHeaders ?? undefined });
  }

  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(sid) || sid <= 0 || !Number.isInteger(shid) || shid <= 0) {
    return fail(400, "Invalid project, sequence, or shot id.");
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) return fail(404, "Project not found.");

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) return fail(404, "Sequence not found.");

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) return fail(404, "Shot not found.");

  const url = new URL(request.url);
  const rawIds = (url.searchParams.get("ids") ?? "").trim();
  const requestedIds = rawIds
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 10));

  if (requestedIds.length === 0 || requestedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return fail(400, "No videos selected, or the selection contains an invalid id.");
  }

  const rows = await db.select().from(shotVideos).where(inArray(shotVideos.id, requestedIds));
  const rowById = new Map(rows.map((r) => [r.id, r]));

  // Refuse the whole export (never a partial one) if any requested id is
  // missing, doesn't belong to this Shot, or has no known duration —
  // "refuse an empty selection or a missing file" per the ticket, applied
  // deterministically before any filesystem check.
  for (const id of requestedIds) {
    const row = rowById.get(id);
    if (!row) return fail(404, `Video #${id} not found.`);
    if (row.shotId !== shid) return fail(400, `Video #${id} does not belong to this Shot.`);
    if (row.durationSeconds === null || row.durationSeconds <= 0) {
      return fail(400, `Video #${id} has no known valid duration and cannot be exported.`);
    }
  }

  const publicRoot = path.join(process.cwd(), "public");
  for (const id of requestedIds) {
    const row = rowById.get(id)!;
    try {
      await fs.access(path.resolve(publicRoot, row.videoPath));
    } catch {
      return fail(409, `Video #${id}'s file is missing on disk — nothing was exported.`);
    }
  }

  const exportPayload = buildShotVideoLibraryExport({
    project: { id: project.id, name: project.name },
    sequence: { id: sequence.id, title: sequence.title },
    shot: { id: shot.id, title: shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title },
    entries: requestedIds.map((id) => {
      const row = rowById.get(id)!;
      return { id: row.id, videoPath: row.videoPath, durationSeconds: row.durationSeconds! };
    }),
    mediaUrlFor: refImageUrl,
  });

  const filename = `mikai-shot-${shid}-video-export-v1.json`;

  return NextResponse.json(exportPayload, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `inline; filename="${filename}"`,
      ...corsHeaders,
    },
  });
}
