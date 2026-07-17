// ---------------------------------------------------------------------------
// parseFfmpegSceneOutput.ts — SEQGEN.SPLIT.1
//
// Pure text parsing: no process spawning, no filesystem, no Date.now(). The
// detection command (see detectVideoSplits.ts's `runFfmpegSceneDetection`)
// is:
//   ffmpeg -hide_banner -i <input> \
//     -filter:v "select='gt(scene,T)',metadata=mode=print:key=lavfi.scene_score" \
//     -an -f null -
// `select` computes a per-frame "scene change" score and stores it as frame
// metadata; `metadata=mode=print` is what actually PRINTS that metadata (to
// stderr, via ffmpeg's own logging) as two lines per kept frame:
//   frame:12    pts:1024    pts_time:1.024000
//   lavfi.scene_score=0.523810
// (Plain `showinfo` alone does NOT print `lavfi.scene_score` on the bundled
// ffmpeg build — confirmed against the real dev drafts — so this parser
// only recognizes the `metadata=print` pairing above, not `showinfo`'s own
// output format.)
//
// A `pts_time` line is only ever turned into a candidate once its EXACT
// paired `lavfi.scene_score` line has actually been seen — this parser
// never fabricates or substitutes a placeholder score. If the real ffmpeg
// build in use ever omits the score line for a given frame (a real,
// version-sensitive risk this ticket explicitly acknowledges), that
// candidate is returned with `score: null` rather than a fake number, so
// downstream code can distinguish "genuinely uncertain" from "computed by
// the real ffmpeg scene detector."
// ---------------------------------------------------------------------------

export type SceneCandidate = {
  timestampSeconds: number;
  /** The real `lavfi.scene_score` FFmpeg reported for this frame, or `null` if no score line followed this frame's `pts_time` line before the next one (or end of input) — NEVER a substituted/fabricated value. */
  score: number | null;
};

const PTS_TIME_RE = /pts_time:\s*(-?\d+(?:\.\d+)?)/;
const SCENE_SCORE_RE = /lavfi\.scene_score\s*[=:]\s*(-?\d+(?:\.\d+)?)/;

/**
 * Parses raw ffmpeg stderr text into scene-cut candidates, in the order
 * they appear. Malformed/empty input returns an empty array, never throws.
 */
export function parseFfmpegSceneOutput(stderrText: string): SceneCandidate[] {
  if (typeof stderrText !== "string" || stderrText.trim() === "") return [];

  const lines = stderrText.split(/\r?\n/);
  const candidates: SceneCandidate[] = [];
  let pendingTimestamp: number | null = null;

  const flushPending = (score: number | null) => {
    if (pendingTimestamp === null) return;
    if (Number.isFinite(pendingTimestamp) && pendingTimestamp >= 0) {
      candidates.push({ timestampSeconds: pendingTimestamp, score });
    }
    pendingTimestamp = null;
  };

  for (const line of lines) {
    const ptsMatch = line.match(PTS_TIME_RE);
    if (ptsMatch) {
      // A new pts_time line starts before the previous one ever got a
      // score line — flush it as score: null (never a fabricated number).
      flushPending(null);
      pendingTimestamp = parseFloat(ptsMatch[1]);
      continue;
    }
    const scoreMatch = line.match(SCENE_SCORE_RE);
    if (scoreMatch && pendingTimestamp !== null) {
      flushPending(parseFloat(scoreMatch[1]));
    }
  }
  flushPending(null);

  return candidates;
}
