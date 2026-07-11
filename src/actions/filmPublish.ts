"use server";

// ---------------------------------------------------------------------------
// Film Result publish action (FILM.RESULT.1.B)
//
// Mirrors src/actions/basicEditorial.ts's publishBasicSequenceResult, one
// level up: build manifest -> render MP4 -> create a film_results row ->
// optionally activate it. Kept in its own file (not added to
// src/actions/filmResults.ts) for the same reason BASIC.EDITORIAL.1.B's
// publish action lives apart from sequenceResults.ts's CRUD/manifest
// primitives — a render+publish orchestration is a different concern from
// the create-draft/list/activate/archive primitives it composes.
//
// Render happens BEFORE any DB write (same reasoning as Basic publish:
// don't hold a transaction open across a long FFmpeg render) — the only
// writes are the single film_results insert and, if requested, a separate
// setActiveFilmResult call. Never touches sequence_results.
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { checkFfmpegAvailability } from "@/lib/ffmpeg";
import {
  buildFilmResultManifest,
  computeFilmProjectSnapshot,
  FilmResultManifestError,
} from "@/lib/film/filmResultManifest";
import { renderFilmResultFromManifest, RenderFilmResultError } from "@/lib/film/renderFilmResult";
import { db } from "@/db";
import { filmResults } from "@/db/schema";
import type { NewFilmResult } from "@/db/schema";
import {
  serializeFilmResultManifest,
  serializeFilmProjectSnapshot,
  serializeFilmResultWarnings,
} from "@/types/filmResult";
import { setActiveFilmResult } from "@/actions/filmResults";

export type PublishFilmResultResult =
  | { ok: true; filmResultId: number; videoPath: string; durationSeconds: number; warnings: string[] }
  | { ok: false; error: string };

export async function publishFilmResultFromActiveSequenceResults(
  projectId: number,
  options: { setActive?: boolean } = {}
): Promise<PublishFilmResultResult> {
  const ffmpegStatus = await checkFfmpegAvailability();
  if (!ffmpegStatus.ok) {
    return { ok: false, error: ffmpegStatus.error ?? "FFmpeg is not available on this server." };
  }

  let manifest;
  try {
    manifest = await buildFilmResultManifest(projectId);
  } catch (err) {
    return { ok: false, error: err instanceof FilmResultManifestError ? err.message : "Failed to build Film Result manifest." };
  }

  const snapshot = computeFilmProjectSnapshot(manifest);

  let renderResult;
  try {
    renderResult = await renderFilmResultFromManifest({ projectId, manifest });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof RenderFilmResultError ? err.message : "FFmpeg render failed unexpectedly.",
    };
  }

  const allWarnings = [...manifest.warnings, ...renderResult.warnings];
  const now = new Date().toISOString();

  const values: NewFilmResult = {
    projectId,
    status: options.setActive ? "active" : "published",
    videoPath: renderResult.outputVideoPath,
    durationSeconds: renderResult.durationSeconds,
    sequenceResultManifest: serializeFilmResultManifest(manifest),
    projectSnapshot: serializeFilmProjectSnapshot(snapshot),
    notes: null,
    warnings: allWarnings.length > 0 ? serializeFilmResultWarnings(allWarnings) : null,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  let insertedId: number;
  try {
    const [row] = await db.insert(filmResults).values(values).returning({ id: filmResults.id });
    insertedId = row.id;
  } catch {
    // DB insert failed after a successful render — the rendered file is now
    // orphaned. Best-effort cleanup, same reasoning as Basic publish: a
    // unique UUID filename this exact request just wrote, safe to remove.
    const orphanedAbsolute = path.resolve(process.cwd(), "public", renderResult.outputVideoPath);
    await fs.rm(orphanedAbsolute, { force: true }).catch(() => {});
    return { ok: false, error: "Failed to save the Film Result. Please try again." };
  }

  // Demotes any other previously-active Film Result in the project — the
  // insert above already wrote "active" directly when setActive is set,
  // this call is only needed for that demotion guarantee.
  if (options.setActive) {
    await setActiveFilmResult(projectId, insertedId);
  }

  revalidatePath(`/projects/${projectId}`);

  return {
    ok: true,
    filmResultId: insertedId,
    videoPath: renderResult.outputVideoPath,
    durationSeconds: renderResult.durationSeconds,
    warnings: allWarnings,
  };
}
