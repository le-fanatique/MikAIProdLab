"use client";

// ---------------------------------------------------------------------------
// RowBackground.tsx — UX.MEDIA.PREVIEW.1
//
// Shared presentation + editor for the Project/Sequence navigation row
// background preference (decorative image + adjustable opacity).
//
// `RowBackgroundLayer` is the read-only decorative layer, reused wherever a
// row/card wants to show the same background without a second
// implementation (Sidebar, /projects list rows, /projects/[id] Sequence
// cards). `RowBackgroundEditButton` is the compact editor — Upload/Replace,
// opacity slider, Remove, Cancel/Close — always rendered as a SIBLING of any
// enclosing <Link>, never nested inside one, and never triggers navigation.
// ---------------------------------------------------------------------------

import { useEffect, useId, useRef, useState } from "react";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  uploadRowBackgroundImageAction,
  setRowBackgroundOpacityAction,
  removeRowBackgroundImageAction,
  type RowBackgroundOwner,
} from "@/actions/rowBackgrounds";
import {
  MIN_ROW_BACKGROUND_OPACITY,
  MAX_ROW_BACKGROUND_OPACITY,
} from "@/lib/navigationBackground/rowBackgroundOpacity";

// ---------------------------------------------------------------------------
// Decorative layer
// ---------------------------------------------------------------------------

type LayerProps = {
  imagePath: string | null;
  opacity: number | null;
  className?: string;
};

