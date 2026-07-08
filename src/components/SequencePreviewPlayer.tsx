"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

export type PreviewShot = {
  id: number;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  videoUrl: string | null;
  isPlaceholder: boolean;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
};

/** Editorial item entry for the item-driven playlist mode. */
export type PreviewItem = {
  itemId: number;
  type: "shot" | "gap";
  shotId: number | null;
  shotCode: string | null;
  title: string | null;
  videoUrl: string | null;
  durationSeconds: number | null;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
  isPlaceholder: boolean;
};

// Unified internal playlist entry — key is itemId in items mode, shot id otherwise
type Entry = {
  key: number;
  kind: "shot" | "gap";
  shotId: number | null;
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  videoUrl: string | null;
  isPlaceholder: boolean;
  trimInSeconds: number | null;
  trimOutSeconds: number | null;
};

type Props = {
  shots: PreviewShot[];
  projectId: number;
  sequenceId: number;
  /** Optional controlled selection — when set, the player follows it for playable shots. */
  selectedShotId?: number | null;
  /** Optional callback fired whenever the player's current shot changes. */
  onShotSelect?: (shotId: number) => void;
  /** Item-driven mode: when provided and non-empty, the playlist follows these items. */
  items?: PreviewItem[];
  selectedItemId?: number | null;
  onItemSelect?: (itemId: number) => void;
  /**
   * Optional: reports elapsed time local to the currently loaded entry
   * (video currentTime minus trimIn for a trimmed clip, 0-based otherwise;
   * gap elapsed for a gap). Never a global timeline position — the player
   * has no notion of where an entry sits in a larger document.
   */
  onTimeUpdate?: (localSeconds: number) => void;
  /**
   * Optional: request to seek a specific entry to a local offset once it
   * becomes the loaded entry. Ignored for non-video entries. Pass a new
   * requestId to trigger a fresh seek (e.g. clicking the same time twice).
   */
  seekRequest?: { itemKey: number; localSeconds: number; requestId: number } | null;
};

function hasValidTrim(entry: Entry): boolean {
  return (
    entry.trimInSeconds !== null &&
    entry.trimOutSeconds !== null &&
    entry.trimInSeconds >= 0 &&
    entry.trimOutSeconds > entry.trimInSeconds
  );
}

/** Effective playback duration: trim range, else narrative target, else null. */
function effectiveDuration(entry: Entry): number | null {
  if (hasValidTrim(entry)) return entry.trimOutSeconds! - entry.trimInSeconds!;
  return entry.durationSeconds;
}

/** A shot entry needs a video; a gap entry needs a positive duration to hold on black. */
function isPlayableEntry(entry: Entry): boolean {
  if (entry.kind === "gap") {
    return entry.durationSeconds !== null && entry.durationSeconds > 0;
  }
  return entry.videoUrl !== null;
}

