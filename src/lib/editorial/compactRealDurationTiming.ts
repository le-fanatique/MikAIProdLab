// ---------------------------------------------------------------------------
// Compact real-duration timing (EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1)
//
// Pure, no DB access. Recomputes startSeconds/durationSeconds for every
// shot-backed editorial item under "latest-generation" mode so the exported
// timeline represents the REAL, decodable duration of each resolved video —
// never the planned production duration of the Shot.
//
// Rules (Product Decision):
//   - Real duration comes exclusively from `ResolvedShotSource.durationSeconds`
//     (a durable, probed value — see that field's own doc comment). A
//     missing/non-finite/non-positive value is never guessed or substituted
//     with the planned duration.
//   - An item whose resolved source has no valid real duration is refused/
//     omitted from the compact timeline, with a bounded, visible diagnostic
//     — it is never "stretched" to fill its planned slot.
//   - Codex Retake P1: a candidate with `durationSeconds` set but
//     `videoPath: null` (verifyResolvedSource downgraded it — missing file,
//     cross-owner confinement failure) is NOT playable and must be omitted
//     exactly like a missing duration. A duration alone is not "eligible to
//     occupy compact time" — see videoSourceModeShared.ts's own
//     `durationSeconds` doc comment, which never promised `videoPath`
//     validity on its own.
//   - Codex Retake P1: the compact duration assigned to an item never
//     exceeds the REAL playable span of its resolved source. When the
//     editorial item carries a valid trim (`trimInSeconds`/`trimOutSeconds`),
//     the compact duration is the trim clamped to `[0, durationSeconds]` —
//     never the raw trim width, which could otherwise exceed real media if
//     the trim was authored against a different (longer) take than the one
//     Latest generation resolves. A trim that clamps to an empty or
//     negative span is refused/omitted, never silently widened back to the
//     planned duration.
//   - Positions are recomputed compactly (no gaps) in EXISTING editorial
//     order, per track — items are never reordered, and multiple tracks are
//     each compacted independently (no cross-track merge).
//   - This function never touches `EditorialDocument` itself (the planned/
//     production document stays untouched — see editorialSnapshot.ts, which
//     must keep fingerprinting the PLANNED document regardless of this
//     module's output).
// ---------------------------------------------------------------------------

import type { EditorialDocument } from "./editorialDocument";
import type { ResolvedShotSource } from "./videoSourceModeShared";

export type CompactItemPosition = {
  startSeconds: number;
  durationSeconds: number;
};

// EDITORIAL.APPROVED.REAL.DURATIONS.1 (Codex retake, P1) — `timingWarnings`
// crosses a trust boundary: it is serialized into the export JSON and
// parsed by the OpenReel sidecar candidate
// (`apps/web/src/integrations/mikai/mikaiToOpenReelProject.ts`'s
// `assertValidMikaiExport`), which must reject an out-of-bound array
// before it is ever loaded into the browser. An anomalously large
// editorial document (many omitted items) must never produce an
// unbounded warnings array. These two numbers are the shared contract —
// duplicated (not imported) on the sidecar side, matching this codebase's
// existing convention for small cross-repo constants (see
// `videoSourceModeShared.ts`'s own root-path duplication comment); keep
// both sides in sync by hand if either number ever changes.
export const MAX_TIMING_WARNINGS = 50;
export const MAX_TIMING_WARNING_MESSAGE_LENGTH = 300;

export type CompactRealDurationResult = {
  /** Keyed by editorial item id (sequence_editorial_items.id). An item absent from this map has no valid real duration and must be omitted from a compact export. */
  positions: Map<number, CompactItemPosition>;
  /**
   * Bounded, human-readable diagnostics — at most `MAX_TIMING_WARNINGS`
   * entries, each at most `MAX_TIMING_WARNING_MESSAGE_LENGTH` characters
   * (see those constants' own doc comment). When more items are omitted
   * than fit individually, the LAST entry is a synthesis message counting
   * the remainder — never a silently truncated (i.e. incomplete-looking)
   * list with no indication more was omitted. Never thrown; the caller
   * decides how to surface these.
   */
  warnings: string[];
  /** Per-track compact total (sum of included items' durations) — the compact analogue of EditorialDocument.tracks[].durationSeconds. */
  trackDurationsSeconds: Map<number, number>;
};

