type Props = {
  role: string | null;
};

export default function ReferenceImageRoleBadge({ role }: Props) {
  if (!role) return null;
  // ASSET.BIBLE.2 — roles like "full_body"/"environment_view" read better
  // as "full body"/"environment view" once the uppercase tracking-wide
  // styling is applied; purely cosmetic, no change to the stored value.
  const displayRole = role.replace(/_/g, " ");
  return (
    <span className="inline-flex items-center rounded border border-[#3a4046] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
      {displayRole}
    </span>
  );
}
