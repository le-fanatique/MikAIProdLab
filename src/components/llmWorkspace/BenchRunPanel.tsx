"use client";

// ---------------------------------------------------------------------------
// BenchRunPanel.tsx — LLMW.BENCH.RUN.1 (B6c1), §4.5; widened to serve a
// `kind: "list"` descriptor's output by LLMW.PROPOSAL.LIST.1 (B7d), §4;
// widened again to serve a `kind: "text"` descriptor's output by
// LLMW.NARRATIVE.1 (B12b-2) — `narrativePrompt.compose`'s own single
// generated value, mirroring the `"object"` branch's one-field case (one
// `<textarea>`, no selection), never the `"list"` branch's checkbox-per-item
// model.
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
  buildShotJsonPayload,
  type BenchCommitPlan,
  type ListOutputItemFields,
  type ObjectOutputFields,
} from "@/lib/llmWorkspace/benchRun";
import {
  buildApplySelectedCastingSuggestionsHiddenFields,
  buildCreateGeneratedSequencesHiddenFields,
  buildCreateGeneratedShotsHiddenFields,
  buildCreateSelectedAssetsHiddenFields,
  buildCreateShotAtPositionHiddenFields,
  buildUpdateSequenceLightingHiddenFields,
  buildUpdateSequencePromptHiddenFields,
  buildUpdateShotLightingHiddenFields,
  buildUpdateShotNarrativePromptHiddenFields,
  buildUpdateShotPromptHiddenFields,
} from "@/lib/llmWorkspace/actions/proposalCommit";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import type { AnchorIds } from "@/lib/llmWorkspace/runner";
import type { BenchSearchParams } from "@/lib/llmWorkspace/bench";
import ProposalPanel, { type ProposalApproveAction, type ProposalTrigger } from "@/components/llmWorkspace/ProposalPanel";

// `Record<string, string>` -> `Record<string, string | number>` (LLMW.UC1.BENCH.1,
// B11-b3), mirroring `runBenchOperation`'s own widened return type
// (`bench.ts`) and `buildBenchDraftFields`'s own widened return type
// (`benchRun.ts`). Every value still edits as text in a `<textarea>` below —
// this only widens what the *initial* Run draft may carry, not what an edit
// produces.
type ObjectDraft = Record<string, string | number>;

// Local copy of `bench.ts`'s own `firstBenchParam` (identical one-liner):
// this component cannot import a runtime binding from `bench.ts` without
// pulling its whole module graph (`runner.ts` → `llm/index.ts` →
// `comfy/comfyServerClient.ts` → Node's `fs/promises`) into the client
// bundle — the same bundling failure `benchRun.ts`'s own `firstSearchValue`
// avoids the same way, for the same reason (see that function's comment).
function firstSearchParamValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The list draft's identity contract, frozen by the ticket: an item has no
// identity but its own index into `items` (nothing is persisted, there is no
// other stable identity), and the default selection is every index — the
// bench's normal gesture is Run then Approve, unlike
// `AssetsLLMExtractPanel`'s empty-by-default extraction review.
// `Record<string, string | number>` -> `Record<string, string | number |
// boolean>` (LLMW.DESCRIPTOR.CASTING.1, B7h-b2, §1), mirroring
// `runBenchOperation`'s own widened return type.
type ListDraft = { items: Array<Record<string, string | number | boolean>>; selected: number[] };

// LLMW.NARRATIVE.1 (B12b-2): the first bench render surface for a
// `kind: "text"` output — one value, no selection, no field list. `text`
// edits in a single `<textarea>`, same interaction as an `"object"` draft's
// one-field case, minus the per-field label loop `output.fields` would
// otherwise drive.
type TextDraft = { text: string };

