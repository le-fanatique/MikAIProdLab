"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ImageSourcePicker from "@/components/ImageSourcePicker";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { uploadShotSourceFromPanel, uploadAssetSourceFromPanel } from "@/actions/panelUpload";
import { refImageUrl } from "@/lib/refImageUrl";
import { getRolesWithNamedGuideMode } from "@/lib/llmWorkspace/conformation/profiles/guideDefault";
import {
  buildBatchRoleOverrideParamKey,
  serializeBatchRoleOverridesParam,
  pruneBatchRoleOverrides,
} from "@/lib/comfy/dynamicBatchRoleOverrides";
import {
  buildBatchNoteParamKey,
  serializeBatchImageNotesParam,
  pruneBatchImageNotes,
  MAX_BATCH_IMAGE_NOTE_LENGTH,
} from "@/lib/comfy/dynamicBatchImageNotes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BatchImageItem = {
  id: string;
  imagePath: string;
  label: string;
  // SEQGEN.VIDEO.1 — "board" added additively (RuntimeImageSource now
  // includes it too); no existing caller ever passes it, this only widens
  // the type to stay assignable from RuntimeImageOption[].
  source: "shot" | "asset" | "board";
  assetName?: string;
};

export type BatchImageGroup = {
  groupLabel: string;
  items: BatchImageItem[];
};

export type BatchExpansionPreview = {
  batchTitle: string;
  templateChainTitles: string[];
  selectedImageCount: number;
  clonedNodeCount: number;
  /**
   * COMFY.DIRECTPORTS.1, Part D — which expansion mode `buildGenerationPayload`
   * detected for this node, so the author can see what MikAI recognized
   * without opening the workflow JSON. Optional: only ShotGenerationPanel
   * threads it through today; every other caller keeps rendering the same
   * preview as before.
   */
  mode?: "dynamic-batch" | "direct-repeatable-inputs";
};

// ---------------------------------------------------------------------------
// Shared key helper (T2 — workflow-keyed sessionStorage)
// ---------------------------------------------------------------------------

export function buildBatchKey(workflowId: string, batchNodeId: string): string {
  return `mikai.dynamicBatchImages.${workflowId}.${batchNodeId}`;
}

export type BatchError =
  | { kind: "detection"; message: string }
  | { kind: "none" };

