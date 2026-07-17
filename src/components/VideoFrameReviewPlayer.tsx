"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { captureVideoFrame } from "@/actions/shotReferenceImages";

export type CaptureDestination =
  | {
      id: string;
      type: "shot";
      shotId: number;
      sequenceId: number;
      label: string;
      subtitle?: string;
      groupLabel: string;
      isCurrent?: boolean;
    }
  | {
      id: string;
      type: "asset";
      assetId: number;
      label: string;
      subtitle?: string;
      groupLabel: string;
    };

type Props = {
  src: string;
  /**
   * Optional (UX.POLISH.3): a multi-sequence aggregate like a Film Result
   * has no single source shot. Only meaningful when captureDestinations is
   * non-empty — the capture section (and therefore any code path that
   * reads these) is not rendered at all otherwise.
   */
  shotId?: number;
  sequenceId?: number;
  projectId: number;
  defaultFps?: number;
  captureDestinations: CaptureDestination[];
  /**
   * SEQGEN.SPLIT.WORKSPACE.1 — optional, additive: fires whenever the
   * player's internal frame/fps state changes (metadata load, playback
   * tick, seek, FPS change). Every existing caller omits this prop and is
   * completely unaffected — it is read-only, external state mirroring, and
   * never influences the player's own behavior.
   *
   * REVISE (round 2) — `frame`/`totalFrames`/`fps` are the player's own
   * DISPLAY-fps-quantized values (the FPS selector exists for playback/
   * scrubbing granularity, not as a precision guarantee); a caller that
   * needs an un-quantized playhead position (to re-derive against a
   * DIFFERENT fps, e.g. a run's `sourceFps`) MUST use `currentTimeSeconds`
   * — the raw `HTMLVideoElement.currentTime` at the moment this fired,
   * never itself rounded to any frame boundary.
   */
  onFrameChange?: (info: { frame: number; totalFrames: number; fps: number; currentTimeSeconds: number }) => void;
};

/**
 * SEQGEN.SPLIT.WORKSPACE.1 — optional imperative handle, additive: lets a
 * parent coordinate the player (seek to a segment's start) without a full
 * page navigation. Existing callers never attach a ref, so this has no
 * effect on their behavior.
 */
export type VideoFrameReviewPlayerHandle = {
  seekToFrame: (frame: number) => void;
};

const FPS_OPTIONS = [12, 24, 25, 30, 60];
const DEST_GROUP_ORDER = ["Current Shot", "Other Shots", "Assets"];

function getFiniteVideoDuration(video: HTMLVideoElement): number {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  if (video.seekable.length > 0) {
    const end = video.seekable.end(video.seekable.length - 1);
    if (Number.isFinite(end) && end > 0) return end;
  }
  return 0;
}

function formatTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalSeconds = Math.floor(frame / safeFps);
  const frames = frame % safeFps;
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

/**
 * Best-effort, read-only audio-track detection (PLAYER.AUDIO.1). There is
 * no single reliable cross-browser API for "does this <video> have an
 * audio track" — this tries the ones that exist (Firefox's mozHasAudio,
 * Chrome/Edge's experimental audioTracks, Safari's
 * webkitAudioDecodedByteCount, which only becomes meaningful once some
 * audio has actually been decoded during playback) and returns null
 * ("unknown, not yet determined") rather than guessing, so callers never
 * hide the audio controls on a false negative — only a definitive false
 * hides them.
 */
