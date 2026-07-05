"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";
import TextFieldTranslationButton from "@/components/TextFieldTranslationButton";
import {
  detectTextInputKind,
  type FillSource,
  type TextInputKind,
} from "@/lib/textInputKind";

function getCompatibleSources(sources: FillSource[], kind: TextInputKind): FillSource[] {
  if (kind === "negative") return [];
  return sources.filter((s) => {
    if (!s.text.trim()) return false;
    if (!s.kinds) return kind === "generic" || kind === "positive";
    return s.kinds.includes(kind);
  });
}

type Props = {
  textMappings: WorkflowInputMapping[];
  textOverrideByNodeId: Record<string, string>;
  currentSearchParams: Record<string, string>;
  basePath: string;
  fillSources?: FillSource[];
};

export default function WorkflowTextOverrideForm({
  textMappings,
  textOverrideByNodeId,
  currentSearchParams,
  basePath,
  fillSources = [],
}: Props) {
  const router = useRouter();

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const m of textMappings) {
      initial[m.input.nodeId] = m.suggestedText ?? "";
    }
    return initial;
  });

  const [openFillNodeId, setOpenFillNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (openFillNodeId === null) return;
    function handleMouseDown(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-fill-dropdown]")) {
        setOpenFillNodeId(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [openFillNodeId]);

  if (textMappings.length === 0) return null;

  const passthroughParams = Object.entries(currentSearchParams).filter(
    ([key]) => !key.startsWith("textNode_")
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of passthroughParams) {
      params.set(key, value);
    }
    for (const [nodeId, value] of Object.entries(values)) {
      if (value.trim()) {
        params.set(`textNode_${nodeId}`, value);
      }
    }
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#4b5158]">
        Text values are applied to the payload preview and generation.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          {textMappings.map((mapping) => {
            const { input } = mapping;
            const currentValue = values[input.nodeId] ?? "";
            const hasOverride = textOverrideByNodeId[input.nodeId] !== undefined;
            const kind = detectTextInputKind(input.label || input.title || "");
            const compatibleSources = getCompatibleSources(fillSources, kind);
            const showFill = compatibleSources.length > 0;
            const isOpen = openFillNodeId === input.nodeId;

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
                <TextFieldTranslationButton
                  getSourceText={() => values[input.nodeId] ?? ""}
                  onReplace={(t) =>
                    setValues((prev) => ({ ...prev, [input.nodeId]: t }))
                  }
                  onAppend={(t) =>
                    setValues((prev) => {
                      const current = prev[input.nodeId] ?? "";
                      return {
                        ...prev,
                        [input.nodeId]: current.trim() ? `${current}\n\n${t}` : t,
                      };
                    })
                  }
                />
                {showFill && (
                  <div className="relative" data-fill-dropdown>
                    <button
                      type="button"
                      onClick={() => setOpenFillNodeId(isOpen ? null : input.nodeId)}
                      className="rounded border border-[#2c3035] text-[#6e767d] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
                    >
                      Fill ▾
                    </button>
                    {isOpen && (
                      <div className="absolute left-0 top-full mt-1 z-10 min-w-[200px] rounded border border-[#2c3035] bg-[#141618] shadow-lg py-1">
                        {compatibleSources.map((source) => (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => {
                              setValues((prev) => ({ ...prev, [input.nodeId]: source.text }));
                              setOpenFillNodeId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-[#a4abb2] hover:bg-[#1a1d20] hover:text-[#e7e9ec] transition-colors"
                          >
                            {source.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
