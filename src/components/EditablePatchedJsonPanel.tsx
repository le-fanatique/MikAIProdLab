"use client";

import { useState, useEffect } from "react";

type Props = {
  initialJsonText: string;
  onValidityChange?: (isValid: boolean) => void;
};

export default function EditablePatchedJsonPanel({ initialJsonText, onValidityChange }: Props) {
  const [jsonText, setJsonText] = useState(initialJsonText);
  const [isValid, setIsValid] = useState(true);
  // GEN.SEEDANCE.1 — "override" must be an explicit, voluntary action, never
  // a silent replacement of the computed mapping. Merely rendering/viewing
  // this textarea (pre-seeded with the live preview) must NOT count as an
  // override; only an actual edit by the user does. `patchedJsonOverrideActive`
  // is the hidden field the server checks before treating `patchedJsonOverride`
  // as authoritative — see runWorkflowGeneration/runAssetGeneration.
  const [hasEdited, setHasEdited] = useState(false);

  // Sync state when the server re-renders with a new image selection.
  // Without this, the textarea retains the stale JSON (with the old image path)
  // across soft navigations, so the wrong image gets sent to ComfyUI. A fresh
  // preview also resets `hasEdited` — a new server-computed baseline is not
  // an edit until the user touches it again.
  useEffect(() => {
    setJsonText(initialJsonText);
    setIsValid(true);
    setHasEdited(false);
    onValidityChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJsonText]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setJsonText(val);
    setHasEdited(true);
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
      {/* Only present when the user has actually edited the JSON — this is
          what the server treats as "an explicit override was made". */}
      {hasEdited && <input type="hidden" name="patchedJsonOverrideActive" value="1" />}
      {!isValid && (
        <p className="text-xs text-[#cf7b6b]">Invalid JSON</p>
      )}
      {hasEdited && isValid && (
        <p className="text-[10px] text-[#cda24f]">
          Edited — this exact JSON will be queued instead of the computed mapping above.
        </p>
      )}
    </div>
  );
}
