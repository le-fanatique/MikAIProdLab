"use client";

// ---------------------------------------------------------------------------
// UseShotCountButton.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX3
//
// Pre-fills the Columns/Rows fields of the Detection Settings form with a
// suggested factorization, computed server-side (computeGridFactorization
// in workerContract.ts) and passed in as plain props — this component only
// performs an imperative DOM write in response to a real click, never
// during render, so there is no hydration mismatch risk.
// ---------------------------------------------------------------------------

type Props = {
  columnsFieldId: string;
  rowsFieldId: string;
  suggestedColumns: number;
  suggestedRows: number;
};

export default function UseShotCountButton({ columnsFieldId, rowsFieldId, suggestedColumns, suggestedRows }: Props) {
  return (
    <button
      type="button"
      onClick={() => {
        const columnsEl = document.getElementById(columnsFieldId) as HTMLInputElement | null;
        const rowsEl = document.getElementById(rowsFieldId) as HTMLInputElement | null;
        if (columnsEl) columnsEl.value = String(suggestedColumns);
        if (rowsEl) rowsEl.value = String(suggestedRows);
      }}
      className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-[11px] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
      title={`Fill Columns/Rows with ${suggestedColumns}x${suggestedRows}, matching this Sequence's Shot count`}
    >
      Use Shot count ({suggestedColumns}×{suggestedRows})
    </button>
  );
}
