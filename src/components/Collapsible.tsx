"use client";

import { useState, type ReactNode } from "react";

type Props = {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Minimal expand/collapse wrapper — no animation, no external state. Used wherever a section should stay reachable without dominating the page by default. */
export default function Collapsible({ label, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        {label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
