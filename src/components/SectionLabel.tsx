// WF.GALLERY.1 §2.4 — extracted from the identical local definitions that
// used to live in several pages (shot workflows page among them). Only the
// copies inside files this ticket already touches were removed; every other
// local definition across the app is untouched, per the ticket's own scope
// line ("pas ailleurs").
export default function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}
