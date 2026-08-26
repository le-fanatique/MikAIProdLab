"use server";

import fs from "fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { generationJobs, projects, comfyWorkflows, assets, shotReferenceImages, assetReferenceImages } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { parseRequestedIndexes, resolveSelectedOutputPaths } from "@/lib/comfy/selectedOutputs";
import { getRuntimeImageLabel, type RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { prepareComfyPayloadForQueue } from "@/lib/comfy/prepareComfyPayload";
import { queueComfyPrompt } from "@/lib/comfy/comfyServerClient";
import { queueCloudPrompt } from "@/lib/comfy/comfyCloudClient";
import { getComfySettings } from "@/lib/settings";
import { maybeUnloadOllamaBeforeComfy } from "@/lib/vramManager";
import { type DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { parseBatchRoleOverridesParam } from "@/lib/comfy/dynamicBatchRoleOverrides";
import { parseBatchImageNotesParam } from "@/lib/comfy/dynamicBatchImageNotes";
import { buildGenerationPayload } from "@/lib/comfy/buildGenerationPayload";
import { serializeGenerationSnapshot, type GenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { isSingleGenerationTarget } from "@/lib/comfy/generationTarget";
import {
  verifyPrePatchMutations,
  verifyPostUploadMutations,
  deriveQueuedPromptText,
} from "@/lib/comfy/verifyWorkflowMutations";
import { ensureVideoOutputSavedToLibrary } from "@/lib/shotVideoLibrary/ensureSaved";
import { approveShotVideoPath } from "@/lib/shotVideoLibrary/approve";
import { prepareGenerationStyleSource, type PreparedGenerationStyleSource } from "@/lib/projectStyle/generationStylePreparation";
import { parseAppendProjectStyleFormValue } from "@/lib/projectStyle/appendProjectStyleFormField";
import {
  checkCloudPreflightGate,
  findEditedStyleTextMismatch,
  markJobFailed,
  summarizeComfyNodeErrors,
  type RunWorkflowGenerationResult,
} from "@/lib/comfy/generationActionHelpers";
import { runShotGenerationCore, type ShotGenerationArgs, type ShotStyleIntent } from "@/lib/comfy/runShotGeneration";

export type { RunWorkflowGenerationResult } from "@/lib/comfy/generationActionHelpers";

// ---------------------------------------------------------------------------
// runWorkflowGeneration — Camera Lab's unstyled, exact-existing-behavior
// entry point (see cameraLabGeneration.ts, the only real caller). "none" is
// a fixed literal here, never a caller-supplied value — no Style is ever
// resolved or injected for this path.
// ---------------------------------------------------------------------------

export async function runWorkflowGeneration(args: ShotGenerationArgs): Promise<RunWorkflowGenerationResult> {
  return runShotGenerationCore(args, "none");
}

// ---------------------------------------------------------------------------
// runWorkflowGenerationFromForm / runShotStoryboardGenerationFromForm —
// form-compatible wrappers with redirect.
//
// STYLE.1.E.SURFACES.1 (retake) — both exported functions take ONLY
// `FormData`, exactly like every other Server Action in this file; neither
// accepts a Style mode/consumer parameter of any kind, so there is no
// exported "policy knob" to forge. The private `submitShotGeneration` below
// (not exported, so never itself a Server Action reference) is the only
// place that picks a literal `styleIntent` — "auto" or "shot-storyboard" —
// and it is chosen entirely by which of the two exported functions was
// called, never by anything read from `formData`. The actual policy-taking
// implementation, `runShotGenerationCore`, lives in a plain (non-"use
// server") module — see its own header for why that matters.
// ---------------------------------------------------------------------------

async function submitShotGeneration(formData: FormData, normalStyleIntent: "auto" | "shot-storyboard"): Promise<void> {
  // GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — fail-closed: only the checkbox's
  // single explicit "1" value opts in; missing (unchecked), duplicated or
  // invalid all opt out, reusing the existing "none" ShotStyleIntent escape
  // hatch (see runShotGeneration.ts) rather than a second resolver path.
  const appendProjectStyle = parseAppendProjectStyleFormValue(formData);
  const styleIntent: ShotStyleIntent = appendProjectStyle ? normalStyleIntent : "none";
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const workflowId = parseInt(formData.get("workflowId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null) ?? "";

  // Build safe return URL base (never allow empty — fall back to home)
  const base = returnTo.trim() || "/";

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("imageNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("imageNode_".length).trim();
    const imageId = value.trim();
    if (!nodeId || !imageId) continue;
    selectedImageByNodeId[nodeId] = imageId;
  }

  // SHOT.VIDEO.LIBRARY.1, Lot C
  const selectedVideoByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("videoNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("videoNode_".length).trim();
    const videoId = value.trim();
    if (!nodeId || !videoId) continue;
    selectedVideoByNodeId[nodeId] = videoId;
  }

  const scalarOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("scalarNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("scalarNode_".length).trim();
    if (!nodeId) continue;
    scalarOverrideByNodeId[nodeId] = value;
  }

  // GEN.SEEDANCE.1 — text overrides staged in the panel UI were previously
  // never sent to the server, so Generate silently recomputed the prompt
  // from DB state, dropping the user's staged text. Collected here exactly
  // like scalarNode_/imageNode_.
  const textOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("textNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("textNode_".length).trim();
    if (!nodeId) continue;
    textOverrideByNodeId[nodeId] = value;
  }

  // --- Collect dynamic batch images (WFBUILD.1A) ---
  const batchImagesByNodeId: Record<string, DynamicBatchExpansionImage[]> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("batchImages_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("batchImages_".length).trim();
    if (!nodeId) continue;
    const raw = value.trim();
    if (!raw) continue;
    // Format: "id1,id2,id3" — store as placeholder; resolution happens server-side
    // in runShotGenerationCore where availableImages is known.
    batchImagesByNodeId[nodeId] = raw.split(",").map((id) => ({
      id: id.trim(),
      imagePath: "", // placeholder — resolved in runShotGenerationCore
    }));
  }

  // REFROLE.INTENT.1 — the job-level role overlay, keyed identically to
  // batchImagesByNodeId above. Never written to the library.
  const batchImageRoleOverridesByNodeId: Record<string, Record<string, string>> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("batchImageRoles_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("batchImageRoles_".length).trim();
    if (!nodeId) continue;
    const overrides = parseBatchRoleOverridesParam(value);
    if (Object.keys(overrides).length > 0) {
      batchImageRoleOverridesByNodeId[nodeId] = overrides;
    }
  }

  // SHOTPROMPT.REFS.2 — the job-level free-text note overlay, keyed
  // identically to batchImagesByNodeId above. Never written to the library.
  const batchImageNoteOverridesByNodeId: Record<string, Record<string, string>> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("batchImageNotes_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("batchImageNotes_".length).trim();
    if (!nodeId) continue;
    const notes = parseBatchImageNotesParam(value);
    if (Object.keys(notes).length > 0) {
      batchImageNoteOverridesByNodeId[nodeId] = notes;
    }
  }

  // GEN.SEEDANCE.1 — the Advanced Payload Editor textarea is always present
  // in the DOM, so patchedJsonOverride is always submitted; it is only
  // treated as an explicit override when patchedJsonOverrideActive is also
  // present (only rendered once the user has actually edited the JSON —
  // see EditablePatchedJsonPanel). Otherwise the freshly computed canonical
  // payload is used, never a stale/unedited echo.
  const overrideActive = (formData.get("patchedJsonOverrideActive") as string | null) === "1";
  const rawPatchedJsonOverride = overrideActive
    ? (formData.get("patchedJsonOverride") as string | null)?.trim() || null
    : null;
  let patchedJsonOverride: Record<string, unknown> | undefined;
  if (rawPatchedJsonOverride) {
    try {
      const parsed = JSON.parse(rawPatchedJsonOverride) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Not an object");
      }
      patchedJsonOverride = parsed as Record<string, unknown>;
    } catch {
      const sep = base.includes("?") ? "&" : "?";
      redirect(`${base}${sep}generationError=${encodeURIComponent("Invalid patched JSON.")}`);
    }
  }

  // COMFY.PROVIDER.1 — only ever present in the DOM when the panel's own
  // preflight already showed the user a Partner Node cost warning (see
  // ShotGenerationPanel.tsx) — never a default-on field.
  const confirmPartnerNodeCost = (formData.get("confirmPartnerNodeCost") as string | null) === "1";

  const result = await runShotGenerationCore(
    {
      projectId,
      sequenceId,
      shotId,
      workflowId,
      selectedImageByNodeId,
      selectedVideoByNodeId,
      scalarOverrideByNodeId,
      textOverrideByNodeId,
      patchedJsonOverride,
      batchImagesByNodeId,
      batchImageRoleOverridesByNodeId,
      batchImageNoteOverridesByNodeId,
      confirmPartnerNodeCost,
      appendProjectStyleRequested: appendProjectStyle,
    },
    styleIntent
  );

  if (result.ok) {
    const sep = base.includes("?") ? "&" : "?";
    redirect(`${base}${sep}jobId=${result.jobId}`);
  } else {
    const sep = base.includes("?") ? "&" : "?";
    redirect(
      `${base}${sep}generationError=${encodeURIComponent(result.error)}`
    );
  }
}

export async function runWorkflowGenerationFromForm(formData: FormData): Promise<void> {
  return submitShotGeneration(formData, "auto");
}

/** STYLE.1.E.SURFACES.1 — the dedicated, hard-coded Shot Storyboard form action; consumer is never derived from a forwarded field, and runShotGenerationCore itself refuses any workflow whose current persisted kind is not "image". */
export async function runShotStoryboardGenerationFromForm(formData: FormData): Promise<void> {
  return submitShotGeneration(formData, "shot-storyboard");
}

// ---------------------------------------------------------------------------
// buildAssetPromptText
// ---------------------------------------------------------------------------

function buildAssetPromptText(input: {
  description?: string | null;
  notes?: string | null;
}): string {
  return [input.description, input.notes]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// appendSearchParam
// ---------------------------------------------------------------------------

function appendSearchParam(url: string, key: string, value: string): string {
  const [pathPart, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${pathPart}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// runAssetGeneration
// ---------------------------------------------------------------------------

// GEN.PROJECT_STYLE.APPEND.TOGGLE.1 (retake Round 1) — not exported. This
// file has "use server" at the top, so every exported async function is a
// potential Server Action reference; an exported version accepting the raw
// `appendProjectStyle` boolean would be a policy surface bypassing
// `runAssetGenerationFromForm`'s fail-closed `parseAppendProjectStyleFormValue`
// parsing. `runAssetGenerationFromForm` (below) is the only Asset entry point
// this ticket exposes; it is the sole in-file caller.
async function runAssetGeneration(input: {
  projectId: number;
  assetId: number;
  workflowId: number;
  selectedImageByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
  textOverrideByNodeId?: Record<string, string>;
  /** Only treated as authoritative when the user actually edited the JSON — see EditablePatchedJsonPanel/patchedJsonOverrideActive. */
  patchedJsonOverride?: Record<string, unknown>;
  batchImagesByNodeId?: Record<string, DynamicBatchExpansionImage[]>;
  /** COMFY.PROVIDER.1 — explicit acknowledgment that this Cloud submission may call paid Partner Node(s). Ignored for the local provider. */
  confirmPartnerNodeCost?: boolean;
  /** GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — the caller's already fail-closed-parsed form choice; never re-derived here. `false` skips `prepareGenerationStyleSource` entirely — no PROJECT STYLE segment is composed and no `styleProvenance` is ever written for this job. */
  appendProjectStyle: boolean;
}): Promise<RunWorkflowGenerationResult> {
  const { projectId, assetId, workflowId } = input;

  const comfySettings = await getComfySettings();
  if (comfySettings.provider === "cloud" && !comfySettings.hasCloudApiKey) {
    return { ok: false, error: "Comfy Cloud is selected but no Comfy Cloud API key is configured." };
  }

  // --- 1. Validate numeric IDs ---
  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(assetId)   || assetId   <= 0 ||
    !Number.isInteger(workflowId) || workflowId <= 0
  ) {
    return { ok: false, error: "Invalid IDs provided." };
  }

  // --- 2. Fetch project ---
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  // --- 3. Fetch asset + verify ownership ---
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, error: "Asset not found." };
  if (asset.projectId !== projectId)
    return { ok: false, error: "Asset does not belong to this project." };

  // --- 4. Fetch workflow ---
  const [workflow] = await db
    .select()
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };
  if (workflow.kind !== "image")
    return { ok: false, error: "Asset generation supports image workflows only." };

  // --- 5. Parse workflow JSON ---
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null)
    return { ok: false, error: "Workflow JSON could not be parsed. Check the workflow file." };

  // --- 6. Fetch asset reference images ---
  const assetRefImages = await db
    .select({
      id: assetReferenceImages.id,
      assetId: assetReferenceImages.assetId,
      imagePath: assetReferenceImages.imagePath,
      label: assetReferenceImages.label,
      imageRole: assetReferenceImages.imageRole,
      sourceFilename: assetReferenceImages.sourceFilename,
    })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, assetId))
    .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id));

  // --- 7. Build available images ---
  const availableImages: RuntimeImageOption[] = assetRefImages.map((image) => ({
    id: `asset-${image.assetId}-${image.id}`,
    source: "asset" as const,
    imagePath: image.imagePath,
    label: getRuntimeImageLabel(image),
    role: image.imageRole,
    assetName: asset.name,
    assetType: asset.type,
  }));

  // --- 8. Build prompt text from description + notes ---
  const assetPromptText = buildAssetPromptText({
    description: asset.description,
    notes: asset.notes,
  });

  // --- STYLE.1.E.SURFACES.1 — Asset consumer is always hard-coded "asset".
  // GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — when the user opted out,
  // prepareGenerationStyleSource is never called at all: no PROJECT STYLE
  // segment can be composed and no styleProvenance can exist for this job. ---
  let preparedStyleOk: Extract<PreparedGenerationStyleSource, { ok: true }> | null = null;
  let effectiveSuggestedText = assetPromptText;
  let effectiveTextOverrideByNodeId = input.textOverrideByNodeId;
  if (input.appendProjectStyle) {
    const preparedStyle = await prepareGenerationStyleSource("asset", { kind: "project", projectId }, assetPromptText);
    if (!preparedStyle.ok) {
      return { ok: false, error: preparedStyle.error };
    }
    preparedStyleOk = preparedStyle;
    effectiveSuggestedText = preparedStyle.composedSuggestedPrompt.prompt;
    effectiveTextOverrideByNodeId = input.textOverrideByNodeId
      ? Object.fromEntries(Object.entries(input.textOverrideByNodeId).map(([nodeId, value]) => [nodeId, preparedStyle.composeTextOverride(value)]))
      : input.textOverrideByNodeId;
  }

  // --- 9. Canonical payload (GEN.SEEDANCE.1 — expand -> filter -> patch, same
  //        function as the shot path, the panels and /map). ---
  const assetBatchEntry = input.batchImagesByNodeId
    ? Object.entries(input.batchImagesByNodeId)[0]
    : undefined;

  const assetResolvedBatchImages: DynamicBatchExpansionImage[] = [];
  if (assetBatchEntry) {
    for (const placeholder of assetBatchEntry[1]) {
      const found = availableImages.find((img) => img.id === placeholder.id);
      if (!found) {
        return {
          ok: false,
          error: `Selected batch image "${placeholder.id}" not found in available images.`,
        };
      }
      assetResolvedBatchImages.push({ id: found.id, imagePath: found.imagePath });
    }
  }

  const built = buildGenerationPayload({
    workflowJson: workflow.workflowJson,
    inputs: parsed.inputs,
    suggestedText: effectiveSuggestedText,
    availableImages,
    textOverrideByNodeId: effectiveTextOverrideByNodeId,
    selectedImageByNodeId: input.selectedImageByNodeId,
    scalarOverrideByNodeId: input.scalarOverrideByNodeId,
    batchSelectedImages: assetResolvedBatchImages,
  });

  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  // GEN.ASSET.INPUT.ISOLATION.1 — the canonical patch step (expanded
  // workflow -> patchWorkflowPayload's output) may only ever change fields
  // that a real patch record accounts for. This checks our own computed
  // payload, not the caller's optional override (see overrideUsed below,
  // which is honestly allowed to diverge).
  const prePatchCheck = verifyPrePatchMutations({
    beforePatchJson: built.expansion.workflowJson,
    patchedJson: built.patch.patchedJson,
    patches: built.patch.patches,
  });
  if (!prePatchCheck.ok) {
    return { ok: false, error: prePatchCheck.error };
  }

  const overrideUsed = input.patchedJsonOverride !== undefined;
  const finalPatchedJson: Record<string, unknown> = input.patchedJsonOverride ?? built.patch.patchedJson;

  if (Object.keys(finalPatchedJson).length === 0) {
    return {
      ok: false,
      error: "No compatible payload could be generated from this workflow and asset.",
    };
  }

  // --- STYLE.1.E.SURFACES.1 (retake) — "actually injected" is derived
  // strictly from the canonical payload result (a real `kind === "text"`
  // patch — buildGenerationPayload found a patchable field on a real
  // text-kind node), never merely from "an effective Style existed". See
  // the identical guard/rationale in runShotGeneration.ts. ---
  const assetTextPatches = built.patch.patches.filter((p) => p.kind === "text");
  const assetStyleActuallyInjected = preparedStyleOk !== null && preparedStyleOk.hasEffectiveStyle && assetTextPatches.length > 0;

  if (overrideUsed && preparedStyleOk !== null && preparedStyleOk.hasEffectiveStyle && assetTextPatches.length > 0) {
    const mismatch = findEditedStyleTextMismatch(assetTextPatches, finalPatchedJson);
    if (mismatch) return { ok: false, error: mismatch };
  }

  // GEN.ASSET.INPUT.ISOLATION.1 (Round 2) — `promptText` must never
  // represent a compiled-but-never-injected Asset prompt (FB-20260724-001),
  // AND must never represent a stale computed string once an Advanced
  // Payload Override has changed/restored the real queued text. Read back
  // the actual value(s) sitting at each real text patch's exact location in
  // `finalPatchedJson` (the payload actually queued) instead.
  const assetPromptTextForSnapshot = deriveQueuedPromptText(assetTextPatches, finalPatchedJson);

  // --- 9b. Comfy Cloud preflight (COMFY.PROVIDER.1) — see runShotGenerationCore. ---
  if (comfySettings.provider === "cloud") {
    const gate = await checkCloudPreflightGate(
      finalPatchedJson,
      comfySettings.cloudApiKey,
      input.confirmPartnerNodeCost
    );
    if (gate) return gate;
  }

  // --- 10. Create job row (pending) ---
  if (!isSingleGenerationTarget({ shotId: null, assetId, sequenceId: null })) {
    return { ok: false, error: "Invalid generation job target." };
  }

  const clientId = `mikai-asset-${assetId}-${workflowId}-${Date.now()}`;
  const now = new Date().toISOString();

  const [inserted] = await db
    .insert(generationJobs)
    .values({
      shotId: null,
      assetId,
      workflowId,
      status: "pending",
      clientId,
      runtimeProvider: comfySettings.provider,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: generationJobs.id });

  const jobId = inserted.id;

  // --- 11. Upload references + queue. prepared.workflow is the sole input
  //         to queueComfyPrompt — no second, divergent recomputation. ---
  try {
    await db
      .update(generationJobs)
      .set({ status: "uploading", updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    const prepared = await prepareComfyPayloadForQueue(
      finalPatchedJson,
      comfySettings.provider === "cloud"
        ? { provider: "cloud", cloudApiKey: comfySettings.cloudApiKey }
        : { provider: "local" }
    );

    // GEN.ASSET.INPUT.ISOLATION.1 — the upload step may only rewrite
    // `inputs.image` on the nodes it actually uploaded, to the exact
    // recorded provider filename. Checked regardless of overrideUsed —
    // this guards the upload transport itself, not the payload's origin.
    const postUploadCheck = verifyPostUploadMutations({
      prePatchedJson: finalPatchedJson,
      uploadedJson: prepared.workflow,
      uploadedImages: prepared.uploadedImages,
    });
    if (!postUploadCheck.ok) {
      await markJobFailed(jobId, postUploadCheck.error);
      return { ok: false, error: postUploadCheck.error };
    }

    // --- 11a. Snapshot (GEN.SEEDANCE.1) ---
    const snapshot: GenerationSnapshot = {
      workflowId,
      contextType: "asset",
      contextId: assetId,
      createdAt: new Date().toISOString(),
      selections: {
        selectedImageByNodeId: input.selectedImageByNodeId ?? {},
        scalarOverrideByNodeId: input.scalarOverrideByNodeId ?? {},
        textOverrideByNodeId: input.textOverrideByNodeId ?? {},
        batchSelectedImageIds: assetResolvedBatchImages.map((img) => img.id),
      },
      dynamicBatch: {
        active: built.expansion.templateChainNodeIds.length > 0,
        batchNodeId: built.expansion.batchNodeId || null,
        templateChainNodeIds: built.expansion.templateChainNodeIds,
        expandedNodeIds: built.expansion.expandedNodeIds,
        batchInputKeys: built.expansion.batchInputKeys,
        selectedImageCount: built.expansion.preview.selectedImageCount,
        clonedNodeCount: built.expansion.preview.clonedNodeCount,
      },
      ...(assetPromptTextForSnapshot !== undefined ? { promptText: assetPromptTextForSnapshot } : {}),
      overrideUsed,
      // REVISE (GEN.SEEDANCE.1) — prepared.warnings (e.g. "local images were
      // uploaded to ComfyUI and LoadImage inputs rewritten") were previously
      // dropped; the snapshot must reflect every warning produced across the
      // whole pipeline, not just the pre-upload patch step.
      warnings: [...new Set([...built.patch.warnings, ...prepared.warnings])],
      uploadedImages: prepared.uploadedImages,
      queuedWorkflow: prepared.workflow,
      // STYLE.1.E.SURFACES.1 — see the identical guard in runShotGeneration.ts.
      ...(assetStyleActuallyInjected && preparedStyleOk?.provenanceCandidate ? { styleProvenance: preparedStyleOk.provenanceCandidate } : {}),
    };
    await db
      .update(generationJobs)
      .set({ payloadSnapshot: serializeGenerationSnapshot(snapshot), updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    await maybeUnloadOllamaBeforeComfy();
    const queued =
      comfySettings.provider === "cloud"
        ? await queueCloudPrompt({
            workflow: prepared.workflow,
            cloudApiKey: comfySettings.cloudApiKey,
            partnerNodeApiKey: comfySettings.apiKey,
          })
        : await queueComfyPrompt({
            workflow: prepared.workflow,
            clientId,
          });

    const nodeErrorSummary = summarizeComfyNodeErrors(queued.node_errors);
    await db
      .update(generationJobs)
      .set({
        status: "queued",
        promptId: queued.prompt_id,
        errorMessage: nodeErrorSummary,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(generationJobs.id, jobId));

    return { ok: true, jobId };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during generation.";
    await markJobFailed(jobId, message);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// runAssetGenerationFromForm — form-compatible wrapper with redirect
// ---------------------------------------------------------------------------

export async function runAssetGenerationFromForm(formData: FormData): Promise<void> {
  const projectId  = parseInt(formData.get("projectId")  as string, 10);
  const assetId    = parseInt(formData.get("assetId")    as string, 10);
  const workflowId = parseInt(formData.get("workflowId") as string, 10);
  const returnTo   = (formData.get("returnTo") as string | null)?.trim() || "/";

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("imageNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId  = key.slice("imageNode_".length).trim();
    const imageId = value.trim();
    if (!nodeId || !imageId) continue;
    selectedImageByNodeId[nodeId] = imageId;
  }

  const scalarOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("scalarNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("scalarNode_".length).trim();
    if (!nodeId) continue;
    scalarOverrideByNodeId[nodeId] = value;
  }

  // GEN.SEEDANCE.1 — collected exactly like the shot path (see comment there).
  const textOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("textNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("textNode_".length).trim();
    if (!nodeId) continue;
    textOverrideByNodeId[nodeId] = value;
  }

  // --- Collect dynamic batch images (WFBUILD.1A) ---
  const assetBatchImagesByNodeId: Record<string, DynamicBatchExpansionImage[]> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("batchImages_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("batchImages_".length).trim();
    if (!nodeId) continue;
    const raw = value.trim();
    if (!raw) continue;
    assetBatchImagesByNodeId[nodeId] = raw.split(",").map((id) => ({
      id: id.trim(),
      imagePath: "",
    }));
  }

  // GEN.SEEDANCE.1 — see the identical comment in runWorkflowGenerationFromForm.
  const overrideActive = (formData.get("patchedJsonOverrideActive") as string | null) === "1";
  const rawPatchedJsonOverride = overrideActive
    ? (formData.get("patchedJsonOverride") as string | null)?.trim() || null
    : null;
  let patchedJsonOverride: Record<string, unknown> | undefined;
  if (rawPatchedJsonOverride) {
    try {
      const parsed = JSON.parse(rawPatchedJsonOverride) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Not an object");
      }
      patchedJsonOverride = parsed as Record<string, unknown>;
    } catch {
      redirect(
        appendSearchParam(returnTo, "generationError", encodeURIComponent("Invalid patched JSON."))
      );
    }
  }

  // COMFY.PROVIDER.1 — see runWorkflowGenerationFromForm; no asset panel
  // currently renders this field, so a Cloud Partner Node workflow started
  // from an Asset stays safely blocked (clear error) rather than silently
  // charged, until that UI is built.
  const confirmPartnerNodeCost = (formData.get("confirmPartnerNodeCost") as string | null) === "1";

  // GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — see the identical comment in
  // submitShotGeneration.
  const appendProjectStyle = parseAppendProjectStyleFormValue(formData);

  const result = await runAssetGeneration({
    projectId,
    assetId,
    workflowId,
    selectedImageByNodeId,
    scalarOverrideByNodeId,
    textOverrideByNodeId,
    patchedJsonOverride,
    batchImagesByNodeId: assetBatchImagesByNodeId,
    confirmPartnerNodeCost,
    appendProjectStyle,
  });

  if (result.ok) {
    redirect(appendSearchParam(returnTo, "jobId", String(result.jobId)));
  } else {
    redirect(
      appendSearchParam(returnTo, "generationError", encodeURIComponent(result.error))
    );
  }
}

// ---------------------------------------------------------------------------
// attachOutputAsShotReference
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// approveVideoOutput
// ---------------------------------------------------------------------------

export async function approveVideoOutput(formData: FormData): Promise<void> {
  const shotId  = parseInt(formData.get("shotId")  as string, 10);
  const jobId   = parseInt(formData.get("jobId")   as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() || "/";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}approveError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(shotId) || shotId <= 0 || !Number.isInteger(jobId) || jobId <= 0) {
    errRedirect("Invalid request.");
  }

  // SHOT.VIDEO.LIBRARY.1, Lot A — approving a Generation Content output
  // always goes through the same durable Shot Video Library entry a plain
  // "Save to Shot Videos" would create (idempotent: reuses it if this job
  // was already saved, never a second copy of the same file) before ever
  // touching `shots.approvedVideoPath`. The copy and the approval are no
  // longer two independently-hardcoded code paths.
  const result = await ensureVideoOutputSavedToLibrary(jobId, shotId);
  if (!result.ok) errRedirect(result.error);

  // REVISE (SHOT.VIDEO.LIBRARY.1, round 1) — shares the exact same
  // transactional approve+invalidate helper `approveShotVideo`
  // (src/actions/shotVideoLibrary.ts) uses, instead of writing
  // `shots.approvedVideoPath` directly: a real change made through this
  // quick one-click button now always outdates dependent active/published
  // Sequence/Film Results exactly like every other approval surface — it
  // can no longer silently bypass that invalidation. The previous approved
  // file is deliberately NEVER deleted here: every approved video now has
  // (or, for a legacy row, has been backfilled into) a durable
  // `shot_videos` entry, and "a shared file must never be deleted while
  // another row still references it" now applies to the previously
  // approved file too. Removing the old file is the Shot Video Library's
  // own explicit `Delete` action, subject to its own approved-video guard.
  const approveResult = await approveShotVideoPath(shotId, result.videoPath);
  if (!approveResult.ok) errRedirect(approveResult.error);

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}approvedVideo=1`);
}

const ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export async function attachOutputAsShotReference(
  formData: FormData
): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const jobId = parseInt(formData.get("jobId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}attachError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0 ||
    !Number.isInteger(jobId) || jobId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Fetch job
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  if (!job) errRedirect("Output not found.");
  if (job.shotId !== shotId) errRedirect("Output does not belong to this shot.");
  if (job.status !== "done") errRedirect("Output is not ready.");
  // GEN.MULTIOUT.1 — identical contract to the Asset action above.
  const requestedIndexes = parseRequestedIndexes(formData.getAll("outputIndex"));
  if (requestedIndexes === null) errRedirect("Invalid output selection.");

  const resolved = await resolveSelectedOutputPaths({
    jobId,
    fallbackPath: job.outputPath,
    requestedIndexes,
    allowedExts: ATTACHABLE_IMAGE_EXTS,
  });
  if (!resolved.ok) errRedirect(resolved.error);

  const publicRoot = path.join(process.cwd(), "public");
  const destSubfolder = `shot-${shotId}`;
  const destDir = path.join(publicRoot, "uploads", "reference-images", destSubfolder);
  const copied: string[] = [];

  try {
    await fs.mkdir(destDir, { recursive: true });

    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
      .from(shotReferenceImages)
      .where(eq(shotReferenceImages.shotId, shotId));

    let nextOrder = maxOrder + 1;

    for (const relativeSource of resolved.paths) {
      const ext = path.extname(relativeSource).toLowerCase();
      const destFilename = `${randomUUID()}${ext}`;
      const destRelative = `uploads/reference-images/${destSubfolder}/${destFilename}`;
      const destAbsolute = path.join(destDir, destFilename);

      await fs.copyFile(path.resolve(publicRoot, relativeSource), destAbsolute);
      copied.push(destAbsolute);

      await db.insert(shotReferenceImages).values({
        shotId,
        orderIndex: nextOrder,
        imagePath: destRelative,
        sourceFilename: null,
        label: "Generated Output",
        // REFROLE.INTENT.1 — a render is not a keyframe. The role is left
        // unset so the author classifies it; the job overrides intent, not
        // the library's stored role.
        imageRole: null,
      });
      nextOrder += 1;
    }
  } catch {
    for (const file of copied) {
      try { await fs.unlink(file); } catch { /* silent */ }
    }
    errRedirect("Failed to attach the selected outputs. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}attachedReference=${resolved.paths.length}`);
}

// ---------------------------------------------------------------------------
// attachOutputAsAssetReference
// ---------------------------------------------------------------------------

const ASSET_ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function attachOutputAsAssetReference(
  formData: FormData
): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const assetId   = parseInt(formData.get("assetId")   as string, 10);
  const jobId     = parseInt(formData.get("jobId")     as string, 10);
  const returnTo  =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/assets/${assetId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}attachError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(assetId)   || assetId   <= 0 ||
    !Number.isInteger(jobId)     || jobId     <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Fetch asset + verify project ownership
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) errRedirect("Asset not found.");
  if (asset.projectId !== projectId) errRedirect("Asset does not belong to this project.");

  // Fetch job + verify asset ownership
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));

  if (!job) errRedirect("Output not found.");
  if (job.assetId !== assetId) errRedirect("Output does not belong to this asset.");
  if (job.status !== "done") errRedirect("Output is not ready.");
  // GEN.MULTIOUT.1 — the user may have ticked several of the job's outputs.
  // An empty selection means "the primary output", which is what a form
  // without checkboxes posts and what every caller did before this ticket.
  const requestedIndexes = parseRequestedIndexes(formData.getAll("outputIndex"));
  if (requestedIndexes === null) errRedirect("Invalid output selection.");

  const resolved = await resolveSelectedOutputPaths({
    jobId,
    fallbackPath: job.outputPath,
    requestedIndexes,
    allowedExts: ASSET_ATTACHABLE_IMAGE_EXTS,
  });
  if (!resolved.ok) errRedirect(resolved.error);

  const publicRoot = path.join(process.cwd(), "public");
  const destSubfolder = `asset-${assetId}`;
  const destDir = path.join(publicRoot, "uploads", "reference-images", destSubfolder);

  // Copied files, so a later failure can undo this call's own work and leave
  // nothing half-attached behind.
  const copied: string[] = [];

  try {
    await fs.mkdir(destDir, { recursive: true });

    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)` })
      .from(assetReferenceImages)
      .where(eq(assetReferenceImages.assetId, assetId));

    let nextOrder = maxOrder + 1;

    // In index order, so several attached panels keep the batch's own order
    // in the reference list rather than the order they were clicked in.
    for (const relativeSource of resolved.paths) {
      const ext = path.extname(relativeSource).toLowerCase();
      const destFilename = `${randomUUID()}${ext}`;
      const destRelative = `uploads/reference-images/${destSubfolder}/${destFilename}`;
      const destAbsolute = path.join(destDir, destFilename);

      await fs.copyFile(path.resolve(publicRoot, relativeSource), destAbsolute);
      copied.push(destAbsolute);

      await db.insert(assetReferenceImages).values({
        assetId,
        orderIndex: nextOrder,
        imagePath: destRelative,
        sourceFilename: null,
        label: "Generated Output",
        // REFROLE.INTENT.1 — same reasoning as the shot-reference site above.
        imageRole: null,
      });
      nextOrder += 1;
    }
  } catch {
    for (const file of copied) {
      try { await fs.unlink(file); } catch { /* silent */ }
    }
    errRedirect("Failed to attach the selected outputs. Please try again.");
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}attachedReference=${resolved.paths.length}`);
}
