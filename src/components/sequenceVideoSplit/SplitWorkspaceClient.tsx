"use client";

// ---------------------------------------------------------------------------
// SplitWorkspaceClient.tsx — SEQGEN.SPLIT.WORKSPACE.1 (Lots A/B/C)
//
// Client coordinator for the unified Split workspace: owns the
// VideoFrameReviewPlayer ref + current frame/fps state (via its additive,
// optional `onFrameChange`/imperative-handle API — see
// VideoFrameReviewPlayer.tsx's own doc comments for why that extension was
// necessary), segment selection (click a segment -> seek the player to its
// start, no page navigation), the frame/timecode/segment-frame-range
// display, "Split at Current Frame", and the collapsible "Refine Detection
// in This Segment" panel. Every mutating form still posts directly to a
// real Server Action (progressive-enhancement preserved) — this component
// only adds client-side coordination on top, it does not reimplement any
// validation itself (the server actions remain the sole source of truth
// and re-validate everything).
// ---------------------------------------------------------------------------

import { useRef, useState, useCallback, useEffect } from "react";
import VideoFrameReviewPlayer, { type VideoFrameReviewPlayerHandle } from "@/components/VideoFrameReviewPlayer";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { refImageUrl } from "@/lib/refImageUrl";
import { formatTimecode, secondsToFrame, isReliableFps } from "@/lib/sequenceVideoSplit/frameTime";
import {
  MIN_SCENE_THRESHOLD,
  MAX_SCENE_THRESHOLD,
  MIN_MIN_SEGMENT_DURATION,
  MAX_MIN_SEGMENT_DURATION,
  DEFAULT_SCENE_THRESHOLD,
} from "@/lib/sequenceVideoSplit/detectionParams";
import {
  adjustSegmentBoundary,
  splitSegmentAt,
  splitSegmentAtFrame,
  mergeSegment,
  skipSegment,
  restoreSegment,
  reassignSegmentShot,
  assignAllSegments,
  validateSplitPlan,
  detectSplitsInSegment,
} from "@/actions/sequenceVideoSplit";

export type SplitSegmentDTO = {
  id: number;
  orderIndex: number;
  startSeconds: number;
  endSeconds: number;
  confidence: number | null;
  boundaryProvenance: string;
  status: string;
  thumbnailPath: string | null;
  targetShotId: number | null;
};

export type SplitShotDTO = {
  id: number;
  shotCode: string | null;
  title: string;
};

type Props = {
  runId: number;
  sequenceId: number;
  projectId: number;
  videoUrl: string;
  sourceFps: number | null;
  /**
   * REVISE (round 2, finding 2) — explicit, server-parsed proof of a
   * constant frame rate (via `parseFrameRateModeFromParamsJson`). `sourceFps`
   * being a plausible number is NOT by itself sufficient to promise
   * frame-exact behavior: a run persisted before this marker existed, or
   * whose source was later found to be VFR, must still be treated
   * conservatively. Frame-exact splitting requires `frameRateMode ===
   * "cfr"` AND a numerically reliable `sourceFps` — both, always.
   */
  frameRateMode: "cfr" | "vfr" | "unknown";
  sourceDurationSeconds: number;
  segments: SplitSegmentDTO[];
  shots: SplitShotDTO[];
  isEditable: boolean;
  returnTo: string;
  /**
   * SEQGEN.SPLIT.CLEANUP.1 retake (`FB-20260719-002`) — the exact id of the
   * segment the server just inserted via "Split at Current Frame" (or the
   * numeric Split control), read from the redirect URL by the page and
   * passed straight through. `null` on a normal page load (no split just
   * happened). Never re-derived from `startSeconds`/order — see the effect
   * below.
   */
  newSegmentId: number | null;
};

/**
 * SEQGEN.SPLIT.CLEANUP.1-FIX2 — persisted "Player size" preference. SSR and
 * the very first client render must always agree on `DEFAULT_PLAYER_SIZE_PCT`
 * (see the `useState` initializer below, which never reads `localStorage`
 * synchronously) — the stored value, if any, is only applied from a
 * post-mount `useEffect`, so no hydration mismatch is ever introduced.
 */
