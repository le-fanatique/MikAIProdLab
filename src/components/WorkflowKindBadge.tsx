type Props = { kind: string };

const KIND_CONFIG: Record<string, { label: string; className: string }> = {
  image: { label: "Image", className: "text-[#5b93d6] border-[#5b93d6]/30" },
  video: { label: "Video", className: "text-[#9b7fd4] border-[#9b7fd4]/30" },
};

const FALLBACK = { label: "Unknown", className: "text-[#4b5158] border-[#232629]" };

export default function WorkflowKindBadge({ kind }: Props) {
  const config = KIND_CONFIG[kind] ?? FALLBACK;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${config.className}`}
    >
      {config.label}
    </span>
  );
}
