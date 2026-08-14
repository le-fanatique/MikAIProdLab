"use client";

// ---------------------------------------------------------------------------
// ProposalPanel.tsx — LLMW.PROPOSAL.COMPONENT.1 (B5)
//
// The single proposal (post-generation, Approve/Redo/Cancel) engine shared
// by the seven mono-entity LLM operations' panels. Scope: the surface that
// starts once a draft exists — draft display, Approve, Redo (regenerate),
// Cancel (discard) — plus the mechanics Decisions 1 and 2 of the ticket
// settle:
//
//  - Decision 1 (call shape): an Approve action is either `returnValue`
//    (the panel calls the binding directly, via `run(draft)`, typed by the
//    caller against `Parameters<typeof ACTION_BINDINGS[K]>` through
//    `actions/proposalCommit.ts`) or `redirectOnly` (the panel never calls
//    the binding — it renders `<form action={binding}>` with hidden fields
//    built from the draft, so the server's own `redirect()` and no-JS
//    submission stay structurally intact, exactly as B4b protected them).
//
//  - Decision 2 (post-Approve, arbitrated 2026-08-14, derived from
//    `registry.ts`'s own `response` field — no second field added): a
//    `returnValue` Approve action, once it answers `ok: true`, always calls
//    `router.refresh()` and returns the panel to `idle` (optionally after
//    an `onApproved` callback the caller can use to set its own transient
//    confirmation, e.g. Asset Bible's "Asset Bible updated."). A
//    `redirectOnly` Approve action does neither by construction — the
//    native form submission navigates before any of this component's state
//    updates would run.
//
// Out of scope, deliberately: the "ask" surface (Generate/mode trigger
// buttons, LLM-not-configured messaging, per-operation preconditions such
// as "Add a pitch first.") stays in each of the seven wrapper components,
// unchanged in wording and layout. That surface is genuinely heterogeneous
// across the seven operations (a persistent top-level Generate button on
// Story/Outline vs. mode buttons that swap out on Shot/Sequence Prompt vs.
// a single button on Asset Bible/Description/Notes; "Try again" resets to
// idle on some, re-triggers directly on none) — forcing one shape onto it
// would not remove real duplication, it would invent an abstraction driven
// by only the two mandated first cases. Decisions 1 and 2, which this
// ticket exists to settle, are both about the proposal/Approve phase; nothing
// in either decision asks for the trigger phase to be unified.
// ---------------------------------------------------------------------------

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LLM_APPLY_ACTION_CLASS } from "@/lib/uiClasses";

export type ProposalApproveAction<TDraft> =
  | {
      kind: "returnValue";
      id: string;
      label: string;
      disabled?: boolean;
      run: (draft: TDraft) => Promise<{ ok: true } | { ok: false; error: string }>;
    }
  | {
      kind: "redirectOnly";
      id: string;
      label: string;
      disabled?: boolean;
      /** The binding itself, e.g. `ACTION_BINDINGS.updateShotPrompt` — passed
       * as the `<form action>`, never invoked from here. */
      action: (formData: FormData) => void | Promise<void>;
      hiddenFields: (draft: TDraft) => Record<string, string>;
    };

export type ProposalTrigger<TDraft> = {
  id: string;
  label: string;
  disabled?: boolean;
  loadingLabel: string;
  run: () => Promise<{ ok: true; draft: TDraft } | { ok: false; error: string }>;
};

type State<TDraft> =
  | { status: "idle" }
  | { status: "loading"; triggerId: string; loadingLabel: string }
  | { status: "success"; triggerId: string; draft: TDraft }
  | { status: "error"; triggerId: string; message: string };

export type ProposalPanelProps<TDraft> = {
  /** Some operations (Shot/Sequence Prompt) never had a pre-check UI: an
   * unconfigured LLM surfaces through the trigger's own error message
   * instead. Defaults to configured, so callers without the concept omit
   * both props entirely rather than pass an unreachable message string. */
  isConfigured?: boolean;
  notConfiguredMessage?: ReactNode;
  triggers: ProposalTrigger<TDraft>[];
  /** Applied to a freshly generated draft before it becomes the panel's
   * editable state — e.g. Asset Bible falling back to the pre-generation
   * value on a blank generated field. */
  mapDraft?: (draft: TDraft) => TDraft;
  /** Static content shown above the trigger row while idle/error (context
   * hints, "limited context" warnings). */
  hints?: ReactNode;
  /** Content shown next to the trigger row, e.g. "Add a pitch first." */
  disabledHint?: ReactNode;
  renderDraft: (draft: TDraft, setDraft: (updater: (prev: TDraft) => TDraft) => void, triggerId: string) => ReactNode;
  approveActions: (draft: TDraft, triggerId: string) => ProposalApproveAction<TDraft>[];
  /** Called once, synchronously, right after a `returnValue` Approve answers
   * `ok: true` and before the panel resets to idle — the caller's hook for
   * its own transient confirmation state. */
  onApproved?: () => void;
  /** Regenerate button next to Cancel/Discard, re-running the trigger that
   * produced the current draft. Off by default: only Asset Bible and the
   * two Asset Description/Notes fields offer it; Shot/Sequence Prompt and
   * Story/Outline don't (Cancel returns to a trigger row that already offers
   * every mode again). */
  showRegenerate?: boolean;
  regenerateLabel?: string;
  cancelLabel?: string;
  className?: string;
};

