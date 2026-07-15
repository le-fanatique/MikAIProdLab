"use client";

import { useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import EditorialTimeline, {
  type EditorialTimelineShot,
  type EditorialItemView,
} from "@/components/EditorialTimeline";
import EditorialShotList from "@/components/EditorialShotList";
import VideoFrameReviewPlayer from "@/components/VideoFrameReviewPlayer";
import { initializeEditorialTimeline } from "@/actions/shots";
import {
  moveEditorialItemOrder,
  updateEditorialItemTrim,
  deleteEditorialGap,
} from "@/actions/editorialTimeline";
import InsertShotFromEditorialButton from "@/components/InsertShotFromEditorialButton";

export type EditorialWorkspaceShot = EditorialTimelineShot;

type Props = {
  shots: EditorialWorkspaceShot[];
  projectId: number;
  sequenceId: number;
  returnTo: string;
  editorialItems: EditorialItemView[];
};

function SectionLabel({ label, badge }: { label: string; badge?: React.ReactNode }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4 flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
      {badge}
    </div>
  );
}

function StatusBadgeParts({
  isPlaceholder,
  hasApprovedVideo,
}: {
  isPlaceholder: boolean;
  hasApprovedVideo: boolean;
}) {
  if (isPlaceholder) {
    return (
      <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#cda24f] border border-[#3d3423] rounded px-1.5 py-px">
        Placeholder
      </span>
    );
  }
  if (hasApprovedVideo) {
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

/**
 * Client container for the editorial page: owns the shared selection so the
 * viewer and the timeline stay synchronized. When the editorial items layer
 * exists, selection is per item (selectedItemId) and the shot id is derived;
 * without items, the legacy per-shot selection path is used unchanged.
 */
export default function EditorialWorkspace({
  shots,
  projectId,
  sequenceId,
  returnTo,
  editorialItems,
}: Props) {
  const hasEditorialItems = editorialItems.length > 0;

  // Legacy selection (no-items fallback) — lazily defaults to the first
  // Shot with a video, computed synchronously at initial render (SSR
  // included), same as the previous player's own default `currentIndex`.
  // A `useEffect` here would only run after hydration, causing a false
  // "no video" flash on first paint whenever a playable Shot exists.
  const [selectedShotId, setSelectedShotId] = useState<number | null>(() => {
    if (editorialItems.length > 0) return null;
    return shots.find((s) => s.videoUrl)?.id ?? null;
  });
  // Item selection (editorial layer active) — same synchronous default.
  const [selectedItemId, setSelectedItemId] = useState<number | null>(
    () => editorialItems.find((it) => it.type === "shot" && it.videoUrl)?.id ?? null
  );

  const selectedItem = hasEditorialItems
    ? editorialItems.find((it) => it.id === selectedItemId) ?? null
    : null;

  // Fallback band data (no items): derived from the shots list
  const fallbackSelectedShot =
    !hasEditorialItems && selectedShotId !== null
      ? shots.find((s) => s.id === selectedShotId) ?? null
      : null;

  // Target duration of the underlying shot for a selected shot item
  const selectedItemTargetDuration =
    selectedItem && selectedItem.shotId !== null
      ? shots.find((s) => s.id === selectedItem.shotId)?.durationSeconds ?? null
      : null;

  function itemHasTrim(it: EditorialItemView): boolean {
    return (
      it.trimInSeconds != null &&
      it.trimOutSeconds != null &&
      it.trimOutSeconds > it.trimInSeconds
    );
  }

  function itemEffective(it: EditorialItemView): number | null {
    if (itemHasTrim(it)) return it.trimOutSeconds! - it.trimInSeconds!;
    return it.durationSeconds;
  }

  // Move up/down (BASIC.EDITORIAL.2) — same sequence, same track, adjacent
  // swap only. editorialItems is already ordered trackIndex asc, orderIndex
  // asc, so filtering by trackIndex preserves the relative order.
  const selectedItemSiblings = selectedItem
    ? editorialItems.filter((it) => it.trackIndex === selectedItem.trackIndex)
    : [];
  const selectedItemPos = selectedItem
    ? selectedItemSiblings.findIndex((it) => it.id === selectedItem.id)
    : -1;
  const canMoveItemUp = selectedItemPos > 0;
  const canMoveItemDown =
    selectedItemPos !== -1 && selectedItemPos < selectedItemSiblings.length - 1;

  // ── Player selection (EDITORIAL.POLISH.1) ────────────────────────────
  // VideoFrameReviewPlayer shows exactly one source at a time (the
  // current selection) — unlike SequencePreviewPlayer it has no built-in
  // playlist/Previous-Next. Cross-shot navigation now comes from the icon
  // button on each row of the Shot list below; gap selection is still
  // driven by clicking a gap segment on the Editorial Timeline, unchanged.
  type CurrentEntry = {
    key: number;
    kind: "shot" | "gap";
    shotId: number | null;
    title: string | null;
    videoUrl: string | null;
    durationSeconds: number | null;
  };

  const currentEntry: CurrentEntry | null = hasEditorialItems
    ? selectedItem
      ? {
          key: selectedItem.id,
          kind: selectedItem.type,
          shotId: selectedItem.shotId,
          title: selectedItem.title,
          videoUrl: selectedItem.type === "shot" ? selectedItem.videoUrl : null,
          durationSeconds: selectedItem.durationSeconds,
        }
      : null
    : fallbackSelectedShot
    ? {
        key: fallbackSelectedShot.id,
        kind: "shot",
        shotId: fallbackSelectedShot.id,
        title: fallbackSelectedShot.title,
        videoUrl: fallbackSelectedShot.videoUrl,
        durationSeconds: fallbackSelectedShot.durationSeconds,
      }
    : null;

  // Shot navigation from the list below (EDITORIAL.SHOTNAV.1) — resolves
  // to the matching editorial item when the gap-aware layer is active,
  // else selects the shot directly (legacy path, same as clicking its
  // segment on the timeline already did).
  function handleSelectShotFromList(shotId: number) {
    if (hasEditorialItems) {
      const item = editorialItems.find((it) => it.type === "shot" && it.shotId === shotId);
      if (item) setSelectedItemId(item.id);
    } else {
      setSelectedShotId(shotId);
    }
  }

  const listSelectedShotId = hasEditorialItems ? selectedItem?.shotId ?? null : selectedShotId;

  return (
    <>
      {/* ── Sequence Viewer — dominant, on top ───────────────────── */}
      <SectionLabel label="Sequence Viewer" />
      <Card>
        {currentEntry && currentEntry.videoUrl ? (
          <VideoFrameReviewPlayer
            key={currentEntry.key}
            src={currentEntry.videoUrl}
            projectId={projectId}
            sequenceId={sequenceId}
            shotId={currentEntry.shotId ?? undefined}
            defaultFps={24}
            // EDITORIAL.POLISH.1: capture destinations intentionally empty
            // here — a gap has no natural Shot to capture into, and
            // building the full cross-project destination list (as Shot
            // Detail/Sequence Result do) is outside "adapter uniquement
            // les props necessaires" for this ticket. Frame capture into
            // References stays available from Shot Detail/Sequence
            // Result; this preview stays focused on playback/seek only.
            captureDestinations={[]}
          />
        ) : currentEntry && currentEntry.kind === "gap" ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 border border-dashed border-[#2c3035] rounded">
            <span className="text-xs text-[#4b5158] uppercase tracking-wider">
              Gap — no video to preview
            </span>
            <span className="text-xs font-mono text-[#6e767d]">
              {currentEntry.durationSeconds !== null
                ? `${currentEntry.durationSeconds.toFixed(1)}s`
                : "—"}
            </span>
          </div>
        ) : currentEntry ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 border border-dashed border-[#2c3035] rounded">
            <span className="text-xs text-[#4b5158]">
              {currentEntry.title ?? "This shot"} has no approved video yet.
            </span>
          </div>
        ) : (
          <p className="text-xs text-[#4b5158] py-6 text-center">
            No approved videos in this sequence yet.
          </p>
        )}
      </Card>

      {/* ── Selected — lightweight read-only strip ───────────────── */}
      {selectedItem && (
        <div className="mt-3 flex items-center gap-x-3 gap-y-1 flex-wrap rounded border border-[#232629] bg-[#0d0e10] px-3 py-2">
          <span className="text-[9px] uppercase tracking-wider text-[#4b5158] shrink-0">
            Selected
          </span>
          {selectedItem.type === "gap" ? (
            <>
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#4b5158] border border-[#2c3035] border-dashed rounded px-1.5 py-px">
                Gap
              </span>
              <span className="text-[10px] font-mono text-[#6e767d]">
                {selectedItem.durationSeconds !== null
                  ? `${selectedItem.durationSeconds.toFixed(1)}s`
                  : "—"}
              </span>
              <form
                action={deleteEditorialGap}
                onSubmit={(e) => {
                  if (!window.confirm("Delete this gap? This cannot be undone.")) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="projectId" value={String(projectId)} />
                <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                <input type="hidden" name="itemId" value={String(selectedItem.id)} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="rounded border border-[#3d2323] text-[#cf7b6b] px-2 py-1 text-[10px] hover:border-[#cf7b6b] hover:bg-[#cf7b6b]/10 transition-colors"
                >
                  Delete gap
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="text-[10px] font-mono text-[#6e767d] shrink-0">
                {selectedItem.shotCode ?? "—"}
              </span>
              <span className="text-xs text-[#a4abb2] truncate min-w-0 max-w-[240px]">
                {selectedItem.title ?? "No shot linked"}
              </span>
              <StatusBadgeParts
                isPlaceholder={selectedItem.isPlaceholder}
                hasApprovedVideo={selectedItem.hasApprovedVideo}
              />
              {selectedItemTargetDuration !== null && (
                <span className="text-[10px] font-mono text-[#6e767d]">
                  Target {selectedItemTargetDuration.toFixed(1)}s
                </span>
              )}
              {itemEffective(selectedItem) !== null && (
                <span className="text-[10px] font-mono text-[#5b93d6]">
                  Effective {itemEffective(selectedItem)!.toFixed(1)}s
                </span>
              )}
              {itemHasTrim(selectedItem) && (
                <span className="text-[10px] font-mono text-[#5b93d6]">
                  Trim {selectedItem.trimInSeconds!.toFixed(1)}s →{" "}
                  {selectedItem.trimOutSeconds!.toFixed(1)}s
                </span>
              )}
              {itemHasTrim(selectedItem) && (
                <form action={updateEditorialItemTrim}>
                  <input type="hidden" name="projectId" value={String(projectId)} />
                  <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                  <input type="hidden" name="itemId" value={String(selectedItem.id)} />
                  <input type="hidden" name="clearTrim" value="1" />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    title="Reset trim — restores the shot's source/target duration"
                    className="rounded border border-[#3d3423] text-[#cda24f] px-2 py-1 text-[10px] hover:border-[#cda24f] hover:bg-[#cda24f]/10 transition-colors"
                  >
                    ↺ Reset trim
                  </button>
                </form>
              )}
              {selectedItem.shotId !== null && (
                <>
                  <InsertShotFromEditorialButton
                    projectId={projectId}
                    sequenceId={sequenceId}
                    insertBeforeShotId={selectedItem.shotId}
                    label="Insert Shot Before"
                  />
                  <InsertShotFromEditorialButton
                    projectId={projectId}
                    sequenceId={sequenceId}
                    insertAfterShotId={selectedItem.shotId}
                    label="Insert Shot After"
                  />
                  <Link
                    href={`/projects/${projectId}/sequences/${sequenceId}/shots/${selectedItem.shotId}`}
                    className="ml-auto shrink-0 text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                  >
                    Open Shot Detail →
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      )}

      {selectedItem && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Order</span>
          <form action={moveEditorialItemOrder}>
            <input type="hidden" name="projectId" value={String(projectId)} />
            <input type="hidden" name="sequenceId" value={String(sequenceId)} />
            <input type="hidden" name="itemId" value={String(selectedItem.id)} />
            <input type="hidden" name="direction" value="up" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              disabled={!canMoveItemUp}
              title="Move Up"
              aria-label="Move Up"
              className="rounded border border-[#232629] text-[#6e767d] px-2 py-1 text-[10px] hover:border-[#3a4046] hover:text-[#a4abb2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ↑ Move up
            </button>
          </form>
          <form action={moveEditorialItemOrder}>
            <input type="hidden" name="projectId" value={String(projectId)} />
            <input type="hidden" name="sequenceId" value={String(sequenceId)} />
            <input type="hidden" name="itemId" value={String(selectedItem.id)} />
            <input type="hidden" name="direction" value="down" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              disabled={!canMoveItemDown}
              title="Move Down"
              aria-label="Move Down"
              className="rounded border border-[#232629] text-[#6e767d] px-2 py-1 text-[10px] hover:border-[#3a4046] hover:text-[#a4abb2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ↓ Move down
            </button>
          </form>
        </div>
      )}

      {fallbackSelectedShot && (
        <div className="mt-3 flex items-center gap-x-3 gap-y-1 flex-wrap rounded border border-[#232629] bg-[#0d0e10] px-3 py-2">
          <span className="text-[9px] uppercase tracking-wider text-[#4b5158] shrink-0">
            Selected
          </span>
          <span className="text-[10px] font-mono text-[#6e767d] shrink-0">
            {fallbackSelectedShot.shotCode ?? "—"}
          </span>
          <span className="text-xs text-[#a4abb2] truncate min-w-0 max-w-[240px]">
            {fallbackSelectedShot.title}
          </span>
          <StatusBadgeParts
            isPlaceholder={fallbackSelectedShot.isPlaceholder}
            hasApprovedVideo={fallbackSelectedShot.hasApprovedVideo}
          />
          {fallbackSelectedShot.durationSeconds !== null && (
            <span className="text-[10px] font-mono text-[#6e767d]">
              Target {fallbackSelectedShot.durationSeconds.toFixed(1)}s
            </span>
          )}
          {fallbackSelectedShot.trimInSeconds != null &&
            fallbackSelectedShot.trimOutSeconds != null &&
            fallbackSelectedShot.trimOutSeconds > fallbackSelectedShot.trimInSeconds && (
              <>
                <span className="text-[10px] font-mono text-[#5b93d6]">
                  Effective{" "}
                  {(
                    fallbackSelectedShot.trimOutSeconds -
                    fallbackSelectedShot.trimInSeconds
                  ).toFixed(1)}
                  s
                </span>
                <span className="text-[10px] font-mono text-[#5b93d6]">
                  Trim {fallbackSelectedShot.trimInSeconds.toFixed(1)}s →{" "}
                  {fallbackSelectedShot.trimOutSeconds.toFixed(1)}s
                </span>
              </>
            )}
          <Link
            href={`/projects/${projectId}/sequences/${sequenceId}/shots/${fallbackSelectedShot.id}`}
            className="ml-auto shrink-0 text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Open Shot Detail →
          </Link>
        </div>
      )}

      {/* ── Shot Order & Fallback Controls — single list surface ────
          EDITORIAL.CLEANUP.1: moved here (was a separate block on the
          page) so it shares this component's selection state and can
          drive the player above via the icon button added on each row
          (EDITORIAL.SHOTNAV.1). Removing SequencePreviewPlayer already
          dropped its own duplicate playlist list, so this remains the
          single shot list on the page. Placed above Editorial Timeline
          per the EDITORIAL.POLISH.1 retake. */}
      <SectionLabel label="Shot Order & Fallback Controls" />
      <Card>
        <EditorialShotList
          shots={shots.map((s) => ({
            id: s.id,
            shotCode: s.shotCode,
            title: s.title,
            durationSeconds: s.durationSeconds,
            hasApprovedVideo: s.hasApprovedVideo,
            trimInSeconds: s.trimInSeconds,
            trimOutSeconds: s.trimOutSeconds,
          }))}
          projectId={projectId}
          sequenceId={sequenceId}
          returnTo={returnTo}
          editorialLayerActive={hasEditorialItems}
          onSelectShot={handleSelectShotFromList}
          selectedShotId={listSelectedShotId}
        />
      </Card>

      {/* ── Editorial Timeline — central editing surface ─────────── */}
      <SectionLabel
        label="Editorial Timeline"
        badge={
          hasEditorialItems ? (
            <span className="text-[9px] uppercase tracking-wider text-[#5b93d6] border border-[#5b93d6]/30 rounded px-1.5 py-px">
              Editorial layer active
            </span>
          ) : undefined
        }
      />

      {/* Initialization block — shown until the editorial layer exists */}
      {!hasEditorialItems && shots.length > 0 && (
        <div className="mb-4 rounded border border-[#2c3035] bg-[#0d0e10] px-4 py-3 flex flex-col gap-2">
          <p className="text-xs text-[#a4abb2]">
            Create editable timeline items from the current shot structure.
          </p>
          <p className="text-[10px] text-[#4b5158]">
            This keeps your story shots intact and creates a separate editorial layer
            for gaps, per-clip trims, and montage decisions.
          </p>
          <form action={initializeEditorialTimeline}>
            <input type="hidden" name="projectId" value={String(projectId)} />
            <input type="hidden" name="sequenceId" value={String(sequenceId)} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-xs hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
            >
              Initialize Editorial Timeline
            </button>
          </form>
        </div>
      )}

      <Card>
        <EditorialTimeline
          shots={shots}
          projectId={projectId}
          sequenceId={sequenceId}
          returnTo={returnTo}
          selectedShotId={hasEditorialItems ? null : selectedShotId}
          onSelectShot={setSelectedShotId}
          items={hasEditorialItems ? editorialItems : undefined}
          selectedItemId={hasEditorialItems ? selectedItemId : undefined}
          onSelectItem={hasEditorialItems ? setSelectedItemId : undefined}
        />
      </Card>
    </>
  );
}
