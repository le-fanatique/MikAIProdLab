"use client";

import { useRef, useState } from "react";
import { generateAssetDescriptionOnlyDraft, generateAssetNotesOnlyDraft } from "@/actions/llm/assetDescription";
import { updateAssetDescriptionFieldInline } from "@/actions/assets";
import { LLM_APPLY_ACTION_CLASS } from "@/lib/uiClasses";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; draft: string }
  | { status: "error"; message: string };

type Field = "description" | "notes";

type Props = {
  projectId: number;
  assetId: number;
  hasExisting: boolean;
  isConfigured: boolean;
  hasUsageContext: boolean;
};

const FIELD_LABEL: Record<Field, string> = { description: "Description", notes: "Notes" };
const FIELD_ACTION: Record<Field, string> = { description: "Enhance Description", notes: "Enhance Notes" };

/**
 * UX.PRODUCTIVITY.POLISH.1 — Lot C. One independent field's enhance flow:
 * its own idle/loading/error/success state, its own synchronous
 * anti-double-submit lock (`busyRef` — checked before any async call
 * starts, unlike React state which only updates after a render), its own
 * preview and Replace/Append actions. Generating/applying/discarding this
 * field never touches the sibling field's panel — each is a fully separate
 * component instance.
 */
function FieldEnhancePanel({
  field,
  projectId,
  assetId,
  hasExisting,
  isConfigured,
  hasUsageContext,
}: Props & { field: Field }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [applied, setApplied] = useState<"replaced" | "appended" | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const busyRef = useRef(false);

  async function handleGenerate() {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ status: "loading" });
    try {
      const fd = new FormData();
      fd.set("projectId", String(projectId));
      fd.set("assetId", String(assetId));
      const result =
        field === "description" ? await generateAssetDescriptionOnlyDraft(fd) : await generateAssetNotesOnlyDraft(fd);
      if (result.ok) {
        setState({ status: "success", draft: result.draft });
        setApplied(null);
        setApplyError(null);
      } else {
        setState({ status: "error", message: result.error });
      }
    } catch (err) {
      // A rejected Server Action (transport/network failure) must still
      // leave the panel in a recoverable state — never stuck on "loading"
      // with no way to retry.
      setState({ status: "error", message: err instanceof Error ? err.message : "Unexpected error. Please try again." });
    } finally {
      busyRef.current = false;
    }
  }

  async function handleApply(mode: "replace" | "append") {
    if (state.status !== "success" || !state.draft.trim() || busyRef.current) return;
    busyRef.current = true;
    setIsApplying(true);
    setApplyError(null);
    try {
      const result = await updateAssetDescriptionFieldInline({
        assetId,
        projectId,
        field,
        mode,
        content: state.draft.trim(),
      });
      if (result.ok) {
        setApplied(mode === "replace" ? "replaced" : "appended");
      } else {
        setApplyError(result.error);
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsApplying(false);
      busyRef.current = false;
    }
  }

  const buttonClass = isConfigured
    ? "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
    : "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed";
  const applyButtonClass = `px-2.5 py-1.5 text-xs font-medium ${LLM_APPLY_ACTION_CLASS}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        {`Generate ${FIELD_LABEL[field].toLowerCase()} from this asset's story, outline, sequence, and shot context.`}
      </p>

      {!isConfigured && (
        <p className="text-xs text-[#cf7b6b]">
          {`LLM is not configured. Configure it in Settings to generate asset ${FIELD_LABEL[field].toLowerCase()}.`}
        </p>
      )}

      {isConfigured && !hasUsageContext && state.status === "idle" && (
        <p className="text-xs text-[#b89a5a]">
          Limited context: this asset is not assigned to any sequence or shot yet. The draft may be generic.
        </p>
      )}

      {state.status === "idle" && (
        <button type="button" onClick={handleGenerate} disabled={!isConfigured} className={buttonClass}>
          {FIELD_ACTION[field]}
        </button>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">Analyzing asset context...</p>
      )}

      {state.status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          <button type="button" onClick={handleGenerate} className={buttonClass}>
            Try Again
          </button>
        </div>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-2">
          {applyError && (
            <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
              <p className="text-xs text-[#cf7b6b]">{applyError}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              {`${FIELD_LABEL[field]} Draft`}
            </p>
            {applied && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a2e1e] text-[#6b9e72] font-medium">
                {applied === "replaced" ? "Replaced" : "Appended"}
              </span>
            )}
          </div>

          <div className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2.5">
            <p className="text-sm text-[#a4abb2] leading-relaxed whitespace-pre-wrap">{state.draft}</p>
          </div>

          {hasExisting && !applied && (
            <p className="text-xs text-[#b89a5a]">{`This will replace your current ${FIELD_LABEL[field].toLowerCase()}.`}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleApply("replace")}
              disabled={isApplying || applied === "replaced"}
              className={applyButtonClass}
            >
              {`Replace ${FIELD_LABEL[field]}`}
            </button>
            <button
              type="button"
              onClick={() => handleApply("append")}
              disabled={isApplying || applied === "appended"}
              className={applyButtonClass}
            >
              {`Append to ${FIELD_LABEL[field]}`}
            </button>
          </div>

          <div className="flex items-center gap-3 border-t border-[#1e2124] pt-2">
            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssetDescriptionEnhancePanel(props: Omit<Props, "hasExisting"> & { hasExistingDescription: boolean }) {
  return <FieldEnhancePanel field="description" {...props} hasExisting={props.hasExistingDescription} />;
}

export function AssetNotesEnhancePanel(props: Omit<Props, "hasExisting"> & { hasExistingNotes: boolean }) {
  return <FieldEnhancePanel field="notes" {...props} hasExisting={props.hasExistingNotes} />;
}
