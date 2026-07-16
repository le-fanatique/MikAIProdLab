"use client";

// ---------------------------------------------------------------------------
// ConfirmSubmitButton.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX6
//
// A plain <button type="submit"> that asks a native confirm() before letting
// its parent <form>'s server-action POST through. Progressive-enhancement
// safe: without JS the button just submits immediately (no confirmation) —
// still fine for Delete here since the server independently re-validates
// ownership and blocks in-use drafts either way; the confirm is a UX
// safeguard, never the actual authorization check.
// ---------------------------------------------------------------------------

import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { confirmMessage: string };

export default function ConfirmSubmitButton({ confirmMessage, onClick, ...rest }: Props) {
  return (
    <button
      {...rest}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