type Props = {
  batchNodeId: string;
  preview: BatchExpansionPreview | null;
  error: BatchError | null;
  availableImages: BatchImageGroup[];
  selectedImageIds: string[];
  /**
   * REFROLE.INTENT.1 — the current job-level role overlay, `id -> role`,
   * for this batch node. Never written to the library — only the URL's
   * `batchImageRoles_<nodeId>` sibling param and sessionStorage. Absent ids
   * fall back to the library's own stored role (rendered by the caller as
   * this component's "role of the library" default).
   */
  roleOverrides?: Record<string, string>;
  /**
   * SHOTPROMPT.REFS.2 — the current job-level free-text note overlay,
   * `id -> note`, for this batch node. Never written to the library — only
   * the URL's `batchImageNotes_<nodeId>` sibling param and sessionStorage.
   * Absent ids carry no note.
   */
  noteOverrides?: Record<string, string>;
  passthroughParams: Record<string, string>;
  basePath: string;
  /** "shot" or "asset" determine which panel upload server action to use; "sequence" (SEQGEN.STORYBOARD.3) has no upload action — only casting references already in the DB feed the batch, so the Upload Image form is not rendered for it. */
  contextType: "shot" | "asset" | "sequence";
  /** SEQGEN.STORYBOARD.CASTING.FIX1 — Lot C. Renders the "Add From Casting" button, restricted to the Sequence Storyboard surface only (contextType "sequence" is also used by Sequence Video, which this ticket never touches). Defaults to false everywhere else. */
  showAddFromCasting?: boolean;
  /**
   * SEQGEN.STORYBOARD.CASTING.FIX1 (Retake Round 2). Restricted to the
   * Sequence Storyboard surface only. When true, an explicit user action
   * that empties the batch (`Clear Images`, removing the last image) keeps
   * `batchImages_<nodeId>` PRESENT but empty in both the URL and
   * sessionStorage, instead of omitting the key entirely. This surface's
   * contract is: param absent = preload the full casting selection; param
   * present (even empty) = authoritative. Omitting the key on empty would
   * silently resurrect the full casting selection on the next render — the
   * opposite of what `Clear Images` means here. Shot/Asset/Sequence Video
   * callers never pass this (default `false`), so their existing
   * default-preserve convention (absent = show everything available) is
   * byte-identical.
   */
  preserveExplicitEmptySelection?: boolean;
  projectId: number;
  workflowId: string;
  shotId?: number;
  sequenceId?: number;
  assetId?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBatchParamKey(batchNodeId: string): string {
  return `batchImages_${batchNodeId}`;
}

// REFROLE.INTENT.1 — offered roles are exactly those with a named guide
// mode. Read once at module scope: the table is static within a session,
// and this keeps every render from re-deriving it.
const NAMED_GUIDE_MODE_ROLES = getRolesWithNamedGuideMode();

/** Build incrementing batch slot labels like "image1", "image2", etc. */
function buildBatchSlotLabels(index: number): string {
  return index === 0 ? "image1" : `image${index + 1}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DynamicBatchImageList({
  batchNodeId,
  preview,
  error,
  availableImages,
  selectedImageIds,
  roleOverrides: roleOverridesProp,
  noteOverrides: noteOverridesProp,
  passthroughParams,
  basePath,
  contextType,
  showAddFromCasting = false,
  preserveExplicitEmptySelection = false,
  projectId,
  workflowId,
  shotId,
  sequenceId,
  assetId,
}: Props) {
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>(selectedImageIds);
  // REFROLE.INTENT.1 — job-level role overlay, id -> role. Never written to
  // the library; lives only in the URL's sibling param + sessionStorage.
  const [roleOverrides, setRoleOverrides] = useState<Record<string, string>>(roleOverridesProp ?? {});
  // SHOTPROMPT.REFS.2 — job-level note overlay, id -> note. Same rule.
  const [notes, setNotes] = useState<Record<string, string>>(noteOverridesProp ?? {});
  const [pickerOpen, setPickerOpen] = useState(false);

  // Combine all available images into flat picker items
  const allPickerItems = availableImages.flatMap((g) => g.items);

  // T2 — workflow-keyed sessionStorage
  const ssKey = buildBatchKey(workflowId, batchNodeId);
  // REFROLE.INTENT.1 — sibling sessionStorage key for the role overlay.
  const roleSsKey = `${ssKey}.roles`;
  // SHOTPROMPT.REFS.2 — sibling sessionStorage key for the note overlay.
  const noteSsKey = `${ssKey}.notes`;

  // Seed sessionStorage from initial URL params on mount so the hidden input
  // can read a fresh value on the very first Generate click after page load.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(ssKey) === null) {
        sessionStorage.setItem(ssKey, selectedImageIds.length > 0 ? selectedImageIds.join(",") : "");
      }
      // REFROLE.INTENT.1 — same seeding for the role overlay.
      if (sessionStorage.getItem(roleSsKey) === null) {
        const initialRoles = roleOverridesProp ?? {};
        const serialized = serializeBatchRoleOverridesParam(initialRoles);
        sessionStorage.setItem(roleSsKey, serialized);
      }
      // SHOTPROMPT.REFS.2 — same seeding for the note overlay.
      if (sessionStorage.getItem(noteSsKey) === null) {
        const initialNotes = noteOverridesProp ?? {};
        const serializedNotes = serializeBatchImageNotesParam(initialNotes);
        sessionStorage.setItem(noteSsKey, serializedNotes);
      }
    } catch { /* sessionStorage unavailable */ }
  }, [ssKey, roleSsKey, noteSsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * REFROLE.INTENT.1 — `nextRoleOverrides` defaults to pruning the current
   * overrides down to `newIds` (`pruneBatchRoleOverrides`, the same rule
   * `pruneDynamicBatchIds` applies to the selection itself), so every
   * selection-changing caller below elides a removed image's override for
   * free. `handleRoleChange` is the only caller that passes an explicit map
   * (ids unchanged, only the overlay itself changes).
   *
   * SHOTPROMPT.REFS.2 — `nextNotes` follows the exact same rule
   * (`pruneBatchImageNotes`): a note for an image no longer selected is
   * elided along with it, never resurrected.
   */
  function pushState(
    newIds: string[],
    nextRoleOverrides?: Record<string, string>,
    nextNotes?: Record<string, string>
  ) {
    const prunedRoles = nextRoleOverrides ?? pruneBatchRoleOverrides(roleOverrides, newIds);
    setRoleOverrides(prunedRoles);
    const prunedNotes = nextNotes ?? pruneBatchImageNotes(notes, newIds);
    setNotes(prunedNotes);

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(passthroughParams)) {
      if (
        !k.startsWith("batchImages_") &&
        !k.startsWith("batchImageRoles_") &&
        !k.startsWith("batchImageNotes_") &&
        k !== "jobId"
      )
        params.set(k, v);
    }
    const urlKey = buildBatchParamKey(batchNodeId);
    const roleUrlKey = buildBatchRoleOverrideParamKey(batchNodeId);
    const noteUrlKey = buildBatchNoteParamKey(batchNodeId);
    // Retake Round 2 — once the user has explicitly acted on this batch
    // (this function only ever runs from an explicit action), the param
    // stays PRESENT even when it empties out, on the Sequence Storyboard
    // surface only. Every other surface keeps the historical "empty means
    // absent" behavior byte-identical.
    if (newIds.length > 0 || preserveExplicitEmptySelection) {
      params.set(urlKey, newIds.join(","));
    }
    const serializedRoles = serializeBatchRoleOverridesParam(prunedRoles);
    // REFROLE.INTENT.1 — additive sibling param: only present when there is
    // at least one override, so a URL with none is byte-identical to a URL
    // predating this ticket.
    if (serializedRoles) {
      params.set(roleUrlKey, serializedRoles);
    }
    const serializedNotes = serializeBatchImageNotesParam(prunedNotes);
    // SHOTPROMPT.REFS.2 — same additive-only convention as the role overlay.
    if (serializedNotes) {
      params.set(noteUrlKey, serializedNotes);
    }
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });

    // Sync sessionStorage immediately so DynamicBatchFormSync can read it
    // at submit time before router.replace has updated window.location.search.
    try {
      if (newIds.length > 0 || preserveExplicitEmptySelection) {
        sessionStorage.setItem(ssKey, newIds.join(","));
      } else {
        sessionStorage.removeItem(ssKey);
      }
      sessionStorage.setItem(roleSsKey, serializedRoles);
      sessionStorage.setItem(noteSsKey, serializedNotes);
    } catch {
      // sessionStorage unavailable — ignore, URL-based sync is fallback.
    }
  }

  // T1 — Clear Images
  function handleClear() {
    setSelected([]);
    pushState([]);
  }

  function handleRemove(id: string) {
    const next = selected.filter((s) => s !== id);
    setSelected(next);
    pushState(next);
  }

  function handleAdd(id: string) {
    if (selected.includes(id)) return;
    const next = [...selected, id];
    setSelected(next);
    pushState(next);
    setPickerOpen(false);
  }

  // SEQGEN.STORYBOARD.CASTING.FIX1 — Lot C. Appends every casting reference
  // not already in the current batch, in `allPickerItems`' own order (the
  // caller's casting order for the "sequence" context), preserving the
  // already-chosen order/subset and never duplicating an id already
  // present. Same update path as `handleAdd` — one state update, one
  // `pushState` (React state, URL, sessionStorage all move together,
  // consistent before a same-tick submit).
  function handleAddFromCasting() {
    const missing = allPickerItems.filter((item) => !selected.includes(item.id)).map((item) => item.id);
    if (missing.length === 0) return;
    const next = [...selected, ...missing];
    setSelected(next);
    pushState(next);
  }

  // REFROLE.INTENT.1 — the role selector's onChange. Empty value ("(library
  // role)") clears the override for that id rather than storing an empty
  // string, so a returned-to-default id never lingers in the URL param.
  function handleRoleChange(id: string, role: string) {
    const next = { ...roleOverrides };
    if (role) {
      next[id] = role;
    } else {
      delete next[id];
    }
    pushState(selected, next);
  }

  // SHOTPROMPT.REFS.2 — a controlled keystroke-level update to local state
  // only, so the URL/sessionStorage/router.replace round trip does not run
  // on every character typed. `handleNoteBlur` commits the current `notes`
  // state via `pushState` once the user leaves the field.
  function handleNoteInputChange(id: string, value: string) {
    const bounded = value.length > MAX_BATCH_IMAGE_NOTE_LENGTH ? value.slice(0, MAX_BATCH_IMAGE_NOTE_LENGTH) : value;
    setNotes((prev) => {
      const next = { ...prev };
      if (bounded.trim()) {
        next[id] = bounded;
      } else {
        delete next[id];
      }
      return next;
    });
  }

  function handleNoteBlur() {
    pushState(selected, roleOverrides, notes);
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...selected];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setSelected(next);
    pushState(next);
  }

  function handleMoveDown(index: number) {
    if (index === selected.length - 1) return;
    const next = [...selected];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setSelected(next);
    pushState(next);
  }

  // Get label for a selected image id
  function getLabel(id: string): string {
    const img = allPickerItems.find((i) => i.id === id);
    return img ? img.label : id;
  }

  function getRoleLabel(id: string): string | undefined {
    for (const group of availableImages) {
      const img = group.items.find((i) => i.id === id);
      if (img) return group.groupLabel;
    }
    return undefined;
  }

  function getImagePath(id: string): string {
    const img = allPickerItems.find((i) => i.id === id);
    return img ? img.imagePath : "";
  }

  // --- Error state ---
  if (error && error.kind === "detection") {
    return (
      <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2.5">
        <p className="text-xs text-[#cf7b6b]">{error.message}</p>
      </div>
    );
  }

  // --- Preview ---
  const hasPreview = preview && preview.selectedImageCount >= 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Section label */}
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Dynamic Image Batch
        </p>
        <p className="text-[10px] text-[#4b5158]">
          These images will be expanded into the Dynamic Batch at generation time.
        </p>
      </div>

      {/* T5 — Runtime Expansion Preview (polished) */}
      {hasPreview && preview!.batchTitle && (
        <div className="flex flex-col gap-2 rounded border border-[#2a2f35] bg-[#131518] px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#5a6168]">
            Runtime Expansion Preview
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-[#5a6168]">Batch node</span>
              <span className="text-xs text-[#a4abb2]">
                {preview!.batchTitle}
                {preview!.mode && (
                  <span className="ml-1.5 text-[10px] text-[#5a6168]">
                    ({preview!.mode === "dynamic-batch" ? "Dynamic Batch" : "Direct repeatable inputs"})
                  </span>
                )}
              </span>
            </div>
            {preview!.templateChainTitles.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#5a6168]">Template chain</span>
                <span className="text-xs text-[#a4abb2]">
                  {preview!.templateChainTitles.join(" → ")}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-[#5a6168]">Selected images</span>
              <span className="text-xs text-[#e7e9ec]">{selected.length}</span>
            </div>
            {selected.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#5a6168]">Batch inputs</span>
                <span className="text-xs font-mono text-[#8fbbe8]">
                  {selected.map((_, i) => buildBatchSlotLabels(i)).join(", ")}
                </span>
              </div>
            )}
            {preview!.clonedNodeCount > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#5a6168]">Runtime clones</span>
                <span className="text-xs text-[#a4abb2]">{preview!.clonedNodeCount} nodes</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* T4 — Selected images list with improved reorder feedback */}
      {selected.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Selected Images
            </p>
            <p className="text-[10px] text-[#4b5158]">
              Images are sent in order: {selected.map((_, i) => buildBatchSlotLabels(i)).join(", ")}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {selected.map((id, index) => (
              <div
                key={id}
                className="flex flex-col gap-1 rounded border border-[#232629] bg-[#1a1d20] px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#5a6168] font-mono w-16 shrink-0 text-left">
                    {buildBatchSlotLabels(index)}
                  </span>
                  <div className="w-7 h-7 rounded overflow-hidden bg-[#141618] shrink-0 flex items-center justify-center">
                    <ThumbnailHoverPreview
                      src={refImageUrl(getImagePath(id))}
                      alt={getLabel(id)}
                      className="w-full h-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={refImageUrl(getImagePath(id))}
                        alt={getLabel(id)}
                        className="w-full h-full object-contain"
                      />
                    </ThumbnailHoverPreview>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs text-[#a4abb2] truncate">
                      {getLabel(id)}
                    </span>
                    {getRoleLabel(id) && (
                      <span className="text-[10px] text-[#4b5158] truncate">
                        {getRoleLabel(id)}
                      </span>
                    )}
                  </div>
                  {/* REFROLE.INTENT.1 — job-level role overlay for this
                      generation only; never writes to the library. Default
                      option ("(library role)") clears the override. */}
                  <select
                    value={roleOverrides[id] ?? ""}
                    onChange={(e) => handleRoleChange(id, e.target.value)}
                    title="Override this image's role for this generation only"
                    className="shrink-0 rounded border border-[#2c3035] bg-[#141618] text-[10px] text-[#a4abb2] px-1.5 py-1 max-w-[9.5rem]"
                  >
                    <option value="">(library role)</option>
                    {NAMED_GUIDE_MODE_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="text-[10px] text-[#5a6168] hover:text-[#e7e9ec] transition-colors px-1.5 py-1 rounded hover:bg-[#2a2f35] disabled:opacity-20 disabled:cursor-default"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === selected.length - 1}
                      className="text-[10px] text-[#5a6168] hover:text-[#e7e9ec] transition-colors px-1.5 py-1 rounded hover:bg-[#2a2f35] disabled:opacity-20 disabled:cursor-default"
                      title="Move Down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(id)}
                      className="text-[10px] text-[#6e767d] hover:text-[#cf7b6b] transition-colors px-1.5 py-0.5 rounded hover:bg-[#2a1a1a]"
                      title="Remove"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {/* SHOTPROMPT.REFS.2 — job-level free-text note for this
                    generation only; never writes to the library. Lands at
                    the end of this image's Subject Definition line. */}
                <input
                  type="text"
                  value={notes[id] ?? ""}
                  onChange={(e) => handleNoteInputChange(id, e.target.value)}
                  onBlur={handleNoteBlur}
                  maxLength={MAX_BATCH_IMAGE_NOTE_LENGTH}
                  placeholder="Note for this image (optional) — e.g. reference for the first image of the shot"
                  title="Add a short note explaining why this image was sent, for this generation only"
                  className="ml-[4.5rem] rounded border border-[#2c3035] bg-[#141618] text-[10px] text-[#a4abb2] px-1.5 py-1 placeholder:text-[#4b5158]"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* T3 — Improved warning message. COMFY.EMPTYSEL.1, Part C — names the
          actual mode this workflow was detected in, via `preview.mode`
          (COMFY.DIRECTPORTS.1 §8); falls back to the original Dynamic Batch
          wording when a caller doesn't thread `mode` through yet, so every
          caller but the one this ticket targets keeps its exact current
          text. */}
      {selected.length === 0 && (
        <div className="rounded border border-[#5c4a24]/60 bg-[#141008] px-3 py-2">
          <p className="text-xs text-[#b89a5a]">
            {preview?.mode === "direct-repeatable-inputs"
              ? "Add at least one image to the direct repeatable image inputs before generating."
              : "Add at least one image to the Dynamic Batch before generating."}
          </p>
        </div>
      )}

      {/* T1 + Add image section */}
      <div className="flex flex-col gap-2">
        {/* T1 — Clear Images button (only visible when images selected) */}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="self-start rounded border border-[#3a2820] text-[#cf7b6b] px-2.5 py-1 text-xs hover:border-[#5a3830] hover:text-[#e89478] hover:bg-[#2a1210] transition-colors"
          >
            Clear Images
          </button>
        )}
        {/* Lot C — "Add From Casting", Sequence Storyboard only. Hidden once
            every casting reference is already in the batch. */}
        {showAddFromCasting && allPickerItems.some((item) => !selected.includes(item.id)) && (
          <button
            type="button"
            onClick={handleAddFromCasting}
            className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Add From Casting
          </button>
        )}
        {!pickerOpen ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Add Image
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#6e767d]">Select from available images:</span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
              >
                Cancel
              </button>
            </div>
            <ImageSourcePicker
              groups={availableImages.map((g) => ({
                groupLabel: g.groupLabel,
                items: g.items.map((i) => ({
                  id: i.id,
                  imagePath: i.imagePath,
                  label: i.label,
                })),
              }))}
              selectedId=""
              onSelect={handleAdd}
            />
          </div>
        )}
      </div>

      {/* Upload form — not offered in "sequence" context (SEQGEN.STORYBOARD.3):
          only casting references already in the DB feed the Sequence
          Storyboard batch in this MVP, no ad hoc upload target. */}
      {contextType !== "sequence" && (
        <form
          action={contextType === "shot" ? uploadShotSourceFromPanel : uploadAssetSourceFromPanel}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="projectId" value={String(projectId)} />
          {contextType === "shot" && (
            <>
              <input type="hidden" name="shotId" value={String(shotId ?? "")} />
              <input type="hidden" name="sequenceId" value={String(sequenceId ?? "")} />
            </>
          )}
          {contextType === "asset" && (
            <input type="hidden" name="assetId" value={String(assetId ?? "")} />
          )}
          <input type="hidden" name="nodeId" value={batchNodeId} />
          <input
            type="hidden"
            name="returnTo"
            value={(() => {
              const p = new URLSearchParams();
              for (const [k, v] of Object.entries(passthroughParams)) {
                if (
                  !k.startsWith("batchImages_") &&
                  !k.startsWith("batchImageRoles_") &&
                  !k.startsWith("batchImageNotes_") &&
                  k !== "jobId"
                )
                  p.set(k, v);
              }
              const key = buildBatchParamKey(batchNodeId);
              if (selected.length > 0) p.set(key, selected.join(","));
              // REFROLE.INTENT.1 — the role overlay survives the same
              // upload-then-return round trip as the selection itself.
              const roleKey = buildBatchRoleOverrideParamKey(batchNodeId);
              const serializedRoles = serializeBatchRoleOverridesParam(roleOverrides);
              if (serializedRoles) p.set(roleKey, serializedRoles);
              // SHOTPROMPT.REFS.2 — same round trip for the note overlay.
              const noteKey = buildBatchNoteParamKey(batchNodeId);
              const serializedNotes = serializeBatchImageNotesParam(notes);
              if (serializedNotes) p.set(noteKey, serializedNotes);
              return `${basePath}?${p.toString()}`;
            })()}
          />
          <input
            type="file"
            name="imageFile"
            accept={[".jpg", ".jpeg", ".png", ".webp", ".gif", "image/jpeg", "image/png", "image/webp", "image/gif"].join(",")}
            className="flex-1 min-w-0 text-xs text-[#6e767d] file:mr-2 file:rounded file:border file:border-[#2c3035] file:bg-[#1a1d20] file:px-2 file:py-1 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
          />
          <button
            type="submit"
            className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Upload Image
          </button>
        </form>
      )}
    </div>
  );
}