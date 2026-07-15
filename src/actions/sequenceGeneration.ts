"use server";

// ---------------------------------------------------------------------------
// sequenceGeneration.ts — SEQGEN.STORYBOARD.3
//
// Sequence-level generation ("Generate Sequence Storyboard": a single
// contact-sheet image spanning every Shot of a Sequence). Reuses the exact
// same canonical pipeline as the Shot/Asset generation paths —
// buildGenerationPayload (expand -> filter -> patch),
// filterAvailableImagesBySelection, prepareComfyPayloadForQueue,
// queueComfyPrompt — never a second ComfyUI protocol. Mirrors
// runAssetGeneration/runAssetGenerationFromForm in src/actions/generation.ts
// as closely as possible; only the DB shape (Sequence, not Asset) differs.
//
// Deliberately a separate file from sequenceStoryboard.ts (the draft store:
// saveSequenceStoryboardDraftFromJob) — same separation already established
// between generation.ts (ComfyUI execution) and storyboard.ts (draft CRUD)
// for the Shot-level equivalent, so the draft-save action never pulls in
// the ComfyUI-calling modules it doesn't need.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  shotAssets,
  assets,
  assetReferenceImages,
  promptSegments,
  shotReferenceImages,
  comfyWorkflows,
  generationJobs,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { filterAvailableImagesBySelection } from "@/lib/comfy/filterAvailableImagesBySelection";
