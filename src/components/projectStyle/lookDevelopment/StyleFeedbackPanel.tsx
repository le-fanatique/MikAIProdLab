"use client";

// ---------------------------------------------------------------------------
// StyleFeedbackPanel.tsx — STYLE.LLM.LOOKFEEDBACK.UI.1 (ticket 4b of
// "L'assistant de Project Style", 2026-08-23)
//
// The surface for `style.adjustFromLookResult` (STYLE.LLM.LOOKFEEDBACK.CORE.1),
// mounted twice since LOOK.FEEDBACK.PLACE.1 — under `Save Look Result` in
// `LookDevelopmentBench` for the generation just published, and next to a
// reopened test's review controls in `LookDevelopmentRecentTests` for an older
// result. One component, two anchors, no second implementation:
// a director's note anchored on ONE opened, durable Look Test result, not on
// the Project's Working Draft in the abstract — "ça part trop vers le
// photoréalisme" in front of a real render. Never imports the descriptor
// itself; the client only names the operation
// (`runWorkspaceOperation({ descriptorId: "style.adjustFromLookResult" })`),
// same discipline `StyleAdjustAssistPanel.tsx` and `AssetRetakeDirectedPanel`
// both state in their own headers.
//
// Sibling of `StyleAdjustAssistPanel.tsx`, not its copy — the two panels
// share tone and review-card presentation (duplicated here rather than
// extracted: `StyleAdjustAssistPanel.tsx`'s own rule cards are inline JSX,
// not an importable component, and this ticket does not force one into
// existence — same "measured, not factored" choice
// `styleAdjustFromLookResult.ts`'s own header already made for its sibling
// descriptor), but differs in one structural way: `ProjectStyleWorkspace.tsx`
// and its `revision` state do not exist on this page (STYLE.1.G.UI.1's Look
// Dev Bench). So approval here resolves the Working Draft's current
// `revision` itself, via `getWorkingDraft(projectId)`, then drives
// `addRuleAction` directly through the SAME tested sequencing helper
// (`applyProposedRules`) `StyleAdjustAssistPanel.tsx` now also uses — never a
// second, hand-written approval loop (this ticket's own stated trap: two
// sequential calls sharing the same `expectedRevision` make the server
// refuse the second as stale).
//
// Honest failure discipline, modelled on `LookDevelopmentReviewControls.tsx`,
// its immediate neighbour: a transport exception is never reported as a
// commit. `addRuleAction`'s own `{ ok: false }` refusal and a thrown
// exception both stop `applyProposedRules` at that rule (its contract makes
// no distinction between "the server said no" and "we don't know") — but
// only a `{ ok: true }` return from `addRuleAction` is ever counted in
// `addedCount`.
//
// The Working Draft this operation writes into is not visible from this
// page: after a successful approval, a link to
// `/projects/{projectId}/style` is shown so the director is not left unable
// to see what was just written.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { getWorkingDraft, addRuleAction } from "@/actions/projectStyle";
import { applyProposedRules, type AddRuleFn } from "@/lib/projectStyle/applyProposedRules";
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

