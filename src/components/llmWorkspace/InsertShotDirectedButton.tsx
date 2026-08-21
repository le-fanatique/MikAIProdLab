"use client";

// ---------------------------------------------------------------------------
// InsertShotDirectedButton.tsx — LLMW.UC1.SURFACE.1 (S6)
//
// `shot.insertDirected` leaves the bench for the Sequence page (§4 of
// `docs/LLM_WORKSPACE_PRODUCT_VISION.md`, UC1). Placed exactly where the
// page already offers a natural spot between two shots — the connector row
// `InsertShotFromEditorialButton` already occupies after each shot (and
// after the last one), never a form field asking for a shot id
// (`.agents/supervised_task.md` §1): this component's own `afterShotId`
// prop is always the id of the shot the caller renders it next to, supplied
// by the Sequence page's own `.map` over its shot list, never typed by the
// user.
//
// Envelope followed: `shotPrompt.assist` (`ShotPromptLLMAssistPanel.tsx`) —
// `output.kind: "object"`, commit `redirectOnly`, `ProposalPanel` never
// calls the binding directly, the Approve action renders as its own
// `<form action={ACTION_BINDINGS.createShotAtPosition}>` with hidden fields
// built from the (possibly user-edited) draft. One trigger only, disabled
// without a director's note — the operation's whole request (`descriptors
// /shotInsertDirected.ts`'s own `intent.freeText`), mirroring
// `ShotRetakeDirectedPanel`'s identical refusal for `shot.retakeDirected`,
// the other free-text-only Directed operation.
//
// `buildInsertShotDirectedHiddenFields` composes the two already-proven
// builders `buildShotJsonPayload` (`benchRun.ts`, B11-b3) and
// `buildCreateShotAtPositionHiddenFields` (`actions/proposalCommit.ts`,
// B11-b3) — reused, not reimplemented, per the ticket's own contract.
// Exported so `tests/` can prove this specific caller feeds them what they
// need (an `afterShotId` and a draft whose numeric field survives as a real
// JSON number) without rendering the component.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { buildCreateShotAtPositionHiddenFields } from "@/lib/llmWorkspace/actions/proposalCommit";
import { buildShotJsonPayload, type ObjectOutputFields } from "@/lib/llmWorkspace/benchRun";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type Draft = Record<string, string | number>;

type Props = {
  projectId: number;
  sequenceId: number;
  /** Implicit: the id of the shot this affordance sits next to. `undefined`
   * inserts at the very start of the sequence — `createShotAtPosition`'s own
   * contract for a blank `afterShotId` (`shotInsertion.ts`) — never a value
   * the user types in. */
  afterShotId?: number;
  returnTo: string;
  /** `shotInsertDirectedDescriptor.output.fields`, resolved server-side by
   * the Sequence page and passed down as plain data — this component never
   * imports the descriptor itself (same discipline `BenchRunPanel` already
   * follows for its own `output` prop, see that component's header). */
  fields: ObjectOutputFields;
  label?: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  durationSeconds: "Duration (s)",
  actionPitch: "Action Pitch",
  cameraPitch: "Camera Pitch",
  continuityNotes: "Continuity Notes",
  shotSize: "Framing",
  cameraMovement: "Camera Movement",
  continuityIn: "Continuity In",
  continuityOut: "Continuity Out",
};

/**
 * `buildInsertShotDirectedHiddenFields` — the one place this component turns
 * a `ProposalPanel` draft into `createShotAtPosition`'s hidden fields.
 * `afterShotId` is threaded straight through — the caller's own click
 * target, never re-derived from the draft — and `shotJson` is always built
 * fresh from the *current* draft (edits included), never cached from the
 * generation that produced it, since `ProposalPanel`'s review step lets the
 * user edit any field before Approve.
 */
