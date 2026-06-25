"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  shotId: number;
  sequenceId: number;
  projectId: number;
  defaultFps?: number;
  captureDestinations: CaptureDestination[];
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

export default function VideoFrameReviewPlayer({
  src,
  shotId,
  sequenceId,
  projectId,
  defaultFps = 24,
  captureDestinations,
}: Props) {
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
        className="w-full rounded border border-[#2c3035]"
        onLoadedMetadata={syncMetadata}
        onDurationChange={syncMetadata}
        onLoadedData={syncMetadata}
        onCanPlay={syncMetadata}
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
            if (v.paused) { v.play(); } else { v.pause(); }
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

      {/* Capture section */}
      <div className="border-t border-[#1e2124] pt-3 flex flex-col gap-2">

        {/* Destination selector */}
        {captureDestinations.length > 0 && (
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
        )}

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
    </div>
  );
}
