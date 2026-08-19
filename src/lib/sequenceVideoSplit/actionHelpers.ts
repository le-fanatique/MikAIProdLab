// ---------------------------------------------------------------------------
// sequenceVideoSplit/actionHelpers.ts — SEQGEN.SPLIT.1
//
// Pure helpers shared by the sequence-video-split Server Actions (split from
// the former `src/actions/sequenceVideoSplit.ts` by IND.SPLIT.1): redirect-
// target constructors, the FPS resolver, the orderIndex renumberer, and the
// foreign-key error predicate. No DB/filesystem access.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { parseFrameRateModeFromParamsJson } from "@/lib/sequenceVideoSplit/detectVideoSplits";

/**
 * SEQGEN.SPLIT.MINFRAMES.1 — the run's own FPS, but only when explicitly
 * proven CFR via `paramsJson.frameRateMode` (never `run.sourceFps` alone,
 * which is only meaningfully non-null for CFR sources by construction but
 * is re-verified here anyway — mirrors the same authoritative re-check
 * `splitSegmentAtFrame` already performed before this ticket). Every
 * frame-exact code path in this file derives its FPS through this one
 * function, never `run.sourceFps` directly.
 */
export function resolveRunFps(run: { sourceFps: number | null; paramsJson: string | null }): number | null {
  return parseFrameRateModeFromParamsJson(run.paramsJson) === "cfr" ? run.sourceFps : null;
}

export function errRedirectTo(returnTo: string, param: string, msg: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${encodeURIComponent(msg)}`);
}

/**
 * `warning`, when present, is a non-fatal problem that happened alongside an
 * otherwise-successful action (e.g. an orphaned thumbnail failed to delete
 * after a Merge) — appended as its own query param so the review page can
 * show it distinctly from the primary success feedback, never silently
 * dropped.
 */
export function okRedirectTo(returnTo: string, param: string, warning?: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  let url = `${returnTo}${sep}${param}=1`;
  if (warning) url += `&splitWarning=${encodeURIComponent(warning)}`;
  redirect(url);
}

export function cleanupRedirectTo(returnTo: string, message: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}splitCleanupMessage=${encodeURIComponent(message)}`);
}

/**
 * REVISE (SEQGEN.SPLIT.CLEANUP.1 retake, `FB-20260719-002`) — dedicated to
 * the two Split actions only (`okRedirectTo`'s existing signature/behavior
 * is untouched for every other caller). Carries the server-certain
 * `newSegmentId` (from `performSplitAtSeconds`'s own `.returning()`) so the
 * client can select and seek to the exact newly-inserted second half —
 * never guessing it client-side via a float `startSeconds` match or "the
 * last segment in the list."
 *
 * REVISE (FIX3) — optional `hashAnchor`: appended as a native URL fragment,
 * strictly AFTER every query param (including `splitWarning`) has already
 * been appended below — a `#fragment` is never valid before a `?query`, so
 * building it in this fixed order is the "explicitly safe" construction
 * the ticket asks for, without needing the full `URL` API for a
 * same-origin relative path. Only `splitSegmentAtFrame`'s success redirect
 * passes one — the numeric `splitSegmentAt` keeps its historical redirect
 * unchanged, and no error/refusal path ever receives or forwards a stale
 * anchor (both call `errRedirectTo`, entirely separate from this
 * function).
 *
 * REVISE (FIX4) — the anchor target moved from `"split-segment-bar"` to
 * `"split-video-player"`: user validation of FIX3 found the segment bar
 * landed the viewport too far down (at the newly-created last segment);
 * the player itself is now the native navigation target instead.
 */
export function splitOkRedirectTo(returnTo: string, newSegmentId: number, options?: { warning?: string; hashAnchor?: string }): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  let url = `${returnTo}${sep}splitEdited=1&newSegmentId=${newSegmentId}`;
  if (options?.warning) url += `&splitWarning=${encodeURIComponent(options.warning)}`;
  if (options?.hashAnchor) url += `#${options.hashAnchor}`;
  redirect(url);
}

/** Renumbers `orderIndex` 0..n-1 in-place, in-memory, for a segment list already sorted by desired order — used after Split/Merge change the segment count. */
export function renumber<T extends { orderIndex: number }>(list: T[]): T[] {
  return list.map((item, i) => ({ ...item, orderIndex: i }));
}

/** The exact, documented SQLite error for a RESTRICT foreign key violation — never inferred from a generic message match. */
export function isForeignKeyRestrictError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}
