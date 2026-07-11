"use client";

import { useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import EditorialTimeline, {
  type EditorialTimelineShot,
  type EditorialItemView,
} from "@/components/EditorialTimeline";
import SequencePreviewPlayer from "@/components/SequencePreviewPlayer";
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

  // Legacy selection (no-items fallback)
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  // Item selection (editorial layer active)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

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

  return (
    <>
      {/* ── Sequence Viewer — dominant, on top ───────────────────── */}
      <SectionLabel label="Sequence Viewer" />
      <Card>
        <SequencePreviewPlayer
          shots={shots.map((s) => ({
            id: s.id,
            shotCode: s.shotCode,
            title: s.title,
            durationSeconds: s.durationSeconds,
            videoUrl: s.videoUrl,
            isPlaceholder: s.isPlaceholder,
            trimInSeconds: s.trimInSeconds,
            trimOutSeconds: s.trimOutSeconds,
          }))}
          projectId={projectId}
          sequenceId={sequenceId}
          {...(hasEditorialItems
            ? {
                items: editorialItems.map((it) => ({
                  itemId: it.id,
                  type: it.type,
                  shotId: it.shotId,
                  shotCode: it.shotCode,
                  title: it.title,
                  videoUrl: it.videoUrl,
                  durationSeconds: it.durationSeconds,
                  trimInSeconds: it.trimInSeconds,
                  trimOutSeconds: it.trimOutSeconds,
                  isPlaceholder: it.isPlaceholder,
                })),
                selectedItemId,
                onItemSelect: setSelectedItemId,
              }
            : {
                selectedShotId,
                onShotSelect: setSelectedShotId,
              })}
        />
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