function detectHasAudio(video: HTMLVideoElement): boolean | null {
  const v = video as HTMLVideoElement & {
    audioTracks?: { length: number };
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
  };
  if (typeof v.mozHasAudio === "boolean") return v.mozHasAudio;
  if (v.audioTracks) return v.audioTracks.length > 0;
  if (typeof v.webkitAudioDecodedByteCount === "number" && v.webkitAudioDecodedByteCount > 0) {
    return true;
  }
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function destOptionText(d: CaptureDestination): string {
  if (d.type === "shot" && d.isCurrent) return `Current Shot — ${d.label}`;
  if (d.type === "asset") {
    const t = d.subtitle ? capitalize(d.subtitle) : "";
    return t ? `${t} — ${d.label}` : d.label;
  }
  return d.label;
}

function destSummaryText(d: CaptureDestination): string {
  if (d.type === "shot" && d.isCurrent) return `Current Shot — ${d.label}`;
  if (d.type === "shot") return `Shot — ${d.label}`;
  const t = d.subtitle ? capitalize(d.subtitle) : "";
  return t ? `Asset — ${t} / ${d.label}` : `Asset — ${d.label}`;
}

function getDestGroups(dests: CaptureDestination[]) {
  const map = new Map<string, CaptureDestination[]>();
  for (const d of dests) {
    const arr = map.get(d.groupLabel) ?? [];
    arr.push(d);
    map.set(d.groupLabel, arr);
  }
  return DEST_GROUP_ORDER
    .filter((g) => map.has(g))
    .map((g) => ({ label: g, items: map.get(g)! }));
}

function VideoFrameReviewPlayer(
  {
    src,
    shotId,
    sequenceId,
    projectId,
    defaultFps = 24,
    captureDestinations,
    onFrameChange,
  }: Props,
  forwardedRef: React.ForwardedRef<VideoFrameReviewPlayerHandle>
) {
  const [fps, setFps] = useState(defaultFps);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [hasMetadata, setHasMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState(() => {
    const d =
      captureDestinations.find((d) => d.type === "shot" && d.isCurrent) ??
      captureDestinations.find((d) => d.type === "shot" && d.shotId === shotId) ??
      captureDestinations[0];
    return d?.id ?? "";
  });
  const [filterText, setFilterText] = useState("");
  const [isCaptureInProgress, setIsCaptureInProgress] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Audio (PLAYER.AUDIO.1) — same <video> element, native audio track.
  // Starts unmuted (no autoplay is used anywhere in this component, so
  // there is no browser policy reason to start muted). hasAudio is a
  // tri-state: null = not yet determined (controls stay visible — see
  // detectHasAudio), true/false once known.
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Refs for the stable RAF callback — always hold the latest values
  const fpsRef = useRef(fps);
  const totalFramesRef = useRef(0);
  const hasMetadataRef = useRef(false);

  function syncMetadata() {
    const video = videoRef.current;
    if (!video) return;

    const duration = getFiniteVideoDuration(video);
    if (!duration || duration <= 0) return;

    const safeFps = Math.max(1, Math.round(fpsRef.current || 24));
    const nextTotalFrames = Math.max(1, Math.round(duration * safeFps));
    const nextCurrentFrame = Math.max(
      0,
      Math.min(Math.round((video.currentTime || 0) * safeFps), nextTotalFrames - 1)
    );

    hasMetadataRef.current = true;
    totalFramesRef.current = nextTotalFrames;

    setMetadataError(null);
    setHasMetadata(true);
    setTotalFrames(nextTotalFrames);
    setCurrentFrame(nextCurrentFrame);

    const detected = detectHasAudio(video);
    if (detected !== null) setHasAudio(detected);
  }

  /** Refines audio-track detection during playback, for browsers (Safari)
   *  where it's only knowable once some audio has actually decoded. A
   *  no-op once hasAudio is already determined. */
  function handleTimeUpdateForAudioDetection() {
    if (hasAudio !== null) return;
    const video = videoRef.current;
    if (!video) return;
    const detected = detectHasAudio(video);
    if (detected !== null) setHasAudio(detected);
  }

  // Stable RAF callback — reads from refs to avoid stale closures
  const tickPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !hasMetadataRef.current || totalFramesRef.current <= 0) return;

    const safeFps = Math.max(1, Math.round(fpsRef.current || 24));
    const nextFrame = Math.max(
      0,
      Math.min(Math.round(video.currentTime * safeFps), totalFramesRef.current - 1)
    );
    setCurrentFrame(nextFrame);

    if (!video.paused && !video.ended) {
      rafRef.current = window.requestAnimationFrame(tickPlayback);
    }
  }, []); // stable — reads from refs

  // Check metadata on mount and src change
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasMetadata(false);
    hasMetadataRef.current = false;
    setTotalFrames(0);
    totalFramesRef.current = 0;
    setCurrentFrame(0);
    setMetadataError(null);
    setHasAudio(null);
    setPlaybackError(null);

    if (video.readyState >= 1) {
      syncMetadata();
    }
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Keep the native element's audio state in sync with our controls —
  // volume/muted have no JSX attribute equivalent that React can control
  // reliably post-mount, so they're set imperatively here, same pattern as
  // the rest of this player's DOM-driven state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);

  function handlePlay() {
    setIsPlaying(true);
    syncMetadata();
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(tickPlayback);
  }

  function handlePause() {
    setIsPlaying(false);
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const video = videoRef.current;
    if (!video || !hasMetadataRef.current || totalFramesRef.current <= 0) return;
    const safeFps = Math.max(1, Math.round(fpsRef.current || 24));
    const nextFrame = Math.max(
      0,
      Math.min(Math.round(video.currentTime * safeFps), totalFramesRef.current - 1)
    );
    setCurrentFrame(nextFrame);
  }

  function seekToFrame(frame: number) {
    const video = videoRef.current;
    if (!video || !hasMetadataRef.current || totalFramesRef.current <= 0) return;

    const safeFps = Math.max(1, Math.round(fpsRef.current || 24));
    const next = Math.max(0, Math.min(Math.round(frame), totalFramesRef.current - 1));

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    video.pause();
    setIsPlaying(false);
    video.currentTime = next / safeFps;
    setCurrentFrame(next);
  }

  // SEQGEN.SPLIT.WORKSPACE.1 — additive imperative handle. `seekToFrame` is
  // a plain function (not memoized) but only ever reads through refs
  // (videoRef/hasMetadataRef/totalFramesRef/fpsRef/rafRef), never a stale
  // closure over state, so exposing it once with an empty dependency array
  // is safe: every call always sees current values via those refs.
  useImperativeHandle(forwardedRef, () => ({ seekToFrame }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // SEQGEN.SPLIT.WORKSPACE.1 — additive, read-only mirror of the player's
  // own frame/fps state for an external coordinator (e.g. the Split
  // workspace's segment list/current-frame display). No-op when
  // `onFrameChange` is omitted (every pre-existing caller).
  //
  // REVISE (round 2, finding 1) — `currentTimeSeconds` is read LIVE from
  // `videoRef.current.currentTime` at the moment this effect runs, never
  // from `currentFrame` (which is already quantized to the player's
  // DISPLAY fps and therefore lossy for any other fps). This effect still
  // re-fires on every `currentFrame` change (i.e. every playback tick/seek)
  // so `currentTimeSeconds` stays fresh, but the value itself is the raw,
  // un-rounded playhead position a caller needs to re-derive frame numbers
  // against a DIFFERENT fps (e.g. a run's `sourceFps`) without inheriting
  // the display fps's own rounding error.
  useEffect(() => {
    if (!onFrameChange || !hasMetadata || totalFrames <= 0) return;
    const video = videoRef.current;
    const currentTimeSeconds = video ? video.currentTime : currentFrame / fps;
    onFrameChange({ frame: currentFrame, totalFrames, fps, currentTimeSeconds });
  }, [onFrameChange, currentFrame, totalFrames, fps, hasMetadata]);

  function handleFpsChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newFps = parseInt(e.target.value, 10);
    if (Number.isNaN(newFps) || newFps <= 0) return;

    fpsRef.current = newFps;
    setFps(newFps);

    const video = videoRef.current;
    if (!video || !hasMetadataRef.current) return;

    const duration = getFiniteVideoDuration(video);
    if (!duration) return;

    const newTotal = Math.max(1, Math.round(duration * newFps));
    const newFrame = Math.max(
      0,
      Math.min(Math.round((video.currentTime || 0) * newFps), newTotal - 1)
    );

    totalFramesRef.current = newTotal;
    setTotalFrames(newTotal);
    setCurrentFrame(newFrame);
  }

  async function handleCapture() {
    if (!hasMetadata || totalFrames <= 0) {
      setCaptureError("Video metadata is not ready yet.");
      return;
    }

    // Defensive — the capture button only renders when captureDestinations
    // is non-empty, which is the only case shotId/sequenceId are expected
    // to be set. Narrows them from `number | undefined` for the call below.
    if (shotId === undefined || sequenceId === undefined) {
      setCaptureError("Capture is not available for this player.");
      return;
    }

    const selected = captureDestinations.find((d) => d.id === selectedDestinationId);
    if (!selected) {
      setCaptureError("Select a capture destination.");
      return;
    }

    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCaptureError("Unable to capture frame. Video not ready.");
      return;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    video.pause();
    setIsPlaying(false);
    setIsCaptureInProgress(true);
    setCaptureMessage(null);
    setCaptureError(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCaptureError("Unable to capture frame.");
        return;
      }

      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
      });

      if (!blob) {
        setCaptureError("Unable to capture frame.");
        return;
      }

      const imageFile = new File([blob], `captured-frame-${currentFrame}.jpg`, {
        type: "image/jpeg",
      });

      let destination:
        | { type: "shot"; shotId: number; sequenceId: number }
        | { type: "asset"; assetId: number };

      if (selected.type === "shot") {
        destination = { type: "shot", shotId: selected.shotId, sequenceId: selected.sequenceId };
      } else {
        destination = { type: "asset", assetId: selected.assetId };
      }

      const result = await captureVideoFrame({
        projectId,
        sourceShotId: shotId,
        sourceSequenceId: sequenceId,
        imageFile,
        frameNumber: currentFrame,
        destination,
      });

      if (result.ok) {
        setCaptureMessage(`Frame captured as ${result.destinationLabel}.`);
      } else {
        setCaptureError(result.error || "Unable to capture frame.");
      }
    } catch {
      setCaptureError("Unable to capture frame.");
    } finally {
      setIsCaptureInProgress(false);
    }
  }

  const controlsReady = hasMetadata && totalFrames > 0;
  const maxFrame = Math.max(totalFrames - 1, 0);
  const showFilter = captureDestinations.length > 12;

  const filteredDestinations = filterText.trim()
    ? captureDestinations.filter((d) => {
        const q = filterText.toLowerCase();
        return (
          d.label.toLowerCase().includes(q) ||
          (d.subtitle?.toLowerCase().includes(q) ?? false) ||
          d.groupLabel.toLowerCase().includes(q)
        );
      })
    : captureDestinations;

  const destGroups = getDestGroups(filteredDestinations);
  const selectedDest = captureDestinations.find((d) => d.id === selectedDestinationId);

  return (
    <div className="flex flex-col gap-3">
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        className="w-full rounded border border-[#2c3035]"
        onLoadedMetadata={syncMetadata}
        onDurationChange={syncMetadata}
        onLoadedData={syncMetadata}
        onCanPlay={syncMetadata}
        onTimeUpdate={handleTimeUpdateForAudioDetection}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handlePause}
        onError={() => setMetadataError("Video failed to load.")}
      />

      {/* Metadata error */}
      {metadataError && (
        <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
          <p className="text-xs text-[#cf7b6b]">{metadataError}</p>
        </div>
      )}

      {/* Playback (autoplay-restriction) error — e.g. play() rejected */}
      {playbackError && (
        <div className="rounded border border-[#cda24f]/30 bg-[#2e2410] px-3 py-2">
          <p className="text-xs text-[#cda24f]">{playbackError}</p>
        </div>
      )}

      {/* Timecode */}
      <div className="flex items-center justify-between px-0.5">
        <span className="font-mono text-xs text-[#a4abb2]">
          {controlsReady ? `Frame ${currentFrame} / ${totalFrames}` : "Frame — / —"}
        </span>
        <span className="font-mono text-xs text-[#6e767d]">
          {controlsReady ? formatTimecode(currentFrame, fps) : "--:--:--:--"}
        </span>
      </div>

      {/* Timeline slider */}
      <input
        type="range"
        min={0}
        max={controlsReady ? maxFrame : 0}
        step={1}
        value={controlsReady ? currentFrame : 0}
        disabled={!controlsReady}
        onChange={(e) => seekToFrame(parseInt(e.target.value, 10))}
        className="w-full accent-[#6b9e72] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      />

      {/* Playback controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) {
              setPlaybackError(null);
              // play() can reject under browser autoplay-restriction edge
              // cases even on a user-gesture click (e.g. Safari private
              // mode) — always handle the rejection so it never surfaces
              // as an unhandled-promise console error.
              v.play().catch(() => {
                setIsPlaying(false);
                setPlaybackError("Playback was blocked by the browser. Click Play again to start.");
              });
            } else {
              v.pause();
            }
          }}
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          disabled={!controlsReady}
          onClick={() => { videoRef.current?.pause(); seekToFrame(currentFrame - 1); }}
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          -1 Frame
        </button>
        <button
          type="button"
          disabled={!controlsReady}
          onClick={() => { videoRef.current?.pause(); seekToFrame(currentFrame + 1); }}
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +1 Frame
        </button>

        {/* Audio controls — hidden only on a *confirmed* no-audio-track
            media (hasAudio === false); shown while unknown (hasAudio ===
            null) since hiding on a false negative would be more
            misleading than showing controls that happen to do nothing. */}
        {hasAudio !== false ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
              aria-label={muted ? "Unmute" : "Mute"}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                setVolume(next);
                if (next > 0 && muted) setMuted(false);
              }}
              aria-label="Volume"
              className="w-20 accent-[#6b9e72] cursor-pointer"
            />
          </div>
        ) : (
          <span className="text-[10px] text-[#4b5158] italic" aria-live="polite">
            No audio track
          </span>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">FPS</span>
          <select
            value={fps}
            onChange={handleFpsChange}
            className="rounded border border-[#2c3035] bg-[#0d0e10] text-[#a4abb2] px-2 py-1 text-xs focus:outline-none focus:border-[#3a4046]"
          >
            {FPS_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Jump to frame */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setJumpError(null);
          const frame = parseInt(jumpValue, 10);
          if (Number.isNaN(frame)) {
            setJumpError("Enter a valid frame number.");
            return;
          }
          if (frame < 0 || frame > maxFrame) {
            setJumpError(`Frame must be between 0 and ${maxFrame}.`);
            return;
          }
          seekToFrame(frame);
          setJumpValue("");
        }}
        className="flex flex-col gap-1"
      >
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider text-[#4b5158] whitespace-nowrap">
            Jump to frame
          </label>
          <input
            type="number"
            min={0}
            value={jumpValue}
            disabled={!controlsReady}
            onChange={(e) => { setJumpValue(e.target.value); setJumpError(null); }}
            placeholder={controlsReady ? String(currentFrame) : "—"}
            className="w-20 rounded border border-[#2c3035] bg-[#0d0e10] text-[#a4abb2] px-2 py-1 text-xs font-mono focus:outline-none focus:border-[#3a4046] disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!controlsReady}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Go
          </button>
        </div>
        {jumpError && (
          <p className="text-[10px] text-[#cf7b6b] pl-0.5">{jumpError}</p>
        )}
      </form>

      {/* Capture section — omitted entirely when no destination exists
          (UX.POLISH.3: Film Result has no natural shot/asset source, so it
          passes an empty captureDestinations array). Existing callers
          (Shot Detail, Sequence Result) always pass at least one
          destination, so this is backward-compatible for them. */}
      {captureDestinations.length > 0 && (
        <div className="border-t border-[#1e2124] pt-3 flex flex-col gap-2">

          {/* Destination selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">
              Capture Destination
            </span>

            {showFilter && (
              <input
                type="text"
                placeholder="Filter destinations"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="rounded border border-[#2c3035] bg-[#0d0e10] text-[#a4abb2] px-2 py-1 text-xs focus:outline-none focus:border-[#3a4046] placeholder:text-[#4b5158]"
              />
            )}

            {destGroups.length === 0 && filterText.trim() ? (
              <p className="text-xs text-[#4b5158]">No matching destination.</p>
            ) : (
              <select
                value={selectedDestinationId}
                onChange={(e) => setSelectedDestinationId(e.target.value)}
                className="rounded border border-[#2c3035] bg-[#0d0e10] text-[#a4abb2] px-2 py-1.5 text-xs focus:outline-none focus:border-[#3a4046]"
              >
                {destGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((d) => (
                      <option key={d.id} value={d.id}>
                        {destOptionText(d)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}

            {selectedDest && (
              <p className="text-[10px] text-[#6e767d]">
                Selected: {destSummaryText(selectedDest)}
              </p>
            )}
          </div>

          {/* Feedback */}
          {captureMessage && (
            <div className="rounded border border-[#6b9e72]/30 bg-[#1a2e1e] px-3 py-2">
              <p className="text-xs text-[#6b9e72]">{captureMessage}</p>
            </div>
          )}
          {captureError && (
            <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
              <p className="text-xs text-[#cf7b6b]">{captureError}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleCapture}
            disabled={isCaptureInProgress || !controlsReady}
            className={
              isCaptureInProgress || !controlsReady
                ? "rounded border border-[#1e2124] text-[#4b5158] px-3 py-1.5 text-xs cursor-not-allowed"
                : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            }
          >
            {isCaptureInProgress ? "Capturing…" : "Capture Frame"}
          </button>
        </div>
      )}
    </div>
  );
}

export default forwardRef(VideoFrameReviewPlayer);
