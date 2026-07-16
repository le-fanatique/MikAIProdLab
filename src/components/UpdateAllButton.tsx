"use client";

// ---------------------------------------------------------------------------
// UpdateAllButton.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX4
//
// Collects the CURRENTLY DISPLAYED x/y/width/height of every editable
// region (from the existing per-region numeric <input id="region-{id}-x">
// fields, already kept in sync with drag/resize by RegionCropBox) and
// submits them as one batch to resizeAllExtractionRegions — a real form
// POST, not a fetch() call. All DOM reads and the field write happen in
// response to this button's own click, never during render, so there is no
// hydration mismatch risk and no new client-side DB write path.
// ---------------------------------------------------------------------------

type Props = {
  regionIds: number[];
  formId: string;
  hiddenFieldId: string;
};

export default function UpdateAllButton({ regionIds, formId, hiddenFieldId }: Props) {
  return (
    <button
      type="button"
      onClick={() => {
        const edits = regionIds.map((id) => {
          const get = (field: string) => (document.getElementById(`region-${id}-${field}`) as HTMLInputElement | null)?.value ?? "";
          return {
            regionId: id,
            x: Number(get("x")),
            y: Number(get("y")),
            width: Number(get("width")),
            height: Number(get("height")),
          };
        });
        const hidden = document.getElementById(hiddenFieldId) as HTMLInputElement | null;
        if (hidden) hidden.value = JSON.stringify(edits);
        const form = document.getElementById(formId) as HTMLFormElement | null;
        form?.requestSubmit();
      }}
      className="rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-3 py-1.5 text-sm font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors"
    >
      Update All
    </button>
  );
}
