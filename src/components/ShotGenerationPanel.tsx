import { db } from "@/db";
import {
  shots,
  comfyWorkflows,
  shotAssets,
  assets,
  promptSegments,
  shotReferenceImages,
  assetReferenceImages,
  generationJobs,
  projects,
  sequences,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import type { ShotPanelImageNode } from "@/components/ShotPanelImagePreviewForm";
import type { ShotPanelVideoNode } from "@/components/ShotPanelVideoSelectionForm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { buildRuntimeImageOptions } from "@/lib/comfy/mapWorkflowInputs";
import { resolveShotDurationScalarDefault } from "@/lib/comfy/resolveShotDurationScalarDefault";
import { loadRuntimeVideoOptionsForShot } from "@/lib/shotVideoLibrary/loadRuntimeVideoOptions";
import { filterAvailableImagesBySelection } from "@/lib/comfy/filterAvailableImagesBySelection";
import {
  buildGenerationPayload,
  detectDynamicBatchUiInfo,
} from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { compileShotPrompt, type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import { buildPromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";
import { buildOrderedShotReferenceInputs, composeShotGenerationPrompt } from "@/lib/prompts/composeShotGenerationPrompt";
import { buildBatchRoleOverrideParamKey, parseBatchRoleOverridesParam } from "@/lib/comfy/dynamicBatchRoleOverrides";
import { resolveProjectStyleTextForComposition } from "@/lib/projectStyle/resolveProjectStyleTextForComposition";
import { resolveStoryboardLighting } from "@/lib/llmWorkspace/composition/resolveStoryboardLighting";
import { prepareGenerationStyleSource } from "@/lib/projectStyle/generationStylePreparation";
import ProjectStyleGenerationPreview from "@/components/projectStyle/ProjectStyleGenerationPreview";
import ProjectStyleAppendCheckbox from "@/components/projectStyle/ProjectStyleAppendCheckbox";
import { suggestImageForNode } from "@/lib/imageSuggestions";
import { composeShotPrompt } from "@/lib/prompts/composeShotPrompt";
import { type FillSource } from "@/lib/textInputKind";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import { resolvePromptCompilerTextNode } from "@/lib/prompts/workflowTextNode";
import {
  resolveWorkflowProfile,
  auditWorkflowNodes,
  resolveFirstLastFrameNodes,
} from "@/lib/comfy/workflowProfiles";
import WorkflowProfilePanel from "@/components/WorkflowProfilePanel";
import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";
import { getComfySettings } from "@/lib/settings";
import { computeCloudPreflightForPanel } from "@/lib/comfy/cloudPreflight";
import ShotPanelHeader from "@/components/shotGenerationPanel/ShotPanelHeader";
import ShotPromptSection from "@/components/shotGenerationPanel/ShotPromptSection";
import SuggestedInputsBody from "@/components/shotGenerationPanel/SuggestedInputsBody";
import GenerateSection from "@/components/shotGenerationPanel/GenerateSection";
import OutputSection from "@/components/shotGenerationPanel/OutputSection";

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  workflowId: number;
  closeUrl: string;
  selectorUrl: string;
  basePath: string;
  currentSearchParams: Record<string, string>;
  selectedImageByNodeId: Record<string, string>;
  /** SHOT.VIDEO.LIBRARY.1, Lot C */
  selectedVideoByNodeId: Record<string, string>;
  scalarValueByNodeId: Record<string, string>;
  textOverrideByNodeId: Record<string, string>;
  generationError: string | undefined;
  activeJobId: number | null;
  attachedReference?: boolean;
  attachError?: string | null;
  approvedVideo?: boolean;
  approveError?: string | null;
  /** SHOT.VIDEO.LIBRARY.1 — feedback for "Save to Shot Videos" (save-only, never approves). */
  librarySaved?: boolean;
  libraryAlreadySaved?: boolean;
  libraryError?: string | null;
  shotPromptSaved?: boolean;
  shotPromptError?: string | null;
  /** SEQGEN.STORYBOARD.2 feedback after saveStoryboardDraftFromJob — same shape as attachedReference/attachError above. */
  storyboardDraftSaved?: boolean;
  storyboardDraftError?: string | null;
};

export default async function ShotGenerationPanel({
  projectId: pid,
  sequenceId: sid,
  shotId: shid,
  workflowId: wid,
  closeUrl,
  selectorUrl,
  basePath,
  currentSearchParams,
  selectedImageByNodeId,
  selectedVideoByNodeId,
  scalarValueByNodeId,
  textOverrideByNodeId,
  generationError,
  activeJobId,
  attachedReference,
  attachError,
  approvedVideo,
  approveError,
  librarySaved,
  libraryAlreadySaved,
  libraryError,
  shotPromptSaved,
  shotPromptError,
  storyboardDraftSaved,
  storyboardDraftError,
}: Props) {
  // SEQGEN.STORYBOARD.2: currentSearchParams already forwards every raw
  // query param generically (see this file's caller) — no new prop needed
  // just to read this one flag.
  const isStoryboardContext = currentSearchParams["storyboard"] === "1";
  // Retake fix: the actual reference-selection transport from Storyboard
  // Assets. Ordered, comma-separated RuntimeImageOption ids (the same "id"
  // shape buildRuntimeImageOptions already produces below) — parsed here,
  // applied once `availableImages` exists.
  const storyboardSelectedRefIds = (currentSearchParams["storyboardRefs"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot) return null;

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) return null;

  // COMFY.PROVIDER.1 — Cloud preflight, computed from the workflow's stored
  // class_type set (unaffected by Dynamic Batch node cloning or per-node
  // input overrides — those never introduce a new class_type). Never
  // inferred from local availability; a missing class always blocks,
  // read/network failure always blocks too (never assume safe). Shared with
  // AssetGenerationPanel and both Sequence generate pages.
  const comfySettings = await getComfySettings();
  const cloudPreflight = await computeCloudPreflightForPanel(workflow.workflowJson, comfySettings);

  const [project, sequence, assignedRows] = await Promise.all([
    db
      .select({ name: projects.name, pitch: projects.pitch, story: projects.story })
      .from(projects)
      .where(eq(projects.id, pid))
      .then(([r]) => r ?? null),
    db
      .select({
        title: sequences.title,
        summary: sequences.summary,
        mood: sequences.mood,
        locationHint: sequences.locationHint,
        narrativePurpose: sequences.narrativePurpose,
      })
      .from(sequences)
      .where(eq(sequences.id, sid))
      .then(([r]) => r ?? null),
    db
      .select({
        assetId: assets.id,
        assetName: assets.name,
        assetType: assets.type,
        assetDescription: assets.description,
        assetNotes: assets.notes,
        assetVisualIdentity: assets.visualIdentity,
        assetUsageRules: assets.usageRules,
        assetForbiddenVariations: assets.forbiddenVariations,
        // ASSET.PROMPTCARD.1 — same reasoning as the three columns above:
        // without it, a filled Prompt Card never reaches this preview's
        // composed Subject part.
        assetPromptCard: assets.promptCard,
      })
      .from(shotAssets)
      .innerJoin(assets, eq(shotAssets.assetId, assets.id))
      .where(eq(shotAssets.shotId, shid))
      .orderBy(asc(assets.name)),
  ]);

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  const segmentList = await db
    .select()
    .from(promptSegments)
    .where(eq(promptSegments.shotId, shid))
    .orderBy(asc(promptSegments.orderIndex));

  const shotRefImages = await db
    .select({
      id: shotReferenceImages.id,
      imagePath: shotReferenceImages.imagePath,
      label: shotReferenceImages.label,
      imageRole: shotReferenceImages.imageRole,
      sourceFilename: shotReferenceImages.sourceFilename,
    })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shid))
    .orderBy(asc(shotReferenceImages.orderIndex), asc(shotReferenceImages.id));

  const castAssetRefImages =
    assignedAssetIds.length > 0
      ? await db
          .select({
            id: assetReferenceImages.id,
            assetId: assetReferenceImages.assetId,
            imagePath: assetReferenceImages.imagePath,
            label: assetReferenceImages.label,
            imageRole: assetReferenceImages.imageRole,
            sourceFilename: assetReferenceImages.sourceFilename,
            variantState: assetReferenceImages.variantState,
            usageNotes: assetReferenceImages.usageNotes,
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, assignedAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  // SHOT.GENERATION.DURATION.DEFAULT.1 — a valid Shot duration prefills the
  // single compatible Duration scalar input when no explicit
  // scalarNode_<nodeId> override already exists; used everywhere the raw
  // scalarValueByNodeId would otherwise flow into the payload/preview/form,
  // so those three can never disagree. Never written back into the URL.
  const effectiveScalarValueByNodeId = resolveShotDurationScalarDefault(
    parsed?.inputs ?? [],
    shot.durationSeconds,
    scalarValueByNodeId
  );
  const compiledPrompt = compilePromptSegments(segmentList);
  const hasRealPromptSegments = segmentList.length > 0;
  const compiledShotPrompt = compileShotPrompt({
    kind: workflow.kind as ShotPromptCompileKind,
    shotPrompt: shot.shotPrompt,
    compiledPromptSegments: hasRealPromptSegments ? compiledPrompt.text : "",
    hasPromptSegments: hasRealPromptSegments,
    hasMissingTiming: compiledPrompt.hasMissingTiming,
  });

  const composedShotPrompt =
    project && sequence
      ? composeShotPrompt({
          project: { name: project.name, pitch: project.pitch },
          sequence: {
            title: sequence.title,
            mood: sequence.mood,
            locationHint: sequence.locationHint,
            summary: sequence.summary,
            narrativePurpose: sequence.narrativePurpose,
          },
          shot: {
            shotCode: shot.shotCode,
            title: shot.title,
            durationSeconds: shot.durationSeconds,
            description: shot.description,
            actionPitch: shot.actionPitch,
            cameraPitch: shot.cameraSubject,
            framing: shot.shotSize,
            cameraMovement: shot.cameraMovement,
          },
          castAssets: assignedRows.map((r) => ({
            name: r.assetName,
            type: r.assetType,
            description: r.assetDescription,
            notes: r.assetNotes,
          })),
          shotRefImages: shotRefImages.map((img) => ({
            imageRole: img.imageRole,
            label: img.label,
            sourceFilename: img.sourceFilename,
          })),
          castAssetRefImages: castAssetRefImages.map((img) => {
            const row = assignedRows.find((r) => r.assetId === img.assetId);
            return {
              assetName: row?.assetName ?? "",
              assetType: row?.assetType ?? "",
              imageRole: img.imageRole,
              label: img.label,
              sourceFilename: img.sourceFilename,
            };
          }),
        })
      : null;

  const actionCamera = [shot.actionPitch, shot.cameraSubject]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => v.trim())
    .join("\n");

  const STYLE_KINDS: FillSource["kinds"] = ["generic", "positive", "style"];

  const fillSources: FillSource[] = [
    shot.shotPrompt?.trim()
      ? { id: "shotPrompt", label: "Shot Prompt", text: shot.shotPrompt.trim() }
      : null,
    compiledShotPrompt.text.trim() && compiledShotPrompt.text.trim() !== (shot.shotPrompt?.trim() ?? "")
      ? { id: "compiledPrompt", label: "Compiled Prompt", text: compiledShotPrompt.text.trim() }
      : null,
    hasRealPromptSegments && compiledPrompt.text.trim()
      ? { id: "segments", label: "Prompt Segments", text: compiledPrompt.text.trim() }
      : null,
    shot.description?.trim()
      ? { id: "description", label: "Shot Description", text: shot.description.trim() }
      : null,
    actionCamera
      ? { id: "actionCamera", label: "Action + Camera", text: actionCamera }
      : null,
    composedShotPrompt?.hasContent
      ? { id: "casting", label: "Casting-aware Prompt", text: composedShotPrompt.proposalText, kinds: STYLE_KINDS }
      : null,
    project?.story?.trim()
      ? { id: "projectStory", label: "Project Story", text: project.story!.trim(), kinds: STYLE_KINDS }
      : null,
    sequence?.summary?.trim()
      ? { id: "sequenceSummary", label: "Sequence Summary", text: sequence.summary!.trim(), kinds: STYLE_KINDS }
      : null,
  ].filter((s): s is FillSource => s !== null);

  const allAvailableImages = buildRuntimeImageOptions(
    shotRefImages,
    castAssetRefImages,
    assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
    }))
  );

  // Retake fix — SEQGEN.STORYBOARD.2: when a Storyboard Assets selection was
  // transported in, every downstream consumer of `availableImages` (Dynamic
  // Batch groups, per-node image pickers, and — critically —
  // buildGenerationPayload's actual payload below) sees only the selected
  // references, in the exact order they were selected. No selection (or a
  // non-storyboard context) keeps today's default: every cast/shot
  // reference, unfiltered. Filtering itself lives in a pure, independently
  // tested helper — see filterAvailableImagesBySelection.ts.
  const availableImages = isStoryboardContext
    ? filterAvailableImagesBySelection(allAvailableImages, storyboardSelectedRefIds)
    : allAvailableImages;

  // SHOT.VIDEO.LIBRARY.1, Lot C — this Shot's own durable video library,
  // ready for a ComfyUI video-input picker. No real workflow has one today
  // (see claude_report.md), so this list is queried unconditionally but
  // only ever rendered/used when `videoMappings` below is non-empty.
  const availableVideos = await loadRuntimeVideoOptionsForShot(shid);

  // --- Dynamic Batch UI info (detect + trace + titles) — shared helper, same
  // result the /map page and AssetGenerationPanel compute for this workflow. ---
  const batchUiInfo = parsed !== null ? detectDynamicBatchUiInfo(workflow.workflowJson) : { kind: "none" as const };
  const batchDetectionOk = batchUiInfo.kind === "ready";
  let batchPreview: BatchExpansionPreview | null = null;
  let batchError: { kind: "detection"; message: string } | null = null;
  const batchTemplateChainNodeIds = batchUiInfo.kind === "ready" ? batchUiInfo.templateChainNodeIds : [];

  if (batchUiInfo.kind === "ready") {
    batchPreview = {
      batchTitle: batchUiInfo.batchTitle,
      templateChainTitles: batchUiInfo.templateChainTitles,
      selectedImageCount: 0,
      clonedNodeCount: 0,
    };
  } else if (batchUiInfo.kind === "error") {
    batchError = { kind: "detection", message: batchUiInfo.message };
  }

  // Parse selected batch images from searchParams
  let batchSelectedIds: string[] = [];
  if (batchUiInfo.kind === "ready") {
    const raw = currentSearchParams[`batchImages_${batchUiInfo.batchNodeId}`] ?? "";
    batchSelectedIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length;
      batchPreview.clonedNodeCount = batchSelectedIds.length * batchPreview.templateChainTitles.length;
    }
  }

  // REFROLE.INTENT.1 — the job-level role overlay, read from its own sibling
  // param so the preview and the queued job never disagree on which role a
  // reference carries for this generation.
  const batchRoleOverrides =
    batchUiInfo.kind === "ready"
      ? parseBatchRoleOverridesParam(currentSearchParams[buildBatchRoleOverrideParamKey(batchUiInfo.batchNodeId)] ?? "")
      : {};

  // --- Canonical payload (GEN.SEEDANCE.1): same function used by /map,
  // AssetGenerationPanel and the server action — the preview computed here
  // matches exactly what queueing recomputes. ---
  const resolvedBatchImages: DynamicBatchExpansionImage[] = batchSelectedIds
    .map((id) => availableImages.find((img) => img.id === id))
    .filter((img): img is NonNullable<typeof img> => img !== undefined)
    .map((img) => ({ id: img.id, imagePath: img.imagePath }));

  // SHOTPROMPT.SHOT.1 — the single shared composer, also called by
  // runShotGenerationCore and the /map page: `@ImageN` follows this exact
  // same batch selection (never DB order), Style/lighting are resolved once
  // by the same two functions those two surfaces call, and the six-part body
  // is `composeStoryboardShot`'s, never a fourth reimplementation.
  const promptContext = buildPromptCompilationContext({
    shot: {
      title: shot.title,
      description: shot.description,
      actionPitch: shot.actionPitch,
      cameraPitch: shot.cameraSubject,
      durationSeconds: shot.durationSeconds,
      shotPrompt: shot.shotPrompt,
      compiledPromptSegments: hasRealPromptSegments ? compiledPrompt.text : "",
      hasPromptSegments: hasRealPromptSegments,
      hasMissingTiming: compiledPrompt.hasMissingTiming,
    },
    castAssets: assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
      description: r.assetDescription,
    })),
    references: buildOrderedShotReferenceInputs({ hasDynamicBatch: batchDetectionOk, batchSelectedIds, availableImages, roleOverrides: batchRoleOverrides }),
    assetBibles: assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
      visualIdentity: r.assetVisualIdentity,
      usageRules: r.assetUsageRules,
      forbiddenVariations: r.assetForbiddenVariations,
      promptCard: r.assetPromptCard,
    })),
    sequenceContext: sequence,
    projectContext: project,
    sources: { casting: true, references: true, assetBibles: true, sequenceContext: true, projectContext: true },
  });

  const [resolvedProjectStyle, shotLighting] = await Promise.all([
    resolveProjectStyleTextForComposition(pid),
    resolveStoryboardLighting(sid, [{ id: shid, lighting: shot.lighting }]),
  ]);

  // SHOTPROMPT.STYLE.1 — the compositeur is the sole source of Style TEXT
  // in this preview (`ProjectStyleGenerationPreview`'s own CSS toggle is
  // what shows the "will not be appended" state when the checkbox is
  // unchecked — this preview computation always assumes the checkbox's
  // `defaultChecked` state, same as before).
  const composedPrompt = composeShotGenerationPrompt({
    kind: workflow.kind as ShotPromptCompileKind,
    context: promptContext,
    continuity: {
      shotSize: shot.shotSize,
      cameraPosition: shot.cameraPosition,
      cameraMovement: shot.cameraMovement,
      movementSpeed: shot.movementSpeed,
      cameraSubject: shot.cameraSubject,
      cameraLens: shot.cameraLens,
    },
    lighting: shotLighting.byShotId[shid] ?? null,
    projectStyle: resolvedProjectStyle.styleText,
    projectStyleAvoid: resolvedProjectStyle.avoidText,
  });

  // STYLE.1.E.SURFACES.1 — same trusted consumer selection as the server
  // action's runShotGenerationCore: Storyboard context (server-known via
  // isStoryboardContext, never a forwarded consumer value) hard-codes
  // shot-storyboard; otherwise the workflow's persisted kind picks
  // shot-image/shot-video. Preview-only — the action re-resolves
  // independently at submit time.
  const styleConsumer = isStoryboardContext ? ("shot-storyboard" as const) : workflow.kind === "video" ? ("shot-video" as const) : ("shot-image" as const);
  const preparedStyle = await prepareGenerationStyleSource(
    styleConsumer,
    { kind: "shot", projectId: pid, sequenceId: sid, shotId: shid },
    composedPrompt.text
  );
  // SHOTPROMPT.STYLE.1 (Part A) — `composedPrompt.text` above already
  // carries the Style segment once. `preparedStyle` is still resolved (its
  // `hasEffectiveStyle`/`provenanceCandidate`/`compiledSegment` still drive
  // `ProjectStyleGenerationPreview` below), but its own
  // `composedSuggestedPrompt`/`composeTextOverride` outputs are no longer
  // used to build the previewed payload, so the segment is never composed
  // into it a second time.
  const styledSuggestedText = composedPrompt.text;
  const styledTextOverrideByNodeId = textOverrideByNodeId;

  const built =
    parsed !== null
      ? buildGenerationPayload({
          workflowJson: workflow.workflowJson,
          inputs: parsed.inputs,
          suggestedText: styledSuggestedText,
          availableImages,
          availableVideos,
          textOverrideByNodeId: styledTextOverrideByNodeId,
          selectedImageByNodeId,
          selectedVideoByNodeId,
          scalarOverrideByNodeId: effectiveScalarValueByNodeId,
          batchSelectedImages: resolvedBatchImages,
        })
      : null;

  // STYLE.1.E.SURFACES.2 retake Round 1 — three-state injectability: never
  // merely "an effective Style existed", and never a false "not compatible"
  // claim for an unevaluated payload (here, only when the workflow JSON
  // itself failed to parse). See ProjectStyleGenerationPreview's own doc
  // comment.
  const styleTextInjectability = built === null ? "pending" : built.ok ? (built.patch.patches.some((p) => p.kind === "text") ? "injected" : "not-compatible") : "pending";

  const mappings = built?.ok ? built.mappings : [];
  const imageMappings = mappings.filter((m) => m.mappingKind === "image");
  // SHOT.VIDEO.LIBRARY.1, Lot C
  const videoMappings = mappings.filter((m) => m.mappingKind === "video");
  const panelVideoNodes: ShotPanelVideoNode[] = videoMappings.map((mapping) => {
    const nodeId = mapping.input.nodeId;
    return {
      nodeId,
      displayLabel: mapping.input.label || mapping.input.title || "Load Video",
      initialValue: selectedVideoByNodeId[nodeId] ?? "",
      videos: mapping.availableVideos.map((v) => ({
        id: String(v.shotVideoId),
        label: v.label,
        source: v.source,
        durationSeconds: v.durationSeconds,
        isApproved: v.isApproved,
      })),
    };
  });
  const promptCompilerTextNodeCandidates = mappings
    .filter((m) => m.mappingKind === "text")
    .map((m) => ({ nodeId: m.input.nodeId, label: m.input.label, title: m.input.title }));

  // When Dynamic Batch is active, template-chain image inputs are replaced by the batch list.
  // Exclude them from classic UI display.
  const displayImageMappings = batchDetectionOk
    ? imageMappings.filter((m) => !batchTemplateChainNodeIds.includes(m.input.nodeId))
    : imageMappings;

  // ── Workflow profile (GEN.SEEDANCE.2) — resolved purely from a stable
  // signature already in the stored JSON; never rewrites it, never touches
  // selections. A generic workflow (profile === null) runs no specialized
  // diagnostic below. ──
  const workflowProfile = resolveWorkflowProfile(workflow.workflowJson);
  const workflowNodeState =
    parsed !== null
      ? auditWorkflowNodes(workflow.workflowJson, parsed)
      : {
          hasTextPromptNode: false,
          imageInputCount: 0,
          dynamicBatchPresent: false,
          hasFirstFrameNode: false,
          hasLastFrameNode: false,
        };
  const promptCompilerTextNodeResolution = resolvePromptCompilerTextNode(promptCompilerTextNodeCandidates);
  const promptCompilerTextNodeMapping = promptCompilerTextNodeResolution.ok
    ? mappings.find((m) => m.input.nodeId === promptCompilerTextNodeResolution.nodeId)
    : undefined;
  const hasTextPromptValue = Boolean(promptCompilerTextNodeMapping?.suggestedText?.trim());
  const selectedImageCount = imageMappings.filter((m) => Boolean(selectedImageByNodeId[m.input.nodeId])).length;

  // First/Last Frame mapping strictness (GEN.SEEDANCE.3) — resolves the two
  // real, distinct image nodes by their exact title, then looks up what the
  // user actually selected for each and that selection's own stored role.
  // Never guesses, never auto-selects, never mutates a selection.
  const workflowImageNodeCandidates = imageMappings.map((m) => ({
    nodeId: m.input.nodeId,
    label: m.input.label,
    title: m.input.title,
  }));
  const { firstFrameNodeId, lastFrameNodeId } = resolveFirstLastFrameNodes(workflowImageNodeCandidates);
  const imageRoleById = new Map(availableImages.map((img) => [img.id, img.role]));
  const firstFrameSelectedImageId = firstFrameNodeId
    ? selectedImageByNodeId[firstFrameNodeId] ?? null
    : null;
  const lastFrameSelectedImageId = lastFrameNodeId
    ? selectedImageByNodeId[lastFrameNodeId] ?? null
    : null;
  const firstFrameSelectedImageRole = firstFrameSelectedImageId
    ? imageRoleById.get(firstFrameSelectedImageId) ?? null
    : null;
  const lastFrameSelectedImageRole = lastFrameSelectedImageId
    ? imageRoleById.get(lastFrameSelectedImageId) ?? null
    : null;

  // Build panelImageNodes for the client image preview component
  const _labelCount: Record<string, number> = {};
  for (const m of displayImageMappings) {
    const l = m.input.label || m.input.title || "Load Image";
    _labelCount[l] = (_labelCount[l] ?? 0) + 1;
  }
  const _labelIndex: Record<string, number> = {};

  const panelImageNodes: ShotPanelImageNode[] = displayImageMappings.map((mapping) => {
    const nodeId = mapping.input.nodeId;
    const rawLabel = mapping.input.label || mapping.input.title || "Load Image";
    const isDup = _labelCount[rawLabel] > 1;
    _labelIndex[rawLabel] = (_labelIndex[rawLabel] ?? 0) + 1;
    const displayLabel = isDup ? `${rawLabel} ${_labelIndex[rawLabel]}` : rawLabel;
    const images = mapping.availableImages;
    const selectedId = selectedImageByNodeId[nodeId] ?? "";
    const suggestedId = suggestImageForNode(rawLabel, images);
    const isSuggestion = selectedId === "" && suggestedId !== null;
    const effectiveId = selectedId !== "" ? selectedId : (suggestedId ?? "");

    let badgeLabel: string | null = null;
    if (isSuggestion && suggestedId) {
      if (suggestedId.startsWith("shot-")) badgeLabel = "Suggested from shot";
      else if (suggestedId.startsWith("asset-")) badgeLabel = "Suggested from cast";
      else badgeLabel = "Suggested";
    }

    return {
      nodeId,
      displayLabel,
      isDup,
      initialValue: effectiveId,
      badgeLabel,
      images: images.map((img) => ({
        id: img.id,
        imagePath: img.imagePath,
        label: img.label,
        role: img.role ?? undefined,
        source: img.source,
        assetName: img.assetName,
      })),
    };
  });

  // --- Runtime preview JSON — GEN.SEEDANCE.1: this is `built.patch`, the
  // exact same canonical computation the server re-runs at queue time, so
  // preview and queue can never diverge. When the workflow has a Dynamic
  // Batch node and nothing is selected yet, `built` is a clean `ok:false`
  // (never a crash) — no preview is shown rather than displaying an
  // incomplete/misleading intermediate payload; DynamicBatchImageList's own
  // "Add at least one image" notice already covers that state. Any other
  // (unexpected) Dynamic Batch error is surfaced via batchError too, so
  // nothing fails silently.
  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError && built.error !== "Add at least one image to Dynamic Image Batch before generating.") {
    batchError = { kind: "detection", message: built.error };
  }

  const batchNodeId = batchUiInfo.kind === "ready" ? batchUiInfo.batchNodeId : "";

  // Build available images as BatchImageGroups for DynamicBatchImageList
  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetectionOk) {
    const shotItems = availableImages.filter((img) => img.source === "shot").map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.label,
      source: img.source,
      assetName: img.assetName,
    }));
    const assetItems = availableImages.filter((img) => img.source === "asset").map((img) => {
      const roleLabel = getReferenceImageRoleLabel(img.role);
      return {
        id: img.id,
        imagePath: img.imagePath,
        label: img.assetName ? `${img.assetName}${roleLabel ? " · " + roleLabel : ""}` : (roleLabel ?? img.label),
        source: img.source,
        assetName: img.assetName,
      };
    });
    if (shotItems.length > 0) batchImageGroups.push({ groupLabel: "Shot Sources", items: shotItems });
    if (assetItems.length > 0) batchImageGroups.push({ groupLabel: "Cast Sources", items: assetItems });
  }

  // Build selectionParams — also include batchImages_* to persist selection after Generate
  const selectionParams = new URLSearchParams({ generation: "open", workflowId: String(wid) });
  for (const [nodeId, imageId] of Object.entries(selectedImageByNodeId)) {
    selectionParams.set(`imageNode_${nodeId}`, imageId);
  }
  for (const [nodeId, videoId] of Object.entries(selectedVideoByNodeId)) {
    selectionParams.set(`videoNode_${nodeId}`, videoId);
  }
  for (const [nodeId, value] of Object.entries(scalarValueByNodeId)) {
    selectionParams.set(`scalarNode_${nodeId}`, value);
  }
  for (const [nodeId, value] of Object.entries(textOverrideByNodeId)) {
    selectionParams.set(`textNode_${nodeId}`, value);
  }
  if (batchDetectionOk && batchSelectedIds.length > 0) {
    selectionParams.set(`batchImages_${batchNodeId}`, batchSelectedIds.join(","));
  }
  const returnTo = `${basePath}?${selectionParams.toString()}`;

  // approveReturnTo keeps the panel open with the current jobId visible
  const approveParams = new URLSearchParams(selectionParams);
  if (activeJobId !== null) {
    approveParams.set("jobId", String(activeJobId));
  }
  const approveReturnTo = `${basePath}?${approveParams.toString()}`;

  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  const VIDEO_APPROVE_EXTS = new Set([".mp4", ".webm", ".mov"]);
  let canAttach = false;
  let canApproveVideo = false;

  if (activeJobId !== null) {
    const [fetchedJob] = await db
      .select({
        status: generationJobs.status,
        outputPath: generationJobs.outputPath,
        shotId: generationJobs.shotId,
      })
      .from(generationJobs)
      .where(eq(generationJobs.id, activeJobId));

    if (fetchedJob && fetchedJob.shotId === shid && fetchedJob.status === "done" && fetchedJob.outputPath !== null) {
      const ext = `.${fetchedJob.outputPath.split(".").pop()?.toLowerCase() ?? ""}`;
      if (workflow.kind === "image") {
        canAttach = ATTACH_EXTS.has(ext);
      } else if (workflow.kind === "video") {
        canApproveVideo = VIDEO_APPROVE_EXTS.has(ext);
      }
    }
  }

  // SEQGEN.STORYBOARD.2 — provenance snapshots for saveStoryboardDraftFromJob.
  // Reuses this render's own already-computed compiledShotPrompt/
  // availableImages; never a second source of truth.
  const canSaveStoryboardDraft = isStoryboardContext && workflow.kind === "image" && canAttach;
  const storyboardReferencesSnapshot = JSON.stringify(
    Object.values(selectedImageByNodeId)
      .map((imageId) => availableImages.find((img) => img.id === imageId))
      .filter((img): img is NonNullable<typeof img> => img !== undefined)
      .map((img) => ({ id: img.id, label: img.label, source: img.source, assetName: img.assetName }))
  );

  // COMFY.PROVIDER.1 — derived from cloudPreflight computed earlier: Generate
  // is entirely hidden when Cloud can't run this workflow at all, and gated
  // behind an explicit native confirm() naming the Partner Node cost when
  // that's the only concern.
  const cloudPreflightBlocksGeneration =
    cloudPreflight !== null && ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0);
  const partnerNodeConfirmMessage =
    cloudPreflight !== null && !("error" in cloudPreflight) && cloudPreflight.apiNodeClasses.length > 0
      ? `This will call paid Comfy Cloud Partner Node(s): ${cloudPreflight.apiNodeClasses.join(", ")}. Continue and incur cost?`
      : null;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <ShotPanelHeader
        workflowKind={workflow.kind}
        workflowName={workflow.name}
        projectId={pid}
        sequenceId={sid}
        shotId={shid}
        workflowId={wid}
        selectorUrl={selectorUrl}
        closeUrl={closeUrl}
      />

      {/* Body */}
      <div className="px-5 py-4 flex flex-col gap-5 group/style">

        {/* Shot Prompt */}
        <ShotPromptSection
          compiledShotPrompt={composedPrompt}
          workflowKind={workflow.kind}
          projectId={pid}
          sequenceId={sid}
          shotId={shid}
          currentShotPrompt={shot.shotPrompt}
          returnTo={returnTo}
          shotPromptSaved={shotPromptSaved}
          shotPromptError={shotPromptError}
        />

        {/* Suggested Inputs */}
        <WorkflowProfilePanel
          profile={workflowProfile}
          nodeState={workflowNodeState}
          hasTextPromptValue={hasTextPromptValue}
          selectedImageCount={selectedImageCount}
          dynamicBatchActive={batchDetectionOk}
          dynamicBatchSelectedCount={batchSelectedIds.length}
          firstFrameSelectedImageId={firstFrameSelectedImageId}
          lastFrameSelectedImageId={lastFrameSelectedImageId}
          firstFrameSelectedImageRole={firstFrameSelectedImageRole}
          lastFrameSelectedImageRole={lastFrameSelectedImageRole}
        >
        <SuggestedInputsBody
          parsed={parsed}
          mappings={mappings}
          effectiveScalarValueByNodeId={effectiveScalarValueByNodeId}
          textOverrideByNodeId={textOverrideByNodeId}
          currentSearchParams={currentSearchParams}
          basePath={basePath}
          fillSources={fillSources}
          displayImageMappings={displayImageMappings}
          panelImageNodes={panelImageNodes}
          projectId={pid}
          shotId={shid}
          sequenceId={sid}
          videoMappings={videoMappings}
          panelVideoNodes={panelVideoNodes}
          batchDetectionOk={batchDetectionOk}
          batchNodeId={batchNodeId}
          batchPreview={batchPreview}
          batchError={batchError}
          batchImageGroups={batchImageGroups}
          batchSelectedIds={batchSelectedIds}
          batchRoleOverrides={batchRoleOverrides}
          workflowId={wid}
        />

        {/* GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — checked by default on every mount. */}
        <ProjectStyleAppendCheckbox formId="shot-panel-generation-form" />

        {/* STYLE.1.E.SURFACES.1 — inspectable Style source, before the payload preview. */}
        <ProjectStyleGenerationPreview sourceLabel="Resolved Sequence Style" prepared={preparedStyle} textInjectability={styleTextInjectability} />

        {/* Preview — shows the final expanded+patched JSON */}
        {/* Generate */}
        {payloadPreview !== null && (
          <GenerateSection
            payloadPreview={payloadPreview}
            generationError={generationError}
            cloudPreflight={cloudPreflight}
            cloudPreflightBlocksGeneration={cloudPreflightBlocksGeneration}
            preparedStyleOk={preparedStyle.ok}
            partnerNodeConfirmMessage={partnerNodeConfirmMessage}
            isStoryboardContext={isStoryboardContext}
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            workflowId={wid}
            returnTo={returnTo}
            selectedImageByNodeId={selectedImageByNodeId}
            selectedVideoByNodeId={selectedVideoByNodeId}
            effectiveScalarValueByNodeId={effectiveScalarValueByNodeId}
            textOverrideByNodeId={textOverrideByNodeId}
            batchDetectionOk={batchDetectionOk}
            batchNodeId={batchNodeId}
            batchRoleOverrides={batchRoleOverrides}
            workflowKind={workflow.kind}
          />
        )}
        </WorkflowProfilePanel>

        {/* Output */}
        {activeJobId !== null && (
          <OutputSection
            activeJobId={activeJobId}
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            approveReturnTo={approveReturnTo}
            attachError={attachError}
            attachedReference={attachedReference}
            canAttach={canAttach}
            canSaveStoryboardDraft={canSaveStoryboardDraft}
            storyboardDraftError={storyboardDraftError}
            storyboardDraftSaved={storyboardDraftSaved}
            compiledShotPromptText={composedPrompt.text}
            storyboardReferencesSnapshot={storyboardReferencesSnapshot}
            approveError={approveError}
            approvedVideo={approvedVideo}
            canApproveVideo={canApproveVideo}
            libraryError={libraryError}
            librarySaved={librarySaved}
            libraryAlreadySaved={libraryAlreadySaved}
          />
        )}

      </div>
    </div>
  );
}