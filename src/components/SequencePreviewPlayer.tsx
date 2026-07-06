"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

export type PreviewShot = {
  id: number;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  videoUrl: string | null;
  isPlaceholder: boolean;
};

type Props = {
  shots: PreviewShot[];
  projectId: number;
  sequenceId: number;
};

function Badge({ shot }: { shot: PreviewShot }) {
  if (shot.isPlaceholder) {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#cda24f] border border-[#3d3423] rounded px-1.5 py-px">
        Placeholder
      </span>
    );
  }
  if (shot.videoUrl) {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#6b9e72] border border-[#2a3d2e] rounded px-1.5 py-px">
        Approved video
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#4b5158] border border-[#232629] rounded px-1.5 py-px">
      No video
    </span>
  );
}

export default function SequencePreviewPlayer({
  shots,
  projectId,
  sequenceId,
}: Props) {
  // Indices (in the full shot list) of shots that can actually play
  const playableIndices = useMemo(
    () =>
      shots
        .map((s, i) => (s.videoUrl ? i : -1))
        .filter((i) => i >= 0),
    [shots]
  );

  const [currentIndex, setCurrentIndex] = useState<number | null>(
    playableIndices.length > 0 ? playableIndices[0] : null
  );
  const [isEnded, setIsEnded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Autoplay the next clip only when advancing from an active playback session
  const pendingPlayRef = useRef(false);
  // Guard against infinite error-skip loops: consecutive failed loads
  const consecutiveErrorsRef = useRef(0);

  const currentShot = currentIndex !== null ? shots[currentIndex] : null;
  const currentPlayablePos =
    currentIndex !== null ? playableIndices.indexOf(currentIndex) : -1;

  const totalEstimated = shots.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0
  );

  function nextPlayableIndex(after: number): number | null {
    for (const i of playableIndices) {
      if (i > after) return i;
    }
    return null;
  }

  function prevPlayableIndex(before: number): number | null {
    for (let k = playableIndices.length - 1; k >= 0; k--) {
      if (playableIndices[k] < before) return playableIndices[k];
    }
    return null;
  }

  function goTo(index: number, autoplay: boolean) {
    setCurrentIndex(index);
    setIsEnded(false);
    setLoadError(null);
    pendingPlayRef.current = autoplay;
  }

  function handleEnded() {
    if (currentIndex === null) return;
    const next = nextPlayableIndex(currentIndex);
    if (next !== null) {
      goTo(next, true);
    } else {
      setIsEnded(true);
      pendingPlayRef.current = false;
    }
  }

  function handleLoadedData() {
    consecutiveErrorsRef.current = 0;
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      videoRef.current?.play().catch(() => {
        // Browser refused autoplay — user can press play manually
      });
    }
  }

  function handleError() {
    consecutiveErrorsRef.current += 1;
    setLoadError("Video could not be loaded.");

    // Stop skipping once every playable clip has failed in a row
    if (
      currentIndex === null ||
      consecutiveErrorsRef.current >= playableIndices.length
    ) {
      pendingPlayRef.current = false;
      return;
    }

    const next = nextPlayableIndex(currentIndex);
    if (next !== null) {
      goTo(next, pendingPlayRef.current);
      setLoadError("Video could not be loaded. Skipped to the next clip.");
    } else {
      setIsEnded(true);
      pendingPlayRef.current = false;
    }
  }

  if (playableIndices.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#4b5158]">
          No approved videos in this sequence yet.
        </p>
        <PlaylistRows
          shots={shots}
          projectId={projectId}
          sequenceId={sequenceId}
          currentIndex={null}
          onSelect={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Status line ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-[#6e767d]">
          {currentPlayablePos >= 0 && (
            <>
              Clip {currentPlayablePos + 1} of {playableIndices.length}
              {" · "}
            </>
          )}
          {playableIndices.length} of {shots.length} shot
          {shots.length !== 1 ? "s" : ""} have video
          {totalEstimated > 0 && (
            <>
              {" · "}Estimated duration{" "}
              <span className="font-mono">{totalEstimated.toFixed(1)}s</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (currentIndex === null) return;
              const prev = prevPlayableIndex(currentIndex);
              if (prev !== null) goTo(prev, false);
            }}
            disabled={currentIndex === null || prevPlayableIndex(currentIndex) === null}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentIndex === null) return;
              const next = nextPlayableIndex(currentIndex);
              if (next !== null) goTo(next, false);
            }}
            disabled={currentIndex === null || nextPlayableIndex(currentIndex) === null}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* ── Player ── */}
      {currentShot && currentShot.videoUrl && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-[#6e767d]">
            <span className="uppercase tracking-wider text-[#4b5158]">
              Now playing
            </span>
            {" · "}
            <span className="font-mono">{currentShot.shotCode ?? "—"}</span>
            {" — "}
            {currentShot.title}
          </p>
          <video
            key={currentShot.id}
            ref={videoRef}
            src={currentShot.videoUrl}
            controls
            onEnded={handleEnded}
            onError={handleError}
            onLoadedData={handleLoadedData}
            className="w-full rounded border border-[#2c3035] bg-black"
          />
        </div>
      )}

      {loadError && <p className="text-xs text-[#cf7b6b]">{loadError}</p>}
      {isEnded && (
        <p className="text-xs text-[#6b9e72]">End of sequence preview.</p>
      )}

      {/* ── Playlist ── */}
      <PlaylistRows
        shots={shots}
        projectId={projectId}
        sequenceId={sequenceId}
        currentIndex={currentIndex}
        onSelect={(index) => goTo(index, false)}
      />
    </div>
  );
}