function Badge({ entry }: { entry: Entry }) {
  if (entry.kind === "gap") {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#4b5158] border border-[#2c3035] border-dashed rounded px-1.5 py-px">
        Gap
      </span>
    );
  }
  if (entry.isPlaceholder) {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#cda24f] border border-[#3d3423] rounded px-1.5 py-px">
        Placeholder
      </span>
    );
  }
  if (entry.videoUrl) {
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
  selectedShotId,
  onShotSelect,
  items,
  selectedItemId,
  onItemSelect,
  onTimeUpdate,
  seekRequest,
}: Props) {
  const itemsMode = items !== undefined && items.length > 0;

  const entries: Entry[] = useMemo(
    () =>
      itemsMode
        ? items!.map((it) => ({
            key: it.itemId,
            kind: it.type,
            shotId: it.shotId,
            shotCode: it.shotCode,
            title: it.title ?? (it.type === "gap" ? "Gap" : ""),
            durationSeconds: it.durationSeconds,
            videoUrl: it.type === "shot" ? it.videoUrl : null,
            isPlaceholder: it.isPlaceholder,
            trimInSeconds: it.trimInSeconds,
            trimOutSeconds: it.trimOutSeconds,
          }))
        : shots.map((s) => ({
            key: s.id,
            kind: "shot" as const,
            shotId: s.id,
            shotCode: s.shotCode,
            title: s.title,
            durationSeconds: s.durationSeconds,
            videoUrl: s.videoUrl,
            isPlaceholder: s.isPlaceholder,
            trimInSeconds: s.trimInSeconds,
            trimOutSeconds: s.trimOutSeconds,
          })),
    [itemsMode, items, shots]
  );

  // Indices (in the full entry list) of entries that can actually play
  // (a video clip, or a gap with a positive duration held as black)
  const playableIndices = useMemo(
    () =>
      entries
        .map((e, i) => (isPlayableEntry(e) ? i : -1))
        .filter((i) => i >= 0),
    [entries]
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
  // Guard: advance once per clip when the trim-out boundary is crossed
  const advancedAtTrimOutRef = useRef(false);
  // Guard: apply a given seekRequest at most once
  const consumedSeekRequestIdRef = useRef<number | null>(null);

  // Black hold gap playback — synthetic timer, no <video> involved
  const [gapPlaying, setGapPlaying] = useState(false);
  const [gapElapsedDisplay, setGapElapsedDisplay] = useState(0);
  const gapElapsedRef = useRef(0);

  const currentEntry = currentIndex !== null ? entries[currentIndex] : null;
  const currentPlayablePos =
    currentIndex !== null ? playableIndices.indexOf(currentIndex) : -1;

  // Estimated total uses effective durations (trim range wins over target)
  const totalEstimated = entries.reduce(
    (sum, e) => sum + (effectiveDuration(e) ?? 0),
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

  function notifySelect(entry: Entry) {
    if (itemsMode) {
      onItemSelect?.(entry.key);
    } else if (entry.shotId !== null) {
      onShotSelect?.(entry.shotId);
    }
  }

  function goTo(index: number, autoplay: boolean) {
    setCurrentIndex(index);
    setIsEnded(false);
    setLoadError(null);
    pendingPlayRef.current = autoplay;
    advancedAtTrimOutRef.current = false;
    // Report internal clip changes (playlist click, Prev/Next, auto-advance)
    const entry = entries[index];
    if (entry) notifySelect(entry);
  }

  // Follow an external selection when it points to a playable entry
  const externalSelectedKey = itemsMode ? selectedItemId : selectedShotId;
  useEffect(() => {
    if (externalSelectedKey == null) return;
    if (currentIndex !== null && entries[currentIndex]?.key === externalSelectedKey) {
      return;
    }
    const index = entries.findIndex((e) => e.key === externalSelectedKey);
    if (index >= 0 && isPlayableEntry(entries[index])) {
      setCurrentIndex(index);
      setIsEnded(false);
      setLoadError(null);
      pendingPlayRef.current = false;
      advancedAtTrimOutRef.current = false;
    }
    // Non-playable selections (shot with no video, empty/invalid gap) are
    // ignored by the player — the timeline still highlights them, and the
    // current clip stays loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedKey]);

  // Re-seek the entry that is *already* loaded when a new seekRequest
  // targets it (clicking a different point within the same clip/gap).
  // The case where the request causes a *new* entry to load is still
  // handled by handleLoadedData below — both paths share
  // consumedSeekRequestIdRef so a request is only ever applied once.
  useEffect(() => {
    if (!seekRequest || !currentEntry) return;
    if (seekRequest.itemKey !== currentEntry.key) return;
    if (consumedSeekRequestIdRef.current === seekRequest.requestId) return;

    if (currentEntry.videoUrl) {
      const video = videoRef.current;
      // Not ready yet (freshly mounted after a selection change) — leave
      // it unconsumed so handleLoadedData applies it once loading finishes.
      if (!video || video.readyState < 1) return;
      consumedSeekRequestIdRef.current = seekRequest.requestId;
      const trimIn = hasValidTrim(currentEntry) ? currentEntry.trimInSeconds! : 0;
      const trimOut = hasValidTrim(currentEntry)
        ? currentEntry.trimOutSeconds!
        : currentEntry.durationSeconds ?? Infinity;
      video.currentTime = Math.min(
        Math.max(trimIn + seekRequest.localSeconds, trimIn),
        trimOut
      );
      advancedAtTrimOutRef.current = false;
    } else if (currentEntry.kind === "gap") {
      consumedSeekRequestIdRef.current = seekRequest.requestId;
      const duration = currentEntry.durationSeconds ?? 0;
      const clamped = Math.min(Math.max(seekRequest.localSeconds, 0), duration);
      gapElapsedRef.current = clamped;
      setGapElapsedDisplay(clamped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest, currentEntry?.key]);

  function advanceOrEnd() {
    if (currentIndex === null) return;
    const next = nextPlayableIndex(currentIndex);
    if (next !== null) {
      goTo(next, true);
    } else {
      setIsEnded(true);
      pendingPlayRef.current = false;
    }
  }

  function handleEnded() {
    advanceOrEnd();
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !currentEntry) return;
    if (hasValidTrim(currentEntry)) {
      if (advancedAtTrimOutRef.current) return;
      if (video.currentTime >= currentEntry.trimOutSeconds!) {
        advancedAtTrimOutRef.current = true;
        video.pause();
        advanceOrEnd();
        return;
      }
      onTimeUpdate?.(video.currentTime - currentEntry.trimInSeconds!);
      return;
    }
    onTimeUpdate?.(video.currentTime);
  }

  function handlePlay() {
    // Replaying a trimmed clip restarts from trim in
    const video = videoRef.current;
    if (!video || !currentEntry || !hasValidTrim(currentEntry)) return;
    if (
      video.currentTime < currentEntry.trimInSeconds! ||
      video.currentTime >= currentEntry.trimOutSeconds!
    ) {
      video.currentTime = currentEntry.trimInSeconds!;
      advancedAtTrimOutRef.current = false;
    }
  }

  function handleLoadedData() {
    consecutiveErrorsRef.current = 0;
    const video = videoRef.current;
    // Position trimmed clips at their trim in before playback
    if (video && currentEntry && hasValidTrim(currentEntry)) {
      video.currentTime = currentEntry.trimInSeconds!;
    }
    // Apply a pending seek request once, only when it targets the entry
    // that just loaded (opt-in — no-op unless seekRequest is provided).
    if (
      video &&
      currentEntry &&
      seekRequest &&
      seekRequest.itemKey === currentEntry.key &&
      consumedSeekRequestIdRef.current !== seekRequest.requestId
    ) {
      consumedSeekRequestIdRef.current = seekRequest.requestId;
      const trimIn = hasValidTrim(currentEntry) ? currentEntry.trimInSeconds! : 0;
      video.currentTime = trimIn + seekRequest.localSeconds;
    }
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      video?.play().catch(() => {
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

  // Entering a gap resets its elapsed time and consumes any pending autoplay
  // (mirrors handleLoadedData's pendingPlayRef consumption for videos).
  useEffect(() => {
    if (!currentEntry || currentEntry.kind !== "gap") return;
    gapElapsedRef.current = 0;
    setGapElapsedDisplay(0);
    const autoplay = pendingPlayRef.current;
    pendingPlayRef.current = false;
    setGapPlaying(autoplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry?.key]);

  // Black hold timer — advances gapElapsed while playing, advances the
  // playlist once the gap's duration is reached. Cleaned up on every
  // entry change and on pause so only one loop ever runs.
  useEffect(() => {
    if (!currentEntry || currentEntry.kind !== "gap" || !gapPlaying) return;
    const duration = currentEntry.durationSeconds ?? 0;
    if (duration <= 0) {
      setGapPlaying(false);
      return;
    }
    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      gapElapsedRef.current += dt;
      if (gapElapsedRef.current >= duration) {
        gapElapsedRef.current = duration;
        setGapElapsedDisplay(duration);
        setGapPlaying(false);
        advanceOrEnd();
        return;
      }
      setGapElapsedDisplay(gapElapsedRef.current);
      onTimeUpdate?.(gapElapsedRef.current);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapPlaying, currentEntry?.key]);

  if (playableIndices.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#4b5158]">
          No approved videos in this sequence yet.
        </p>
        <PlaylistRows
          entries={entries}
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
          {playableIndices.length} of {entries.length}{" "}
          {itemsMode
            ? `item${entries.length !== 1 ? "s" : ""}`
            : `shot${entries.length !== 1 ? "s" : ""}`}{" "}
          have video
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
      {currentEntry && currentEntry.videoUrl && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-[#6e767d]">
            <span className="uppercase tracking-wider text-[#4b5158]">
              Now playing
            </span>
            {" · "}
            <span className="font-mono">{currentEntry.shotCode ?? "—"}</span>
            {" — "}
            {currentEntry.title}
          </p>
          <video
            key={currentEntry.key}
            ref={videoRef}
            src={currentEntry.videoUrl}
            controls
            onEnded={handleEnded}
            onError={handleError}
            onLoadedData={handleLoadedData}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            className="w-full max-h-[280px] object-contain rounded border border-[#2c3035] bg-black"
          />
        </div>
      )}

      {currentEntry && currentEntry.kind === "gap" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-[#6e767d]">
            <span className="uppercase tracking-wider text-[#4b5158]">
              Now playing
            </span>
            {" · "}Gap
          </p>
          <div className="w-full aspect-video max-h-[280px] rounded border border-[#2c3035] bg-black flex flex-col items-center justify-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">
              Black hold — no video during this gap
            </span>
            <span className="text-xs font-mono text-[#6e767d] tabular-nums">
              {gapElapsedDisplay.toFixed(1)}s / {(currentEntry.durationSeconds ?? 0).toFixed(1)}s
            </span>
            <button
              type="button"
              onClick={() => setGapPlaying((p) => !p)}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              {gapPlaying ? "Pause" : "Play"}
            </button>
          </div>
        </div>
      )}

      {loadError && <p className="text-xs text-[#cf7b6b]">{loadError}</p>}
      {isEnded && (
        <p className="text-xs text-[#6b9e72]">End of sequence preview.</p>
      )}

      {/* ── Playlist ── */}
      <PlaylistRows
        entries={entries}
        projectId={projectId}
        sequenceId={sequenceId}
        currentIndex={currentIndex}
        onSelect={(index) => goTo(index, false)}
      />
    </div>
  );
}

function PlaylistRows({
  entries,
  projectId,
  sequenceId,
  currentIndex,
  onSelect,
}: {
  entries: Entry[];
  projectId: number;
  sequenceId: number;
  currentIndex: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-[#1a1d20] border-t border-[#1a1d20] max-h-40 overflow-y-auto">
      {entries.map((entry, index) => {
        const playable = entry.videoUrl !== null;
        const isCurrent = index === currentIndex;

        if (entry.kind === "gap") {
          const d = effectiveDuration(entry);
          const gapPlayable = isPlayableEntry(entry);
          return (
            <div
              key={entry.key}
              className={`flex items-center gap-3 py-1.5 ${
                isCurrent ? "bg-[#141e2b] -mx-2 px-2 rounded" : ""
              }`}
            >
              <span className="text-[10px] font-mono text-[#3a4046] w-6 shrink-0 text-right tabular-nums">
                {index + 1}
              </span>
              {gapPlayable ? (
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className={`text-[10px] font-mono w-16 shrink-0 truncate text-left transition-colors ${
                    isCurrent ? "text-[#5b93d6]" : "text-[#6e767d] hover:text-[#a4abb2]"
                  }`}
                  title="Load this gap"
                >
                  —
                </button>
              ) : (
                <span className="text-[10px] font-mono text-[#3a4046] w-16 shrink-0 truncate">
                  —
                </span>
              )}
              <span
                className={`flex-1 min-w-0 text-xs italic truncate ${
                  gapPlayable ? "text-[#a4abb2]" : "text-[#4b5158]"
                }`}
              >
                Gap{d !== null ? ` · ${d.toFixed(1)}s` : ""}
              </span>
              <Badge entry={entry} />
              <span className="text-[10px] font-mono text-[#6e767d] w-12 shrink-0 text-right tabular-nums">
                {d !== null ? `${d.toFixed(1)}s` : "—"}
              </span>
              <span className="shrink-0 w-12" />
            </div>
          );
        }

        return (
          <div
            key={entry.key}
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
                {entry.shotCode ?? "—"}
              </button>
            ) : (
              <span className="text-[10px] font-mono text-[#3a4046] w-16 shrink-0 truncate">
                {entry.shotCode ?? "—"}
              </span>
            )}
            <span
              className={`flex-1 min-w-0 text-xs truncate ${
                playable ? "text-[#a4abb2]" : "text-[#4b5158]"
              }`}
            >
              {entry.title}
            </span>
            <Badge entry={entry} />
            {hasValidTrim(entry) && (
              <span
                className="shrink-0 text-[9px] font-mono text-[#5b93d6]"
                title={`Trim: ${entry.trimInSeconds!.toFixed(1)}s → ${entry.trimOutSeconds!.toFixed(1)}s`}
              >
                Trimmed
              </span>
            )}
            <span className="text-[10px] font-mono text-[#6e767d] w-12 shrink-0 text-right tabular-nums">
              {effectiveDuration(entry) !== null
                ? `${effectiveDuration(entry)!.toFixed(1)}s`
                : "—"}
            </span>
            {entry.shotId !== null ? (
              <Link
                href={`/projects/${projectId}/sequences/${sequenceId}/shots/${entry.shotId}`}
                className="shrink-0 text-[10px] text-[#4b5158] hover:text-[#a4abb2] transition-colors w-12"
              >
                Open →
              </Link>
            ) : (
              <span className="shrink-0 w-12" />
            )}
          </div>
        );
      })}
    </div>
  );
}
