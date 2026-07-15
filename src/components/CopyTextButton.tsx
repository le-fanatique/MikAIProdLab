"use client";

import { useState } from "react";

type Props = {
  /** Plain string, not a function — Server Components can't pass closures to Client Components across the RSC boundary. */
  text: string;
  label?: string;
  className?: string;
};

/** Minimal, generic copy-to-clipboard button — same navigator.clipboard pattern already used in TextFieldTranslationButton, extracted so other read-only preview surfaces (e.g. SequenceGenerationPackagePanel) don't each reimplement it. Local-only: never persists or sends the copied text anywhere. */
export default function CopyTextButton({ text, label = "Copy", className }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard is not available in this browser.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={
          className ??
          "rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        }
      >
        {copied ? "Copied" : label}
      </button>
      {error && <span className="text-[10px] text-[#cf7b6b]">{error}</span>}
    </div>
  );
}