import { buildGenerationPayload, detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import { type DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import type { PromptCompilationReferenceImageInput } from "@/lib/prompts/buildPromptCompilationContext";
import {
  buildSequenceGenerationPackage,
  formatSequenceGenerationPackageText,
  type SequenceGenerationPackageShotInput,
} from "@/lib/prompts/buildSequenceGenerationPackage";
import {
  buildSequenceStoryboardPrompt,
  type SequenceStoryboardReferenceInput,
} from "@/lib/prompts/buildSequenceStoryboardPrompt";
import { prepareComfyPayloadForQueue } from "@/lib/comfy/prepareComfyPayload";
import { queueComfyPrompt } from "@/lib/comfy/comfyServerClient";
import { maybeUnloadOllamaBeforeComfy } from "@/lib/vramManager";
import {
  serializeGenerationSnapshot,
  type GenerationSnapshot,
} from "@/lib/comfy/generationSnapshot";
import { isSingleGenerationTarget } from "@/lib/comfy/generationTarget";
import { findTextInputKey } from "@/lib/comfy/patchWorkflowPayload";

// ---------------------------------------------------------------------------
// extractQueuedTextValues — SEQGEN.STORYBOARD.3 (retake 3)
//
// The job's provenance snapshot must record the text actually queued, not
// the canonically-composed suggestion: `finalPatchedJson` can differ from
// `promptResult.text` via per-node `textOverrideByNodeId` edits or a
// wholesale `patchedJsonOverride` (Advanced Payload Editor). `prepared.
// workflow` (built from `finalPatchedJson`) is the single source of truth
// for what was truly sent — reuses `findTextInputKey`, the exact same
// write-time key-priority rule from src/lib/comfy/patchWorkflowPayload.ts
// (value only for PrimitiveStringMultiline, else text > prompt > string),
// so a custom node exposing both `value` and `text` is read from the same
// key it was actually written to, never a second, divergent priority order.
// ---------------------------------------------------------------------------

function extractQueuedTextValues(
  queuedWorkflow: Record<string, unknown>,
  textNodes: { nodeId: string; classType: string }[]
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const { nodeId, classType } of textNodes) {
    const node = queuedWorkflow[nodeId];
    if (!node || typeof node !== "object") continue;
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) continue;
    const key = findTextInputKey(inputs, classType);
    if (key === null) continue;
    const value = inputs[key];
    if (typeof value !== "string" || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Shared context builder — mirrors the DB-fetch shape already used by
// SequenceGenerationPackagePanel.tsx and the Storyboard workspace page,
// recomputed independently here (same convention already established by
// runWorkflowGeneration/runAssetGeneration duplicating their own page's
// fetch logic rather than trusting client-supplied data).
// ---------------------------------------------------------------------------

type SequenceStoryboardGenerationContext =
  | {
      ok: true;
      projectId: number;
      sequenceTitle: string | null;
      sequenceCode: string | null;
      shotCount: number;
      availableImages: RuntimeImageOption[];
      packageText: string;
    }
  | { ok: false; error: string };

async function buildSequenceStoryboardGenerationContext(
  projectId: number,
  sequenceId: number,
  selectedRefIds: string[]
): Promise<SequenceStoryboardGenerationContext> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    return { ok: false, error: "Sequence not found or does not belong to this project." };
  }

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex));
  const shotIds = shotList.map((s) => s.id);

  // --- Cast Assets across every Shot of the Sequence (unique) ---
  const castRows =
    shotIds.length > 0
      ? await db
          .select({
            shotId: shotAssets.shotId,
            assetId: assets.id,
            assetName: assets.name,
            assetType: assets.type,
            description: assets.description,
            notes: assets.notes,
            visualIdentity: assets.visualIdentity,
            usageRules: assets.usageRules,
            forbiddenVariations: assets.forbiddenVariations,
          })
          .from(shotAssets)
          .innerJoin(assets, eq(shotAssets.assetId, assets.id))
          .where(inArray(shotAssets.shotId, shotIds))
          .orderBy(asc(assets.name))
      : [];
  const castByShot = new Map<number, typeof castRows>();
  const assetMetaById = new Map<number, (typeof castRows)[number]>();
  for (const row of castRows) {
    const list = castByShot.get(row.shotId) ?? [];
    list.push(row);
    castByShot.set(row.shotId, list);
    if (!assetMetaById.has(row.assetId)) assetMetaById.set(row.assetId, row);
  }
  const uniqueAssetIds = Array.from(assetMetaById.keys());

  // --- Asset reference images for every cast Asset ---
  const assetRefRows =
    uniqueAssetIds.length > 0
      ? await db
          .select({
            id: assetReferenceImages.id,
            assetId: assetReferenceImages.assetId,
            imagePath: assetReferenceImages.imagePath,
            label: assetReferenceImages.label,
            imageRole: assetReferenceImages.imageRole,
            variantState: assetReferenceImages.variantState,
            usageNotes: assetReferenceImages.usageNotes,
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, uniqueAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];
  const assetRefsByAsset = new Map<number, typeof assetRefRows>();
  for (const row of assetRefRows) {
    const list = assetRefsByAsset.get(row.assetId) ?? [];
    list.push(row);
    assetRefsByAsset.set(row.assetId, list);
  }

  // --- Only Asset casting references feed the batch in this MVP — Shot
  // references are never added automatically (ticket scope). ---
  const allAvailableImages: RuntimeImageOption[] = [];
  for (const assetId of uniqueAssetIds) {
    const meta = assetMetaById.get(assetId)!;
    for (const img of assetRefsByAsset.get(assetId) ?? []) {
      allAvailableImages.push({
        id: `asset-${assetId}-${img.id}`,
        source: "asset",
        imagePath: img.imagePath,
        label: img.label?.trim() || img.imageRole?.trim() || "Image",
        role: img.imageRole,
        assetName: meta.assetName,
        assetType: meta.assetType,
        variantState: img.variantState,
        approved: img.approvedForGeneration,
      });
    }
  }
  // SEQGEN.STORYBOARD.3 (retake) — "selectionnees explicitement par
  // l'utilisateur" is mandatory here: an empty selection means "nothing
  // available", never "everything available" (unlike the Shot-level
  // default-preserve convention). filterAvailableImagesBySelection itself
  // stays unmodified; only this caller's own fallback changes.
  const availableImages =
    selectedRefIds.length > 0
      ? filterAvailableImagesBySelection(allAvailableImages, selectedRefIds)
      : [];

  // --- Sequence Generation Package (same builder as SEQGEN.1/STORYBOARD.2, unmodified) ---
  const segmentRows =
    shotIds.length > 0
      ? await db
          .select()
          .from(promptSegments)
          .where(inArray(promptSegments.shotId, shotIds))
          .orderBy(asc(promptSegments.orderIndex))
      : [];
  const segmentsByShot = new Map<number, typeof segmentRows>();
  for (const row of segmentRows) {
    const list = segmentsByShot.get(row.shotId) ?? [];
    list.push(row);
    segmentsByShot.set(row.shotId, list);
  }

  const shotRefRows =
    shotIds.length > 0
      ? await db
          .select({
            id: shotReferenceImages.id,
            shotId: shotReferenceImages.shotId,
            label: shotReferenceImages.label,
            imageRole: shotReferenceImages.imageRole,
          })
          .from(shotReferenceImages)
          .where(inArray(shotReferenceImages.shotId, shotIds))
          .orderBy(asc(shotReferenceImages.orderIndex), asc(shotReferenceImages.id))
      : [];
  const shotRefsByShot = new Map<number, typeof shotRefRows>();
  for (const row of shotRefRows) {
    const list = shotRefsByShot.get(row.shotId) ?? [];
    list.push(row);
    shotRefsByShot.set(row.shotId, list);
  }

  const shotInputs: SequenceGenerationPackageShotInput[] = shotList.map((s) => {
    const segments = segmentsByShot.get(s.id) ?? [];
    const hasPromptSegments = segments.length > 0;
    const compiledSegments = compilePromptSegments(segments);
    const cast = castByShot.get(s.id) ?? [];

    const references: PromptCompilationReferenceImageInput[] = [
      ...(shotRefsByShot.get(s.id) ?? []).map((img) => ({
        refId: `shot-${img.id}`,
        source: "shot" as const,
        assetId: null,
        assetName: null,
        label: img.label,
        role: img.imageRole,
        variantState: null,
        usageNotes: null,
        approvedForGeneration: null,
      })),
      ...cast.flatMap((c) =>
        (assetRefsByAsset.get(c.assetId) ?? []).map((img) => ({
          refId: `asset-${c.assetId}-${img.id}`,
          source: "asset" as const,
          assetId: c.assetId,
          assetName: c.assetName,
          label: img.label,
          role: img.imageRole,
          variantState: img.variantState,
          usageNotes: img.usageNotes,
          approvedForGeneration: img.approvedForGeneration,
        }))
      ),
    ];

    return {
      shotId: s.id,
      shotCode: s.shotCode,
      title: s.title,
      orderIndex: s.orderIndex,
      durationSeconds: s.durationSeconds,
      hasApprovedVideo: s.approvedVideoPath !== null,
      continuity: {
        framing: s.framing,
        cameraMovement: s.cameraMovement,
        continuityIn: s.continuityIn,
        continuityOut: s.continuityOut,
        continuityNotes: s.continuityNotes,
      },
      promptContext: {
        shot: {
          title: s.title,
          description: s.description,
          actionPitch: s.actionPitch,
          cameraPitch: s.cameraPitch,
          durationSeconds: s.durationSeconds,
          shotPrompt: s.shotPrompt,
          compiledPromptSegments: hasPromptSegments ? compiledSegments.text : "",
          hasPromptSegments,
          hasMissingTiming: compiledSegments.hasMissingTiming,
        },
        castAssets: cast.map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          description: c.description,
          notes: c.notes,
        })),
        references,
        assetBibles: cast.map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          visualIdentity: c.visualIdentity,
          usageRules: c.usageRules,
          forbiddenVariations: c.forbiddenVariations,
        })),
        sequenceContext: {
          title: sequence.title,
          summary: sequence.summary,
          mood: sequence.mood,
          locationHint: sequence.locationHint,
          narrativePurpose: sequence.narrativePurpose,
        },
        projectContext: { name: project.name, pitch: project.pitch, story: project.story },
        sources: {
          casting: true,
          references: true,
          assetBibles: true,
          sequenceContext: true,
          projectContext: true,
        },
      },
    };
  });

  const pkg = buildSequenceGenerationPackage(
    {
      projectId,
      sequenceId,
      sequenceTitle: sequence.title,
      sequenceCode: sequence.sequenceCode,
    },
    shotInputs
  );
  const packageText = formatSequenceGenerationPackageText(pkg);

  return {
    ok: true,
    projectId,
    sequenceTitle: sequence.title,
    sequenceCode: sequence.sequenceCode,
    shotCount: shotList.length,
    availableImages,
    packageText,
  };
}

