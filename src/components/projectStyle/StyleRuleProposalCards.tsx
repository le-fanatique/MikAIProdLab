// ---------------------------------------------------------------------------
// StyleRuleProposalCards.tsx — LOOK.FEEDBACK.DRAFT.1
//
// Presentation only, extracted from `StyleAdjustAssistPanel.tsx` and
// `StyleDirectorNotePanel.tsx` once the latter's rule-card block was mounted
// a second time on the bench: the two files carried a byte-identical 33-line
// block (the "N rules proposed" summary line plus the checkbox card list),
// measured before extracting — see `.agents/executor_report.md`. Pure JSX
// receiving props; no `useState`, `useEffect` or handler body moved out of
// either caller (mikai-method §5/§8) — `selected`, `isApproving` and the
// toggle handler still live where they always did, only passed down.
//
// The button row below the card list (Approve / Discard) was measured too
// and left alone: `StyleAdjustAssistPanel.tsx`'s Approve button also disables
// on its own `submitting` prop, a condition `StyleDirectorNotePanel.tsx` has
// no equivalent of (it resolves its own state, no parent submission in
// flight) — not the same block, so not folded into this one.
//
// `RuleCard` is declared locally, not imported by either caller: both
// callers' own `ProposedRule` type is structurally identical (same
// discipline `StyleAdjustAssistPanel.tsx`'s own `ApprovedRuleFields` comment
// already states for why cross-file type imports are skipped here).
// ---------------------------------------------------------------------------

type StylePillar = "world" | "visual";
type StyleRuleStrength = "Required" | "Preferred" | "Avoid";

export type RuleCard = {
  instruction: string;
  pillar: StylePillar;
  section: string;
  category: string;
  strength: StyleRuleStrength;
  applicability: string;
  provenanceNotes: string;
};

type Props = {
  rules: RuleCard[];
  selected: Set<number>;
  onToggle: (index: number) => void;
  disabled: boolean;
};

const STRENGTH_CHIP: Record<StyleRuleStrength, string> = {
  Required: "text-[#5fa37a] border-[#5fa37a]/40",
  Preferred: "text-[#5b93d6] border-[#5b93d6]/40",
  Avoid: "text-[#cda24f] border-[#cda24f]/40",
};

export default function StyleRuleProposalCards({ rules, selected, onToggle, disabled }: Props) {
  return (
    <>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
        {rules.length} rule{rules.length !== 1 ? "s" : ""} proposed — {selected.size} selected
      </p>

      <div className="flex flex-col gap-2">
        {rules.map((rule, i) => (
          <label
            key={i}
            className={[
              "rounded border px-3 py-2.5 flex gap-3 cursor-pointer transition-colors",
              selected.has(i) ? "border-[#2c3035] bg-[#141618]" : "border-[#1a1d20] bg-[#0d0e10] opacity-60",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => onToggle(i)}
              disabled={disabled}
              className="accent-[#5b93d6] mt-0.5 shrink-0"
            />
            <div className="flex flex-col gap-1.5 min-w-0">
              <p className="text-sm text-[#e7e9ec]">{rule.instruction}</p>
              <div className="flex flex-wrap gap-1 text-[9px] text-[#4b5158]">
                <span className="border border-[#2c3035] rounded px-1">{rule.pillar === "world" ? "World" : "Visual"}</span>
                <span className={`border rounded px-1 ${STRENGTH_CHIP[rule.strength]}`}>{rule.strength}</span>
                {rule.category && <span className="border border-[#2c3035] rounded px-1">{rule.category}</span>}
                {rule.section && <span className="border border-[#2c3035] rounded px-1">{rule.section}</span>}
              </div>
              {rule.applicability && <p className="text-xs text-[#6e767d]">Applies to: {rule.applicability}</p>}
              {rule.provenanceNotes && <p className="text-xs text-[#4b5158]">{rule.provenanceNotes}</p>}
            </div>
          </label>
        ))}
      </div>
    </>
  );
}
