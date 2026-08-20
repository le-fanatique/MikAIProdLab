import { addExtractionRegion } from "@/actions/storyboardExtractionRegions";

type Props = {
  extractionId: number;
  returnToActive: string;
};

/** "+ Add Region" form (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function AddRegionForm({ extractionId, returnToActive }: Props) {
  return (
    <div className="mt-3">
      <form action={addExtractionRegion}>
        <input type="hidden" name="extractionId" value={String(extractionId)} />
        <input type="hidden" name="returnTo" value={returnToActive} />
        <button
          type="submit"
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          + Add Region
        </button>
      </form>
    </div>
  );
}