function PlaylistRows({
  shots,
  projectId,
  sequenceId,
  currentIndex,
  onSelect,
}: {
  shots: PreviewShot[];
  projectId: number;
  sequenceId: number;
  currentIndex: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-[#1a1d20] border-t border-[#1a1d20]">
      {shots.map((shot, index) => {
        const playable = shot.videoUrl !== null;
        const isCurrent = index === currentIndex;
        return (
          <div
            key={shot.id}
            className={`flex items-center gap-3 py-1.5 ${
              isCurrent ? "bg-[#141e2b] -mx-2 px-2 rounded" : ""
            }`}
          >
            <span className="text-[10px] font-mono text-[#3a4046] w-6 shrink-0 text-right tabular-nums">
              {index + 1}
            </span>
            {playable ? (
              <button
                type="button"
                onClick={() => onSelect(index)}
                className={`text-[10px] font-mono w-16 shrink-0 truncate text-left transition-colors ${
                  isCurrent
                    ? "text-[#5b93d6]"
                    : "text-[#6e767d] hover:text-[#a4abb2]"
                }`}
                title="Load this clip"
              >
                {shot.shotCode ?? "—"}
              </button>
            ) : (
              <span className="text-[10px] font-mono text-[#3a4046] w-16 shrink-0 truncate">
                {shot.shotCode ?? "—"}
              </span>
            )}
            <span
              className={`flex-1 min-w-0 text-xs truncate ${
                playable ? "text-[#a4abb2]" : "text-[#4b5158]"
              }`}
            >
              {shot.title}
            </span>
            <Badge shot={shot} />
            <span className="text-[10px] font-mono text-[#6e767d] w-12 shrink-0 text-right tabular-nums">
              {shot.durationSeconds !== null
                ? `${shot.durationSeconds.toFixed(1)}s`
                : "—"}
            </span>
            <Link
              href={`/projects/${projectId}/sequences/${sequenceId}/shots/${shot.id}`}
              className="shrink-0 text-[10px] text-[#4b5158] hover:text-[#a4abb2] transition-colors"
            >
              Open →
            </Link>
          </div>
        );
      })}
    </div>
  );
}
