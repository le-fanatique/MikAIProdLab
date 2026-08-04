"use client";

import { createContext, useContext, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
  /**
   * COMFY.PROVIDER.1 — when set, submitting this form (by ANY trigger —
   * button click, Enter in a text field, etc.) must first pass a native
   * confirm() naming the Comfy Cloud Partner Node cost. Gating this at the
   * <form>'s own submit event (not a button's onClick) is required:
   * pressing Enter in a form field submits the form directly and never
   * fires a submit button's onClick handler, which would silently skip the
   * confirmation and let a chargeable Cloud generation through.
   *
   * IMPORTANT: callers must NEVER render a `confirmPartnerNodeCost` hidden
   * input themselves — this component is the ONLY place that ever sets it,
   * and only on the confirmed path below. Rendering it server-side would
   * put the opt-in in the pre-hydration/no-JS HTML, letting a submission
   * that happens before React attaches (or with JS disabled) skip
   * window.confirm() entirely.
   */
  partnerNodeConfirmMessage?: string | null;
};

// WFBUILD.1.B-FIX1 (retake) — read by WorkflowGenerateActions so its submit
// button can show an honest pending/error state without every one of this
// form's 7+ callers having to thread props through. Never used to gate the
// actual submission itself (that guard lives entirely in the synchronous
// submittingRef below, decoupled from render/state timing).
type GenerationFormState = {
  pending: boolean;
  /** Generic, sanitized message only — never the raw error, its message,
   * a stack, a URL, or any submitted payload. See the catch block below. */
  submissionError: string | null;
};

const GenerationFormStateContext = createContext<GenerationFormState>({ pending: false, submissionError: null });

export function useGenerationFormState(): GenerationFormState {
  return useContext(GenerationFormStateContext);
}

/**
 * A plain <form> that, when `partnerNodeConfirmMessage` is set, blocks its
 * own submission until the user accepts a native confirm() — regardless of
 * how the submit was triggered. Without a message, behaves exactly like a
 * bare <form>. A pre-hydration or no-JS submission never carries the
 * confirmation flag (it doesn't exist in the DOM), so the server-side gate
 * in generation.ts/sequenceGeneration.ts/sequenceVideoGeneration.ts refuses
 * it — never a silent bypass.
 *
 * WFBUILD.1.B-FIX1 (retake) — a double-click, a double Enter, or a click
 * immediately followed by Enter must all submit exactly once, on both the
 * confirmed and unconfirmed paths (a Partner Node submission is a real
 * Comfy Cloud charge). Both paths now funnel through this one onSubmit,
 * gated by a plain ref checked and set BEFORE any await, transition, or
 * confirm() dialog can yield to another event — a ref (not state) because
 * state updates are not visible synchronously to a second submit event
 * that fires before React re-renders. Once hydrated, `onSubmit` always
 * calls `preventDefault()` and invokes `action` by hand — React's own
 * <form action> dispatch never runs post-hydration. The `action` prop on
 * the <form> element itself is kept solely for the no-JS/pre-hydration
 * fallback (a submission `onSubmit` never sees), unaffected by any of this.
 */
export default function PartnerNodeConfirmForm({
  action,
  className,
  children,
  partnerNodeConfirmMessage,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={action}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();

        // The synchronous gate: a second submit event (double-click, Enter
        // while already submitting, ...) landing before the first one's
        // `finally` below runs is refused here, before touching confirm(),
        // FormData, or the action — never a second Comfy/Cloud call.
        if (submittingRef.current) return;

        if (partnerNodeConfirmMessage) {
          // Cancelling never engages the lock — nothing to release.
          if (!window.confirm(partnerNodeConfirmMessage)) return;
        }

        submittingRef.current = true;
        setPending(true);
        // A new valid attempt always clears any error left by a previous
        // rejected one — never stacks, never survives past a fresh submit.
        setSubmissionError(null);

        const formData = new FormData(e.currentTarget);
        if (partnerNodeConfirmMessage) {
          // The ONLY place this flag is ever set — never present in the
          // rendered DOM before this point is reached.
          formData.set("confirmPartnerNodeCost", "1");
        }

        startTransition(async () => {
          try {
            await action(formData);
          } catch (err) {
            // GEN.ASSET.INPUT.ISOLATION.1 (Round 3) — `redirect()` (called by
            // every real Server Action passed as `action` here on success —
            // see runAssetGenerationFromForm/runWorkflowGenerationFromForm/
            // etc.) deliberately THROWS a framework-internal `NEXT_REDIRECT`
            // control-flow error; that is Next's own documented mechanism
            // for performing the navigation, not a failure. Must be the
            // first statement in this catch block, called with the raw
            // caught value — never a manual inspection of `digest`/
            // `message`, which are internal/unstable shape. It rethrows
            // ONLY framework-controlled exceptions (redirect/notFound/
            // dynamic-API bailout); it returns normally for any ordinary
            // application error, which then falls through to the generic
            // message below exactly as before.
            unstable_rethrow(err);
            // A rejected `action` (e.g. a genuine transport failure — the
            // real Server Actions here return `{ ok: false, error }` and
            // never throw in normal operation) must never crash the whole
            // page, and never fail silently either. React 19 re-throws an
            // async transition's rejection into the nearest error boundary
            // if left uncaught; catching it here avoids that. The caught
            // value is deliberately discarded — never logged, never shown —
            // it may carry an arbitrary message, URL, or stack from
            // whatever failed at the transport layer. Only this fixed,
            // pre-written, sanitized string ever reaches the user or the
            // console.
            setSubmissionError("Generation could not be submitted. Please try again.");
          } finally {
            // Always releases — including on a thrown/rejected action, so a
            // transport failure never leaves the form permanently locked.
            // Never auto-resubmits; the user must trigger a new submission.
            submittingRef.current = false;
            setPending(false);
          }
        });
      }}
    >
      <GenerationFormStateContext.Provider value={{ pending, submissionError }}>{children}</GenerationFormStateContext.Provider>
    </form>
  );
}