// LLMW.LIGHTING.FROMIMAGE.1 (B16b) — the first bench render surface for a
// descriptor that declares `images`. Server-resolved by the page (which
// already queries the anchored Asset's reference images for
// `resolveOperationPreview`'s own selection) and handed down as plain data,
// the same discipline `output`/`plan`/`commitAdvisory` already follow: no
// business logic lives here, only rendering.
//
// **Selection travels through the page's own "Test Entity" GET form, not
// through local component state.** Every other run input this bench has
// (`mode`, `intent.parameters`, `freeText`) already works this way — resolved
// server-side from the URL, applied on the same "Apply" submit — and the
// centre "Resolved Context" pane (server-rendered from that same URL) must
// see the identical selection Run/Approve use, or the two panes would
// silently disagree. The checkboxes below are therefore associated with the
// page's form via the HTML `form` attribute (`formId`) rather than living in
// a form of their own.
//
// **This control does not express the order the user checked boxes in.** An
// HTML form serializes checked boxes in DOM order, not click order — the
// same limitation `intent.parameters`'s own `"multiEnum"` checkboxes already
// have. The order the runner keys `R1..Rn` by is therefore this list's own
// display order (the Asset's reference images, in the order the page queried
// them), never the order the user actually ticked them in. Reported rather
// than silently assumed — see `.agents/executor_report.md`.
type ImagesInput = {
  available: Array<{ id: number; label: string | null }>;
  selectedIds: number[];
  minCount: number;
  maxCount: number;
};

type Draft = ObjectDraft | ListDraft | TextDraft;

type Output =
  | { kind: "object"; fields: ObjectOutputFields }
  | { kind: "list"; itemFields: ListOutputItemFields; formDataKey: string }
  // `field` names the descriptor's own declared `output.field`
  // (`narrativePrompt.compose`'s `"narrativePrompt"`) — the same value the
  // Approve hidden field is posted under.
  | { kind: "text"; field: string };

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
  /** LLMW.LIGHTING.FROMIMAGE.1 (B16b). `null` for a descriptor that declares
   * no `images` — no selector renders, "un descripteur qui n'en déclare pas
   * ne montre rien de neuf" (the ticket's own words). */
  imagesInput: ImagesInput | null;
  /** The page's "Test Entity" `<form method="get">` id, so the images
   * checkboxes below (rendered here, not inside that form) still submit
   * with it via the HTML `form` attribute. */
  testEntityFormId: string;
};