export function buildInsertShotDirectedHiddenFields(input: {
  projectId: number;
  sequenceId: number;
  afterShotId: number | undefined;
  returnTo: string;
  fields: ObjectOutputFields;
  draft: Draft;
}): Record<string, string> {
  return buildCreateShotAtPositionHiddenFields({
    projectId: input.projectId,
    sequenceId: input.sequenceId,
    afterShotId: input.afterShotId,
    returnTo: input.returnTo,
    shotJson: buildShotJsonPayload(input.fields, input.draft),
  });
}

export default function InsertShotDirectedButton({
  projectId,
  sequenceId,
  afterShotId,
  returnTo,
  fields,
  label = "Insert Directed Shot",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const hasDirection = Boolean(freeText.trim());

  const trigger: ProposalTrigger<Draft> = {
    id: "insert",
    label: "Propose Shot",
    // Same refusal `ShotRetakeDirectedPanel` applies to `shot.retakeDirected`:
    // a directed insertion with no direction is not this operation, and
    // still costs a model call.
    disabled: !hasDirection,
    loadingLabel: "Directing the shot...",
    // LLMW.UNIFY.PANEL.2 — names its operation instead of importing a
    // function for it. The director's note and `afterShotId` both travel
    // through `intent`, the descriptor's own declared shape — not
    // reconstructed here. `result.values` is handed to `Draft` as-is, the
    // same widening `generateShotInsertDraft` and `runBenchOperation`
    // already made for this descriptor (LLMW.UC1.BENCH.1, B11-b3) — no
    // second flattening.
    run: async () => {
      const result = await runWorkspaceOperation({
        descriptorId: "shot.insertDirected",
        ids: { projectId, sequenceId },
        intent: {
          freeText: freeText || undefined,
          parameters: afterShotId !== undefined ? { afterShotId } : {},
        },
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.kind !== "object") return { ok: false, error: "Expected an object-kind result." };
      return { ok: true, draft: result.values };
    },
  };

  function approveActions(): ProposalApproveAction<Draft>[] {
    return [
      {
        kind: "redirectOnly",
        id: "approve",
        label: "Insert Shot",
        action: ACTION_BINDINGS.createShotAtPosition,
        hiddenFields: (current) =>
          buildInsertShotDirectedHiddenFields({
            projectId,
            sequenceId,
            afterShotId,
            returnTo,
            fields,
            draft: current,
          }),
      },
    ];
  }

  const textareaClass =
    "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] resize-y focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed";

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded border border-[#2c3035] bg-[#141618] p-3 flex flex-col gap-2.5 my-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">Insert Directed Shot</p>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          Close
        </button>
      </div>
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Describe the shot you want inserted here, and the assistant proposes it for review — nothing is created
        until you click Insert Shot.
      </p>

      <ProposalPanel<Draft>
        triggers={[trigger]}
        freeTextInput={{
          label: "Director's note",
          value: freeText,
          onChange: setFreeText,
          placeholder: "e.g. a low angle shot, the hero entering and exiting frame",
        }}
        disabledHint={
          !hasDirection ? (
            <p className="text-xs text-[#4b5158]">
              Add a director&apos;s note above to propose a shot — an insertion needs direction.
            </p>
          ) : undefined
        }
        showRegenerate
        cancelLabel="Discard"
        approveActions={approveActions}
        renderDraft={(draft, setDraft) => (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[#b89a5a]">
              Preview only — nothing is saved until you click Insert Shot.
            </p>
            {fields.map((f) => (
              <div key={f.field} className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                  {FIELD_LABELS[f.field] ?? f.field}
                </label>
                {f.type === "number" ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft[f.field] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDraft((prev) => ({ ...prev, [f.field]: value }));
                    }}
                    className={textareaClass}
                  />
                ) : (
                  <textarea
                    value={draft[f.field] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDraft((prev) => ({ ...prev, [f.field]: value }));
                    }}
                    rows={f.field === "title" || f.field === "shotSize" || f.field === "cameraMovement" ? 1 : 2}
                    className={textareaClass}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}