export default function ProposalPanel<TDraft>({
  isConfigured = true,
  notConfiguredMessage = "",
  triggers,
  mapDraft,
  hints,
  disabledHint,
  renderDraft,
  approveActions,
  onApproved,
  showRegenerate = false,
  regenerateLabel = "Regenerate",
  cancelLabel = "Cancel",
  className,
}: ProposalPanelProps<TDraft>) {
  const router = useRouter();
  const [state, setState] = useState<State<TDraft>>({ status: "idle" });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const busyRef = useRef(false);

  async function runTrigger(trigger: ProposalTrigger<TDraft>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ status: "loading", triggerId: trigger.id, loadingLabel: trigger.loadingLabel });
    setApplyError(null);
    try {
      const result = await trigger.run();
      if (result.ok) {
        const draft = mapDraft ? mapDraft(result.draft) : result.draft;
        setState({ status: "success", triggerId: trigger.id, draft });
      } else {
        setState({ status: "error", triggerId: trigger.id, message: result.error });
      }
    } catch (err) {
      // A rejected Server Action (transport/network failure) must still
      // leave the panel in a recoverable state — never stuck on "loading"
      // with no way to retry. Mirrors the guard
      // `AssetDescriptionEnhancePanel.handleGenerate` had before this
      // ticket, now applied once, here, for all seven triggers.
      setState({
        status: "error",
        triggerId: trigger.id,
        message: err instanceof Error ? err.message : "Unexpected error. Please try again.",
      });
    } finally {
      busyRef.current = false;
    }
  }

  function setDraft(updater: (prev: TDraft) => TDraft) {
    setState((prev) => (prev.status === "success" ? { ...prev, draft: updater(prev.draft) } : prev));
  }

  async function handleApprove(action: ProposalApproveAction<TDraft>) {
    if (state.status !== "success" || action.kind !== "returnValue" || busyRef.current) return;
    busyRef.current = true;
    setIsApplying(true);
    setApplyError(null);
    try {
      const result = await action.run(state.draft);
      if (result.ok) {
        onApproved?.();
        setState({ status: "idle" });
        router.refresh();
      } else {
        setApplyError(result.error);
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsApplying(false);
      busyRef.current = false;
    }
  }

  function handleCancel() {
    setState({ status: "idle" });
    setApplyError(null);
  }

  const triggerButtonClass = (disabled: boolean) =>
    disabled
      ? "rounded border border-[#2c3035] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
      : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors";

  return (
    <div className={className ?? "flex flex-col gap-3"}>
      {!isConfigured && <p className="text-xs text-[#cf7b6b]">{notConfiguredMessage}</p>}

      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-2">
          {hints}
          <div className="flex flex-wrap gap-2">
            {triggers.map((trigger) => (
              <button
                key={trigger.id}
                type="button"
                onClick={() => runTrigger(trigger)}
                disabled={!isConfigured || trigger.disabled}
                className={triggerButtonClass(!isConfigured || Boolean(trigger.disabled))}
              >
                {trigger.label}
              </button>
            ))}
          </div>
          {disabledHint}
          {state.status === "error" && <p className="text-xs text-[#cf7b6b]">{state.message}</p>}
        </div>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">{state.loadingLabel}</p>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-4">
          {applyError && (
            <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
              <p className="text-xs text-[#cf7b6b]">{applyError}</p>
            </div>
          )}

          {renderDraft(state.draft, setDraft, state.triggerId)}

          <div className="flex flex-wrap items-center gap-3 border-t border-[#1e2124] pt-3">
            {approveActions(state.draft, state.triggerId).map((action) =>
              action.kind === "returnValue" ? (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleApprove(action)}
                  disabled={isApplying || action.disabled}
                  className={`px-3 py-1.5 text-sm font-medium ${LLM_APPLY_ACTION_CLASS}`}
                >
                  {action.label}
                </button>
              ) : (
                <form key={action.id} action={action.action}>
                  {Object.entries(action.hiddenFields(state.draft)).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <button
                    type="submit"
                    disabled={action.disabled}
                    className="rounded bg-[#232629] text-[#e7e9ec] px-3 py-1.5 text-sm hover:bg-[#2c3035] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {action.label}
                  </button>
                </form>
              )
            )}

            {showRegenerate && (
              <button
                type="button"
                onClick={() => {
                  const active = triggers.find((t) => t.id === state.triggerId) ?? triggers[0];
                  if (active) void runTrigger(active);
                }}
                className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
              >
                {regenerateLabel}
              </button>
            )}

            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