type Props = {
  projectId: number;
  /** The opened, durable Look Test result this feedback is anchored on. */
  lookResultId: number;
  /** `style.adjustFromLookResult` resolved server-side by the Look
   * Development page — this client component never imports a descriptor
   * itself. Always defined in practice (states a permanent fact about the
   * Working Draft, not a staleness condition), optional only to mirror
   * `StyleAdjustAssistPanel`'s own prop contract. */
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

/** Presentation only — see this file's header for why it is duplicated
 * rather than shared with `StyleAdjustAssistPanel.tsx`'s own `toProposedRule`.
 * The runner's `readEnumField`/`readStringField` already guarantee
 * `pillar`/`strength` are one of the descriptor's declared values and every
 * string field is present (possibly `""`). */
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

export default function StyleFeedbackPanel({ projectId, lookResultId, commitAdvisory }: Props) {
  const [freeText, setFreeText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isApproving, setIsApproving] = useState(false);
  const [approveNotice, setApproveNotice] = useState<{ addedCount: number; failedInstruction: string | null; failedMessage: string | null } | null>(null);
  const [showAdvisory, setShowAdvisory] = useState(false);

  const hasDirection = Boolean(freeText.trim());

  async function handleGenerate() {
    setState({ status: "loading" });
    setApproveNotice(null);
    setShowAdvisory(false);
    const result = await runWorkspaceOperation({
      descriptorId: "style.adjustFromLookResult",
      ids: { projectId, lookResultId },
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

    // The draft may not exist yet — `expectedRevision: null` — and
    // `addRuleAction` knows how to create it in that case (its own registry
    // entry declares this; STYLE.1.A's `addRuleAction`).
    let initialRevision: number | null;
    try {
      const draftView = await getWorkingDraft(projectId);
      initialRevision = draftView?.draft.revision ?? null;
    } catch {
      setIsApproving(false);
      setApproveNotice({ addedCount: 0, failedInstruction: null, failedMessage: "Could not read the current Working Draft — check your connection and try again." });
      return;
    }

    const addRule: AddRuleFn<ProposedRule, number | null> = async (rule, expectedRevision) => {
      try {
        const result = await addRuleAction({
          projectId,
          expectedRevision,
          instruction: rule.instruction,
          pillar: rule.pillar,
          section: rule.section || null,
          category: rule.category || null,
          strength: rule.strength,
          applicability: rule.applicability || null,
          provenanceNotes: rule.provenanceNotes || null,
        });
        return result.ok ? { ok: true as const, revision: result.revision } : { ok: false as const, error: result.error };
      } catch {
        // A transport exception before a known CORE success is never
        // reported as a commit — never "added", always an uncertain
        // failure that stops the sequence here.
        return { ok: false as const, error: "This rule may not have been added — check your connection." };
      }
    };

    const outcome = await applyProposedRules(toApprove, initialRevision, addRule);
    // Order is preserved and the sequence stops at the first failure, so the
    // first `addedCount` entries of `toApprove` are exactly the ones that
    // succeeded.
    const addedRules = new Set(toApprove.slice(0, outcome.addedCount));

    setIsApproving(false);
    setApproveNotice({
      addedCount: outcome.addedCount,
      failedInstruction: outcome.failed?.rule.instruction ?? null,
      failedMessage: outcome.failed?.message ?? null,
    });

    const stillPending = state.rules.filter((r) => !addedRules.has(r));
    if (stillPending.length > 0) {
      setState({ status: "success", rules: stillPending });
      setSelected(new Set(stillPending.map((_, i) => i)));
    } else {
      setState({ status: "idle" });
      setSelected(new Set());
    }
    if (outcome.addedCount > 0 && commitAdvisory) setShowAdvisory(true);
  }

  return (
    <div className="rounded border border-[#232629] p-4 flex flex-col gap-3 [background-color:var(--mikros-border,#2c3035)]">
      <h3 className="text-xs font-medium uppercase tracking-wider [color:var(--mikros-text-primary,#e7e9ec)]">Style Feedback (From This Result)</h3>
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Describe what is wrong with this render — medium, texture, palette, tone — and the assistant proposes atomic Style Rules to review and approve, judged against this exact result.
      </p>

      {showAdvisory && commitAdvisory && <p className="text-xs text-[#b89a5a]">{commitAdvisory}</p>}

      {approveNotice && (
        <div className={`text-xs ${approveNotice.failedInstruction ? "text-[#cf7b6b]" : "text-[#6b9e72]"} flex flex-col gap-1`}>
          <p>
            {approveNotice.addedCount > 0
              ? `Added ${approveNotice.addedCount} rule${approveNotice.addedCount !== 1 ? "s" : ""}.`
              : "No rule was added."}
            {approveNotice.failedInstruction && ` Failed to add "${approveNotice.failedInstruction}"${approveNotice.failedMessage ? ` — ${approveNotice.failedMessage}` : "."}`}
          </p>
          {approveNotice.addedCount > 0 && (
            <Link href={`/projects/${projectId}/style`} className="text-[#5b93d6] hover:text-[#e7e9ec] transition-colors underline w-fit">
              View added rules in Project Style
            </Link>
          )}
        </div>
      )}

      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="styleFeedbackFreeText" className="text-[10px] uppercase tracking-wide text-[#6e767d]">
              Director&apos;s note
            </label>
            <textarea
              id="styleFeedbackFreeText"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              placeholder="e.g. this render leans too photoreal, I want something more painted, with visible textures, and stop giving me blue skies"
              className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] resize-y focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            />
          </div>
          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!hasDirection}
              className={
                !hasDirection
                  ? "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                  : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors"
              }
            >
              Propose Style Rules
            </button>
          </div>
          {!hasDirection && (
            <p className="text-xs text-[#4b5158]">Add a director&apos;s note above to propose rules — feedback with no direction is not this operation.</p>
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
              disabled={isApproving || selected.size === 0}
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
