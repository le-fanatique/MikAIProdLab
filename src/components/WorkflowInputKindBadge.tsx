type Props = { kind: string };

const KIND_CONFIG: Record<string, { label: string; className: string }> = {
  text: { label: "Text", className: "text-[#cda24f] border-[#cda24f]/30" },
  image: { label: "Image", className: "text-[#5b93d6] border-[#5b93d6]/30" },
  seed: { label: "Seed", className: "text-[#b89a5a] border-[#b89a5a]/30" },
  integer: { label: "Integer", className: "text-[#8b78d6] border-[#8b78d6]/30" },
  float: { label: "Float", className: "text-[#6b9ea0] border-[#6b9ea0]/30" },
  boolean: { label: "Boolean", className: "text-[#6b9e72] border-[#6b9e72]/30" },
  select: { label: "Select", className: "text-[#b079cf] border-[#b079cf]/30" },
  string: { label: "String", className: "text-[#a4abb2] border-[#a4abb2]/30" },
  unknown: { label: "Unknown", className: "text-[#4b5158] border-[#232629]" },
};

const FALLBACK = { label: "Unknown", className: "text-[#4b5158] border-[#232629]" };

export default function WorkflowInputKindBadge({ kind }: Props) {
  const config = KIND_CONFIG[kind] ?? FALLBACK;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${config.className}`}
    >
      {config.label}
    </span>
  );
}
