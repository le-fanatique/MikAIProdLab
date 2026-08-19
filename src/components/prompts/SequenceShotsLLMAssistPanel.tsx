"use client";

import { useState } from "react";
import { createGeneratedShots } from "@/actions/llm/sequenceShots";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import type { GeneratedSequenceShot } from "@/lib/prompts/shots-from-sequence";

// LLMW.UNIFY.PANEL.3 — this panel now names `shots.fromSequence` directly
// instead of importing a generation function for it
// (`generateShotsFromSequenceDraft`, deleted alongside this migration,
// `src/actions/llm/sequenceShots.ts`). `runWorkspaceOperation` already
// returns `result.items` keyed by the model's own JSON keys
// (LLMW.UNIFY.LIST.1). What remains here is presentation, kept identical to
// what the deleted adapter did: the `"" -> null` fill-back for every
// `type: "string"` field, and `duration_seconds` staying `null` when the
// runner omitted it (out of range or absent). The boolean guard mirrors the
// deleted adapter's own "impossible input throws" discipline — no
// `output.item.fields` entry is ever boolean-typed for this descriptor.
function toShot(item: Record<string, string | number | boolean>): GeneratedSequenceShot {
  function strField(key: string): string | null {
    const value = item[key];
    if (value === undefined) return null;
    if (typeof value === "boolean") {
      throw new Error(`SequenceShotsLLMAssistPanel: unexpected boolean value for field "${key}".`);
    }
    return value === "" ? null : String(value);
  }
  const title = item.title;
  if (typeof title !== "string") {
    throw new Error('SequenceShotsLLMAssistPanel: expected a string "title" on every item.');
  }
  const durationRaw = item.duration_seconds;
  if (durationRaw !== undefined && typeof durationRaw !== "number") {
    throw new Error('SequenceShotsLLMAssistPanel: expected a numeric "duration_seconds" when present.');
  }
  return {
    title,
    shot_code: strField("shot_code"),
    description: strField("description"),
    duration_seconds: durationRaw ?? null,
    continuity_in: strField("continuity_in"),
    action_pitch: strField("action_pitch"),
    camera_pitch: strField("camera_pitch"),
    framing: strField("framing"),
    camera_movement: strField("camera_movement"),
    continuity_out: strField("continuity_out"),
    shot_prompt: strField("shot_prompt"),
  };
}

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
  hasSequencePrompt?: boolean;
  existingShotsCount?: number;
};

export default function SequenceShotsLLMAssistPanel({
  projectId,
  sequenceId,
  returnTo,
  createdCount,
  createError,
  hasSequencePrompt,
  existingShotsCount = 0,
}: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [shotCount, setShotCount] = useState(6);
  const [isCreating, setIsCreating] = useState(false);

  async function handleGenerate() {
    setState({ status: "loading" });
    const result = await runWorkspaceOperation({
      descriptorId: "shots.fromSequence",
      ids: { projectId, sequenceId },
      intent: { parameters: { targetCount: shotCount } },
    });
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    if (result.kind !== "list") {
      setState({ status: "error", message: "Expected a list-kind result." });
      return;
    }
    try {
      const shots = result.items.map(toShot);
      setState({ status: "success", shots });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unexpected error. Please try again.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Generate a draft shot list from this sequence. Nothing is created until you click Create Shots.
      </p>

      {hasSequencePrompt ? (
        <p className="text-xs text-[#6b9e72]">
          The current Sequence Prompt will guide the generated shots.
        </p>
      ) : (
        <p className="text-xs text-[#4b5158]">
          Add a Sequence Prompt above to guide the generated shots more precisely.
        </p>
      )}

      {existingShotsCount > 0 && (
        <div className="rounded border border-amber-800/40 bg-amber-950/20 px-3 py-2">
          <p className="text-xs text-amber-500 leading-relaxed">
            This will add new shots after the existing ones. ({existingShotsCount} shot{existingShotsCount !== 1 ? "s" : ""} already exist.)
          </p>
        </div>
      )}

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
                  {(shot.continuity_in || shot.continuity_out) && (
                    <div className="flex flex-col gap-0.5 border-t border-[#1e2124] pt-1.5 mt-0.5">
                      {shot.continuity_in && (
                        <p className="text-xs text-[#4b5158]">
                          <span className="font-medium">Continuity In </span>
                          <span className="text-[#6e767d]">{shot.continuity_in}</span>
                        </p>
                      )}
                      {shot.continuity_out && (
                        <p className="text-xs text-[#4b5158]">
                          <span className="font-medium">Continuity Out </span>
                          <span className="text-[#6e767d]">{shot.continuity_out}</span>
                        </p>
                      )}
                    </div>
                  )}
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
            <form
              action={async (fd) => {
                setIsCreating(true);
                await createGeneratedShots(fd);
              }}
            >
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="shotsJson" value={JSON.stringify(state.shots)} />
              <button
                type="submit"
                disabled={isCreating}
                className={
                  isCreating
                    ? "rounded bg-[#1a1d20] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
                    : "rounded bg-[#232629] text-[#e7e9ec] px-3 py-1.5 text-sm hover:bg-[#2c3035] transition-colors"
                }
              >
                {isCreating ? "Creating shots..." : "Create Shots"}
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
