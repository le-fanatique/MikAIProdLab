"use client";

// ---------------------------------------------------------------------------
// BenchRunPanel.tsx — LLMW.BENCH.RUN.1 (B6c1), §4.5; widened to serve a
// `kind: "list"` descriptor's output by LLMW.PROPOSAL.LIST.1 (B7d), §4.
//
// A thin wrapper around `ProposalPanel`: no business logic here — it calls
// the two Server Actions (`runBenchOperation`, `commitBenchProposal`) and
// renders the fields `plan` and `output` (both computed server-side) already
// describe (`.claude/rules/frontend.md`, "Keep business logic and durable
// decisions out of Client Components"). `ProposalPanel` itself is unchanged
// (`LLMW.PROPOSAL.LIST.1`, B7d): it is already generic on its own draft type,
// and its `redirectOnly` branch already renders exactly the hidden-field form
// `createGeneratedShots` needs.
//
// The bench's Approve is `replace`/`insertPerItem` only (§3.2 of B6c1's
// ticket, extended by B7d to the list case): no Append control exists here,
// and none is added for the list branch either — a list operation's Approve
// creates rows, it does not append to an existing field.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { runBenchOperation, commitBenchProposal } from "@/actions/llmWorkspace/bench";
import {
  buildBenchDraftFields,
  buildListSelectionPayload,
  type BenchCommitPlan,
  type ListOutputItemFields,
  type ObjectOutputFields,
} from "@/lib/llmWorkspace/benchRun";
import {
  buildCreateGeneratedSequencesHiddenFields,
  buildCreateGeneratedShotsHiddenFields,
  buildCreateSelectedAssetsHiddenFields,
  buildUpdateSequencePromptHiddenFields,
  buildUpdateShotPromptHiddenFields,
} from "@/lib/llmWorkspace/actions/proposalCommit";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import type { AnchorIds } from "@/lib/llmWorkspace/runner";
import type { BenchSearchParams } from "@/lib/llmWorkspace/bench";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

type ObjectDraft = Record<string, string>;

// The list draft's identity contract, frozen by the ticket: an item has no
// identity but its own index into `items` (nothing is persisted, there is no
// other stable identity), and the default selection is every index — the
// bench's normal gesture is Run then Approve, unlike
// `AssetsLLMExtractPanel`'s empty-by-default extraction review.
// `Record<string, string | number>` -> `Record<string, string | number |
// boolean>` (LLMW.DESCRIPTOR.CASTING.1, B7h-b2, §1), mirroring
// `runBenchOperation`'s own widened return type.
type ListDraft = { items: Array<Record<string, string | number | boolean>>; selected: number[] };

type Draft = ObjectDraft | ListDraft;

type Output =
  | { kind: "object"; fields: ObjectOutputFields }
  | { kind: "list"; itemFields: ListOutputItemFields; formDataKey: string };

type Props = {
  templateId: string;
  ids: AnchorIds;
  searchParams: BenchSearchParams;
  plan: BenchCommitPlan;
  output: Output;
  returnTo: string;
  /** LLMW.COMMIT.ADVISORY.1 (B10-f). `descriptor.commitAdvisory`, resolved
   * server-side by the page and passed down as a plain string — this
   * component never imports a descriptor itself (see `resolveBenchConfirmation`'s
   * comment in `benchRun.ts` for why that already broke the build once).
   * Shown after a successful `returnValue` Approve, via `ProposalPanel`'s
   * `onApproved`, on the same transient-confirmation model `AssetBibleEnhancePanel`
   * uses for "Asset Bible updated." A `redirectOnly` Approve navigates away
   * before `onApproved` would run, so this only ever surfaces for the
   * `returnValue` branch below — which is exactly the branch the three
   * advisory-bearing Asset descriptors commit through. */
  commitAdvisory?: string;
};

