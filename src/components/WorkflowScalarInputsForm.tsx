"use client";

import { useState } from "react";
import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";

const SCALAR_KINDS = new Set(["integer", "float", "boolean", "select", "seed", "string"]);

type Props = {
  mappings: WorkflowInputMapping[];
  scalarValueByNodeId: Record<string, string>;
  currentSearchParams: Record<string, string>;
  basePath: string;
};

export default function WorkflowScalarInputsForm({
  mappings,
  scalarValueByNodeId,
  currentSearchParams,
  basePath,
}: Props) {
  const scalarMappings = mappings.filter((m) => SCALAR_KINDS.has(m.input.kind));

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const m of scalarMappings) {
      initial[m.input.nodeId] =
        scalarValueByNodeId[m.input.nodeId] ?? m.input.defaultValue ?? "";
    }
    return initial;
  });

  function setValue(nodeId: string, value: string) {
    setValues((prev) => ({ ...prev, [nodeId]: value }));
  }

  function randomizeSeed(nodeId: string) {
    setValue(nodeId, String(Math.floor(Math.random() * 2 ** 32)));
  }

  if (scalarMappings.length === 0) {
    return <p className="text-sm text-[#4b5158]">No scalar inputs detected.</p>;
  }

  // Preserve all current search params except scalarNode_* (replaced by the form fields)
  const passthroughParams = Object.entries(currentSearchParams).filter(
    ([key]) => !key.startsWith("scalarNode_")
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#4b5158]">
        Scalar values are applied to the payload preview and generation.
      </p>

      <form method="GET" action={basePath} className="flex flex-col gap-5">
        {passthroughParams.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        <div className="flex flex-col gap-4">
          {scalarMappings.map((mapping) => {
            const { input } = mapping;
            const currentValue = values[input.nodeId] ?? "";
            const hasUrlOverride = scalarValueByNodeId[input.nodeId] !== undefined;
            const showDefault =
              input.defaultValue !== null &&
              input.defaultValue !== undefined &&
              input.defaultValue !== currentValue;

            return (
              <div key={input.nodeId} className="flex flex-col gap-1.5">
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <WorkflowInputKindBadge kind={input.kind} />
                  <span className="text-sm font-medium text-[#e7e9ec]">
                    {input.label || input.title}
                  </span>
                  <span className="text-[10px] font-mono text-[#4b5158]">
                    · node {input.nodeId}
                  </span>
                  {hasUrlOverride && (
                    <span className="text-[10px] text-[#5b93d6] uppercase tracking-wider">
                      Current
                    </span>
                  )}
                </div>

                {/* Default indicator */}
                {showDefault && (
                  <p className="text-[10px] text-[#4b5158]">
                    <span className="uppercase tracking-wider mr-1">Default</span>
                    <span className="font-mono">{input.defaultValue}</span>
                  </p>
                )}

                {/* seed / integer */}
                {(input.kind === "seed" || input.kind === "integer") && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      name={`scalarNode_${input.nodeId}`}
                      value={currentValue}
                      onChange={(e) => setValue(input.nodeId, e.target.value)}
                      className="w-40 rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] font-mono"
                    />
                    {input.kind === "seed" && (
                      <button
                        type="button"
                        onClick={() => randomizeSeed(input.nodeId)}
                        className="rounded border border-[#2c3035] text-[#6e767d] px-2.5 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
                      >
                        Randomize Seed
                      </button>
                    )}
                  </div>
                )}

                {/* float */}
                {input.kind === "float" && (
                  <input
                    type="number"
                    step="any"
                    name={`scalarNode_${input.nodeId}`}
                    value={currentValue}
                    onChange={(e) => setValue(input.nodeId, e.target.value)}
                    className="w-40 rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] font-mono"
                  />
                )}

                {/* boolean — switch button (no name) + single hidden input */}
                {input.kind === "boolean" && (() => {
                  const checked = currentValue === "true";
                  return (
                    <div className="flex items-center gap-3">
                      <input
                        type="hidden"
                        name={`scalarNode_${input.nodeId}`}
                        value={checked ? "true" : "false"}
                      />
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => setValue(input.nodeId, checked ? "false" : "true")}
                        className={[
                          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                          checked
                            ? "border-[#6b9e72] bg-[#233d2a]"
                            : "border-[#4b5158] bg-[#16191c]",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "pointer-events-none inline-block h-5 w-5 rounded-full transition-transform",
                            checked
                              ? "translate-x-[22px] bg-[#6b9e72]"
                              : "translate-x-[2px] bg-[#6f7680]",
                          ].join(" ")}
                        />
                      </button>
                      <span className="text-xs text-[#a4abb2] font-mono min-w-[2.5rem]">
                        {checked ? "True" : "False"}
                      </span>
                    </div>
                  );
                })()}

                {/* select */}
                {input.kind === "select" && (
                  <>
                    {input.inputOptions && input.inputOptions.length > 0 ? (
                      <select
                        name={`scalarNode_${input.nodeId}`}
                        value={currentValue}
                        onChange={(e) => setValue(input.nodeId, e.target.value)}
                        className="w-56 rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] cursor-pointer"
                      >
                        {input.inputOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        name={`scalarNode_${input.nodeId}`}
                        value={currentValue}
                        onChange={(e) => setValue(input.nodeId, e.target.value)}
                        className="w-56 rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] font-mono"
                      />
                    )}
                  </>
                )}

                {/* string */}
                {input.kind === "string" && (
                  <input
                    type="text"
                    name={`scalarNode_${input.nodeId}`}
                    value={currentValue}
                    onChange={(e) => setValue(input.nodeId, e.target.value)}
                    className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] font-mono"
                  />
                )}
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          className="self-start rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
        >
          Apply Scalar Values
        </button>
      </form>
    </div>
  );
}