const PLAYER_SIZE_STORAGE_KEY = "splitWorkspacePlayerSizePct";
const MIN_PLAYER_SIZE_PCT = 40;
const MAX_PLAYER_SIZE_PCT = 100;
const DEFAULT_PLAYER_SIZE_PCT = 50;

function clampPlayerSizePct(value: number): number {
  return Math.min(MAX_PLAYER_SIZE_PCT, Math.max(MIN_PLAYER_SIZE_PCT, value));
}

function fmtSeconds(n: number): string {
  return n.toFixed(2);
}

function provenanceLabel(p: string): string {
  switch (p) {
    case "scene":
      return "Scene detection";
    case "manual":
      return "Manual edit";
    default:
      return "Timing fallback";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "mapped":
      return "text-[#6b9e72] border-[#2a3d2e]";
    case "skipped":
      return "text-[#4b5158] border-[#232629]";
    default:
      return "text-[#c9a24b] border-[#3d3320]";
  }
}

export default function SplitWorkspaceClient({
  runId,
  sequenceId,
  projectId,
  videoUrl,
  sourceFps,
  frameRateMode,
  sourceDurationSeconds,
  segments,
  shots,
  isEditable,
  returnTo,
  newSegmentId,
}: Props) {
  const playerRef = useRef<VideoFrameReviewPlayerHandle>(null);
  const [frameInfo, setFrameInfo] = useState<{ frame: number; totalFrames: number; fps: number; currentTimeSeconds: number } | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(
    newSegmentId !== null && segments.some((s) => s.id === newSegmentId) ? newSegmentId : (segments[0]?.id ?? null)
  );
  const [refineOpenForId, setRefineOpenForId] = useState<number | null>(null);
  // SEQGEN.SPLIT.CLEANUP.1-FIX2 — always `DEFAULT_PLAYER_SIZE_PCT` on the
  // server AND on the very first client render (this initializer never
  // touches `localStorage`) — a stored preference is only ever applied
  // afterward, from the dedicated mount effect below, so hydration can
  // never mismatch.
  const [playerSizePct, setPlayerSizePct] = useState<number>(DEFAULT_PLAYER_SIZE_PCT);

  // Reads the persisted preference once, after mount (client-only). A
  // missing/corrupted/out-of-range stored value is a clean no-op — the SSR
  // default stays in effect rather than risking an invalid layout.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYER_SIZE_STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= MIN_PLAYER_SIZE_PCT && parsed <= MAX_PLAYER_SIZE_PCT) {
          setPlayerSizePct(parsed);
        }
      }
    } catch {
      // localStorage unavailable (privacy mode, etc.) — the default simply stays in effect.
    }
  }, []);

  const handlePlayerSizeChange = useCallback((raw: string) => {
    const value = clampPlayerSizePct(Number(raw));
    setPlayerSizePct(value);
    try {
      localStorage.setItem(PLAYER_SIZE_STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable — the choice simply isn't persisted for next time.
    }
  }, []);
  // REVISE (round 4, Codex finding 2) — `VideoFrameReviewPlayer.seekToFrame`
  // is a no-op until its internal `hasMetadataRef`/`totalFramesRef` are
  // ready (i.e. until it has fired at least one `onFrameChange`, which is
  // exactly this component's own `frameInfo` becoming non-null). A seek
  // attempted before that point is silently dropped, never retried. This
  // holds the exact segment id that still needs to be seeked-to once the
  // player IS ready — `null` means "nothing pending."
  const [pendingSeekSegmentId, setPendingSeekSegmentId] = useState<number | null>(null);

  const handleSelectSegment = useCallback(
    (seg: SplitSegmentDTO) => {
      setSelectedSegmentId(seg.id);
      const fps = frameInfo?.fps ?? sourceFps ?? 24;
      playerRef.current?.seekToFrame(secondsToFrame(seg.startSeconds, fps));
    },
    [frameInfo?.fps, sourceFps]
  );

  // SEQGEN.SPLIT.CLEANUP.1 retake (`FB-20260719-002`) — selects the exact
  // new second half by its server-provided id ONLY (never "last in list"
  // or a float `startSeconds` match), and arms the pending seek below
  // rather than seeking immediately — the player may not be ready yet. The
  // App Router can keep this component instance alive across a same-route
  // redirect (only props change, no full remount), so this cannot be a
  // mount-only effect — it must re-run every time `newSegmentId` itself
  // changes, including the very first render if the URL already carries
  // one (e.g. a direct reload). A `null`/stale id (absent from the current
  // `segments`) is a clean no-op.
  //
  // REVISE (FIX2) — this effect used to also capture/restore a DOM-anchor-
  // based scroll position (FIX1). That mechanism failed real-browser
  // validation twice and has been removed entirely (per `FB-20260719-002`
  // and the FIX2 ticket): this workspace no longer attempts to restore
  // scroll at all. Instead the Frame/Split bandeau now renders directly
  // above the player (see the JSX below) so it stays reachable regardless
  // of wherever the browser's own navigation leaves the scroll position.
  useEffect(() => {
    if (newSegmentId === null) return;
    const seg = segments.find((s) => s.id === newSegmentId);
    if (seg) {
      setSelectedSegmentId(seg.id);
      setPendingSeekSegmentId(seg.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newSegmentId]);

  // REVISE (round 4, Codex finding 2) — consumes `pendingSeekSegmentId`
  // exactly once, only once `frameInfo` is actually available (proof the
  // player's metadata is loaded and `seekToFrame` will not be a no-op).
  // Covers BOTH required cases: if the player is already ready at the
  // moment `pendingSeekSegmentId` is armed (App-Router same-instance
  // navigation), this effect re-runs immediately because its OWN
  // dependency (`pendingSeekSegmentId`) just changed, and `frameInfo` is
  // already truthy — seeks right away. If the player is NOT ready yet
  // (remount / slow metadata load), this effect first no-ops (`frameInfo`
  // still `null`) and naturally re-runs later when `frameInfo` itself
  // transitions to non-null. Either way `pendingSeekSegmentId` is cleared
  // immediately after the seek, so subsequent `frameInfo` updates during
  // normal playback (which fire continuously) never re-trigger a seek.
  useEffect(() => {
    if (pendingSeekSegmentId === null || !frameInfo) return;
    const seg = segments.find((s) => s.id === pendingSeekSegmentId);
    if (seg) {
      playerRef.current?.seekToFrame(secondsToFrame(seg.startSeconds, frameInfo.fps));
    }
    setPendingSeekSegmentId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSeekSegmentId, frameInfo]);

  // "Split at Current Frame" (and every frame/timecode display projected
  // from the source) is only ever available when BOTH a numerically
  // reliable `sourceFps` AND an explicit, server-verified `frameRateMode
  // === "cfr"` hold — see this component's own `Props` doc comment for why
  // `sourceFps` alone is not sufficient (legacy runs / runs whose source
  // was later proven VFR must never silently qualify).
  const frameSplitAvailable = isReliableFps(sourceFps) && frameRateMode === "cfr";

  const shotById = new Map(shots.map((s) => [s.id, s]));
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId) ?? null;
  const selectedSegmentFrameRange =
    selectedSegment && frameSplitAvailable
      ? { start: secondsToFrame(selectedSegment.startSeconds, sourceFps as number), end: secondsToFrame(selectedSegment.endSeconds, sourceFps as number) - 1 }
      : null;

  // REVISE (round 2, finding 1) — `frameInfo.frame` is the player's own
  // DISPLAY-fps-QUANTIZED frame number (e.g. at 1.02s real time and a 30fps
  // display selection, `frameInfo.frame` is already rounded to frame 31 —
  // `frameInfo.frame / frameInfo.fps` would only recover that ALREADY-
  // ROUNDED value, 1.0333s, not the true 1.02s). `frameInfo.currentTimeSeconds`
  // is the raw, never-quantized `HTMLVideoElement.currentTime` at that same
  // moment — THIS is what gets re-quantized against the run's own
  // snapshotted `sourceFps`, so the result is independent of whatever
  // display fps the user last picked in the player's own FPS selector.
  const rawCurrentTimeSeconds = frameInfo?.currentTimeSeconds ?? null;
  const sourceFrame = rawCurrentTimeSeconds !== null && frameSplitAvailable ? secondsToFrame(rawCurrentTimeSeconds, sourceFps as number) : null;
  // Displayed frame counter/timecode are likewise a projection of
  // `sourceFps` (per the ticket's own definition), never the player's
  // display fps — computed from the same raw `rawCurrentTimeSeconds`.
  const sourceTotalFrames = frameSplitAvailable ? secondsToFrame(sourceDurationSeconds, sourceFps as number) : null;

  return (
    <div className="flex flex-col gap-4">
      {/*
        SEQGEN.SPLIT.CLEANUP.1-FIX2 — "Player size" control: a compact
        `input type="range"` (40–100%, default 50%) plus the current
        percentage. Persisted defensively in `localStorage` (see
        `handlePlayerSizeChange`/the mount effect above) — never affects
        the video itself, its FPS, the current frame, or the selection.
      */}
      <div className="flex items-center gap-2 text-[10px] text-[#6e767d]">
        <label htmlFor="split-player-size" className="text-[#4b5158]">
          Player size
        </label>
        <input
          id="split-player-size"
          type="range"
          min={MIN_PLAYER_SIZE_PCT}
          max={MAX_PLAYER_SIZE_PCT}
          step={1}
          value={playerSizePct}
          onChange={(e) => handlePlayerSizeChange(e.target.value)}
          className="w-32 accent-[#5b93d6]"
        />
        <span className="font-mono text-[#a4abb2] w-9 text-right">{playerSizePct}%</span>
      </div>

      {/*
        Centered horizontally, width driven by the persisted percentage,
        but never exceeding its parent's width (`max-w-full`) and never
        collapsing below an ergonomic floor on small viewports (CSS
        `min()` — pure CSS, no JS viewport measurement/resize listener
        needed, and it's inherently bounded by `100%` on its own).
      */}
      {/*
        SEQGEN.SPLIT.CLEANUP.1-FIX4 — `id="split-video-player"` is now the
        landing target for the native URL fragment appended server-side
        (`splitOkRedirectTo` in `sequenceVideoSplit.ts`) only to "Split at
        Current Frame"'s success redirect — placed on this resizable
        OUTER container (not the inner `<video>` tag, not the shared
        `VideoFrameReviewPlayer` component itself), so navigating to the
        fragment lands on the player regardless of its current FIX2 size.
        FIX3 had this same role on the segment bar below, but user
        validation found that landed the viewport too far down (at the
        newly-created last segment) — the player is now the target
        instead. No `scrollIntoView`/`requestAnimationFrame`/
        `sessionStorage`/`scrollTo` — the browser's own fragment
        navigation handles this entirely.
      */}
      <div id="split-video-player" className="mx-auto w-full max-w-full" style={{ width: `${playerSizePct}%`, minWidth: "min(240px, 100%)" }}>
        <VideoFrameReviewPlayer
          ref={playerRef}
          src={videoUrl}
          projectId={projectId}
          captureDestinations={[]}
          defaultFps={isReliableFps(sourceFps) ? sourceFps : 24}
          onFrameChange={setFrameInfo}
        />
      </div>

      {/*
        SEQGEN.SPLIT.CLEANUP.1-FIX3 — moved back BELOW the player, its
        original position before FIX2. All text, disabled states, titles
        and hidden fields are unchanged from before.
      */}
      <div className="flex items-center justify-between gap-4 flex-wrap rounded border border-[#2c3035] bg-[#141618] px-3 py-2">
        <div className="flex items-center gap-4 flex-wrap text-xs">
          {frameSplitAvailable && sourceFrame !== null && sourceTotalFrames !== null ? (
            <>
              <span className="font-mono text-[#a4abb2]">
                Frame {sourceFrame} / {sourceTotalFrames}
              </span>
              <span className="font-mono text-[#6e767d]">{formatTimecode(sourceFrame, sourceFps as number)}</span>
            </>
          ) : (
            <span className="font-mono text-[#4b5158]">Frame — / — (no proven constant frame rate for this run)</span>
          )}
          <span className="text-[#6e767d]">{rawCurrentTimeSeconds !== null ? fmtSeconds(rawCurrentTimeSeconds) : "—"}s</span>
          {selectedSegment && selectedSegmentFrameRange && (
            <span className="text-[#4b5158]">
              Selected segment frames [{selectedSegmentFrameRange.start}–{selectedSegmentFrameRange.end}]
            </span>
          )}
          {selectedSegment && !frameSplitAvailable && (
            <span className="text-[#4b5158]">
              Selected: {fmtSeconds(selectedSegment.startSeconds)}s–{fmtSeconds(selectedSegment.endSeconds)}s
            </span>
          )}
        </div>

        {isEditable && (
          <form action={splitSegmentAtFrame} className="flex items-center gap-2">
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="sequenceId" value={sequenceId} />
            <input type="hidden" name="segmentId" value={selectedSegment?.id ?? ""} />
            <input type="hidden" name="frame" value={sourceFrame ?? 0} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              disabled={!selectedSegment || sourceFrame === null}
              title={
                !frameSplitAvailable
                  ? "This run has no reliable FPS for the source video — frame-exact splitting is not available. Use the numeric Split control on a segment instead."
                  : !selectedSegment
                    ? "Select a segment first."
                    : undefined
              }
              className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Split at Current Frame
            </button>
          </form>
        )}
      </div>

      {!frameSplitAvailable && (
        <p className="text-[10px] text-[#c9a24b]">
          This source has no reliable constant frame rate (VFR or unprobed) — frame-exact splitting/timecodes are not promised; seconds
          timestamps remain the reference for this run.
        </p>
      )}

      {/*
        SEQGEN.SPLIT.CLEANUP.1-FIX4 — no longer a fragment-navigation
        target: FIX3 anchored here (`id="split-segment-bar"`), but user
        validation found it landed the viewport too far down. The anchor
        now lives on the player container above (`id="split-video-player"`)
        — this bar is a plain segment timeline again.
      */}
      <div className="flex h-8 w-full rounded overflow-hidden border border-[#2c3035]">
        {segments.map((s) => {
          const widthPct = sourceDurationSeconds > 0 ? ((s.endSeconds - s.startSeconds) / sourceDurationSeconds) * 100 : 0;
          const bg = s.status === "skipped" ? "bg-[#232629]" : s.status === "mapped" ? "bg-[#2a3d2e]" : "bg-[#3d3320]";
          const isSelected = s.id === selectedSegmentId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelectSegment(s)}
              className={`${bg} ${isSelected ? "ring-1 ring-inset ring-[#5b93d6]" : ""} border-r border-[#0d0e10] flex items-center justify-center text-[9px] text-[#a4abb2] overflow-hidden shrink-0 cursor-pointer hover:brightness-125`}
              style={{ width: `${widthPct}%` }}
              title={`#${s.orderIndex + 1}: ${fmtSeconds(s.startSeconds)}s–${fmtSeconds(s.endSeconds)}s`}
            >
              {s.orderIndex + 1}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        {segments.map((s, i) => {
          const targetShot = s.targetShotId !== null ? shotById.get(s.targetShotId) : null;
          const isSelected = s.id === selectedSegmentId;
          const isRefineOpen = refineOpenForId === s.id;
          return (
            <div
              key={s.id}
              className={`rounded-lg border p-4 ${isSelected ? "border-[#5b93d6]/60 bg-[#161b20]" : "border-[#2c3035] bg-[#1a1d20]"}`}
            >
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => handleSelectSegment(s)}
                  className="relative w-28 aspect-video bg-[#0d0e10] shrink-0 overflow-hidden rounded cursor-pointer"
                  title="Select this segment and seek the player to its start"
                >
                  {s.thumbnailPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={refImageUrl(s.thumbnailPath)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-[#4b5158]">No thumbnail</div>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSelectSegment(s)}
                      className={`text-sm ${isSelected ? "text-[#8fbbe8]" : "text-[#e7e9ec]"} hover:text-[#8fbbe8] cursor-pointer`}
                    >
                      Segment #{s.orderIndex + 1}
                    </button>
                    <span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px ${statusBadgeClass(s.status)}`}>{s.status}</span>
                    <span className="text-[10px] text-[#4b5158]">{provenanceLabel(s.boundaryProvenance)}</span>
                    {s.confidence !== null && <span className="text-[10px] text-[#4b5158]">confidence {s.confidence.toFixed(2)}</span>}
                  </div>
                  <p className="text-[10px] text-[#6e767d] mb-2">
                    {fmtSeconds(s.startSeconds)}s → {fmtSeconds(s.endSeconds)}s ({fmtSeconds(s.endSeconds - s.startSeconds)}s)
                    {frameSplitAvailable && (
                      <>
                        {" "}
                        — frames [{secondsToFrame(s.startSeconds, sourceFps as number)}–{secondsToFrame(s.endSeconds, sourceFps as number) - 1}]
                      </>
                    )}
                    {targetShot && (
                      <>
                        {" "}
                        — target: {targetShot.shotCode ? `${targetShot.shotCode} ` : ""}
                        {targetShot.title}
                      </>
                    )}
                  </p>

                  {isEditable && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <form action={adjustSegmentBoundary} className="flex items-center gap-1">
                          <input type="hidden" name="runId" value={runId} />
                          <input type="hidden" name="sequenceId" value={sequenceId} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="field" value="start" />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <label className="text-[10px] text-[#4b5158]">Start</label>
                          <input
                            type="number"
                            step="any"
                            name="valueSeconds"
                            defaultValue={s.startSeconds}
                            disabled={i === 0}
                            className="w-20 bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec] disabled:opacity-40"
                          />
                          <button
                            type="submit"
                            disabled={i === 0}
                            className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] disabled:text-[#4b5158] disabled:cursor-not-allowed"
                          >
                            Set
                          </button>
                        </form>

                        <form action={adjustSegmentBoundary} className="flex items-center gap-1">
                          <input type="hidden" name="runId" value={runId} />
                          <input type="hidden" name="sequenceId" value={sequenceId} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="field" value="end" />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <label className="text-[10px] text-[#4b5158]">End</label>
                          <input
                            type="number"
                            step="any"
                            name="valueSeconds"
                            defaultValue={s.endSeconds}
                            disabled={i === segments.length - 1}
                            className="w-20 bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec] disabled:opacity-40"
                          />
                          <button
                            type="submit"
                            disabled={i === segments.length - 1}
                            className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] disabled:text-[#4b5158] disabled:cursor-not-allowed"
                          >
                            Set
                          </button>
                        </form>

                        <form action={splitSegmentAt} className="flex items-center gap-1">
                          <input type="hidden" name="runId" value={runId} />
                          <input type="hidden" name="sequenceId" value={sequenceId} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <label className="text-[10px] text-[#4b5158]">Split at</label>
                          <input
                            type="number"
                            step="any"
                            name="splitAtSeconds"
                            placeholder={fmtSeconds((s.startSeconds + s.endSeconds) / 2)}
                            className="w-20 bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec]"
                          />
                          <button type="submit" className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8]">
                            Split
                          </button>
                        </form>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {i > 0 && (
                          <form action={mergeSegment}>
                            <input type="hidden" name="runId" value={runId} />
                            <input type="hidden" name="sequenceId" value={sequenceId} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="direction" value="prev" />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className="text-[10px] text-[#a4abb2] hover:text-[#e7e9ec]">
                              ← Merge with previous
                            </button>
                          </form>
                        )}
                        {i < segments.length - 1 && (
                          <form action={mergeSegment}>
                            <input type="hidden" name="runId" value={runId} />
                            <input type="hidden" name="sequenceId" value={sequenceId} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="direction" value="next" />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className="text-[10px] text-[#a4abb2] hover:text-[#e7e9ec]">
                              Merge with next →
                            </button>
                          </form>
                        )}
                        {s.status === "skipped" ? (
                          <form action={restoreSegment}>
                            <input type="hidden" name="runId" value={runId} />
                            <input type="hidden" name="sequenceId" value={sequenceId} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className="text-[10px] text-[#6b9e72] hover:text-[#8ec696]">
                              Restore
                            </button>
                          </form>
                        ) : (
                          <form action={skipSegment}>
                            <input type="hidden" name="runId" value={runId} />
                            <input type="hidden" name="sequenceId" value={sequenceId} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className="text-[10px] text-[#cf7b6b] hover:text-[#e0958a]">
                              Skip
                            </button>
                          </form>
                        )}
                        <button
                          type="button"
                          onClick={() => setRefineOpenForId(isRefineOpen ? null : s.id)}
                          className="text-[10px] text-[#a4abb2] hover:text-[#e7e9ec]"
                        >
                          {isRefineOpen ? "▾" : "▸"} Refine Detection in This Segment
                        </button>
                      </div>

                      {s.status !== "skipped" && (
                        <form action={reassignSegmentShot} className="flex items-center gap-2">
                          <input type="hidden" name="runId" value={runId} />
                          <input type="hidden" name="sequenceId" value={sequenceId} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <label className="text-[10px] text-[#4b5158]">Target Shot</label>
                          <select
                            name="targetShotId"
                            defaultValue={s.targetShotId ?? ""}
                            className="bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec]"
                          >
                            <option value="">— unassigned —</option>
                            {shots.map((shot) => (
                              <option key={shot.id} value={shot.id}>
                                {shot.shotCode ? `${shot.shotCode} — ` : ""}
                                {shot.title}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8]">
                            Assign
                          </button>
                        </form>
                      )}

                      {isRefineOpen && (
                        <form
                          action={detectSplitsInSegment}
                          className="mt-2 flex items-end gap-3 flex-wrap rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2"
                        >
                          <input type="hidden" name="runId" value={runId} />
                          <input type="hidden" name="sequenceId" value={sequenceId} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-[#4b5158]">
                              Local scene threshold ({MIN_SCENE_THRESHOLD}–{MAX_SCENE_THRESHOLD})
                            </label>
                            <input
                              type="number"
                              name="localSceneThreshold"
                              step="0.01"
                              min={MIN_SCENE_THRESHOLD}
                              max={MAX_SCENE_THRESHOLD}
                              defaultValue={DEFAULT_SCENE_THRESHOLD}
                              className="w-28 bg-[#141618] border border-[#2c3035] rounded px-2 py-1 text-xs text-[#e7e9ec]"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-[#4b5158]">
                              Local min duration ({MIN_MIN_SEGMENT_DURATION}–{MAX_MIN_SEGMENT_DURATION}s)
                            </label>
                            <input
                              type="number"
                              name="localMinSegmentDurationSeconds"
                              step="0.05"
                              min={MIN_MIN_SEGMENT_DURATION}
                              max={MAX_MIN_SEGMENT_DURATION}
                              defaultValue={MIN_MIN_SEGMENT_DURATION}
                              className="w-28 bg-[#141618] border border-[#2c3035] rounded px-2 py-1 text-xs text-[#e7e9ec]"
                            />
                          </div>
                          <button
                            type="submit"
                            className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
                          >
                            Detect Cuts in This Segment
                          </button>
                          <p className="w-full text-[10px] text-[#4b5158]">
                            Runs FFmpeg only inside this segment&apos;s own range. No other segment is reanalyzed or modified.
                          </p>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isEditable && (
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-[#232629]">
          <form action={assignAllSegments}>
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="sequenceId" value={sequenceId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Assign All
            </button>
          </form>

          <form action={validateSplitPlan}>
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="sequenceId" value={sequenceId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <ConfirmSubmitButton
              confirmMessage="Validate this Split Plan? It will become immutable — a new detection run will be required to change it afterwards."
              className="rounded border border-[#6b9e72]/50 text-[#6b9e72] px-4 py-1.5 text-sm hover:border-[#6b9e72] hover:bg-[#6b9e72]/10 transition-colors"
            >
              Validate Split Plan →
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
