type Props = { position: string | null };

const POSITION_LABEL: Record<string, string> = {
  start: "Start",
  middle: "Mid",
  end: "End",
};

export default function TimingPositionBadge({ position }: Props) {
  if (!position) return null;
  const label = POSITION_LABEL[position] ?? position;
  return (
    <span className="inline-flex items-center rounded border border-[#2c3035] px-1.5 py-0.5 text-[10px] font-mono uppercase text-[#4b5158]">
      {label}
    </span>
  );
}
