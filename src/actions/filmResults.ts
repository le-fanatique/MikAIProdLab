"use server";

// ---------------------------------------------------------------------------
// Film Result actions (FILM.RESULT.1.A)
//
// Mirrors src/actions/sequenceResults.ts one level up: list/read/activate/
// archive an already-existing Film Result, plus a manifest-only "create
// draft" primitive. No FFmpeg, no rendering, no video file — videoPath
// stays null until a future FILM.RESULT.1.B actually assembles one.
//
// "At most one active Film Result per project" — same applicative
// uniqueness as setActiveSequenceResult, same reasoning for why (no
// first-class partial-index support in this project's pinned drizzle-kit
// version; the transactional demote-then-promote gives the same practical
// guarantee).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { filmResults, projects } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { FilmResult, NewFilmResult } from "@/db/schema";
import {
  buildFilmResultManifest,
  computeFilmProjectSnapshot,
  computeFilmResultTotalDuration,
  FilmResultManifestError,
} from "@/lib/film/filmResultManifest";
import {
  serializeFilmResultManifest,
  serializeFilmProjectSnapshot,
  serializeFilmResultWarnings,
} from "@/types/filmResult";

async function assertProjectExists(projectId: number): Promise<boolean> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  return !!project;
}

/** All Film Results for a project, most recent first. Empty array (not an error) if none exist, or the project doesn't exist. */
export async function listFilmResults(projectId: number): Promise<FilmResult[]> {
  if (!(await assertProjectExists(projectId))) return [];
  return db.select().from(filmResults).where(eq(filmResults.projectId, projectId)).orderBy(desc(filmResults.createdAt));
}

/** The project's current active Film Result, or null if none. */
export async function getActiveFilmResult(projectId: number): Promise<FilmResult | null> {
  if (!(await assertProjectExists(projectId))) return null;
  const [row] = await db
    .select()
    .from(filmResults)
    .where(and(eq(filmResults.projectId, projectId), eq(filmResults.status, "active")))
    .orderBy(desc(filmResults.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Promotes `filmResultId` to "active", demoting any other currently-active
 * Film Result for the same project to "published" first. Same
 * transactional pattern as setActiveSequenceResult.
 */
export async function setActiveFilmResult(
  projectId: number,
  filmResultId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertProjectExists(projectId))) {
    return { ok: false, error: "Project not found." };
  }

  const now = new Date().toISOString();
  const result = db.transaction((tx) => {
    const targetRows = tx
      .select({ id: filmResults.id, projectId: filmResults.projectId })
      .from(filmResults)
      .where(eq(filmResults.id, filmResultId))
      .all() as unknown as { id: number; projectId: number }[];
    const target = targetRows[0];
    if (!target || target.projectId !== projectId) {
      return { changed: false };
    }

    const currentlyActiveRows = tx
      .select({ id: filmResults.id })
      .from(filmResults)
      .where(and(eq(filmResults.projectId, projectId), eq(filmResults.status, "active")))
      .all() as unknown as { id: number }[];

    for (const row of currentlyActiveRows) {
      if (row.id === filmResultId) continue;
      tx.update(filmResults).set({ status: "published", updatedAt: now }).where(eq(filmResults.id, row.id)).run();
    }

    tx.update(filmResults).set({ status: "active", updatedAt: now }).where(eq(filmResults.id, filmResultId)).run();

    return { changed: true };
  });

  if (!result.changed) {
    return { ok: false, error: "Film Result not found in this project." };
  }

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Archives a Film Result. Does not auto-promote a replacement. */
export async function archiveFilmResult(
  projectId: number,
  filmResultId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertProjectExists(projectId))) {
    return { ok: false, error: "Project not found." };
  }

  const [existing] = await db
    .select({ id: filmResults.id })
    .from(filmResults)
    .where(and(eq(filmResults.id, filmResultId), eq(filmResults.projectId, projectId)));
  if (!existing) return { ok: false, error: "Film Result not found in this project." };

  await db.update(filmResults).set({ status: "archived", updatedAt: new Date().toISOString() }).where(eq(filmResults.id, filmResultId));

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/**
 * Marks every non-terminal Film Result (`active`/`published`) of a project
 * as `outdated` — called whenever a sequence's active Sequence Result
 * state changes (see src/actions/sequenceResults.ts's setActiveSequenceResult/
 * archiveSequenceResult/outdateSequenceResultsForSequence, which all call
 * this at the end), since the project's Film Result manifest is no longer
 * a faithful description of what would currently be assembled. Never
 * throws — a missing/invalid project just outdates zero rows.
 */
export async function outdateFilmResultsForProject(
  projectId: number
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!(await assertProjectExists(projectId))) {
    return { ok: false, error: "Project not found." };
  }

  const now = new Date().toISOString();
  const rows = await db
    .update(filmResults)
    .set({ status: "outdated", updatedAt: now })
    .where(and(eq(filmResults.projectId, projectId), inArray(filmResults.status, ["active", "published"])))
    .returning({ id: filmResults.id });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, count: rows.length };
}

/**
 * Creates a manifest-only "draft" Film Result from the project's current
 * active Sequence Results — no FFmpeg, no file written, videoPath stays
 * null. Always created as "draft" (never auto-activated) — publish/activate
 * are deliberately separate steps, same convention as createSequenceResult.
 */
export async function createFilmResultDraftFromActiveSequenceResults(
  projectId: number
): Promise<{ ok: true; id: number; warnings: string[] } | { ok: false; error: string }> {
  if (!(await assertProjectExists(projectId))) {
    return { ok: false, error: "Project not found." };
  }

  let manifest;
  try {
    manifest = await buildFilmResultManifest(projectId);
  } catch (err) {
    return { ok: false, error: err instanceof FilmResultManifestError ? err.message : "Failed to build Film Result manifest." };
  }

  const snapshot = computeFilmProjectSnapshot(manifest);
  const durationSeconds = computeFilmResultTotalDuration(manifest);
  const now = new Date().toISOString();

  const values: NewFilmResult = {
    projectId,
    status: "draft",
    videoPath: null,
    durationSeconds,
    sequenceResultManifest: serializeFilmResultManifest(manifest),
    projectSnapshot: serializeFilmProjectSnapshot(snapshot),
    notes: null,
    warnings: manifest.warnings.length > 0 ? serializeFilmResultWarnings(manifest.warnings) : null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const [row] = await db.insert(filmResults).values(values).returning({ id: filmResults.id });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, id: row.id, warnings: manifest.warnings };
}