function isValidRealDuration(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Exported only so the length bound itself is directly unit-testable — every real call site inside this module goes through `BoundedWarningCollector.add`, never this function on its own. */
export function truncateWarningMessage(message: string): string {
  return message.length > MAX_TIMING_WARNING_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_TIMING_WARNING_MESSAGE_LENGTH - 1)}…`
    : message;
}

/**
 * Bounded warning collector — reserves the LAST of `MAX_TIMING_WARNINGS`
 * slots for a synthesis message when more items are omitted than fit
 * individually, so the array length never exceeds the shared contract
 * regardless of how many items an editorial document actually omits.
 */
class BoundedWarningCollector {
  private readonly individual: string[] = [];
  private omittedCount = 0;

  add(message: string): void {
    this.omittedCount++;
    if (this.individual.length < MAX_TIMING_WARNINGS - 1) {
      this.individual.push(truncateWarningMessage(message));
    }
  }

  toArray(): string[] {
    const overflow = this.omittedCount - this.individual.length;
    if (overflow <= 0) return this.individual;
    return [...this.individual, `${overflow} more item(s) omitted from the compact timeline — full list truncated.`];
  }
}

/**
 * Computes compact, real-duration positions for every shot-backed item in
 * `document`, keyed by editorial item id. `videoSources` must be the SAME
 * map (shotId -> ResolvedShotSource) the caller resolved under
 * "latest-generation" mode — this function trusts `durationSeconds` on it
 * verbatim, without re-deriving or re-fetching anything.
 *
 * Gap items are never part of this result (they are never exported as
 * items either — see editorialExport.ts's own filter) — they simply don't
 * consume compact space, which is the correct "trou audité, jamais
 * réordonné silencieusement" behavior: the items that follow a gap keep
 * their existing relative order, just compacted forward.
 */
export function computeCompactRealDurationPositions(
  document: EditorialDocument,
  videoSources: ReadonlyMap<number, ResolvedShotSource>
): CompactRealDurationResult {
  const positions = new Map<number, CompactItemPosition>();
  const warnings = new BoundedWarningCollector();
  const trackDurationsSeconds = new Map<number, number>();

  for (const track of document.tracks) {
    let cursor = 0;

    for (const item of track.items) {
      if (item.sourceType !== "shot" || item.shotId === null) continue;

      const resolved = videoSources.get(item.shotId);

      // Codex Retake P1 — a rejected/unverified candidate (missing file,
      // confinement failure) is not playable regardless of what duration it
      // carries. Only a source with BOTH a verified, non-null `videoPath`
      // AND a valid real duration may occupy compact time.
      if (!resolved || resolved.videoPath === null) {
        warnings.add(`Item ${item.id} (shot ${item.shotId}) has no verified, playable media file — omitted from the compact timeline.`);
        continue;
      }

      const realDuration = resolved.durationSeconds;
      if (!isValidRealDuration(realDuration)) {
        warnings.add(`Item ${item.id} (shot ${item.shotId}) has no valid real media duration — omitted from the compact timeline.`);
        continue;
      }

      // Codex Retake P1 — never let a trim make the compact duration exceed
      // the real playable source span. Clamp to [0, realDuration] before
      // computing the trimmed width; a trim that clamps to an empty/negative
      // span means the requested trim doesn't actually land inside what the
      // resolved source provides — omit honestly rather than fall back to
      // the planned duration or the raw (possibly too-wide) trim.
      let playableDuration = realDuration;
      if (item.trimIn !== undefined && item.trimOut !== undefined) {
        const clampedTrimIn = Math.max(0, Math.min(item.trimIn, realDuration));
        const clampedTrimOut = Math.max(0, Math.min(item.trimOut, realDuration));
        const trimmedSpan = clampedTrimOut - clampedTrimIn;
        if (!(trimmedSpan > 0)) {
          warnings.add(
            `Item ${item.id} (shot ${item.shotId}) has a trim range (${item.trimIn}-${item.trimOut}s) outside the real media span (${realDuration.toFixed(3)}s) — omitted from the compact timeline.`
          );
          continue;
        }
        playableDuration = trimmedSpan;
      }

      positions.set(item.id, { startSeconds: cursor, durationSeconds: playableDuration });
      cursor += playableDuration;
    }

    trackDurationsSeconds.set(track.id, cursor);
  }

  return { positions, warnings: warnings.toArray(), trackDurationsSeconds };
}
