"use client";

import { useState } from "react";
import { saveNomenclatureSettings } from "@/actions/settings";

type Props = {
  initialSequenceTemplate: string;
  initialShotTemplate: string;
};

export default function NomenclatureSettingsForm({
  initialSequenceTemplate,
  initialShotTemplate,
}: Props) {
  const [seqTemplate, setSeqTemplate] = useState(initialSequenceTemplate);
  const [shotTemplate, setShotTemplate] = useState(initialShotTemplate);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);

    const result = await saveNomenclatureSettings({
      sequenceTemplate: seqTemplate,
      shotTemplate: shotTemplate,
    });

    if (result.ok) {
      setSaved(true);
    } else {
      setError(result.error);
    }
    setIsSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
          <p className="text-xs text-[#cf7b6b]">{error}</p>
        </div>
      )}
      {saved && (
        <div className="rounded border border-[#6b9e72]/30 bg-[#1a2e1e] px-3 py-2">
          <p className="text-xs text-[#6b9e72]">Nomenclature settings saved.</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-[#6e767d]">Sequence Code Template</label>
        <input
          type="text"
          value={seqTemplate}
          onChange={(e) => { setSeqTemplate(e.target.value); setSaved(false); }}
          placeholder="Sq_1XXX"
          className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 font-mono focus:outline-none focus:border-[#3a4046]"
        />
        <p className="text-[10px] text-[#4b5158]">
          Example: Sq_1000, Sq_2000, Sq_3000 — X count defines the step (XXX = 1000, XX = 100).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-[#6e767d]">Shot Code Template</label>
        <input
          type="text"
          value={shotTemplate}
          onChange={(e) => { setShotTemplate(e.target.value); setSaved(false); }}
          placeholder="Sh_1XX"
          className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 font-mono focus:outline-none focus:border-[#3a4046]"
        />
        <p className="text-[10px] text-[#4b5158]">
          Example: Sh_100, Sh_200, Sh_300 — scoped per sequence.
        </p>
      </div>

      <div>
        <button
          type="submit"
          disabled={isSaving}
          className={
            isSaving
              ? "rounded border border-[#1e2124] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
              : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          }
        >
          {isSaving ? "Saving…" : "Save Nomenclature"}
        </button>
      </div>
    </form>
  );
}
