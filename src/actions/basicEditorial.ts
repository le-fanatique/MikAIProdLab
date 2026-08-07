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
import { createSequenceResult, setActiveSequenceResult, getActiveSequenceResult } from "@/actions/sequenceResults";
import { parseVideoSourceModeStrict, type VideoSourceMode } from "@/lib/editorial/videoSourceMode";
import fs from "node:fs/promises";
import path from "node:path";

export type PublishBasicSequenceResultResult =
  | { ok: true; resultId: number; videoPath: string; durationSeconds: number; warnings: string[] }
  | { ok: false; error: string };

export async function publishBasicSequenceResult(
  projectId: number,
  sequenceId: number,
  options: { setActive?: boolean; videoSourceMode?: VideoSourceMode } = {}
): Promise<PublishBasicSequenceResultResult> {
  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 (Retake Round 1, Codex P1) — this is
  // a MUTATING entry point: an ABSENT mode is compatible (old callers,
  // resolves to approved-only), but a PRESENT, invalid value must be
  // REFUSED here, before FFmpeg/DB/render/write — never silently downgraded
  // to approved-only and published under a mode nobody asked for (that was
  // the previous `parseVideoSourceMode` lenient-fallback behavior, correct
  // for the read-only page URL but wrong for a Server Action).
  const modeResult = parseVideoSourceModeStrict(options.videoSourceMode);
  if (!modeResult.ok) {
    return { ok: false, error: "Invalid video source mode." };
  }
  const videoSourceMode = modeResult.mode;

  const ffmpegStatus = await checkFfmpegAvailability();
  if (!ffmpegStatus.ok) {
    return { ok: false, error: ffmpegStatus.error ?? "FFmpeg is not available on this server." };
  }

  let editorialState;
  try {
    editorialState = await loadEditorialDocumentForSequence(projectId, sequenceId, { videoSourceMode });
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

  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 (Retake Round 1, Codex P1) — a
  // rendered file already exists on disk at this point. A DB failure here
  // (whether `createSequenceResult` returns `ok:false` OR throws outright,
  // e.g. a raw SQLite error) must never leave that file silently orphaned
  // nor report a false success, and the PUBLIC error message must never
  // repeat a raw SQLite/path string back to the caller — logged internally
  // only, replaced by one fixed, sanitized message.
  let created;
  try {
    created = await createSequenceResult({
      projectId,
      sequenceId,
      sourceMode: "basic",
      // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 (Retake Round 2, Codex P1) —
      // ALWAYS insert as "published", never directly "active". Inserting
      // straight to "active" here (the previous behavior) opened a window
      // where the new row was already active while the OLD active row
      // hadn't been demoted yet — if the separate `setActiveSequenceResult`
      // call below then failed, BOTH could remain durably "active" at once.
      // Activation is requested explicitly, right below, through the same
      // transactional demote-then-promote `setActiveSequenceResult` every
      // other caller uses — the only code path that ever writes "active".
      status: "published",
      videoPath: renderResult.outputVideoPath,
      durationSeconds: renderResult.durationSeconds,
      cutManifest: manifest,
      editorialSnapshot,
      warnings: allWarnings,
      publishedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`publishBasicSequenceResult(${projectId}, ${sequenceId}): createSequenceResult threw`, err);
    created = { ok: false as const, error: "__threw__" };
  }

  if (!created.ok) {
    if (created.error !== "__threw__") {
      // A genuine, already-sanitized `{ok:false}` from createSequenceResult
      // itself (e.g. "Sequence not found.") — safe to surface verbatim.
      console.error(`publishBasicSequenceResult(${projectId}, ${sequenceId}): createSequenceResult returned ok:false: ${created.error}`);
    }
    const publicDbError = created.error === "__threw__" ? "Failed to save the published result." : created.error;

    // The rendered file is now orphaned (not referenced by any row).
    // Best-effort cleanup: a simple, low-risk delete of a file this exact
    // request just wrote (unique UUID filename, so it can never collide
    // with or accidentally remove anyone else's result) — but the OUTCOME
    // is checked and reported, never silently swallowed. Only the RELATIVE
    // uploads path is ever surfaced — never the absolute filesystem path.
    const orphanedAbsolute = path.resolve(process.cwd(), "public", renderResult.outputVideoPath);
    const cleanup = await fs.rm(orphanedAbsolute, { force: true }).then(
      () => ({ removed: true as const }),
      (rmErr) => ({ removed: false as const, error: rmErr instanceof Error ? rmErr.message : String(rmErr) })
    );
    if (!cleanup.removed) {
      console.error(
        `publishBasicSequenceResult(${projectId}, ${sequenceId}): failed to clean up orphaned render at "${orphanedAbsolute}": ${cleanup.error}`
      );
    }
    const orphanNote = cleanup.removed
      ? ""
      : ` The rendered file could not be cleaned up and remains, unreferenced, at "${renderResult.outputVideoPath}".`;
    return { ok: false, error: `${publicDbError}${orphanNote}` };
  }

  // The row is now durable, published — a future retry of this exact
  // publish would create a SECOND, redundant Sequence Result rather than
  // fixing anything, so from here on nothing below is ever allowed to make
  // this response look like a failure the user should retry.
  //
  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 (Retake Round 2, Codex P1) —
  // `setActiveSequenceResult` is the ONLY code path that ever promotes a
  // row to "active" (it does so transactionally, demoting any other
  // currently-active row in the same commit). Three distinct failure
  // shapes must never be conflated:
  //
  //   1. It returns `ok:false` (its own transaction never ran, or ran and
  //      found nothing to change) -> nothing durable changed: this new
  //      result stays "published", the previous active one (if any) is
  //      untouched. Warn plainly that this result is NOT active yet.
  //   2. It throws BEFORE its internal transaction commits (e.g. a raw
  //      SQLite error inside the transaction callback) -> better-sqlite3
  //      auto-rolls back, so again nothing durable changed. Same warning
  //      as case 1 — we cannot tell this apart from case 1 without
  //      re-reading, and don't need to: the durable outcome is identical.
  //   3. It throws AFTER its internal transaction has already committed
  //      (e.g. during the non-transactional Film Result invalidation, or
  //      Next's `revalidatePath`, that both run after the commit) -> the
  //      promote/demote DID happen durably. Blindly warning "activation
  //      failed" here would be a LIE — the result IS active. The only way
  //      to tell cases 2 and 3 apart after a throw is to re-read the
  //      durable state, never to guess from the shape of the error.
  if (options.setActive) {
    let activationWarning: string | null = null;
    try {
      const activation = await setActiveSequenceResult(projectId, sequenceId, created.id);
      if (!activation.ok) {
        activationWarning = `Published successfully as a non-active result; activation was refused (${activation.error}). Open the Sequence page and activate it manually if needed.`;
      }
    } catch (err) {
      console.error(`publishBasicSequenceResult(${projectId}, ${sequenceId}): setActiveSequenceResult threw`, err);
      let reconciledActiveId: number | null = null;
      try {
        const reconciled = await getActiveSequenceResult(projectId, sequenceId);
        reconciledActiveId = reconciled?.id ?? null;
      } catch (readErr) {
        console.error(
          `publishBasicSequenceResult(${projectId}, ${sequenceId}): failed to reconcile activation state after throw`,
          readErr
        );
      }
      activationWarning =
        reconciledActiveId === created.id
          ? "Published and activated successfully, but a follow-up step (Film Result invalidation) failed unexpectedly. Open the project's Film Result, if any, and re-check it."
          : "Published successfully as a non-active result; activating it (and demoting the previous one) failed unexpectedly. Open the Sequence page and activate it manually if needed.";
    }
    if (activationWarning) allWarnings.push(activationWarning);
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
