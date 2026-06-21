"use client";

import { useState } from "react";
import { generateShotsFromSequenceDraft, createGeneratedShots } from "@/actions/llm/sequenceShots";
import type { GeneratedSequenceShot } from "@/lib/prompts/shots-from-sequence";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; shots: GeneratedSequenceShot[] }
  | { status: "error"; message: string };

type Props = {
  projectId: number;
  sequenceId: number;
  returnTo: string;
  createdCount?: number | null;
  createError?: string | null;
};

export default function SequenceShotsLLMAssistPanel({
  projectId,
  sequenceId,
  returnTo,
  createdCount,
  createError,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [shotCount, setShotCount] = useState(6);

  async function handleGenerate() {
    setState({ status: "loading" });
    const fd = new FormData();
    fd.set("projectId", String(projectId));
    fd.set("sequenceId", String(sequenceId));
    fd.set("shotCount", String(shotCount));
    const result = await generateShotsFromSequenceDraft(fd);
    if (result.ok) {
      setState({ status: "success", shots: result.shots });
    } else {
      setState({ status: "error", message: result.error });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Generate a draft shot list from this sequence. Nothing is created until you click Create Shots.
      </p>

      {createdCount != null && createdCount > 0 && (
        <p className="text-xs text-[#6b9e72]">Created {createdCount} shot{createdCount !== 1 ? "s" : ""}.</p>
      )}
      {createError && (
        <p className="text-xs text-[#cf7b6b]">{createError}</p>
      )}

      {/* Generate controls */}
      {(state.status === "idle" || state.status === "error") && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="shot-count-input"
                className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]"
              >
                Number of shots
              </label>
              <input
                id="shot-count-input"
                type="number"
                min={1}
                max={30}
                value={shotCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isInteger(v) && v >= 1 && v <= 30) setShotCount(v);
                }}
                className="w-20 rounded border border-[#2c3035] bg-[#141618] px-2 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046]"
              />
            </div>
            <div className="self-end">
              <button
                type="button"
                onClick={handleGenerate}
                className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Generate Shot List
              </button>
            </div>
          </div>
          {state.status === "error" && (
            <p className="text-xs text-[#cf7b6b]">{state.message}</p>
          )}
        </div>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">Generating...</p>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-4">
          {/* Shot preview list */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Draft — {state.shots.length} shot{state.shots.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-2">
              {state.shots.map((shot, i) => (
                <div
                  key={i}
                  className="rounded border border-[#232629] bg-[#141618] px-3 py-2.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-baseline gap-2">
                    {shot.shot_code && (
                      <span className="font-mono text-[10px] text-[#4b5158]">{shot.shot_code}</span>
                    )}
                    <span className="text-sm font-medium text-[#e7e9ec]">{shot.title}</span>
                    {shot.duration_seconds != null && (
                      <span className="ml-auto font-mono text-xs text-[#4b5158]">
                        {shot.duration_seconds}s
                      </span>
                    )}
                  </div>
                  {shot.description && (
                    <p className="text-xs text-[#6e767d] leading-relaxed">{shot.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                    {shot.action_pitch && (
                      <span>
                        <span className="text-[#4b5158]">Action </span>
                        <span className="text-[#6e767d]">{shot.action_pitch}</span>
                      </span>
                    )}
                    {shot.camera_pitch && (
                      <span>
                        <span className="text-[#4b5158]">Camera </span>
                        <span className="text-[#6e767d]">{shot.camera_pitch}</span>
                      </span>
                    )}
                    {shot.framing && (
                      <span>
                        <span className="text-[#4b5158]">Framing </span>
                        <span className="text-[#6e767d]">{shot.framing}</span>
                      </span>
                    )}
                    {shot.camera_movement && (
                      <span>
                        <span className="text-[#4b5158]">Movement </span>
                        <span className="text-[#6e767d]">{shot.camera_movement}</span>
                      </span>
                    )}
                  </div>
                  {shot.shot_prompt && (
                    <p className="text-xs text-[#a4abb2] leading-relaxed border-t border-[#1e2124] pt-1.5 mt-0.5 italic">
                      {shot.shot_prompt}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <form action={createGeneratedShots}>
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="shotsJson" value={JSON.stringify(state.shots)} />
              <button
                type="submit"
                className="rounded bg-[#232629] text-[#e7e9ec] px-3 py-1.5 text-sm hover:bg-[#2c3035] transition-colors"
              >
                Create Shots
              </button>
            </form>

            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
