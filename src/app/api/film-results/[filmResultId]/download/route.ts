// ---------------------------------------------------------------------------
// GET /api/film-results/[filmResultId]/download — FILM.EXPORT.DOWNLOAD.1
//
// A dedicated route, not an opt-in extension of the generic
// /api/uploads/[...path] route (src/app/api/uploads/[...path]/route.ts):
// that route is a pure file-tree server with no DB access, so it cannot
// know the owning project's name — the download filename's whole point
// (see buildFilmResultDownloadFilename). Handing it that name via a client
// query param would put the client back in charge of the filename decision
// this ticket keeps app-side, and would need a second confinement check
// alongside the one it already has for its path segments. Kept apart
// instead: this route takes only a Film Result id, resolves videoPath from
// film_results, and reuses resolveExistingAbsolutePath
// (src/lib/editorial/renderBasicSequenceResult.ts) to turn it into a real
// file — no path segment ever comes from the client, so there is nothing to
// confine here. The generic uploads route (Range, sidecar CORS, default
// inline serving) is untouched.
// ---------------------------------------------------------------------------

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { filmResults, projects } from "@/db/schema";
import { resolveExistingAbsolutePath } from "@/lib/editorial/renderBasicSequenceResult";
import { buildFilmResultDownloadFilename } from "@/lib/film/filmResultDownloadFilename";

function streamFile(filePath: string): ReadableStream {
  return Readable.toWeb(createReadStream(filePath)) as ReadableStream;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filmResultId: string }> }
) {
  const { filmResultId } = await params;
  const id = parseInt(filmResultId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid Film Result id." }, { status: 400 });
  }

  const [row] = await db.select().from(filmResults).where(eq(filmResults.id, id));
  if (!row || !row.videoPath) {
    return NextResponse.json({ error: "Film Result not found." }, { status: 404 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, row.projectId));
  if (!project) {
    return NextResponse.json({ error: "Film Result not found." }, { status: 404 });
  }

  const absolutePath = await resolveExistingAbsolutePath(row.videoPath);
  if (!absolutePath) {
    return NextResponse.json({ error: "The Film Result's file is missing on disk." }, { status: 404 });
  }

  const stat = await fs.stat(absolutePath);
  const filename = buildFilmResultDownloadFilename(project.name, row.id);

  return new NextResponse(streamFile(absolutePath), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