/**
 * Builds the reference-metadata lookup (Asset name/type/role/variant/
 * approval) keyed by refId, from the same cast-Asset query shape as
 * buildSequenceStoryboardGenerationContext — used to turn a filtered
 * `RuntimeImageOption[]` into `SequenceStoryboardReferenceInput[]` for the
 * prompt builder without a second DB round trip.
 */
async function buildReferenceMetaByRefId(
  sequenceId: number
): Promise<Map<string, SequenceStoryboardReferenceInput>> {
  const shotIds = (
    await db.select({ id: shots.id }).from(shots).where(eq(shots.sequenceId, sequenceId))
  ).map((s) => s.id);

  const castRows =
    shotIds.length > 0
      ? await db
          .select({
            shotId: shotAssets.shotId,
            assetId: assets.id,
            assetName: assets.name,
            assetType: assets.type,
          })
          .from(shotAssets)
          .innerJoin(assets, eq(shotAssets.assetId, assets.id))
          .where(inArray(shotAssets.shotId, shotIds))
      : [];
  const assetMetaById = new Map<number, { assetName: string; assetType: string }>();
  for (const row of castRows) {
    if (!assetMetaById.has(row.assetId)) {
      assetMetaById.set(row.assetId, { assetName: row.assetName, assetType: row.assetType });
    }
  }
  const uniqueAssetIds = Array.from(assetMetaById.keys());

  const assetRefRows =
    uniqueAssetIds.length > 0
      ? await db
          .select({
            id: assetReferenceImages.id,
            assetId: assetReferenceImages.assetId,
            label: assetReferenceImages.label,
            imageRole: assetReferenceImages.imageRole,
            variantState: assetReferenceImages.variantState,
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, uniqueAssetIds))
      : [];

  const metaByRefId = new Map<string, SequenceStoryboardReferenceInput>();
  for (const row of assetRefRows) {
    const meta = assetMetaById.get(row.assetId);
    if (!meta) continue;
    const refId = `asset-${row.assetId}-${row.id}`;
    metaByRefId.set(refId, {
      refId,
      assetId: row.assetId,
      assetName: meta.assetName,
      assetType: meta.assetType,
      role: row.imageRole,
      roleLabel: getReferenceImageRoleLabel(row.imageRole),
      label: row.label,
      variantState: row.variantState,
      approvedForGeneration: row.approvedForGeneration,
    });
  }
  return metaByRefId;
}

