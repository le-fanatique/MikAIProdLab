type Props = { type: string };

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  character: {
    label: "Character",
    className: "text-[#5b93d6] border-[#5b93d6]/30",
  },
  environment: {
    label: "Environment",
    className: "text-[#5fa37a] border-[#5fa37a]/30",
  },
  prop: {
    label: "Prop",
    className: "text-[#cda24f] border-[#cda24f]/30",
  },
  vehicle: {
    label: "Vehicle",
    className: "text-[#a4abb2] border-[#3a4046]",
  },
  crowd: {
    label: "Crowd",
    className: "text-[#6e767d] border-[#2c3035]",
  },
  other: {
    label: "Other",
    className: "text-[#4b5158] border-[#232629]",
  },
};

export default function AssetTypeBadge({ type }: Props) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG["other"];
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${config.className}`}
    >
      {config.label}
    </span>
  );
}
