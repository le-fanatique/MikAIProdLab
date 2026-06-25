"use client";

import { useState } from "react";
import { updateAssetDetailsInline } from "@/actions/assets";

type Props = {
  projectId: number;
  assetId: number;
  description: string | null;
  notes: string | null;
  returnTo: string;
};

export default function AssetInlineDetailsForm({
  projectId,
  assetId,
  description: initialDescription,
  notes: initialNotes,
  returnTo,
}: Props) {
  const [description, setDescription] = useState(initialDescription ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateAssetDetailsInline({
        assetId,
        projectId,
        description,
        notes,
      });
      if (result.ok) {
        // Construct returnTo with detailsUpdated param
        const sep = returnTo.includes("?") ? "&" : "?";
        window.location.href = `${returnTo}${sep}detailsUpdated=1`;
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
          <p className="text-xs text-[#cf7b6b]">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="description" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
          placeholder="Describe this asset..."
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
          placeholder="Add any additional notes..."
        />
      </div>

      <p className="text-xs text-[#4b5158]">
        Description and notes are used as the text prompt for asset image generation.
      </p>

      <div className="flex items-center gap-2 border-t border-[#1e2124] pt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={
            isSaving
              ? "rounded border border-[#1e2124] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
              : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          }
        >
          Save Details
        </button>
      </div>
    </div>
  );
}
