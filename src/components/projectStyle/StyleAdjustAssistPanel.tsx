"use client";

// ---------------------------------------------------------------------------
// StyleAdjustAssistPanel.tsx — STYLE.LLM.ADJUST.UI.1 (ticket 3b of
// "L'assistant de Project Style", 2026-08-23)
//
// The only surface for `style.adjustDirected` (STYLE.LLM.ADJUST.CORE.1): a
// director's note free-text trigger, modelled on
// `AssetRetakeDirectedPanel.tsx` (disabled-until-direction button, no
// descriptor import — the operation is named, never imported), and a
// checkbox review list modelled on `CastingSuggestionsPanel.tsx` (own local
// state machine, not `ProposalPanel`) — because approval here is N
// independent, sequential writes through `handleAddRule`, not one draft with
// one Approve action, which is the shape `ProposalPanel`'s
// `approveActions`/`renderDraft` contract assumes.
//
// Reuses `ProjectStyleWorkspace.tsx`'s own `handleAddRule` exactly as
// written — no second write path, no `ACTION_BINDINGS`, nothing added to
// `proposalCommit.ts`. Each approved rule is a separate `handleAddRule`
// call, awaited one at a time: two concurrent calls sharing the same
// `expectedRevision` would make the server refuse the second as stale
// (ticket's own vigilance point).
//
// No persistence: the proposal is client state only (§2.3 of the
// architecture), discarded on Discard or on leaving the page — the approved
// rules are the only durable trace, already written through
// `addRuleAction`.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { LLM_APPLY_ACTION_CLASS } from "@/lib/uiClasses";

type StylePillar = "world" | "visual";
type StyleRuleStrength = "Required" | "Preferred" | "Avoid";

type ProposedRule = {
  instruction: string;
  pillar: StylePillar;
  section: string;
  category: string;
  strength: StyleRuleStrength;
  applicability: string;
  provenanceNotes: string;
};

/** Structurally identical to `Omit<RuleRow, "id" | "status" | "orderIndex">`
 * — `handleAddRule`'s own parameter type in `ProjectStyleWorkspace.tsx`.
 * Not imported: `RuleRow` isn't exported there, and this ticket does not
 * touch that file's exports. TypeScript's structural typing makes the two
 * interchangeable at the call site below. */
type ApprovedRuleFields = {
  instruction: string;
  pillar: StylePillar | null;
  section: string | null;
  category: string | null;
  strength: StyleRuleStrength | null;
  applicability: string | null;
  provenanceNotes: string | null;
};

type Props = {
  projectId: number;
  handleAddRule: (fields: ApprovedRuleFields) => Promise<boolean>;
  submitting: boolean;
  /** `style.adjustDirected` resolved server-side by the Project Style page —
   * this client component never imports a descriptor itself, same rule
   * `AssetRetakeDirectedPanel` states in its own props comment. Unlike the
   * Asset Bible case, this descriptor's advisory is not conditioned on a
   * staleness flag: it states a permanent fact ("lives in the Working Draft
   * until published"), so it is always defined. */
  commitAdvisory?: string;
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; rules: ProposedRule[] }
  | { status: "error"; message: string };

const STYLE_PILLAR_VALUES: StylePillar[] = ["world", "visual"];
const STYLE_RULE_STRENGTH_VALUES: StyleRuleStrength[] = ["Required", "Preferred", "Avoid"];

function isStylePillar(v: unknown): v is StylePillar {
  return typeof v === "string" && (STYLE_PILLAR_VALUES as string[]).includes(v);
}
function isStyleRuleStrength(v: unknown): v is StyleRuleStrength {
  return typeof v === "string" && (STYLE_RULE_STRENGTH_VALUES as string[]).includes(v);
}

/** Presentation only, mirrors `CastingSuggestionsPanel.tsx`'s own
 * `toSuggestion`. The runner's `readEnumField`/`readStringField`
 * (`src/lib/llmWorkspace/runner.ts`) already guarantee `pillar`/`strength`
 * are one of the descriptor's declared values and every string field is
 * present (possibly `""`) — this is a straight field-by-field read, never a
 * decision, so it stays inline rather than becoming a tested `src/lib/`
 * module (see the executor report for why no test was added for it). */
function toProposedRule(item: Record<string, string | number | boolean>): ProposedRule {
  return {
    instruction: typeof item.instruction === "string" ? item.instruction : "",
    pillar: isStylePillar(item.pillar) ? item.pillar : "visual",
    section: typeof item.section === "string" ? item.section : "",
    category: typeof item.category === "string" ? item.category : "",
    strength: isStyleRuleStrength(item.strength) ? item.strength : "Preferred",
    applicability: typeof item.applicability === "string" ? item.applicability : "",
    provenanceNotes: typeof item.provenanceNotes === "string" ? item.provenanceNotes : "",
  };
}

const STRENGTH_CHIP: Record<StyleRuleStrength, string> = {
  Required: "text-[#5fa37a] border-[#5fa37a]/40",
  Preferred: "text-[#5b93d6] border-[#5b93d6]/40",
  Avoid: "text-[#cda24f] border-[#cda24f]/40",
};

