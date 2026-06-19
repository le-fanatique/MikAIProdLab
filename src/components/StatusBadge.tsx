const styles: Record<string, string> = {
  draft: "border border-[#3a4046] text-[#6e767d]",
  active: "border border-[#5fa37a]/40 text-[#5fa37a] bg-[#5fa37a]/10",
  archived: "border border-[#232629] text-[#4b5158]",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${styles[status] ?? styles.draft}`}
    >
      {status}
    </span>
  );
}
