"use client";

import { useState } from "react";
import EditablePatchedJsonPanel from "@/components/EditablePatchedJsonPanel";

type Props = {
  initialJsonText: string;
  buttonLabel: string;
};

export default function WorkflowGenerateActions({ initialJsonText, buttonLabel }: Props) {
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!isJsonValid}
          className={[
            "rounded border px-4 py-2 text-sm font-medium transition-colors",
            isJsonValid
              ? "border-[#5b93d6]/50 text-[#5b93d6] hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10"
              : "border-[#2c3035] text-[#4b5158] cursor-not-allowed",
          ].join(" ")}
        >
          {buttonLabel}
        </button>
        <p className={`text-xs ${isJsonValid ? "text-[#6e767d]" : "text-[#cf7b6b]"}`}>
          {isJsonValid
            ? "Queue this workflow in ComfyUI."
            : "Fix the JSON error before generating."}
        </p>
      </div>

      <div className="border-t border-[#232629] pt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded((e) => !e)}
          className="self-start flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-[#4b5158] hover:text-[#6e767d] transition-colors"
        >
          Advanced Payload Editor
          <span className="text-[10px]">{isExpanded ? "↑" : "↓"}</span>
        </button>

        {isExpanded && (
          <p className="text-xs text-[#4b5158]">
            Edit the final ComfyUI JSON only if you need low-level control.
          </p>
        )}

        {/* Always in DOM so the form submits patchedJsonOverride; display:none when collapsed */}
        <div className={isExpanded ? "" : "hidden"}>
          <EditablePatchedJsonPanel
            initialJsonText={initialJsonText}
            onValidityChange={setIsJsonValid}
          />
        </div>
      </div>
    </div>
  );
}
