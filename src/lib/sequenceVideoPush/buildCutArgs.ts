// ---------------------------------------------------------------------------
// buildCutArgs.ts — SEQGEN.PUSH.1 (Lot A)
//
// Pure: no process spawning, no filesystem, no Date.now()/randomUUID. Builds
// the exact FFmpeg argument array used to cut+reencode one Split Segment
// into a standalone clip, and the tolerance used to validate the resulting
// clip's probed duration against the segment's own bounds. Kept separate
// from the I/O-heavy `cutSegmentClip.ts` so both are independently testable
// without ever touching a real FFmpeg binary or the filesystem.
// ---------------------------------------------------------------------------

/**
 * Builds the `ffmpeg` argument array for cutting `[startSeconds, endSeconds)`
 * out of `sourceAbsolutePath` into `outputAbsolutePath`. Always reencodes
 * (never `-c copy`) — a stream-copied cut can only land on the source's own
 * keyframes, which would silently shift the segment's real boundaries away
 * from the ones the user reviewed and validated in the Split Workspace.
 * Output seeking (`-i` before `-ss`/`-to`) is used rather than input seeking
 * so the reencoded boundaries are frame-accurate rather than snapped to the
 * nearest keyframe before the cut point — these source videos are short
 * Sequence Video drafts (seconds, not hours), so the extra decode cost of
 * output seeking is negligible.
 */
export function buildCutSegmentArgs(params: {
  sourceAbsolutePath: string;
  outputAbsolutePath: string;
  startSeconds: number;
  endSeconds: number;
  hasAudio: boolean;
}): string[] {
  const { sourceAbsolutePath, outputAbsolutePath, startSeconds, endSeconds, hasAudio } = params;
  const args = [
    "-y",
    "-i",
    sourceAbsolutePath,
    "-ss",
    startSeconds.toFixed(6),
    "-to",
    endSeconds.toFixed(6),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
  ];
  if (hasAudio) {
    args.push("-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-an");
  }
  args.push("-movflags", "+faststart", "-f", "mp4", outputAbsolutePath);
  return args;
}

/**
 * The single duration-tolerance policy for a produced clip: frame-exact
 * (one source frame) when the run's FPS is reliable (mirrors
 * `roundBoundarySeconds`'s own reliable/unreliable split in
 * `frameTime.ts`), a generous fixed high-precision fallback otherwise —
 * never a frame-snap promise the source cannot actually honor for a VFR or
 * unprobed source.
 */
export function clipDurationToleranceSeconds(sourceFps: number | null | undefined): number {
  const isReliable = typeof sourceFps === "number" && Number.isFinite(sourceFps) && sourceFps >= 1 && sourceFps <= 240;
  return isReliable ? 1 / sourceFps : 0.05;
}

export type ClipDurationCheck = { ok: true } | { ok: false; error: string };

/** Validates a probed clip duration against the segment's own expected duration, within `clipDurationToleranceSeconds`. */
export function checkClipDuration(params: {
  probedDurationSeconds: number;
  expectedStartSeconds: number;
  expectedEndSeconds: number;
  sourceFps: number | null | undefined;
}): ClipDurationCheck {
  const { probedDurationSeconds, expectedStartSeconds, expectedEndSeconds, sourceFps } = params;
  const expectedDuration = expectedEndSeconds - expectedStartSeconds;
  const tolerance = clipDurationToleranceSeconds(sourceFps);
  const delta = Math.abs(probedDurationSeconds - expectedDuration);
  if (delta > tolerance) {
    return {
      ok: false,
      error: `Produced clip duration (${probedDurationSeconds.toFixed(3)}s) does not match the expected segment duration (${expectedDuration.toFixed(3)}s, tolerance ${tolerance.toFixed(3)}s).`,
    };
  }
  return { ok: true };
}
