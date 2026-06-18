const colors: Record<string, string> = {
  draft: "bg-neutral-700 text-neutral-300",
  active: "bg-emerald-900 text-emerald-300",
  archived: "bg-neutral-800 text-neutral-500",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${colors[status] ?? colors.draft}`}
    >
      {status}
    </span>
  );
}
