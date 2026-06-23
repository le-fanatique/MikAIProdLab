"use client";

import { useState } from "react";
import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";

type Props = {
  textMappings: WorkflowInputMapping[];
  textOverrideByNodeId: Record<string, string>;
  currentSearchParams: Record<string, string>;
  basePath: string;
};

export default function WorkflowTextOverrideForm({
  textMappings,
  textOverrideByNodeId,
  currentSearchParams,
  basePath,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const m of textMappings) {
      initial[m.input.nodeId] = m.suggestedText ?? "";
    }
    return initial;
  });

  if (textMappings.length === 0) return null;

  const passthroughParams = Object.entries(currentSearchParams).filter(
    ([key]) => !key.startsWith("textNode_")
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#4b5158]">
        Text values are applied to the payload preview and generation.
      </p>

      <form method="GET" action={basePath} className="flex flex-col gap-5">
        {passthroughParams.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        <div className="flex flex-col gap-4">
          {textMappings.map((mapping) => {
            const { input } = mapping;
            const currentValue = values[input.nodeId] ?? "";
            const hasOverride = textOverrideByNodeId[input.nodeId] !== undefined;

            return (
              <div key={input.nodeId} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <WorkflowInputKindBadge kind={input.kind} />
                  <span className="text-sm font-medium text-[#e7e9ec]">
                    {input.label || input.title}
                  </span>
                  <span className="text-[10px] font-mono text-[#4b5158]">
                    · node {input.nodeId}
                  </span>
                  {hasOverride && (
                    <span className="text-[10px] text-[#5b93d6] uppercase tracking-wider">
                      Edited
                    </span>
                  )}
                </div>
                <textarea
                  name={`textNode_${input.nodeId}`}
                  value={currentValue}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [input.nodeId]: e.target.value }))
                  }
                  rows={5}
                  className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-y focus:outline-none focus:border-[#3a4046] leading-relaxed"
                />
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Apply Text
        </button>
      </form>
    </div>
  );
}