// ---------------------------------------------------------------------------
// runSequenceGeneration
// ---------------------------------------------------------------------------

export type RunSequenceGenerationResult =
  | { ok: true; jobId: number }
  | { ok: false; error: string };

export async function runSequenceGeneration(input: {
  projectId: number;
  sequenceId: number;
  workflowId: number;
  /** Ordered, deduplicated refIds from Storyboard Assets ("storyboardRefs") — empty means every cast Asset reference is available (same default-preserve convention as filterAvailableImagesBySelection elsewhere). */
  selectedRefIds: string[];
  selectedImageByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
  textOverrideByNodeId?: Record<string, string>;
  /** Only treated as authoritative when the user actually edited the JSON — see EditablePatchedJsonPanel/patchedJsonOverrideActive. */
  patchedJsonOverride?: Record<string, unknown>;
  batchImagesByNodeId?: Record<string, DynamicBatchExpansionImage[]>;
}): Promise<RunSequenceGenerationResult> {
  const { projectId, sequenceId, workflowId } = input;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(workflowId) || workflowId <= 0
  ) {
    return { ok: false, error: "Invalid IDs provided." };
  }

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };
  if (workflow.kind !== "image") {
    return { ok: false, error: "Sequence Storyboard generation supports image workflows only." };
  }

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null) {
    return { ok: false, error: "Workflow JSON could not be parsed. Check the workflow file." };
  }

  // SEQGEN.STORYBOARD.3 (retake) — "bloquer clairement la generation sans
  // reference": explicit selection is mandatory, checked server-side too
  // (not only in the page's own UI gating).
  if (input.selectedRefIds.length === 0) {
    return {
      ok: false,
      error: "Select at least one casting reference in Storyboard Assets before generating.",
    };
  }

  const context = await buildSequenceStoryboardGenerationContext(
    projectId,
    sequenceId,
    input.selectedRefIds
  );
  if (!context.ok) return { ok: false, error: context.error };

  const metaByRefId = await buildReferenceMetaByRefId(sequenceId);

  const batchEntry = input.batchImagesByNodeId
    ? Object.entries(input.batchImagesByNodeId)[0]
    : undefined;
  const resolvedBatchImages: DynamicBatchExpansionImage[] = [];
  if (batchEntry) {
    for (const placeholder of batchEntry[1]) {
      const found = context.availableImages.find((img) => img.id === placeholder.id);
      if (!found) {
        return {
          ok: false,
          error: `Selected batch image "${placeholder.id}" not found in available images.`,
        };
      }
      resolvedBatchImages.push({ id: found.id, imagePath: found.imagePath });
    }
  }

  // SEQGEN.STORYBOARD.3 (retake) — @ImageN must designate the image
  // actually sent at that position. When this workflow has a Dynamic
  // Batch node, that is the batch's own selected order/subset (the
  // user-provided `batchImagesByNodeId`), never the raw Storyboard Assets
  // selection order. Workflows without a Dynamic Batch node fall back to
  // the full explicit selection order (assigned per-node instead).
  const batchUiInfo = detectDynamicBatchUiInfo(workflow.workflowJson);
  const batchDetectionOk = batchUiInfo.kind === "ready";
  const orderedReferenceIds = batchDetectionOk
    ? resolvedBatchImages.map((img) => img.id)
    : context.availableImages.map((img) => img.id);
  const referenceInputs: SequenceStoryboardReferenceInput[] = orderedReferenceIds
    .map((id) => metaByRefId.get(id))
    .filter((r): r is SequenceStoryboardReferenceInput => r !== undefined);

  const promptResult = buildSequenceStoryboardPrompt({
    projectId,
    sequenceId,
    sequenceTitle: context.sequenceTitle,
    sequenceCode: context.sequenceCode,
    shotCount: context.shotCount,
    references: referenceInputs,
    packageText: context.packageText,
  });

  const built = buildGenerationPayload({
    workflowJson: workflow.workflowJson,
    inputs: parsed.inputs,
    suggestedText: promptResult.text,
    availableImages: context.availableImages,
    textOverrideByNodeId: input.textOverrideByNodeId,
    selectedImageByNodeId: input.selectedImageByNodeId,
    scalarOverrideByNodeId: input.scalarOverrideByNodeId,
    batchSelectedImages: resolvedBatchImages,
  });

  if (!built.ok) return { ok: false, error: built.error };

  const overrideUsed = input.patchedJsonOverride !== undefined;
  const finalPatchedJson: Record<string, unknown> = input.patchedJsonOverride ?? built.patch.patchedJson;

  if (Object.keys(finalPatchedJson).length === 0) {
    return {
      ok: false,
      error: "No compatible payload could be generated from this workflow and Sequence.",
    };
  }

  if (!isSingleGenerationTarget({ shotId: null, assetId: null, sequenceId })) {
    return { ok: false, error: "Invalid generation job target." };
  }

  const clientId = `mikai-sequence-${sequenceId}-${workflowId}-${Date.now()}`;
  const now = new Date().toISOString();

  const [inserted] = await db
    .insert(generationJobs)
    .values({
      shotId: null,
      assetId: null,
      sequenceId,
      workflowId,
      status: "pending",
      clientId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: generationJobs.id });

  const jobId = inserted.id;

  try {
    await db
      .update(generationJobs)
      .set({ status: "uploading", updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    const prepared = await prepareComfyPayloadForQueue(finalPatchedJson);

    // SEQGEN.STORYBOARD.3 (retake 3) — read the text actually queued
    // (after textOverrideByNodeId / patchedJsonOverride) from
    // prepared.workflow, never the pre-override promptResult.text. When
    // this workflow has no readable text node at all, the honest snapshot
    // is "no text was queued" (empty string) — promptResult.text must
    // never be presented as "effectively queued" when it wasn't.
    const textNodes = parsed.inputs
      .filter((i) => i.kind === "text")
      .map((i) => ({ nodeId: i.nodeId, classType: i.classType }));
    const queuedTextValues = extractQueuedTextValues(prepared.workflow, textNodes);
    const queuedPromptText = queuedTextValues.join("\n\n---\n\n");

    const snapshot: GenerationSnapshot = {
      workflowId,
      contextType: "sequence",
      contextId: sequenceId,
      createdAt: new Date().toISOString(),
      selections: {
        selectedImageByNodeId: input.selectedImageByNodeId ?? {},
        scalarOverrideByNodeId: input.scalarOverrideByNodeId ?? {},
        textOverrideByNodeId: input.textOverrideByNodeId ?? {},
        batchSelectedImageIds: resolvedBatchImages.map((img) => img.id),
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
      promptText: queuedPromptText,
      overrideUsed,
      warnings: [...new Set([...built.patch.warnings, ...prepared.warnings, ...promptResult.warnings])],
      uploadedImages: prepared.uploadedImages,
      queuedWorkflow: prepared.workflow,
      sequenceStoryboardReferenceMappings: promptResult.imageMappings.map((m) => ({
        refId: m.refId,
        imageLabel: m.imageLabel,
        assetId: m.assetId,
        assetName: m.assetName,
        assetType: m.assetType,
        roleLabel: m.roleLabel,
      })),
    };
    await db
      .update(generationJobs)
      .set({ payloadSnapshot: serializeGenerationSnapshot(snapshot), updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    await maybeUnloadOllamaBeforeComfy();
    const queued = await queueComfyPrompt({ workflow: prepared.workflow, clientId });

    await db
      .update(generationJobs)
      .set({
        status: "queued",
        promptId: queued.prompt_id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(generationJobs.id, jobId));

    return { ok: true, jobId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during generation.";
    const errNow = new Date().toISOString();
    await db
      .update(generationJobs)
      .set({ status: "failed", errorMessage: message.slice(0, 1000), updatedAt: errNow, completedAt: errNow })
      .where(eq(generationJobs.id, jobId));
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// runSequenceGenerationFromForm — form-compatible wrapper with redirect
// ---------------------------------------------------------------------------

export async function runSequenceGenerationFromForm(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const workflowId = parseInt(formData.get("workflowId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  const rawSelectedRefIds = (formData.get("storyboardRefs") as string | null) ?? "";
  const selectedRefIds = rawSelectedRefIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("imageNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("imageNode_".length).trim();
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

  const textOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("textNode_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("textNode_".length).trim();
    if (!nodeId) continue;
    textOverrideByNodeId[nodeId] = value;
  }

  const batchImagesByNodeId: Record<string, DynamicBatchExpansionImage[]> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("batchImages_")) continue;
    if (typeof value !== "string") continue;
    const nodeId = key.slice("batchImages_".length).trim();
    if (!nodeId) continue;
    const raw = value.trim();
    if (!raw) continue;
    batchImagesByNodeId[nodeId] = raw.split(",").map((id) => ({ id: id.trim(), imagePath: "" }));
  }

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
      const sep = returnTo.includes("?") ? "&" : "?";
      redirect(`${returnTo}${sep}generationError=${encodeURIComponent("Invalid patched JSON.")}`);
    }
  }

  const result = await runSequenceGeneration({
    projectId,
    sequenceId,
    workflowId,
    selectedRefIds,
    selectedImageByNodeId,
    scalarOverrideByNodeId,
    textOverrideByNodeId,
    patchedJsonOverride,
    batchImagesByNodeId,
  });

  const sep = returnTo.includes("?") ? "&" : "?";
  if (result.ok) {
    redirect(`${returnTo}${sep}jobId=${result.jobId}`);
  } else {
    redirect(`${returnTo}${sep}generationError=${encodeURIComponent(result.error)}`);
  }
}
