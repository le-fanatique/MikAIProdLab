"use client";

import { useRef, useTransition } from "react";
import type { ReactNode } from "react";

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

/**
 * A plain <form> that, when `partnerNodeConfirmMessage` is set, blocks its
 * own submission until the user accepts a native confirm() — regardless of
 * how the submit was triggered. Without a message, behaves exactly like a
 * bare <form>. A pre-hydration or no-JS submission never carries the
 * confirmation flag (it doesn't exist in the DOM), so the server-side gate
 * in generation.ts/sequenceGeneration.ts/sequenceVideoGeneration.ts refuses
 * it — never a silent bypass.
 */
export default function PartnerNodeConfirmForm({
  action,
  className,
  children,
  partnerNodeConfirmMessage,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!partnerNodeConfirmMessage) return;
        // Every submission of a Partner Node form must pass through this
        // gate — never re-entrant via requestSubmit() (which re-triggers
        // this same handler and, in React 19, does not reliably re-invoke
        // a function `action` on the second native pass). Instead, once
        // confirmed, the action is invoked directly with this exact
        // submission's FormData — functionally identical to what React's
        // own form-action wiring would have done, just invoked by hand.
        e.preventDefault();
        if (!window.confirm(partnerNodeConfirmMessage)) return;
        const formData = new FormData(e.currentTarget);
        // The ONLY place this flag is ever set — never present in the
        // rendered DOM before this point is reached.
        formData.set("confirmPartnerNodeCost", "1");
        startTransition(() => {
          action(formData);
        });
      }}
    >
      {children}
    </form>
  );
}
