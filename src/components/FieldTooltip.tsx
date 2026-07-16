// ---------------------------------------------------------------------------
// FieldTooltip.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX6
//
// CSS-only tooltip (no JS): a small "?" affordance next to a field label
// that reveals its explanation on hover OR keyboard focus, via
// group-hover/group-focus-within on a wrapping <span> around the focusable
// control. Works identically with JS disabled — the explanation is never
// gated behind client-side behavior, only its visibility affordance is.
// Ticket requires every advanced-parameter tooltip to be reachable via
// mouse hover AND keyboard focus, in English.
// ---------------------------------------------------------------------------

export default function FieldTooltip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex items-center">
      <span
        tabIndex={0}
        aria-label={text}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[#3a4046] text-[8px] leading-none text-[#6e767d] cursor-help select-none focus:outline-none focus:border-[#5b93d6] focus:text-[#5b93d6]"
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-1.5 w-56 -translate-x-1/2 rounded border border-[#2c3035] bg-[#141618] px-2 py-1.5 text-[10px] leading-snug text-[#a4abb2] opacity-0 shadow-lg transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
