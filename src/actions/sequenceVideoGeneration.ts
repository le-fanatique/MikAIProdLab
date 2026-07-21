"use server";

// ---------------------------------------------------------------------------
// sequenceVideoGeneration.ts — SEQGEN.VIDEO.1
//
// Sequence-level VIDEO generation ("Generate Sequence Video": one continuous
// video realizing every Shot of a Sequence in order), from an explicitly
// chosen `sequence_storyboard_images` draft (the mandatory visual anchor,
// always @Image1) via a `kind="video"` ComfyUI workflow. Reuses the exact
// same canonical pipeline as every other generation path —
// buildGenerationPayload, detectDynamicBatchUiInfo, prepareComfyPayloadForQueue,
// queueComfyPrompt — never a second ComfyUI protocol. Mirrors
// runSequenceGeneration/runSequenceGenerationFromForm in
// sequenceGeneration.ts as closely as possible; the differences are: the
// mandatory board (not mandatory casting references), the `kind==="video"`
// gate, and buildSequenceVideoPrompt instead of buildSequenceStoryboardPrompt.
//
// Deliberately a separate file from sequenceVideo.ts (the draft store:
// saveSequenceVideoDraftFromJob) — same separation already established
// between sequenceGeneration.ts and sequenceStoryboard.ts for the image
// twin, so the draft-save action never pulls in the ComfyUI-calling modules
// it doesn't need.
//
// Never splits, never touches Shots, Shot references, Sequence Results, Film
// Results, or Editorial — this ticket only queues and snapshots a job.
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
  sequenceStoryboardImages,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { filterAvailableImagesBySelection } from "@/lib/comfy/filterAvailableImagesBySelection";
