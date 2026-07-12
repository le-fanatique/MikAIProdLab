"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateShotNarrativeContext } from "@/actions/shots";
import TextFieldTranslationButton from "@/components/TextFieldTranslationButton";

function appendText(current: string, addition: string): string {
  return current.trim() ? `${current}\n\n${addition}` : addition;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-1">
        {label}
      </div>
      <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

type Props = {
  shotId: number;
  sequenceId: number;
  projectId: number;
  description: string | null;
  actionPitch: string | null;
  cameraPitch: string | null;
};

/**
 * Inline editor for Shot Detail's Narrative Context text fields
 * (UX.POLISH.2) — description/actionPitch/cameraPitch only, not the
 * parent sequence's own context (read-only here, editable from Sequence
 * Detail instead) and not continuity/camera fields (separate Cards, out
 * of this ticket's scope).
 */
export default function ShotNarrativeContextEditor({
  shotId,
  sequenceId,
  projectId,
  description: initialDescription,
  actionPitch: initialActionPitch,
  cameraPitch: initialCameraPitch,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState(initialDescription ?? "");
  const [actionPitch, setActionPitch] = useState(initialActionPitch ?? "");
  const [cameraPitch, setCameraPitch] = useState(initialCameraPitch ?? "");

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateShotNarrativeContext(shotId, sequenceId, projectId, {
      description: description.trim() || null,
      actionPitch: actionPitch.trim() || null,
      cameraPitch: cameraPitch.trim() || null,
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
    setDescription(initialDescription ?? "");
    setActionPitch(initialActionPitch ?? "");
    setCameraPitch(initialCameraPitch ?? "");
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        {initialDescription && <Field label="Description" value={initialDescription} />}
        {initialActionPitch && <Field label="Action Pitch" value={initialActionPitch} />}
        {initialCameraPitch && <Field label="Camera Pitch" value={initialCameraPitch} />}
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
          Description
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={saving}
          className="rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 resize-y focus:outline-none focus:border-[#3a4046] disabled:opacity-60"
        />
        <TextFieldTranslationButton
          getSourceText={() => description}
          onReplace={(t) => setDescription(t)}
          onAppend={(t) => setDescription(appendText(description, t))}
          disabled={saving}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Action Pitch
        </span>
        <textarea
          value={actionPitch}
          onChange={(e) => setActionPitch(e.target.value)}
          rows={2}
          disabled={saving}
          className="rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 resize-y focus:outline-none focus:border-[#3a4046] disabled:opacity-60"
        />
        <TextFieldTranslationButton
          getSourceText={() => actionPitch}
          onReplace={(t) => setActionPitch(t)}
          onAppend={(t) => setActionPitch(appendText(actionPitch, t))}
          disabled={saving}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Camera Pitch
        </span>
        <textarea
          value={cameraPitch}
          onChange={(e) => setCameraPitch(e.target.value)}
          rows={2}
          disabled={saving}
          className="rounded border border-[#2c3035] bg-[#0e1013] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-2.5 py-1.5 resize-y focus:outline-none focus:border-[#3a4046] disabled:opacity-60"
        />
        <TextFieldTranslationButton
          getSourceText={() => cameraPitch}
          onReplace={(t) => setCameraPitch(t)}
          onAppend={(t) => setCameraPitch(appendText(cameraPitch, t))}
          disabled={saving}
        />
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