export default function StyleAdjustAssistPanel({ projectId, handleAddRule, submitting, commitAdvisory }: Props) {
  const [freeText, setFreeText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isApproving, setIsApproving] = useState(false);
  // `failedInstruction` identifies which rule stopped the sequence; the
  // failure's own message is not duplicated here — `handleAddRule` already
  // routes it into `ProjectStyleWorkspace`'s top-level `error` banner
  // (`setError(result.error)`), which this panel points to rather than
  // re-deriving a message `handleAddRule`'s boolean return does not carry.
  const [approveNotice, setApproveNotice] = useState<{ addedCount: number; failedInstruction: string | null } | null>(null);
  const [showAdvisory, setShowAdvisory] = useState(false);

  const hasDirection = Boolean(freeText.trim());

  async function handleGenerate() {
    setState({ status: "loading" });
    setApproveNotice(null);
    setShowAdvisory(false);
    const result = await runWorkspaceOperation({
      descriptorId: "style.adjustDirected",
      ids: { projectId },
      intent: { freeText: freeText || undefined },
    });
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    if (result.kind !== "list") {
      setState({ status: "error", message: "Expected a list of proposed rules." });
      return;
    }
    const rules = result.items.map(toProposedRule);
    setState({ status: "success", rules });
    // All checked by default (ticket requirement).
    setSelected(new Set(rules.map((_, i) => i)));
  }

  function toggleSelected(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function discard() {
    setState({ status: "idle" });
    setSelected(new Set());
    setApproveNotice(null);
  }

  async function handleApproveSelected() {
    if (state.status !== "success" || isApproving) return;
    const toApprove = state.rules.filter((_, i) => selected.has(i));
    if (toApprove.length === 0) return;

    setIsApproving(true);
    setApproveNotice(null);

    let addedCount = 0;
    let failedInstruction: string | null = null;
    let remaining = state.rules;

    for (const rule of toApprove) {
      const ok = await handleAddRule({
        instruction: rule.instruction,
        pillar: rule.pillar,
        section: rule.section,
        category: rule.category,
        strength: rule.strength,
        applicability: rule.applicability,
        provenanceNotes: rule.provenanceNotes,
      });
      if (!ok) {
        failedInstruction = rule.instruction;
        break;
      }
      addedCount += 1;
      remaining = remaining.filter((r) => r !== rule);
    }

    setIsApproving(false);
    setApproveNotice({ addedCount, failedInstruction });
    if (remaining.length > 0) {
      setState({ status: "success", rules: remaining });
      setSelected(new Set(remaining.map((_, i) => i)));
    } else {
      setState({ status: "idle" });
      setSelected(new Set());
    }
    if (addedCount > 0 && commitAdvisory) setShowAdvisory(true);
  }

  return (
    <div className="rounded border border-[#232629] p-4 flex flex-col gap-3 [background-color:var(--mikros-border,#2c3035)]">
      <h3 className="text-xs font-medium uppercase tracking-wider [color:var(--mikros-text-primary,#e7e9ec)]">Adjust Style (Directed)</h3>
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Describe what you want to change in the Working Draft — medium, texture, palette, tone — and the assistant proposes atomic Style Rules to review and approve.
      </p>

      {showAdvisory && commitAdvisory && <p className="text-xs text-[#b89a5a]">{commitAdvisory}</p>}

      {approveNotice && (
        <p className={`text-xs ${approveNotice.failedInstruction ? "text-[#cf7b6b]" : "text-[#6b9e72]"}`}>
          {approveNotice.addedCount > 0
            ? `Added ${approveNotice.addedCount} rule${approveNotice.addedCount !== 1 ? "s" : ""}.`
            : "No rule was added."}
          {approveNotice.failedInstruction && ` Failed to add "${approveNotice.failedInstruction}" — see the error above for details.`}
        </p>
      )}

      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="styleAdjustFreeText" className="text-[10px] uppercase tracking-wide text-[#6e767d]">
              Director&apos;s note
            </label>
            <textarea
              id="styleAdjustFreeText"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              placeholder="e.g. the render leans too photoreal, I want something more painted, with visible textures, and stop giving me blue skies"
              disabled={submitting}
              className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] resize-y focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            />
          </div>
          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!hasDirection || submitting}
              className={
                !hasDirection || submitting
                  ? "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                  : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              }
            >
              Propose Style Rules
            </button>
          </div>
          {!hasDirection && (
            <p className="text-xs text-[#4b5158]">Add a director&apos;s note above to propose rules — a directed adjustment with no direction is not this operation.</p>
          )}
          {state.status === "error" && <p className="text-xs text-[#cf7b6b]">{state.message}</p>}
        </div>
      )}

      {state.status === "loading" && <p className="text-xs text-[#6e767d] animate-pulse">Working out style rules...</p>}

      {state.status === "success" && (
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
            {state.rules.length} rule{state.rules.length !== 1 ? "s" : ""} proposed — {selected.size} selected
          </p>

          <div className="flex flex-col gap-2">
            {state.rules.map((rule, i) => (
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
                  onChange={() => toggleSelected(i)}
                  disabled={isApproving}
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

          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={handleApproveSelected}
              disabled={isApproving || submitting || selected.size === 0}
              className={`px-3 py-1.5 text-sm font-medium ${LLM_APPLY_ACTION_CLASS}`}
            >
              {isApproving
                ? "Adding rules..."
                : selected.size === 0
                ? "No rule selected"
                : `Approve ${selected.size} rule${selected.size !== 1 ? "s" : ""}`}
            </button>
            <button type="button" onClick={discard} disabled={isApproving} className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
