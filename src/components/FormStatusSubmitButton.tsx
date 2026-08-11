"use client";

// ---------------------------------------------------------------------------
// FormStatusSubmitButton.tsx — SHOT.VIDEO.REFERENCES.1
//
// A `<button type="submit">` that (a) optionally asks a native confirm()
// before letting the parent <form>'s Server Action submit through (same
// idiom as ConfirmSubmitButton), AND (b) shows a synchronous busy/disabled
// state for the duration of that submission via React's own `useFormStatus`
// — MUST be rendered as a descendant of the `<form action={...}>` it belongs
// to. Progressive-enhancement safe: without JS the button just submits
// immediately (no confirm, no busy state) — the server independently
// re-validates ownership/freshness either way.
// ---------------------------------------------------------------------------

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage?: string;
  pendingLabel?: string;
};

export default function FormStatusSubmitButton({ confirmMessage, pendingLabel, children, onClick, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      type="submit"
      disabled={disabled || pending}
      onClick={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
