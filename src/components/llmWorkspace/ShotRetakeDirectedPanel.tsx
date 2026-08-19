"use client";

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { buildShotRetakeCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import type { GeneratedShotRetakeDraft } from "@/types/llm";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  description: string | null;
  actionPitch: string | null;
  cameraPitch: string | null;
};

/**
 * `shot.retakeDirected` — LLMW.UC2.RETAKE.1 (B9b). Sits next to
 * `ShotPromptLLMAssistPanel` on Shot Detail's "Shot Prompt" Card (§4.5 of the
 * ticket: "à côté de l'assistant de prompt existant — qui reste intact"),
 * on the same `ProposalPanel` engine, with the free-text director's note
 * (B9a) as its only input — this operation declares no `intent.mode`
 * (§4.4: "UC2 n'a qu'un mode, la consigne libre le porte").
 *
 * A field the model left empty must never overwrite the existing value
 * (§4.3) — handled by `buildShotRetakeCommitArgs`, not by this component.
 */
export default function ShotRetakeDirectedPanel({
  projectId,
  sequenceId,
  shotId,
  description,
  actionPitch,
  cameraPitch,
}: Props) {
  const [freeText, setFreeText] = useState("");
  const [justUpdated, setJustUpdated] = useState(false);
  const hasDirection = Boolean(freeText.trim());

  const trigger: ProposalTrigger<GeneratedShotRetakeDraft> = {
    id: "retake",
    label: "Propose Retake",
    // Supervisor review, post-B9b: a directed retake with no direction is
    // not this operation — it is a random regeneration that still costs a
    // model call. Disabled here rather than left to the descriptor's own
    // (now neutral) closing instruction to somehow compensate.
    disabled: !hasDirection,
    loadingLabel: "Working out a retake...",
    // LLMW.UNIFY.PANEL.2 — names its operation instead of importing a
    // function for it. The director's note travels through `intent`, the
    // descriptor's own declared shape — not reconstructed here. The
    // narrowing below is not defensive noise: `runOperation`'s `"object"`
    // values are `string | number`, while all three fields this descriptor
    // declares are `type: "string"`. The impossible branch is refused
    // loudly rather than coerced, exactly as the deleted adapter did.
    run: async () => {
      const result = await runWorkspaceOperation({
        descriptorId: "shot.retakeDirected",
        ids: { projectId, sequenceId, shotId },
        intent: { freeText: freeText || undefined },
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.kind !== "object") return { ok: false, error: "Expected an object-kind result." };
      const { description, actionPitch, cameraPitch } = result.values;
      if (typeof description !== "string" || typeof actionPitch !== "string" || typeof cameraPitch !== "string") {
        return { ok: false, error: "Unexpected non-text value in a string field." };
      }
      return { ok: true, draft: { description, actionPitch, cameraPitch } };
    },
  };

  function approveActions(): ProposalApproveAction<GeneratedShotRetakeDraft>[] {
    return [
      {
        kind: "returnValue",
        id: "apply",
        label: "Apply Retake",
        run: async (current) => {
          const args = buildShotRetakeCommitArgs({
            shotId,
            sequenceId,
            projectId,
            existing: { description, actionPitch, cameraPitch },
            applied: current,
          });
          return ACTION_BINDINGS.updateShotNarrativeContext(...args);
        },
      },
    ];
  }

  const textareaClass =
    "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] resize-y focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed";

  return (
    <div className="flex flex-col gap-2 border-t border-[#232629] pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
        Directed Retake
      </p>
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Describe what you want changed — action, framing intent, tone — and the assistant proposes updated Description, Action Pitch and Camera Pitch for review.
      </p>

      {justUpdated && <p className="text-xs text-[#6b9e72]">Shot narrative context updated.</p>}

      <ProposalPanel<GeneratedShotRetakeDraft>
        triggers={[trigger]}
        freeTextInput={{
          label: "Director's note",
          value: freeText,
          onChange: setFreeText,
          placeholder: "e.g. more empathy with the character, and a lower angle on the approach",
        }}
        disabledHint={
          !hasDirection ? (
            <p className="text-xs text-[#4b5158]">
              Add a director&apos;s note above to propose a retake — a retake needs direction.
            </p>
          ) : undefined
        }
        showRegenerate
        cancelLabel="Discard"
        onApproved={() => setJustUpdated(true)}
        approveActions={approveActions}
        renderDraft={(draft, setDraft) => (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-[#b89a5a]">
              Preview only — nothing is saved until you click Apply Retake. A field left blank keeps its current value.
            </p>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="retakeDescription" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                  Description
                </label>
                {!draft.description.trim() && (
                  <span className="text-[10px] normal-case tracking-normal text-[#6e767d]">Unchanged — keeps current value</span>
                )}
              </div>
              <textarea
                id="retakeDescription"
                value={draft.description}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({ ...prev, description: value }));
                }}
                placeholder={description ?? ""}
                rows={3}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="retakeActionPitch" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                  Action Pitch
                </label>
                {!draft.actionPitch.trim() && (
                  <span className="text-[10px] normal-case tracking-normal text-[#6e767d]">Unchanged — keeps current value</span>
                )}
              </div>
              <textarea
                id="retakeActionPitch"
                value={draft.actionPitch}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({ ...prev, actionPitch: value }));
                }}
                placeholder={actionPitch ?? ""}
                rows={2}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="retakeCameraPitch" className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                  Camera Pitch
                </label>
                {!draft.cameraPitch.trim() && (
                  <span className="text-[10px] normal-case tracking-normal text-[#6e767d]">Unchanged — keeps current value</span>
                )}
              </div>
              <textarea
                id="retakeCameraPitch"
                value={draft.cameraPitch}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({ ...prev, cameraPitch: value }));
                }}
                placeholder={cameraPitch ?? ""}
                rows={2}
                className={textareaClass}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}
