type Props = {
  role: string | null;
};

export default function ReferenceImageRoleBadge({ role }: Props) {
  if (!role) return null;
  return (
    <span className="inline-flex items-center rounded border border-[#3a4046] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
      {role}
    </span>
  );
}
