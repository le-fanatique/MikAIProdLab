import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";

type Props = {
  role: string | null;
};

export default function ReferenceImageRoleBadge({ role }: Props) {
  if (!role) return null;
  // REFROLE.MVP.1 — uses the shared catalogue's English label
  // ("First Frame", "Continuity Anchor", "Environment View") when the role
  // is known; falls back to a simple underscore-to-space rendering for any
  // stored value the catalogue doesn't recognize. Purely cosmetic, never
  // changes the stored value.
  const displayRole = getReferenceImageRoleLabel(role) ?? role;
  return (
    <span className="inline-flex items-center rounded border border-[#3a4046] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
      {displayRole}
    </span>
  );
}
