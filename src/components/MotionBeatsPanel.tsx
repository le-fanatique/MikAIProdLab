import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import MotionBeatTypeBadge from "@/components/MotionBeatTypeBadge";
import TimingPositionBadge from "@/components/TimingPositionBadge";

type BeatRow = {
  id: number;
  beatType: string;
  label: string;
  description: string | null;
  timingPosition: string | null;
  editHref: string;
  deleteAction: () => Promise<void>;
};

type Props = {
  beats: BeatRow[];
  addHref: string;
};

export default function MotionBeatsPanel({ beats, addHref }: Props) {
  if (beats.length === 0) {
    return (
      <EmptyState
        title="No beats yet."
        description="Structure the timing of this shot by adding motion, camera, or performance beats."
        action={
          <Link
            href={addHref}
            className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            + Add Beat →
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {beats.map((beat) => (
          <div
            key={beat.id}
            className="border-b border-[#1a1d20] last:border-0 py-2.5 flex items-start gap-3"
          >
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              <MotionBeatTypeBadge type={beat.beatType} />
              <TimingPositionBadge position={beat.timingPosition} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#e7e9ec]">{beat.label}</p>
              {beat.description && (
                <p className="text-xs text-[#6e767d] mt-0.5 leading-relaxed">
                  {beat.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href={beat.editHref}
                className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
              >
                Edit
              </Link>
              <DeleteButton
                action={beat.deleteAction}
                confirm="Delete this beat?"
                label="Del"
                className="text-xs text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors"
              />
            </div>
          </div>
        ))}
      </div>
      <Link
        href={addHref}
        className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
      >
        + Add Beat
      </Link>
    </div>
  );
}