export default function BenchRunPanel({
  templateId,
  ids,
  searchParams,
  plan,
  output,
  returnTo,
  commitAdvisory,
  imagesInput,
  testEntityFormId,
}: Props) {
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

      if (output.kind === "text") {
        if (result.kind !== "text") {
          return { ok: false, error: "This template's Run result does not match its declared text output." };
        }
        const draft: TextDraft = { text: result.text };
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
    if (output.kind === "text") {
      if (plan.kind === "redirectOnly" && plan.actionId === "updateShotNarrativePrompt") {
        return [
          {
            kind: "redirectOnly",
            id: "approve",
            label: "Approve",
            action: ACTION_BINDINGS.updateShotNarrativePrompt,
            hiddenFields: (currentDraft) => {
              const current = currentDraft as TextDraft;
              return buildUpdateShotNarrativePromptHiddenFields({
                projectId: ids.projectId as number,
                sequenceId: ids.sequenceId as number,
                shotId: ids.shotId as number,
                narrativePrompt: current.text,
                returnTo,
              });
            },
          },
        ];
      }

      // LLMW.LIGHTING.DIRECTED.1 (B16c) — `shot.lightingDirected`'s own
      // branch, on the exact model of `updateShotNarrativePrompt`'s branch
      // above, over `lighting` instead of `narrativePrompt`.
      if (plan.kind === "redirectOnly" && plan.actionId === "updateShotLighting") {
        return [
          {
            kind: "redirectOnly",
            id: "approve",
            label: "Approve",
            action: ACTION_BINDINGS.updateShotLighting,
            hiddenFields: (currentDraft) => {
              const current = currentDraft as TextDraft;
              return buildUpdateShotLightingHiddenFields({
                projectId: ids.projectId as number,
                sequenceId: ids.sequenceId as number,
                shotId: ids.shotId as number,
                lighting: current.text,
                returnTo,
              });
            },
          },
        ];
      }

      // LLMW.LIGHTING.DIRECTED.1 (B16c) — `sequence.lightingDirected`'s own
      // branch, same model, over `updateSequenceLighting` (no `shotId`: this
      // operation anchors on `sequence`).
      if (plan.kind === "redirectOnly" && plan.actionId === "updateSequenceLighting") {
        return [
          {
            kind: "redirectOnly",
            id: "approve",
            label: "Approve",
            action: ACTION_BINDINGS.updateSequenceLighting,
            hiddenFields: (currentDraft) => {
              const current = currentDraft as TextDraft;
              return buildUpdateSequenceLightingHiddenFields({
                projectId: ids.projectId as number,
                sequenceId: ids.sequenceId as number,
                lighting: current.text,
                returnTo,
              });
            },
          },
        ];
      }

      // LLMW.LIGHTING.FROMIMAGE.1 (B16b) — `updateAssetLightingInline`'s own
      // branch: a `returnValue` action, like the `"object"` branch's own
      // generic `plan.kind === "returnValue"` case further down, but the
      // draft here is a `TextDraft` (one string, no per-field loop), so the
      // `values` object `commitBenchProposal` expects is built from
      // `output.field` rather than spread from the draft directly.
      if (plan.kind === "returnValue") {
        return [
          {
            kind: "returnValue",
            id: "approve",
            label: "Approve",
            run: (current) =>
              commitBenchProposal({
                templateId,
                ids,
                values: { [output.field]: (current as TextDraft).text },
              }),
          },
        ];
      }

      // Any other `actionId` a text descriptor could declare has no
      // approve branch wired here yet — no Approve button; the reason is
      // rendered under the field below, on the same model the list and
      // object branches already follow.
      return [];
    }

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

      if (plan.kind === "redirectOnly" && plan.actionId === "applySelectedCastingSuggestions") {
        // `output.formDataKey` names the descriptor's own declared selection
        // destination (`descriptor.output.selection.formDataKey`); refuse
        // rather than write the payload under an invented key if it ever
        // diverges from what `applySelectedCastingSuggestions` actually
        // reads.
        if (output.formDataKey !== "selectedJson") {
          return [];
        }
        return [
          {
            kind: "redirectOnly",
            id: "approve",
            label: "Approve",
            disabled: listDraft.selected.length === 0,
            action: ACTION_BINDINGS.applySelectedCastingSuggestions,
            hiddenFields: (currentDraft) => {
              const current = currentDraft as ListDraft;
              return buildApplySelectedCastingSuggestionsHiddenFields({
                projectId: ids.projectId as number,
                sequenceId: ids.sequenceId as number,
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
            // `shotPrompt.assist` declares only `type: "string"` fields
            // (`ObjectOutputField`, `types.ts`), so `current.shotPrompt` is
            // never actually a number at runtime — `String(...)` here is the
            // same "type mechanically widened, value never actually numeric"
            // treatment `ObjectDraft`'s own widening requires
            // (LLMW.UC1.BENCH.1, B11-b3), not a silent stringify of a real
            // number the way `commitBenchProposal`'s `requireStringValue`
            // (`bench.ts`) refuses instead.
            return buildUpdateShotPromptHiddenFields({
              projectId: ids.projectId as number,
              sequenceId: ids.sequenceId as number,
              shotId: ids.shotId as number,
              shotPrompt: String(current.shotPrompt ?? ""),
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
            // `sequencePrompt.assist` declares only `type: "string"` fields
            // (`ObjectOutputField`, `types.ts`) — see the sibling comment on
            // `updateShotPrompt`'s own branch above for why `String(...)` is
            // the right, and not a silent, coercion here.
            return buildUpdateSequencePromptHiddenFields({
              projectId: ids.projectId as number,
              sequenceId: ids.sequenceId as number,
              sequencePrompt: String(current.sequencePrompt ?? ""),
              returnTo,
            });
          },
        },
      ];
    }

    if (plan.kind === "redirectOnly" && plan.actionId === "createShotAtPosition") {
      // `afterShotId` is an `intent.parameters` entry (`shot.insertDirected`'s
      // own descriptor, `descriptors/shotInsertDirected.ts`), not an anchor
      // id — it arrives on the query string exactly like the bench's other
      // intent controls, read here the same way `parseIntentInputFromSearchParams`
      // reads it server-side (`bench.ts`), via the local
      // `firstSearchParamValue` copy above.
      //
      // No `output.formDataKey`-shaped guard exists for this branch, unlike
      // the four list branches above: that guard refuses to write a list
      // payload under an invented key if a descriptor's own declared
      // `selection.formDataKey` ever diverges from what the commit action
      // reads. An object `redirectOnly` branch has no equivalent declared
      // key to diverge from — `updateShotPrompt`/`updateSequencePrompt`
      // above render unconditionally once `plan.actionId` matches, and this
      // branch follows the same, already-established model.
      const afterShotIdRaw = firstSearchParamValue(searchParams.afterShotId);
      const afterShotId =
        afterShotIdRaw != null && afterShotIdRaw !== "" && Number.isInteger(Number(afterShotIdRaw))
          ? Number(afterShotIdRaw)
          : undefined;

      return [
        {
          kind: "redirectOnly",
          id: "approve",
          label: "Approve",
          action: ACTION_BINDINGS.createShotAtPosition,
          hiddenFields: (currentDraft) => {
            const current = currentDraft as ObjectDraft;
            return buildCreateShotAtPositionHiddenFields({
              projectId: ids.projectId as number,
              sequenceId: ids.sequenceId as number,
              afterShotId,
              returnTo,
              shotJson: buildShotJsonPayload(output.fields, current),
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
          {imagesInput && (
            <div className="flex flex-col gap-2 rounded border border-[#2c3035] bg-[#0d0e10] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d]">
                Reference images ({imagesInput.selectedIds.length} selected, {imagesInput.minCount}–
                {imagesInput.maxCount} required)
              </p>
              {imagesInput.available.length === 0 ? (
                <p className="text-xs text-[#6e767d]">This Asset has no reference images.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {imagesInput.available.map((image) => (
                    <label key={image.id} className="flex items-center gap-2 text-xs text-[#a4abb2]">
                      <input
                        type="checkbox"
                        name="imageIds"
                        value={image.id}
                        form={testEntityFormId}
                        defaultChecked={imagesInput.selectedIds.includes(image.id)}
                        className="h-3.5 w-3.5"
                      />
                      {image.label ?? `Reference image #${image.id}`}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-[#4b5158]">
                Check the images to attach, then Apply above — the run keys them R1..Rn in this list&apos;s
                own order, not the order they were checked in.
              </p>
            </div>
          )}
          {plan.kind === "unsupported" && <p className="text-xs text-[#cf7b6b]">{plan.reason}</p>}
          {showAdvisory && commitAdvisory && <p className="text-xs text-[#b89a5a]">{commitAdvisory}</p>}
        </>
      }
      onApproved={commitAdvisory ? () => setShowAdvisory(true) : undefined}
      showRegenerate
      regenerateLabel="Redo"
      approveActions={approveActions}
      renderDraft={(draft, setDraft) => {
        if (output.kind === "text") {
          const textDraft = draft as TextDraft;
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={`bench-${output.field}`}
                  className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]"
                >
                  {output.field}
                </label>
                <textarea
                  id={`bench-${output.field}`}
                  value={textDraft.text}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((prev) => ({ ...(prev as TextDraft), text: value }));
                  }}
                  rows={8}
                  className={textareaClass}
                />
              </div>

              {plan.kind === "unsupported" && <p className="text-xs text-[#cf7b6b]">{plan.reason}</p>}
              {plan.kind !== "unsupported" &&
                plan.kind !== "returnValue" &&
                !(plan.kind === "redirectOnly" && plan.actionId === "updateShotNarrativePrompt") &&
                !(plan.kind === "redirectOnly" && plan.actionId === "updateShotLighting") &&
                !(plan.kind === "redirectOnly" && plan.actionId === "updateSequenceLighting") && (
                  <p className="text-xs text-[#cf7b6b]">
                    This template&apos;s commit action has no bench Approve path yet.
                  </p>
                )}
            </div>
          );
        }

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
              {/* LLMW.MIGRATE.LIST.4 (B7h-m): all four list-kind descriptors
                  declared today (`shotsFromSequence`, `sequencesFromOutline`,
                  `assetsFromProject`, `castingFromSequence`) commit through
                  one of the four branches above — but this fallback is not
                  proven dead, and is kept rather than removed.
                  `OperationDescriptor.commit` (`types.ts:486`) is
                  `ActionId[]`, not narrowed to the four list-shaped
                  `redirectOnly` actions by `output.kind` — a future list
                  descriptor could still name `updateShotPrompt` /
                  `updateSequencePrompt` (the two other `RedirectOnlyActionId`
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
                !(plan.kind === "redirectOnly" && plan.actionId === "createSelectedAssets") &&
                !(plan.kind === "redirectOnly" && plan.actionId === "applySelectedCastingSuggestions") && (
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
