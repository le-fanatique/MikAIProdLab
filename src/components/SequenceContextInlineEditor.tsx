"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSequenceContext } from "@/actions/sequences";
import TextFieldTranslationButton from "@/components/TextFieldTranslationButton";

function appendText(current: string, addition: string): string {
  return current.trim() ? `${current}\n\n${addition}` : addition;
}

function appendInline(current: string, addition: string): string {
  return current.trim() ? `${current.trim()}, ${addition}` : addition;
}

type Props = {
  sequenceId: number;
  projectId: number;
  summary: string | null;
  /** Not shown in this Card's read-only view, but preserved unchanged on save so it's never silently cleared. */
  description: string | null;
  narrativePurpose: string | null;
  mood: string | null;
  locationHint: string | null;
};

/**
 * Inline editor for Sequence Detail's Context Card (UX.POLISH.2) —
 * summary/narrativePurpose/mood/locationHint, matching the fields already
 * displayed there. Distinct from SequenceContextEditor (used on the
 * Outline page's compact sequence list, which also edits `description`
 * and has a different collapsed layout) — kept separate so neither
 * surface's existing visual conventions regress.
 */
export default function SequenceContextInlineEditor({
  sequenceId,
  projectId,
  summary: initialSummary,
  description,
  narrativePurpose: initialNarrativePurpose,
  mood: initialMood,
  locationHint: initialLocationHint,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState(initialSummary ?? "");
  const [narrativePurpose, setNarrativePurpose] = useState(initialNarrativePurpose ?? "");
  const [mood, setMood] = useState(initialMood ?? "");
  const [locationHint, setLocationHint] = useState(initialLocationHint ?? "");

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateSequenceContext(sequenceId, projectId, {
      summary: summary.trim() || null,
      description,
      narrativePurpose: narrativePurpose.trim() || null,
      mood: mood.trim() || null,
      locationHint: locationHint.trim() || null,
    });
    if (result.ok) {
      setSaving(false);
      setEditing(false);
      router.refresh();
    } else {
      setSaving(false);
      setError(result.error);
    }
  }

  function handleCancel() {
    setSummary(initialSummary ?? "");
    setNarrativePurpose(initialNarrativePurpose ?? "");
    setMood(initialMood ?? "");
    setLocationHint(initialLocationHint ?? "");
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        {initialSummary && (
          <p className="text-sm text-[#a4abb2] leading-relaxed">{initialSummary}</p>
        )}
        {(initialNarrativePurpose || initialMood || initialLocationHint) && (
          <div className="flex flex-wrap gap-4 text-xs">
            {initialNarrativePurpose && (
              <span>
                <span className="text-[#4b5158]">Purpose </span>
                <span className="text-[#6e767d]">{initialNarrativePurpose}</span>
              </span>
            )}
            {initialMood && (
              <span>
                <span className="text-[#4b5158]">Mood </span>
                <span className="text-[#6e767d]">{initialMood}</span>
              </span>
            )}
            {initialLocationHint && (
              <span>
                <span className="text-[#4b5158]">Location </span>
                <span className="text-[#6e767d]">{initialLocationHint}</span>
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Summary
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          disabled={saving}
          className="rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 resize-y focus:outline-none focus:border-[#3a4046] disabled:opacity-60"
        />
        <TextFieldTranslationButton
          getSourceText={() => summary}
          onReplace={(t) => setSummary(t)}
          onAppend={(t) => setSummary(appendText(summary, t))}
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Purpose
          </span>
          <input
            type="text"
            value={narrativePurpose}
            onChange={(e) => setNarrativePurpose(e.target.value)}
            disabled={saving}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 focus:outline-none focus:border-[#3a4046] disabled:opacity-60"
          />
          <TextFieldTranslationButton
            getSourceText={() => narrativePurpose}
            onReplace={(t) => setNarrativePurpose(t)}
            onAppend={(t) => setNarrativePurpose(appendInline(narrativePurpose, t))}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Mood
          </span>
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            disabled={saving}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 focus:outline-none focus:border-[#3a4046] disabled:opacity-60"
          />
          <TextFieldTranslationButton
            getSourceText={() => mood}
            onReplace={(t) => setMood(t)}
            onAppend={(t) => setMood(appendInline(mood, t))}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Location
          </span>
          <input
            type="text"
            value={locationHint}
            onChange={(e) => setLocationHint(e.target.value)}
            disabled={saving}
            className="rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 focus:outline-none focus:border-[#3a4046] disabled:opacity-60"
          />
          <TextFieldTranslationButton
            getSourceText={() => locationHint}
            onReplace={(t) => setLocationHint(t)}
            onAppend={(t) => setLocationHint(appendInline(locationHint, t))}
            disabled={saving}
          />
        </div>
      </div>

      {error && <p className="text-xs text-[#cf7b6b]">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={
            saving
              ? "rounded border border-[#232629] text-[#3a4046] px-3 py-1.5 text-xs cursor-not-allowed"
              : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          }
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="rounded border border-[#232629] text-[#4b5158] px-3 py-1.5 text-xs hover:text-[#6e767d] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
