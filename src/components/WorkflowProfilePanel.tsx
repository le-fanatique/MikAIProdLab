"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  getPromptCompilerHandoffStorageKey,
  sanitizePromptCompilerHandoff,
} from "@/lib/prompts/promptCompilerHandoff";
import {
  diagnoseWorkflowGeneration,
  type WorkflowProfile,
  type WorkflowNodeState,
} from "@/lib/comfy/workflowProfiles";

type Props = {
  shotId: number;
  profile: WorkflowProfile | null;
  nodeState: WorkflowNodeState;
  hasTextPromptValue: boolean;
  selectedImageCount: number;
  dynamicBatchActive: boolean;
  dynamicBatchSelectedCount: number;
  children: ReactNode;
};

const SUPPORTED_INPUT_LABELS: Record<string, string> = {
  textPrompt: "Text Prompt",
  dynamicImages: "Dynamic Batch images",
  firstFrame: "First Frame",
  lastFrame: "Last Frame",
  referenceVideo: "Reference Video",
  referenceAudio: "Reference Audio",
};

/**
 * Wraps the "Suggested Inputs" → "Generate" region of a Generation Panel
 * surface (ShotGenerationPanel / the /map page), alongside
 * PromptCompilerHandoffGate. Shows the resolved Workflow profile (or
 * "Generic workflow") and blocks the wrapped Generate form's submit only
 * for a blocking diagnostic — a generic workflow never runs specialized
 * validation and behaves exactly as before this ticket.
 */
export default function WorkflowProfilePanel({
  shotId,
  profile,
  nodeState,
  hasTextPromptValue,
  selectedImageCount,
  dynamicBatchActive,
  dynamicBatchSelectedCount,
  children,
}: Props) {
  const [presetId, setPresetId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(getPromptCompilerHandoffStorageKey(shotId));
      if (!raw) {
        setPresetId(null);
        return;
      }
      const handoff = sanitizePromptCompilerHandoff(JSON.parse(raw));
      setPresetId(handoff && handoff.shotId === shotId ? handoff.presetId : null);
    } catch {
      setPresetId(null);
    }
  }, [shotId]);

  const result = useMemo(
    () =>
      diagnoseWorkflowGeneration({
        profile,
        nodeState,
        presetId,
        hasTextPromptValue,
        selectedImageCount,
        dynamicBatchActive,
        dynamicBatchSelectedCount,
      }),
    [
      profile,
      nodeState,
      presetId,
      hasTextPromptValue,
      selectedImageCount,
      dynamicBatchActive,
      dynamicBatchSelectedCount,
    ]
  );

  function handleFormSubmit(e: FormEvent<HTMLDivElement>) {
    if (result.blocked) {
      e.preventDefault();
    }
  }

  const supportedInputLabels = profile
    ? (Object.keys(profile.supportedInputs) as (keyof typeof profile.supportedInputs)[])
        .filter((key) => profile.supportedInputs[key])
        .map((key) => SUPPORTED_INPUT_LABELS[key])
    : [];

  return (
    <div onSubmit={handleFormSubmit}>
      <div className="mb-4 rounded border border-[#2c3035] bg-[#141618] px-3 py-2.5 flex flex-col gap-1.5">
        <p className="text-xs text-[#a4abb2]">
          {profile ? (
            <>
              <span className="text-[#5b93d6]">Workflow profile</span> — {profile.label}
            </>
          ) : (
            <span className="text-[#6e767d]">Generic workflow</span>
          )}
        </p>
        {profile && (
          <>
            <p className="text-[10px] text-[#6e767d]">
              Generation mode: <span className="font-mono text-[#a4abb2]">{profile.generationMode}</span>
            </p>
            <p className="text-[10px] text-[#6e767d]">
              Supported inputs: {supportedInputLabels.length > 0 ? supportedInputLabels.join(", ") : "none"}
            </p>
            <p className="text-[10px] text-[#6e767d]">
              Limits: {profile.limits.images} image{profile.limits.images === 1 ? "" : "s"} ·{" "}
              {profile.limits.videos} video{profile.limits.videos === 1 ? "" : "s"} ·{" "}
              {profile.limits.audio} audio
            </p>
          </>
        )}
        {result.diagnostics.map((d, i) => (
          <p
            key={i}
            className={d.severity === "blocking" ? "text-xs text-[#cf7b6b]" : "text-xs text-[#b89a5a]"}
          >
            {d.message}
          </p>
        ))}
      </div>
      {children}
    </div>
  );
}
