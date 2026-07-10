"use server";

// ---------------------------------------------------------------------------
// Basic Editorial publish action (BASIC.EDITORIAL.1.B)
//
// Orchestrates: load editorial state -> build manifest -> render MP4 ->
// create a sequence_results row (sourceMode: "basic") -> optionally
// activate it. Render happens BEFORE any DB write (per this ticket's own
// guidance: don't hold a transaction open across a long ffmpeg render) —
// the only write is the single createSequenceResult insert (+ a separate
// setActiveSequenceResult transaction if requested), both fast, both
// already-existing, already-transactional where it matters.
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { checkFfmpegAvailability } from "@/lib/ffmpeg";
import {
  buildBasicCutManifest,
  loadEditorialDocumentForSequence,
  BasicCutManifestError,
} from "@/lib/editorial/basicCutManifest";
import { renderBasicSequenceResult, RenderBasicSequenceResultError } from "@/lib/editorial/renderBasicSequenceResult";
import { buildEditorialSnapshot } from "@/lib/editorial/editorialSnapshot";
import { createSequenceResult, setActiveSequenceResult } from "@/actions/sequenceResults";
import fs from "node:fs/promises";
import path from "node:path";

export type PublishBasicSequenceResultResult =
  | { ok: true; resultId: number; videoPath: string; durationSeconds: number; warnings: string[] }
  | { ok: false; error: string };

export async function publishBasicSequenceResult(
  projectId: number,
  sequenceId: number,
  options: { setActive?: boolean } = {}
): Promise<PublishBasicSequenceResultResult> {
  const ffmpegStatus = await checkFfmpegAvailability();
  if (!ffmpegStatus.ok) {
    return { ok: false, error: ffmpegStatus.error ?? "FFmpeg is not available on this server." };
  }

  let editorialState;
  try {
    editorialState = await loadEditorialDocumentForSequence(projectId, sequenceId);
  } catch (err) {
    return { ok: false, error: err instanceof BasicCutManifestError ? err.message : "Failed to load editorial state." };
  }

  let manifest;
  try {
    manifest = await buildBasicCutManifest(projectId, sequenceId, { preloaded: editorialState });
  } catch (err) {
    return { ok: false, error: err instanceof BasicCutManifestError ? err.message : "Failed to build cut manifest." };
  }

  const editorialSnapshot = buildEditorialSnapshot({ sequenceId, document: editorialState.document });

  let renderResult;
  try {
    renderResult = await renderBasicSequenceResult({ projectId, sequenceId, manifest });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof RenderBasicSequenceResultError ? err.message : "FFmpeg render failed unexpectedly.",
    };
  }

  const allWarnings = [...manifest.warnings, ...renderResult.warnings];

  const created = await createSequenceResult({
    projectId,
    sequenceId,
    sourceMode: "basic",
    status: options.setActive ? "active" : "published",
    videoPath: renderResult.outputVideoPath,
    durationSeconds: renderResult.durationSeconds,
    cutManifest: manifest,
    editorialSnapshot,
    warnings: allWarnings,
    publishedAt: new Date().toISOString(),
  });

  if (!created.ok) {
    // DB insert failed after a successful render — the rendered file is now
    // orphaned (not referenced by any row). Best-effort cleanup: this is a
    // simple, low-risk delete of a file this exact request just wrote
    // (unique UUID filename, so it can never collide with or accidentally
    // remove anyone else's result), not a broader cleanup pass.
    const orphanedAbsolute = path.resolve(process.cwd(), "public", renderResult.outputVideoPath);
    await fs.rm(orphanedAbsolute, { force: true }).catch(() => {});
    return { ok: false, error: created.error };
  }

  // setActiveSequenceResult already sets status: "active" — createSequenceResult
  // above already wrote "active" directly when options.setActive is set, so
  // this call is only needed to demote any OTHER previously-active result in
  // the same sequence (the guarantee setActiveSequenceResult exists to provide).
  if (options.setActive) {
    await setActiveSequenceResult(projectId, sequenceId, created.id);
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);

  return {
    ok: true,
    resultId: created.id,
    videoPath: renderResult.outputVideoPath,
    durationSeconds: renderResult.durationSeconds,
    warnings: allWarnings,
  };
}