/** Purely decorative — absolutely positioned under a `relative` parent, `object-cover`, with a dark veil so overlaid text/actions stay legible at any opacity. Renders nothing when there is no image. */
export function RowBackgroundLayer({ imagePath, opacity, className }: LayerProps) {
  if (!imagePath) return null;
  const effectiveOpacity = opacity ?? 0.2;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={refImageUrl(imagePath)}
        alt=""
        className="w-full h-full object-cover"
        style={{ opacity: effectiveOpacity }}
      />
      <div className="absolute inset-0 bg-[#0d0e10]" style={{ opacity: 1 - effectiveOpacity * 0.6 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export type RowBackgroundEditState = {
  rowBackgroundImagePath: string | null;
  rowBackgroundOpacity: number | null;
  updatedAt: string;
};

type EditorProps = {
  owner: RowBackgroundOwner;
  state: RowBackgroundEditState;
  /** Accessible label for the trigger button, e.g. "Edit Project background". */
  label: string;
  onChange?: (next: RowBackgroundEditState) => void;
};

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

export function RowBackgroundEditButton({ owner, state, label, onChange }: EditorProps) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<RowBackgroundEditState>(state);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [opacityDraft, setOpacityDraft] = useState<number>(state.rowBackgroundOpacity ?? 0.2);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const opacitySliderRef = useRef<HTMLInputElement>(null);
  // Set true by the slider's own mouseup/touchend/keyup handlers right
  // before calling handleOpacityCommit; consumed by the effect below once
  // `pending` actually turns back false (i.e. after React has committed the
  // re-render that removes `disabled` — a plain `.focus()` call in
  // `finally` would still hit the not-yet-updated, still-disabled DOM node).
  const refocusOpacityAfterCommit = useRef(false);
  // Retake Round 1 (Codex P1) — `pending` (React state) is presentational
  // only; two activations in the SAME tick both read its stale `false`
  // value before either `setPending(true)` commit lands, so it cannot
  // actually prevent a double Server Action call (dblclick, or two
  // synchronous activations). This ref is set synchronously, before the
  // first `await`, and is the ONLY thing every mutation actually gates on.
  const mutationInFlight = useRef(false);
  // Retake Round 1 (Codex P2) — a unique id per instance so two popovers
  // open at once (one per row) never render two `id="row-bg-opacity"`
  // elements with ambiguous `<label htmlFor>` associations.
  const opacityInputId = `row-bg-opacity-${useId()}`;

  // Resync from the parent's `state` only when its durable `updatedAt`
  // actually changes (e.g. a mutation from THIS editor via `applyResult`,
  // or a fresh server value after navigation) — adjusting state during
  // render per React's own guidance, rather than in a `useEffect` (which
  // would fire on every parent re-render, since Sidebar recomputes a new
  // `state` object identity each render even when its content is
  // unchanged, and would otherwise cascade an extra render every time).
  const [syncedUpdatedAt, setSyncedUpdatedAt] = useState(state.updatedAt);
  if (state.updatedAt !== syncedUpdatedAt) {
    setSyncedUpdatedAt(state.updatedAt);
    setLive(state);
    setOpacityDraft(state.rowBackgroundOpacity ?? 0.2);
  }

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (!pending && refocusOpacityAfterCommit.current) {
      refocusOpacityAfterCommit.current = false;
      opacitySliderRef.current?.focus();
    }
  }, [pending]);

  function applyResult(next: RowBackgroundEditState) {
    setLive(next);
    setOpacityDraft(next.rowBackgroundOpacity ?? 0.2);
    onChange?.(next);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    if (!file) return;
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalFile(file);
    setLocalPreviewUrl(URL.createObjectURL(file));
  }

  async function handleUpload() {
    if (mutationInFlight.current || !localFile) return;
    mutationInFlight.current = true;
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const result = await uploadRowBackgroundImageAction(owner, localFile, live.updatedAt);
      if (result.ok) {
        applyResult({
          rowBackgroundImagePath: result.rowBackgroundImagePath,
          rowBackgroundOpacity: result.rowBackgroundOpacity,
          updatedAt: result.updatedAt,
        });
        if (result.warning) setWarning(result.warning);
        setLocalFile(null);
        if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        // Preserve the local selection on failure — never drop what the user picked.
        setError(result.error);
      }
    } catch {
      setError("Unexpected error while uploading.");
    } finally {
      mutationInFlight.current = false;
      setPending(false);
    }
  }

  async function handleOpacityCommit(value: number) {
    if (mutationInFlight.current || !live.rowBackgroundImagePath) return;
    mutationInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await setRowBackgroundOpacityAction(owner, value, live.updatedAt);
      if (result.ok) {
        applyResult({
          rowBackgroundImagePath: result.rowBackgroundImagePath,
          rowBackgroundOpacity: result.rowBackgroundOpacity,
          updatedAt: result.updatedAt,
        });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected error while updating opacity.");
    } finally {
      mutationInFlight.current = false;
      setPending(false);
    }
  }

  async function handleRemove() {
    if (mutationInFlight.current || !live.rowBackgroundImagePath) return;
    mutationInFlight.current = true;
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const result = await removeRowBackgroundImageAction(owner, live.updatedAt);
      if (result.ok) {
        applyResult({
          rowBackgroundImagePath: null,
          rowBackgroundOpacity: null,
          updatedAt: result.updatedAt,
        });
        if (result.warning) setWarning(result.warning);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected error while removing the background.");
    } finally {
      mutationInFlight.current = false;
      setPending(false);
    }
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  const previewSrc = localPreviewUrl ?? (live.rowBackgroundImagePath ? refImageUrl(live.rowBackgroundImagePath) : null);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center justify-center w-5 h-5 rounded text-[#4b5158] hover:text-[#a4abb2] hover:bg-[#232629] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="5.2" cy="6.2" r="1.2" stroke="currentColor" strokeWidth="1.1" />
          <path d="M2 11.5L5.8 8.2C6.3 7.75 7 7.75 7.5 8.2L9.3 9.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M8.5 11.5L11.3 8.9C11.8 8.45 12.5 8.45 13 8.9L14 9.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop — closes the popover on outside click, never intercepts anything else. */}
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            role="dialog"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            className="absolute left-0 top-6 z-50 w-64 rounded-lg border border-[#2c3035] bg-[#141618] shadow-xl p-3 flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#4b5158]">Row background</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="text-[#4b5158] hover:text-[#a4abb2] text-xs"
              >
                ✕
              </button>
            </div>

            {previewSrc ? (
              <div className="relative w-full h-20 rounded overflow-hidden border border-[#232629] bg-[#0d0e10]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewSrc} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-full h-20 rounded border border-dashed border-[#232629] flex items-center justify-center text-[10px] text-[#4b5158]">
                No image
              </div>
            )}

            <label className="flex items-center justify-center gap-1.5 rounded border border-[#2c3035] bg-[#1a1d20] text-[#a4abb2] px-2 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors cursor-pointer">
              <span>{live.rowBackgroundImagePath ? "Replace image" : "Upload image"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                disabled={pending}
                onChange={handleFileChange}
              />
            </label>

            {localFile && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={pending}
                className="rounded border border-[#5b93d6]/40 text-[#5b93d6] px-2 py-1.5 text-xs hover:border-[#5b93d6]/70 hover:text-[#8fbbe8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pending ? "Uploading…" : `Save "${localFile.name}"`}
              </button>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={opacityInputId} className="text-[10px] uppercase tracking-wider text-[#4b5158]">
                  Opacity
                </label>
                <span className="text-[10px] font-mono text-[#6e767d]">{Math.round(opacityDraft * 100)}%</span>
              </div>
              <input
                ref={opacitySliderRef}
                id={opacityInputId}
                type="range"
                min={MIN_ROW_BACKGROUND_OPACITY}
                max={MAX_ROW_BACKGROUND_OPACITY}
                step={0.01}
                value={opacityDraft}
                disabled={pending || !live.rowBackgroundImagePath}
                onChange={(e) => setOpacityDraft(parseFloat(e.target.value))}
                onMouseUp={() => { refocusOpacityAfterCommit.current = true; handleOpacityCommit(opacityDraft); }}
                onTouchEnd={() => { refocusOpacityAfterCommit.current = true; handleOpacityCommit(opacityDraft); }}
                onKeyUp={() => { refocusOpacityAfterCommit.current = true; handleOpacityCommit(opacityDraft); }}
                className="w-full accent-[#6b9e72] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRemove}
                disabled={pending || !live.rowBackgroundImagePath}
                className="flex-1 rounded border border-[#cf7b6b]/30 text-[#cf7b6b] px-2 py-1.5 text-xs hover:border-[#cf7b6b]/60 hover:text-[#e0a194] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Remove image
              </button>
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Close
              </button>
            </div>

            {error && <p className="text-[10px] text-[#cf7b6b]">{error}</p>}
            {warning && <p className="text-[10px] text-[#cda24f]">{warning}</p>}
          </div>
        </>
      )}
    </div>
  );
}
