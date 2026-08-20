export default function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-8 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">{label}</span>
    </div>
  );
}
