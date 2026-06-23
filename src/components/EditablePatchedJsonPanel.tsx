"use client";

import { useState } from "react";

type Props = {
  initialJsonText: string;
  onValidityChange?: (isValid: boolean) => void;
};

export default function EditablePatchedJsonPanel({ initialJsonText, onValidityChange }: Props) {
  const [jsonText, setJsonText] = useState(initialJsonText);
  const [isValid, setIsValid] = useState(true);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setJsonText(val);
    let valid = true;
    try {
      JSON.parse(val);
    } catch {
      valid = false;
    }
    setIsValid(valid);
    onValidityChange?.(valid);
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        name="patchedJsonOverride"
        value={jsonText}
        onChange={handleChange}
        rows={20}
        className={[
          "w-full rounded bg-[#0d0e10] border px-3 py-2 text-sm text-[#a4abb2] font-mono resize-y focus:outline-none leading-relaxed",
          isValid
            ? "border-[#2c3035] focus:border-[#3a4046]"
            : "border-[#cf7b6b]/50 focus:border-[#cf7b6b]/70",
        ].join(" ")}
      />
      {!isValid && (
        <p className="text-xs text-[#cf7b6b]">Invalid JSON</p>
      )}
    </div>
  );
}
