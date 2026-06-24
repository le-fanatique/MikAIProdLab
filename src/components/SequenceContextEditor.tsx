"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSequenceContext } from "@/actions/sequences";

type Props = {
  sequenceId: number;
  projectId: number;
  summary: string | null;
  description: string | null;
  narrativePurpose: string | null;
  mood: string | null;
  locationHint: string | null;
};

export default function SequenceContextEditor({
  sequenceId,
  projectId,
  summary: initialSummary,
  description: initialDescription,
  narrativePurpose: initialNarrativePurpose,
  mood: initialMood,
  locationHint: initialLocationHint,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState(initialSummary ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [narrativePurpose, setNarrativePurpose] = useState(initialNarrativePurpose ?? "");
  const [mood, setMood] = useState(initialMood ?? "");
  const [locationHint, setLocationHint] = useState(initialLocationHint ?? "");

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateSequenceContext(sequenceId, projectId, {
      summary: summary.trim() || null,
      description: description.trim() || null,
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
    setDescription(initialDescription ?? "");
    setNarrativePurpose(initialNarrativePurpose ?? "");
    setMood(initialMood ?? "");
    setLocationHint(initialLocationHint ?? "");
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    const hasAny =
      initialSummary || initialNarrativePurpose || initialMood || initialLocationHint;
    return (
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 pl-9 mb-1.5">
        {initialNarrativePurpose && (
          <span className="text-[10px]">
            <span className="text-[#3a4046]">Purpose </span>
            <span className="text-[#4b5158]">{initialNarrativePurpose}</span>
          </span>
        )}
        {initialMood && (
          <span className="text-[10px]">
            <span className="text-[#3a4046]">Mood </span>
            <span className="text-[#4b5158]">{initialMood}</span>
          </span>
        )}
        {initialLocationHint && (
          <span className="text-[10px]">
            <span className="text-[#3a4046]">Location </span>
            <span className="text-[#4b5158]">{initialLocationHint}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[10px] text-[#3a4046] hover:text-[#6e767d] transition-colors underline"
        >
          {hasAny ? "Edit context" : "Add context"}
        </button>
      </div>
    );
  }

  return (
    <div className="pl-9 mb-3 flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded border border-[#2c3035] bg-[#141618] p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
              Summary
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              disabled={saving}
              className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] placeholder-[#3a4046] px-2 py-1.5 resize-none focus:outline-none focus:border-[#3a4046]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={saving}
              className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] placeholder-[#3a4046] px-2 py-1.5 resize-none focus:outline-none focus:border-[#3a4046]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
              Narrative Purpose
            </span>
            <input
              type="text"
              value={narrativePurpose}
              onChange={(e) => setNarrativePurpose(e.target.value)}
              disabled={saving}
              className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] placeholder-[#3a4046] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
              Mood
            </span>
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              disabled={saving}
              className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] placeholder-[#3a4046] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
              Location Hint
            </span>
            <input
              type="text"
              value={locationHint}
              onChange={(e) => setLocationHint(e.target.value)}
              disabled={saving}
              className="rounded border border-[#2c3035] bg-[#0e1013] text-xs text-[#e7e9ec] placeholder-[#3a4046] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </label>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={
              saving
                ? "rounded border border-[#232629] text-[#3a4046] px-3 py-1 text-xs cursor-not-allowed"
                : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            }
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded border border-[#232629] text-[#4b5158] px-3 py-1 text-xs hover:text-[#6e767d] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
