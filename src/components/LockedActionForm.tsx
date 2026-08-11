"use client";

// ---------------------------------------------------------------------------
// LockedActionForm.tsx — SHOT.VIDEO.REFERENCES.1 (Retake Round 1, Codex P1)
//
// A real, synchronous double-submit guard for a Server Action form.
// `useFormStatus().pending` (the previous approach, `FormStatusSubmitButton`)
// only flips to `true` AFTER React has started processing the submission —
// two same-tick clicks/`requestSubmit()` calls can both read `pending` as
// `false` and both go through, and a native `window.confirm()` dialog is not
// a mutex either. This component closes that gap with a plain `useRef`
// mutated synchronously as the very FIRST statement of `onSubmit`, before
// `window.confirm()` or any React state update — no render/commit timing can
// ever race it. The lock releases only after a cancelled confirmation or the
// action call actually settles (success redirect, or a caught error), never
// automatically replayed.
//
// Used by both cross-collection bridge buttons ("Duplicate as Video
// Reference" / "Add to Shot Videos"), which the ticket explicitly requires
// to be double-click-safe. Progressive-enhancement note: without JS this is
// a plain `<form>` with no `action` attribute set (Server Action forms
// already require JS in this app's existing convention — see
// `PartnerNodeConfirmForm.tsx`'s own identical rationale).
// ---------------------------------------------------------------------------

import { useRef, useState, type FormHTMLAttributes, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "children" | "onSubmit"> & {
  action: (formData: FormData) => Promise<void>;
  confirmMessage?: string;
  children: (state: { pending: boolean }) => ReactNode;
};

export default function LockedActionForm({ action, confirmMessage, children, ...rest }: Props) {
  const lockRef = useRef(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      {...rest}
      onSubmit={(e) => {
        e.preventDefault();

        // The synchronous gate: a second submit event landing before this
        // attempt's own `finally` below runs is refused here, before
        // touching `confirm()`, `FormData`, or the action — never a second
        // copy created.
        if (lockRef.current) return;
        lockRef.current = true;
        setPending(true);

        if (confirmMessage && !window.confirm(confirmMessage)) {
          // Cancelling never leaves the lock held — nothing was submitted.
          lockRef.current = false;
          setPending(false);
          return;
        }

        const formData = new FormData(e.currentTarget);
        (async () => {
          try {
            await action(formData);
          } catch (err) {
            // Every real Server Action passed as `action` here ends in
            // `redirect()` on both its success AND its own sanitized-error
            // paths — that deliberately throws a framework-internal
            // NEXT_REDIRECT to perform the navigation, never a failure to
            // swallow. Rethrown first, unconditionally. Any OTHER thrown
            // value is an unexpected transport failure; it is intentionally
            // swallowed here rather than crashing the page — the action's
            // own expected failure paths already redirect with a sanitized
            // error query param.
            unstable_rethrow(err);
          } finally {
            // Always releases — including on a thrown/rejected action — so
            // a transport failure never leaves the form permanently locked.
            // Never auto-resubmits; the user must trigger a new submission.
            lockRef.current = false;
            setPending(false);
          }
        })();
      }}
    >
      {children({ pending })}
    </form>
  );
}
