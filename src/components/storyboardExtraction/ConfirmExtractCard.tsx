import Card from "@/components/Card";
import { confirmStoryboardExtraction } from "@/actions/storyboardExtractionConfirm";

type Props = {
  extractionId: number;
  returnToActive: string;
  assignedCount: number;
};

/** "Confirm & Extract" card (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function ConfirmExtractCard({ extractionId, returnToActive, assignedCount }: Props) {
  return (
    <Card>
      <p className="text-xs text-[#6e767d] mb-3">
        {assignedCount === 0
          ? "No regions are assigned to a Shot yet — assign at least one before extracting."
          : `${assignedCount} region${assignedCount !== 1 ? "s" : ""} will be cropped and saved as draft storyboard images on their assigned Shots. Skipped and unassigned regions are left untouched.`}
      </p>
      <form action={confirmStoryboardExtraction} className="flex items-end gap-3">
        <input type="hidden" name="extractionId" value={String(extractionId)} />
        <input type="hidden" name="returnTo" value={returnToActive} />
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Padding (px, inward)</span>
          <input
            type="number"
            name="padding"
            defaultValue={0}
            min={0}
            className="w-28 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={assignedCount === 0}
          className="rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-3 py-1.5 text-sm font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm & Extract
        </button>
      </form>
    </Card>
  );
}