import { buildGenerationPayload, detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import { classifyImageInputCompatibility } from "@/lib/comfy/imageInputCompatibility";
import { validateImageProvenanceUnchanged } from "@/lib/comfy/validateImageProvenance";
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
  buildSequenceVideoPrompt,
  type SequenceVideoPrompt,
} from "@/lib/prompts/buildSequenceVideoPrompt";
import type { SequenceStoryboardReferenceInput } from "@/lib/prompts/buildSequenceStoryboardPrompt";
import { prepareComfyPayloadForQueue } from "@/lib/comfy/prepareComfyPayload";
import { queueComfyPrompt } from "@/lib/comfy/comfyServerClient";
import { queueCloudPrompt } from "@/lib/comfy/comfyCloudClient";
import { runCloudPreflight } from "@/lib/comfy/cloudPreflight";
import { getComfySettings } from "@/lib/settings";
import { maybeUnloadOllamaBeforeComfy } from "@/lib/vramManager";
import { serializeGenerationSnapshot, type GenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { isSingleGenerationTarget } from "@/lib/comfy/generationTarget";
import { findTextInputKey } from "@/lib/comfy/patchWorkflowPayload";

const BOARD_IMAGE_ID = "board";

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
// Shared context builder — mirrors buildSequenceStoryboardGenerationContext's
// shape/recompute convention, but the board is the mandatory anchor and
// casting references are optional. `multiImageSupported` is exposed so
// callers can decide whether to even offer/send references at all.
// ---------------------------------------------------------------------------

export type SequenceVideoGenerationContext =
  | {
      ok: true;
      projectId: number;
      sequenceTitle: string | null;
      sequenceCode: string | null;
      shotCount: number;
      boardImage: RuntimeImageOption;
      /** Casting references only — the board is never part of this list (see availableImages below). */
      availableReferenceImages: RuntimeImageOption[];
      /** [boardImage, ...availableReferenceImages] — the full set buildGenerationPayload should see. */
      availableImages: RuntimeImageOption[];
      packageText: string;
    }
  | { ok: false; error: string };

export async function buildSequenceVideoGenerationContext(
  projectId: number,
  sequenceId: number,
  sourceStoryboardImageId: number,
  selectedRefIds: string[]
): Promise<SequenceVideoGenerationContext> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    return { ok: false, error: "Sequence not found or does not belong to this project." };
  }

  const [board] = await db
    .select()
    .from(sequenceStoryboardImages)
    .where(eq(sequenceStoryboardImages.id, sourceStoryboardImageId));
  if (!board) return { ok: false, error: "Source Sequence Storyboard draft not found." };
  if (board.sequenceId !== sequenceId) {
    return { ok: false, error: "Source Sequence Storyboard draft does not belong to this Sequence." };
  }

  const boardImage: RuntimeImageOption = {
    id: BOARD_IMAGE_ID,
    source: "board",
    imagePath: board.imagePath,
    label: "Sequence Storyboard board",
    role: null,
  };

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex));
  const shotIds = shotList.map((s) => s.id);

  // --- Cast Assets across every Shot of the Sequence (unique), for optional casting references ---
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

  const allAvailableReferenceImages: RuntimeImageOption[] = [];
  for (const assetId of uniqueAssetIds) {
    const meta = assetMetaById.get(assetId)!;
    for (const img of assetRefsByAsset.get(assetId) ?? []) {
      allAvailableReferenceImages.push({
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
  // Casting references are OPTIONAL here (unlike the mandatory-selection
  // Sequence Storyboard image flow): an empty `selectedRefIds` just means
  // "no references chosen", never a block — the board alone is enough to
  // generate.
  const availableReferenceImages =
    selectedRefIds.length > 0
      ? filterAvailableImagesBySelection(allAvailableReferenceImages, selectedRefIds)
      : [];

  // --- Sequence Generation Package (same builder as every other Sequence generation path, unmodified) ---
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
    { projectId, sequenceId, sequenceTitle: sequence.title, sequenceCode: sequence.sequenceCode },
    shotInputs
  );
  const packageText = formatSequenceGenerationPackageText(pkg);

  return {
    ok: true,
    projectId,
    sequenceTitle: sequence.title,
    sequenceCode: sequence.sequenceCode,
    shotCount: shotList.length,
    boardImage,
    availableReferenceImages,
    availableImages: [boardImage, ...availableReferenceImages],
    packageText,
  };
}

async function buildReferenceMetaByRefId(sequenceId: number): Promise<Map<string, SequenceStoryboardReferenceInput>> {
  const shotIds = (await db.select({ id: shots.id }).from(shots).where(eq(shots.sequenceId, sequenceId))).map((s) => s.id);

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
// runSequenceVideoGeneration
// ---------------------------------------------------------------------------

export type RunSequenceVideoGenerationResult =
  | { ok: true; jobId: number }
  | {
      ok: false;
      error: string;
      /** COMFY.PROVIDER.1 — same opt-in confirmation contract as runWorkflowGeneration. */
      requiresPartnerNodeConfirmation?: boolean;
      apiNodeClasses?: string[];
    };

export async function runSequenceVideoGeneration(input: {
  projectId: number;
  sequenceId: number;
  workflowId: number;
  sourceStoryboardImageId: number;
  /** Ordered, deduplicated refIds — optional casting references, only ever sent when the workflow supports more than one image. */
  selectedRefIds: string[];
  /** Only meaningful in the "ambiguous" multi-single-image-node case: which node receives the board. */
  boardTargetNodeId?: string;
  scalarOverrideByNodeId?: Record<string, string>;
  textOverrideByNodeId?: Record<string, string>;
  patchedJsonOverride?: Record<string, unknown>;
  batchImagesByNodeId?: Record<string, DynamicBatchExpansionImage[]>;
  /** COMFY.PROVIDER.1 — explicit acknowledgment that this Cloud submission may call paid Partner Node(s). Ignored for the local provider. */
  confirmPartnerNodeCost?: boolean;
}): Promise<RunSequenceVideoGenerationResult> {
  const { projectId, sequenceId, workflowId, sourceStoryboardImageId } = input;

  const comfySettings = await getComfySettings();
  if (comfySettings.provider === "cloud" && !comfySettings.hasCloudApiKey) {
    return { ok: false, error: "Comfy Cloud is selected but no Comfy Cloud API key is configured." };
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(workflowId) || workflowId <= 0 ||
    !Number.isInteger(sourceStoryboardImageId) || sourceStoryboardImageId <= 0
  ) {
    return { ok: false, error: "Invalid IDs provided." };
  }

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };
  if (workflow.kind !== "video") {
    return { ok: false, error: "Sequence Video generation supports video workflows only." };
  }

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null) {
    return { ok: false, error: "Workflow JSON could not be parsed. Check the workflow file." };
  }

  const context = await buildSequenceVideoGenerationContext(
    projectId,
    sequenceId,
    sourceStoryboardImageId,
    input.selectedRefIds
  );
  if (!context.ok) return { ok: false, error: context.error };

  const batchUiInfo = detectDynamicBatchUiInfo(workflow.workflowJson);
  const batchDetectionOk = batchUiInfo.kind === "ready";
  const imageInputNodeIds = parsed.inputs.filter((i) => i.kind === "image").map((i) => i.nodeId);
  const compatibility = classifyImageInputCompatibility(imageInputNodeIds, batchDetectionOk);

  if (compatibility.kind === "none") {
    return { ok: false, error: "This workflow has no compatible image input — a Sequence Video needs at least one." };
  }

  const selectedImageByNodeId: Record<string, string> = {};
  if (compatibility.kind === "mono") {
    selectedImageByNodeId[compatibility.nodeId] = BOARD_IMAGE_ID;
  } else if (compatibility.kind === "ambiguous") {
    if (!input.boardTargetNodeId || !compatibility.nodeIds.includes(input.boardTargetNodeId)) {
      return {
        ok: false,
        error:
          "This workflow has multiple image inputs and no Dynamic Batch — choose which input receives the Sequence Storyboard board before generating.",
      };
    }
    selectedImageByNodeId[input.boardTargetNodeId] = BOARD_IMAGE_ID;
  }

  const metaByRefId = await buildReferenceMetaByRefId(sequenceId);

  const batchEntry = input.batchImagesByNodeId ? Object.entries(input.batchImagesByNodeId)[0] : undefined;
  // SEQGEN.VIDEO.1 — the board is ALWAYS the first Dynamic Batch slot,
  // never part of the removable/reorderable selection the caller sends in
  // `batchImagesByNodeId` (that selection is casting references only) —
  // this is what guarantees the board can never be displaced by casting.
  const resolvedBatchImages: DynamicBatchExpansionImage[] = compatibility.kind === "multi" ? [{ id: BOARD_IMAGE_ID, imagePath: context.boardImage.imagePath }] : [];
  if (batchEntry) {
    for (const placeholder of batchEntry[1]) {
      const found = context.availableReferenceImages.find((img) => img.id === placeholder.id);
      if (!found) {
        return { ok: false, error: `Selected batch image "${placeholder.id}" not found in available references.` };
      }
      resolvedBatchImages.push({ id: found.id, imagePath: found.imagePath });
    }
  }

  const orderedReferenceIds =
    compatibility.kind === "multi"
      ? resolvedBatchImages.slice(1).map((img) => img.id)
      : [];
  const referenceInputs: SequenceStoryboardReferenceInput[] = orderedReferenceIds
    .map((id) => metaByRefId.get(id))
    .filter((r): r is SequenceStoryboardReferenceInput => r !== undefined);

  const promptResult: SequenceVideoPrompt = buildSequenceVideoPrompt({
    projectId,
    sequenceId,
    sequenceTitle: context.sequenceTitle,
    sequenceCode: context.sequenceCode,
    shotCount: context.shotCount,
    multiImageSupported: compatibility.kind === "multi",
    references: referenceInputs,
    packageText: context.packageText,
  });

  const built = buildGenerationPayload({
    workflowJson: workflow.workflowJson,
    inputs: parsed.inputs,
    suggestedText: promptResult.text,
    availableImages: context.availableImages,
    textOverrideByNodeId: input.textOverrideByNodeId,
    selectedImageByNodeId,
    scalarOverrideByNodeId: input.scalarOverrideByNodeId,
    batchSelectedImages: resolvedBatchImages,
  });

  if (!built.ok) return { ok: false, error: built.error };

  const overrideUsed = input.patchedJsonOverride !== undefined;
  const finalPatchedJson: Record<string, unknown> = input.patchedJsonOverride ?? built.patch.patchedJson;

  if (Object.keys(finalPatchedJson).length === 0) {
    return { ok: false, error: "No compatible payload could be generated from this workflow and Sequence." };
  }

  // REVISE round 2 (Codex finding #1) — validate the FINAL payload
  // (post-override) node-for-node against the canonically built one for
  // every image-relevant node, BEFORE a job row is even created. Comparing
  // full node objects (not just "is this a local path") catches a
  // ComfyUI-native filename substitution the earlier uploadedImages-based
  // approach missed entirely, and scanning every OTHER node's links to
  // these ids catches a rewired downstream connection that would otherwise
  // leave "the board's path exists somewhere" true while the board no
  // longer actually feeds the node that uses it. Dynamic Batch clones are
  // included defensively — comparing more nodes is always safe, never a
  // source of false negatives.
  const imageRelevantNodeIds = [
    ...new Set([
      ...parsed.inputs.filter((i) => i.kind === "image").map((i) => i.nodeId),
      ...(built.expansion.templateChainNodeIds.length > 0 ? built.expansion.expandedNodeIds : []),
    ]),
  ];
  const provenanceCheck = validateImageProvenanceUnchanged(built.patch.patchedJson, finalPatchedJson, imageRelevantNodeIds);
  if (!provenanceCheck.ok) {
    return { ok: false, error: provenanceCheck.error };
  }

  // COMFY.PROVIDER.1 — Cloud preflight before any job row is created: same
  // opt-in confirmation contract as runWorkflowGeneration (Shot).
  if (comfySettings.provider === "cloud") {
    let preflight;
    try {
      preflight = await runCloudPreflight(finalPatchedJson, comfySettings.cloudApiKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      return { ok: false, error: `Could not verify this workflow against Comfy Cloud before queueing: ${message}` };
    }
    if (preflight.missingClasses.length > 0) {
      return { ok: false, error: `This workflow uses node type(s) not available on Comfy Cloud: ${preflight.missingClasses.join(", ")}. It cannot be queued on Comfy Cloud.` };
    }
    if (preflight.apiNodeClasses.length > 0 && !input.confirmPartnerNodeCost) {
      return {
        ok: false,
        error: `This workflow calls paid Comfy Cloud Partner Node(s): ${preflight.apiNodeClasses.join(", ")}. Confirm the cost to continue.`,
        requiresPartnerNodeConfirmation: true,
        apiNodeClasses: preflight.apiNodeClasses,
      };
    }
  }

  if (!isSingleGenerationTarget({ shotId: null, assetId: null, sequenceId })) {
    return { ok: false, error: "Invalid generation job target." };
  }

  const clientId = `mikai-sequence-video-${sequenceId}-${workflowId}-${Date.now()}`;
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
      runtimeProvider: comfySettings.provider,
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

    const prepared = await prepareComfyPayloadForQueue(
      finalPatchedJson,
      comfySettings.provider === "cloud"
        ? { provider: "cloud", cloudApiKey: comfySettings.cloudApiKey }
        : { provider: "local" }
    );

    const textNodes = parsed.inputs.filter((i) => i.kind === "text").map((i) => ({ nodeId: i.nodeId, classType: i.classType }));
    const queuedTextValues = extractQueuedTextValues(prepared.workflow, textNodes);
    const queuedPromptText = queuedTextValues.join("\n\n---\n\n");

    const snapshot: GenerationSnapshot = {
      workflowId,
      contextType: "sequence",
      contextId: sequenceId,
      createdAt: new Date().toISOString(),
      selections: {
        selectedImageByNodeId,
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
      // Both fields are safe to record as originally computed:
      // validateImageProvenanceUnchanged already proved, node-for-node,
      // that every image-relevant node (and every connection to it) in the
      // queued payload is identical to what this pipeline itself built —
      // never an assumption carried over from before the override.
      sequenceVideoSourceStoryboardImageId: sourceStoryboardImageId,
      sequenceVideoImageMappings: promptResult.imageMappings,
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
        : await queueComfyPrompt({ workflow: prepared.workflow, clientId });

    await db
      .update(generationJobs)
      .set({ status: "queued", promptId: queued.prompt_id, updatedAt: new Date().toISOString() })
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
// runSequenceVideoGenerationFromForm — form-compatible wrapper with redirect
// ---------------------------------------------------------------------------

export async function runSequenceVideoGenerationFromForm(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const workflowId = parseInt(formData.get("workflowId") as string, 10);
  const sourceStoryboardImageId = parseInt(formData.get("sourceStoryboardImageId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  const rawSelectedRefIds = (formData.get("storyboardRefs") as string | null) ?? "";
  const selectedRefIds = rawSelectedRefIds.split(",").map((s) => s.trim()).filter(Boolean);

  const boardTargetNodeId = (formData.get("boardTargetNodeId") as string | null)?.trim() || undefined;

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
  const rawPatchedJsonOverride = overrideActive ? (formData.get("patchedJsonOverride") as string | null)?.trim() || null : null;
  let patchedJsonOverride: Record<string, unknown> | undefined;
  if (rawPatchedJsonOverride) {
    try {
      const parsed = JSON.parse(rawPatchedJsonOverride) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Not an object");
      patchedJsonOverride = parsed as Record<string, unknown>;
    } catch {
      const sep = returnTo.includes("?") ? "&" : "?";
      redirect(`${returnTo}${sep}generationError=${encodeURIComponent("Invalid patched JSON.")}`);
    }
  }

  // COMFY.PROVIDER.1 — only ever present in the DOM when this page's own
  // preflight already showed the Partner Node cost warning.
  const confirmPartnerNodeCost = (formData.get("confirmPartnerNodeCost") as string | null) === "1";

  const result = await runSequenceVideoGeneration({
    projectId,
    sequenceId,
    workflowId,
    sourceStoryboardImageId,
    selectedRefIds,
    boardTargetNodeId,
    scalarOverrideByNodeId,
    textOverrideByNodeId,
    patchedJsonOverride,
    batchImagesByNodeId,
    confirmPartnerNodeCost,
  });

  const sep = returnTo.includes("?") ? "&" : "?";
  if (result.ok) {
    redirect(`${returnTo}${sep}jobId=${result.jobId}`);
  } else {
    redirect(`${returnTo}${sep}generationError=${encodeURIComponent(result.error)}`);
  }
}