export default function BenchRunPanel({ templateId, ids, searchParams, plan, output, returnTo, commitAdvisory }: Props) {
  const [showAdvisory, setShowAdvisory] = useState(false);

  const trigger: ProposalTrigger<Draft> = {
    id: "run",
    label: "Run",
    loadingLabel: "Running…",
    run: async () => {
      const result = await runBenchOperation({ templateId, ids, searchParams });
      if (!result.ok) return result;

      if (output.kind === "list") {
        if (result.kind !== "list") {
          return { ok: false, error: "This template's Run result does not match its declared list output." };
        }
        const draft: ListDraft = { items: result.items, selected: result.items.map((_, index) => index) };
        return { ok: true, draft };
      }

      if (result.kind !== "object") {
        return { ok: false, error: "This template's Run result does not match its declared object output." };
      }
      const draft: ObjectDraft = Object.fromEntries(
        buildBenchDraftFields(output.fields, result.values).map(({ field, value }) => [field, value])
      );
      return { ok: true, draft };
    },
  };

  function approveActions(draft: Draft): ProposalApproveAction<Draft>[] {
    if (output.kind === "list") {
      const listDraft = draft as ListDraft;

      if (plan.kind === "redirectOnly" && plan.actionId === "createGeneratedShots") {
        // `output.formDataKey` names the descriptor's own declared selection
        // destination (`descriptor.output.selection.formDataKey`); refuse
        // rather than write the payload under an invented key if it ever
        // diverges from what `createGeneratedShots` actually reads.
        if (output.formDataKey !== "shotsJson") {
          return [];
        }
        return [
          {
            kind: "redirectOnly",
            id: "approve",
            label: "Approve",
            disabled: listDraft.selected.length === 0,
            action: ACTION_BINDINGS.createGeneratedShots,
            hiddenFields: (currentDraft) => {
              const current = currentDraft as ListDraft;
              return buildCreateGeneratedShotsHiddenFields({
                projectId: ids.projectId as number,
                sequenceId: ids.sequenceId as number,
                returnTo,
                shotsJson: buildListSelectionPayload(output.itemFields, current.items, current.selected),
              });
            },
          },
        ];
      }

      if (plan.kind === "redirectOnly" && plan.actionId === "createGeneratedSequences") {
        // `output.formDataKey` names the descriptor's own declared selection
        // destination (`descriptor.output.selection.formDataKey`); refuse
        // rather than write the payload under an invented key if it ever
        // diverges from what `createGeneratedSequences` actually reads.
        if (output.formDataKey !== "sequencesJson") {
          return [];
        }
        return [
          {
            kind: "redirectOnly",
            id: "approve",
            label: "Approve",
            disabled: listDraft.selected.length === 0,
            action: ACTION_BINDINGS.createGeneratedSequences,
            hiddenFields: (currentDraft) => {
              const current = currentDraft as ListDraft;
              return buildCreateGeneratedSequencesHiddenFields({
                projectId: ids.projectId as number,
                returnTo,
                sequencesJson: buildListSelectionPayload(output.itemFields, current.items, current.selected),
              });
            },
          },
        ];
      }

      if (plan.kind === "redirectOnly" && plan.actionId === "createSelectedAssets") {
        // `output.formDataKey` names the descriptor's own declared selection
        // destination (`descriptor.output.selection.formDataKey`); refuse
        // rather than write the payload under an invented key if it ever
        // diverges from what `createSelectedAssets` actually reads.
        if (output.formDataKey !== "selectedJson") {
          return [];
        }
        return [
          {
            kind: "redirectOnly",
            id: "approve",
            label: "Approve",
            disabled: listDraft.selected.length === 0,
            action: ACTION_BINDINGS.createSelectedAssets,
            hiddenFields: (currentDraft) => {
              const current = currentDraft as ListDraft;
              return buildCreateSelectedAssetsHiddenFields({
                projectId: ids.projectId as number,
                returnTo,
                selectedJson: buildListSelectionPayload(output.itemFields, current.items, current.selected),
              });
            },
          },
        ];
      }

      // Any other `actionId` a list descriptor could declare has no
      // descriptor wired to it, and any `returnValue`/`unsupported` plan is
      // not a list-commit shape at all. No Approve button; the reason is
      // rendered under the fields below.
      return [];
    }

    if (plan.kind === "returnValue") {
      return [
        {
          kind: "returnValue",
          id: "approve",
          label: "Approve",
          run: (current) => commitBenchProposal({ templateId, ids, values: current as ObjectDraft }),
        },
      ];
    }

    if (plan.kind === "redirectOnly" && plan.actionId === "updateShotPrompt") {
      return [
        {
          kind: "redirectOnly",
          id: "approve",
          label: "Approve",
          action: ACTION_BINDINGS.updateShotPrompt,
          hiddenFields: (currentDraft) => {
            const current = currentDraft as ObjectDraft;
            return buildUpdateShotPromptHiddenFields({
              projectId: ids.projectId as number,
              sequenceId: ids.sequenceId as number,
              shotId: ids.shotId as number,
              shotPrompt: current.shotPrompt ?? "",
              returnTo,
            });
          },
        },
      ];
    }

    if (plan.kind === "redirectOnly" && plan.actionId === "updateSequencePrompt") {
      return [
        {
          kind: "redirectOnly",
          id: "approve",
          label: "Approve",
          action: ACTION_BINDINGS.updateSequencePrompt,
          hiddenFields: (currentDraft) => {
            const current = currentDraft as ObjectDraft;
            return buildUpdateSequencePromptHiddenFields({
              projectId: ids.projectId as number,
              sequenceId: ids.sequenceId as number,
              sequencePrompt: current.sequencePrompt ?? "",
              returnTo,
            });
          },
        },
      ];
    }

    // `plan.kind === "unsupported"`, or a `redirectOnly` action this object
    // branch does not (yet) know — no Approve action; the refusal reason is
    // rendered under the fields instead (below).
    return [];
  }

  const textareaClass =
    "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed";

  return (
    <ProposalPanel<Draft>
      triggers={[trigger]}
      // Supervisor review retake (post-B6c1): an `unsupported` plan (the
      // `entitySet` batch descriptor) is known before Run ever runs — surface
      // it here too, not only after a Run that already paid for a real model
      // call, so the user learns Approve is impossible without spending one.
      // Run itself stays offered either way (§3.2 of the ticket).
      hints={
        <>
          {plan.kind === "unsupported" && <p className="text-xs text-[#cf7b6b]">{plan.reason}</p>}
          {showAdvisory && commitAdvisory && <p className="text-xs text-[#b89a5a]">{commitAdvisory}</p>}
        </>
      }
      onApproved={commitAdvisory ? () => setShowAdvisory(true) : undefined}
      showRegenerate
      regenerateLabel="Redo"
      approveActions={approveActions}
      renderDraft={(draft, setDraft) => {
        if (output.kind === "list") {
          const listDraft = draft as ListDraft;
          return (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-[#6e767d]">
                {listDraft.selected.length} of {listDraft.items.length} selected
              </p>
              <div className="flex flex-col gap-3">
                {listDraft.items.map((item, index) => {
                  const checked = listDraft.selected.includes(index);
                  return (
                    <div
                      key={index}
                      className="rounded border border-[#2c3035] bg-[#0d0e10] p-3 flex flex-col gap-2"
                    >
                      <label className="flex items-center gap-2 text-xs text-[#a4abb2]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setDraft((prev) => {
                              const p = prev as ListDraft;
                              const selected = isChecked
                                ? [...p.selected, index]
                                : p.selected.filter((i) => i !== index);
                              return { ...p, selected };
                            });
                          }}
                        />
                        Item {index + 1}
                      </label>
                      <div className="flex flex-col gap-1 pl-6">
                        {output.itemFields.map((f) => {
                          const value = item[f.field];
                          if (value === undefined || value === "") return null;
                          // `value` is now typed `string | number | boolean`
                          // (LLMW.DESCRIPTOR.CASTING.1, B7h-b2, §1), but
                          // `output.itemFields` iterates only
                          // `descriptor.output.item.fields` — the fields the
                          // model itself fills — and no `ListItemField`
                          // variant is ever boolean-typed (frozen contract).
                          // A `postResponse`-computed boolean field (e.g.
                          // `alreadyAssigned`) is never declared there, so
                          // this branch is unreached today. Explicit decision
                          // for the day it is not: `String(value)` renders a
                          // boolean the same way it already renders a number
                          // ("true" / "false"), not a special-cased label.
                          return (
                            <p key={f.field} className="text-[11px] text-[#8a8f96] font-mono">
                              <span className="text-[#6e767d]">{f.field}:</span> {String(value)}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {plan.kind === "unsupported" && <p className="text-xs text-[#cf7b6b]">{plan.reason}</p>}
              {/* LLMW.MIGRATE.LIST.3 (B7f-m): all three list-kind descriptors
                  declared today (`shotsFromSequence`, `sequencesFromOutline`,
                  `assetsFromProject`) commit through one of the three
                  branches above — but this fallback is not proven dead, and
                  is kept rather than removed. `OperationDescriptor.commit`
                  (`types.ts:486`) is `ActionId[]`, not narrowed to the three
                  list-shaped `redirectOnly` actions by `output.kind` — a
                  future list descriptor could still name `updateShotPrompt`
                  / `updateSequencePrompt` (the two other `RedirectOnlyActionId`
                  members, both `"update"`/object-shaped in the registry, not
                  wired to any list branch here) or any `response:
                  "returnValue"` action (e.g. `updateAssetDetailsInline`) as
                  its own `commit`, and nothing at the type level rejects
                  that. `planBenchCommit` (`benchRun.ts`) would still resolve
                  such a descriptor to a `redirectOnly` or `returnValue` plan,
                  and this line is exactly the path that would render for it. */}
              {plan.kind !== "unsupported" &&
                !(plan.kind === "redirectOnly" && plan.actionId === "createGeneratedShots") &&
                !(plan.kind === "redirectOnly" && plan.actionId === "createGeneratedSequences") &&
                !(plan.kind === "redirectOnly" && plan.actionId === "createSelectedAssets") && (
                  <p className="text-xs text-[#cf7b6b]">
                    This template&apos;s commit action has no bench Approve path yet.
                  </p>
                )}
            </div>
          );
        }

        const objectDraft = draft as ObjectDraft;
        return (
          <div className="flex flex-col gap-4">
            {output.fields.map((f) => (
              <div key={f.field} className="flex flex-col gap-2">
                <label
                  htmlFor={`bench-${f.field}`}
                  className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]"
                >
                  {f.field}
                </label>
                <textarea
                  id={`bench-${f.field}`}
                  value={objectDraft[f.field] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((prev) => ({ ...(prev as ObjectDraft), [f.field]: value }));
                  }}
                  rows={5}
                  className={textareaClass}
                />
              </div>
            ))}

            {plan.kind === "unsupported" && <p className="text-xs text-[#cf7b6b]">{plan.reason}</p>}
          </div>
        );
      }}
    />
  );
}
