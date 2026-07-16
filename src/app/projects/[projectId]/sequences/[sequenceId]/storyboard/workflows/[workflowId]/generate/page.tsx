import Link from "next/link";
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
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import WorkflowImageSelectionForm from "@/components/WorkflowImageSelectionForm";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { filterAvailableImagesBySelection } from "@/lib/comfy/filterAvailableImagesBySelection";
import {
  buildGenerationPayload,
  detectDynamicBatchUiInfo,
} from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import { runSequenceGenerationFromForm } from "@/actions/sequenceGeneration";
import { saveSequenceStoryboardDraftFromJob } from "@/actions/sequenceStoryboard";
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
import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";
import { refImageUrl } from "@/lib/refImageUrl";

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * SEQGEN.STORYBOARD.3 — Sequence-level generate page: the twin of
 * `.../shots/[shotId]/workflows/[workflowId]/map/page.tsx` and
 * `.../assets/[assetId]/workflows/[workflowId]/generate/page.tsx`. Produces
 * a single contact-sheet Sequence Storyboard image from the casting
 * references selected in Storyboard Assets, using the exact same canonical
 * pipeline (buildGenerationPayload, filterAvailableImagesBySelection,
 * Dynamic Batch UI) — no second ComfyUI protocol, no change to per-Shot
 * data. Data-fetch/package-build logic is intentionally recomputed here
 * (not imported from SequenceGenerationPackagePanel or shared with
 * runSequenceGeneration) — the same "each surface recomputes its own
 * canonical data" convention already used between /map and
 * runWorkflowGeneration.
 */
export default async function SequenceStoryboardGeneratePage({ params, searchParams }: Props) {
  const { projectId, sequenceId, workflowId } = await params;
  const resolvedSearchParams = await searchParams;

  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const wid = parseInt(workflowId, 10);

  const rawJobId = resolvedSearchParams["jobId"];
  const jobIdParam =
    typeof rawJobId === "string" ? rawJobId : Array.isArray(rawJobId) ? rawJobId[0] : undefined;

  const rawGenerationError = resolvedSearchParams["generationError"];
  const generationError =
    typeof rawGenerationError === "string"
      ? rawGenerationError
      : Array.isArray(rawGenerationError)
      ? rawGenerationError[0]
      : undefined;

  const rawDraftSaved = resolvedSearchParams["sequenceStoryboardDraftSaved"];
  const draftSaved =
    (typeof rawDraftSaved === "string" ? rawDraftSaved : Array.isArray(rawDraftSaved) ? rawDraftSaved[0] : undefined) === "1";
  const rawDraftError = resolvedSearchParams["sequenceStoryboardDraftError"];
  const draftError =
    typeof rawDraftError === "string" ? rawDraftError : Array.isArray(rawDraftError) ? rawDraftError[0] : undefined;

  const selectedImageByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (!key.startsWith("imageNode_")) continue;
    const nodeId = key.slice("imageNode_".length);
    if (!nodeId) continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue?.trim()) selectedImageByNodeId[nodeId] = strValue.trim();
  }

  const scalarValueByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (!key.startsWith("scalarNode_")) continue;
    const nodeId = key.slice("scalarNode_".length);
    if (!nodeId) continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) scalarValueByNodeId[nodeId] = strValue;
  }

  const textOverrideByNodeId: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (!key.startsWith("textNode_")) continue;
    const nodeId = key.slice("textNode_".length);
    if (!nodeId) continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) textOverrideByNodeId[nodeId] = strValue;
  }

  // SEQGEN.STORYBOARD.3-FIX4 — `generationError` is a flash message tied to
  // this one failed attempt, read separately above (`generationError` const)
  // for display on THIS render only. It must never be re-propagated as a
  // navigation parameter: every in-page form/link that spreads
  // `currentSearchParams` as its own passthrough base
  // (WorkflowRuntimeMappingPanel -> WorkflowTextOverrideForm/
  // WorkflowScalarInputsForm, DynamicBatchImageList's pushState and upload
  // form) would otherwise carry a stale error forward into every subsequent
  // interaction and Sequence/workflow the user moves to next. Filtering it
  // out at this single shared construction site fixes every one of those
  // downstream consumers at once — no divergent per-component filtering.
  const currentSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (key === "generationError") continue;
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) currentSearchParams[key] = strValue;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, wid));
  if (!workflow) notFound();
  if (workflow.kind !== "image") notFound();

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sid))
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

  // --- Only Asset casting references feed generation in this MVP ---
  const allAvailableImages: RuntimeImageOption[] = [];
  const refMetaByRefId = new Map<string, SequenceStoryboardReferenceInput>();
  for (const assetId of uniqueAssetIds) {
    const meta = assetMetaById.get(assetId)!;
    for (const img of assetRefsByAsset.get(assetId) ?? []) {
      const refId = `asset-${assetId}-${img.id}`;
      allAvailableImages.push({
        id: refId,
        source: "asset",
        imagePath: img.imagePath,
        label: img.label?.trim() || img.imageRole?.trim() || "Image",
        role: img.imageRole,
        assetName: meta.assetName,
        assetType: meta.assetType,
        variantState: img.variantState,
        approved: img.approvedForGeneration,
      });
      refMetaByRefId.set(refId, {
        refId,
        assetId,
        assetName: meta.assetName,
        assetType: meta.assetType,
        role: img.imageRole,
        roleLabel: getReferenceImageRoleLabel(img.imageRole),
        label: img.label,
        variantState: img.variantState,
        approvedForGeneration: img.approvedForGeneration,
      });
    }
  }

  const storyboardRefsParam = currentSearchParams["storyboardRefs"] ?? "";
  const storyboardSelectedRefIds = storyboardRefsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // SEQGEN.STORYBOARD.3 (retake) — "selectionnees explicitement par
  // l'utilisateur" is a hard requirement here, unlike the Shot-level
  // default-preserve convention: an EMPTY selection must mean "nothing
  // available", not "everything available". filterAvailableImagesBySelection
  // itself is never modified (its own default-preserve contract is correct
  // for its other callers) — only this caller's own fallback changes.
  const hasExplicitSelection = storyboardSelectedRefIds.length > 0;
  const availableImages = hasExplicitSelection
    ? filterAvailableImagesBySelection(allAvailableImages, storyboardSelectedRefIds)
    : [];

  const parsed = parseComfyWorkflow(workflow.workflowJson);

  // --- Dynamic Batch UI info — same canonical helpers as the Shot/Asset
  // pages, computed early (before the @ImageN mapping) because the actual
  // send order/subset for this workflow's LoadImage (Repeatable) chain is
  // the Dynamic Batch selection, not the raw Storyboard Assets order. ---
  const batchUiInfo = parsed !== null ? detectDynamicBatchUiInfo(workflow.workflowJson) : { kind: "none" as const };
  const batchDetectionOk = batchUiInfo.kind === "ready";
  const batchNodeId = batchUiInfo.kind === "ready" ? batchUiInfo.batchNodeId : "";
  let batchPreview: BatchExpansionPreview | null = null;
  let batchError: { kind: "detection"; message: string } | null = null;

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

  let batchSelectedIds: string[] = [];
  if (batchDetectionOk) {
    const rawParam = currentSearchParams[`batchImages_${batchNodeId}`];
    if (rawParam !== undefined) {
      // Explicit selection already in the URL (either the user reordered/
      // removed images in the panel, or a previous render already
      // initialized it below) — this is always the source of truth once
      // present, for both modes.
      batchSelectedIds = rawParam.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (batchUiInfo.kind === "ready" && batchUiInfo.mode === "direct-repeatable-inputs") {
      // SEQGEN.STORYBOARD.3-FIX3 — direct mode has no separate selection
      // step of its own: `storyboardRefs` (already resolved into
      // `availableImages`, in the user's selected order) IS the intended
      // selection. Initializing from it here means the first render
      // already has a usable preview/Update Preview, instead of requiring
      // an extra manual pick in the Dynamic Image Batch panel. Classic
      // Dynamic Batch workflows are untouched: batchSelectedIds stays []
      // when their query param is absent, exactly as before.
      batchSelectedIds = availableImages.map((img) => img.id);
    }
    if (batchPreview) {
      batchPreview.selectedImageCount = batchSelectedIds.length;
      batchPreview.clonedNodeCount = batchSelectedIds.length * batchPreview.templateChainTitles.length;
    }
  }

  const resolvedBatchImages: DynamicBatchExpansionImage[] = batchSelectedIds
    .map((id) => availableImages.find((img) => img.id === id))
    .filter((img): img is NonNullable<typeof img> => img !== undefined)
    .map((img) => ({ id: img.id, imagePath: img.imagePath }));

  // SEQGEN.STORYBOARD.3 (retake) — @ImageN must designate the image
  // actually sent at that position. When this workflow has a Dynamic
  // Batch node, that is the batch's own selected order/subset — never the
  // raw Storyboard Assets selection order, which the user can reorder or
  // narrow independently inside the Dynamic Batch panel. Only workflows
  // without a Dynamic Batch node (assigned per-node via Image Inputs
  // instead) fall back to the full explicit selection order.
  const orderedReferenceIds = batchDetectionOk ? batchSelectedIds : availableImages.map((img) => img.id);
  const referenceInputs: SequenceStoryboardReferenceInput[] = orderedReferenceIds
    .map((id) => refMetaByRefId.get(id))
    .filter((r): r is SequenceStoryboardReferenceInput => r !== undefined);

  // --- Sequence Generation Package (SEQGEN.1/STORYBOARD.2 builder, unmodified) ---
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
    { projectId: pid, sequenceId: sid, sequenceTitle: sequence.title, sequenceCode: sequence.sequenceCode },
    shotInputs
  );
  const packageText = formatSequenceGenerationPackageText(pkg);

  const promptResult = buildSequenceStoryboardPrompt({
    projectId: pid,
    sequenceId: sid,
    sequenceTitle: sequence.title,
    sequenceCode: sequence.sequenceCode,
    shotCount: shotList.length,
    references: referenceInputs,
    packageText,
  });

  const basePath = `/projects/${pid}/sequences/${sid}/storyboard/workflows/${wid}/generate`;

  // SEQGEN.STORYBOARD.3 (retake) — generation is blocked entirely without
  // at least one explicit Storyboard Assets selection ("bloquer clairement
  // la generation sans reference"), not just displayed as empty.
  const built =
    parsed !== null && hasExplicitSelection
      ? buildGenerationPayload({
          workflowJson: workflow.workflowJson,
          inputs: parsed.inputs,
          suggestedText: promptResult.text,
          availableImages,
          textOverrideByNodeId,
          selectedImageByNodeId,
          scalarOverrideByNodeId: scalarValueByNodeId,
          batchSelectedImages: resolvedBatchImages,
        })
      : null;

  const mappings = built?.ok ? built.mappings : [];
  const displayMappings = built?.ok ? built.displayMappings : mappings;

  const payloadPreview = built?.ok ? built.patch : null;
  if (built && !built.ok && !batchError && built.error !== "Add at least one image to Dynamic Image Batch before generating.") {
    batchError = { kind: "detection", message: built.error };
  }

  const batchImageGroups: BatchImageGroup[] = [];
  if (batchDetectionOk) {
    const items = availableImages.map((img) => ({
      id: img.id,
      imagePath: img.imagePath,
      label: img.assetName ? `${img.assetName}${img.role ? " · " + img.role : ""}` : (img.role ?? img.label),
      source: img.source,
      assetName: img.assetName,
    }));
    if (items.length > 0) batchImageGroups.push({ groupLabel: "Casting Sources", items });
  }

  // SEQGEN.STORYBOARD.3 — storyboardRefs must survive the Image Inputs
  // "Update Preview" GET form and the Generate redirect's returnTo, not
  // just this page's initial render (same fix already applied to the
  // per-Shot /map page in SEQGEN.STORYBOARD.2 retake 3).
  const storyboardPreserveParams: Record<string, string> | undefined = storyboardRefsParam
    ? { storyboardRefs: storyboardRefsParam }
    : undefined;

  const selectionParams = new URLSearchParams();
  for (const [nodeId, imageId] of Object.entries(selectedImageByNodeId)) {
    selectionParams.set(`imageNode_${nodeId}`, imageId);
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
  if (storyboardPreserveParams) {
    for (const [key, value] of Object.entries(storyboardPreserveParams)) {
      selectionParams.set(key, value);
    }
  }
  const selectionQuery = selectionParams.toString();
  const returnTo = selectionQuery ? `${basePath}?${selectionQuery}` : basePath;

  const outputParams = new URLSearchParams(selectionParams);
  if (jobIdParam) outputParams.set("jobId", jobIdParam);
  const outputReturnTo = `${basePath}?${outputParams.toString()}`;

  const activeJobId = jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

  const ATTACH_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  let canSaveDraft = false;

  if (activeJobId !== null) {
    const [fetchedJob] = await db
      .select({ status: generationJobs.status, outputPath: generationJobs.outputPath, sequenceId: generationJobs.sequenceId })
      .from(generationJobs)
      .where(eq(generationJobs.id, activeJobId));

    if (fetchedJob && fetchedJob.sequenceId === sid) {
      const outputPath = fetchedJob.outputPath ?? null;
      const ext = outputPath ? outputPath.split(".").pop()?.toLowerCase() ?? "" : "";
      canSaveDraft = fetchedJob.status === "done" && outputPath !== null && ATTACH_EXTS.has(`.${ext}`);
    }
  }

  // SEQGEN.STORYBOARD.3 (retake) — the empty state must explain WHY no
  // @ImageN mapping exists yet: no explicit Storyboard Assets selection at
  // all, versus a selection that exists but hasn't been added to the
  // Dynamic Batch (the actual send order) yet.
  const castingReferencesEmptyMessage = !hasExplicitSelection
    ? "No casting references selected. Select references in Storyboard Assets before generating."
    : batchDetectionOk
    ? "Casting references are selected, but none have been added to the Dynamic Image Batch below yet — add them there to set the @ImageN order that will actually be sent."
    : "No casting references available for the current selection.";

  // SEQGEN.STORYBOARD.3 (retake 2) — every link back to Storyboard must
  // carry the current storyboardRefs selection, otherwise the user's
  // casting-reference checkboxes appear deselected on return even though
  // nothing was actually changed.
  const storyboardWorkspaceReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}${
    storyboardRefsParam ? `&storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""
  }`;
  const sequenceLabel = sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard", href: storyboardWorkspaceReturnTo },
          {
            label: "Generate Sequence Storyboard",
            href: `/projects/${pid}/sequences/${sid}/storyboard/workflows${storyboardRefsParam ? `?storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""}`,
          },
          { label: workflow.name },
        ]}
      />

      <PageHeader title="Generate Sequence Storyboard" meta={sequenceLabel} />

      <div className="flex flex-col gap-4">
        {/* ── Workflow ──────────────────────────────────────── */}
        <Card title="Workflow">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <WorkflowKindBadge kind={workflow.kind} />
              <span className="text-sm font-medium text-[#e7e9ec]">{workflow.name}</span>
            </div>
            {workflow.description && <p className="text-xs text-[#a4abb2]">{workflow.description}</p>}
            {workflow.sourceFilename && (
              <p className="text-xs font-mono text-[#6e767d]">{workflow.sourceFilename}</p>
            )}
          </div>
        </Card>

        {/* ── Inputs ────────────────────────────────────────── */}
        <SectionLabel label="Inputs" />

        <Card title="Casting References (@ImageN)">
          {promptResult.imageMappings.length === 0 ? (
            <p className="text-xs text-[#b89a5a]">{castingReferencesEmptyMessage}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {promptResult.imageMappings.map((m) => {
                const img = availableImages.find((i) => i.id === m.refId);
                return (
                  <div key={m.refId} className="flex flex-col gap-1 rounded border border-[#232629] p-1.5">
                    {img && (
                      <div className="relative aspect-square w-full bg-[#0d0e10] overflow-hidden rounded">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={refImageUrl(img.imagePath)} alt={m.assetName} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <span className="text-[10px] font-mono text-[#5b93d6]">{m.imageLabel}</span>
                    <span className="text-xs text-[#a4abb2] truncate">{m.assetName}</span>
                    <span className="text-[10px] text-[#4b5158] truncate">
                      {m.assetType}
                      {m.roleLabel ? ` · ${m.roleLabel}` : ""}
                    </span>
                    {!m.approvedForGeneration && (
                      <span className="text-[9px] uppercase tracking-wider text-[#cda24f]">Not approved</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {promptResult.warnings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#1e2124] flex flex-col gap-0.5">
              {promptResult.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-[#cda24f]">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-[#1e2124]">
            <Link
              href={storyboardWorkspaceReturnTo}
              className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Edit Selection in Storyboard Assets →
            </Link>
          </div>
        </Card>

        {!hasExplicitSelection && (
          <div className="rounded border border-[#5c4a24]/60 bg-[#141008] px-3 py-2.5">
            <p className="text-xs text-[#b89a5a]">
              Generation is disabled until at least one casting reference is explicitly selected
              in Storyboard Assets.
            </p>
          </div>
        )}

        <Card title="Suggested Inputs">
          {parsed === null ? (
            <p className="text-sm text-[#cf7b6b]">This workflow JSON could not be parsed.</p>
          ) : (
            <WorkflowRuntimeMappingPanel
              mappings={mappings}
              scalarValueByNodeId={scalarValueByNodeId}
              textOverrideByNodeId={textOverrideByNodeId}
              currentSearchParams={currentSearchParams}
              basePath={basePath}
            />
          )}
        </Card>

        {displayMappings.some((m) => m.mappingKind === "image") && (
          <Card title="Image Inputs">
            <WorkflowImageSelectionForm
              basePath={basePath}
              mappings={displayMappings}
              selectedImageByNodeId={selectedImageByNodeId}
              preserveParams={storyboardPreserveParams}
            />
          </Card>
        )}

        {/* ── Dynamic Image Batch ───────────────────────────── */}
        {batchDetectionOk && (
          <Card title="Dynamic Image Batch">
            <DynamicBatchImageList
              batchNodeId={batchNodeId}
              preview={batchPreview}
              error={batchError}
              availableImages={batchImageGroups}
              selectedImageIds={batchSelectedIds}
              passthroughParams={currentSearchParams}
              basePath={basePath}
              contextType="sequence"
              projectId={pid}
              workflowId={String(wid)}
              sequenceId={sid}
            />
          </Card>
        )}

        {batchError && !batchDetectionOk && (
          <Card title="Dynamic Image Batch">
            <DynamicBatchImageList
              batchNodeId=""
              preview={null}
              error={batchError}
              availableImages={[]}
              selectedImageIds={[]}
              passthroughParams={currentSearchParams}
              basePath={basePath}
              contextType="sequence"
              projectId={pid}
              workflowId={String(wid)}
              sequenceId={sid}
            />
          </Card>
        )}

        {/* ── Preview ───────────────────────────────────────── */}
        {payloadPreview !== null && (
          <>
            <SectionLabel label="Preview" />
            <Card title="Payload Preview">
              <WorkflowPayloadPreviewPanel result={payloadPreview} />
            </Card>
          </>
        )}

        {/* ── Generate ──────────────────────────────────────── */}
        {payloadPreview !== null && (
          <>
            <SectionLabel label="Generate" />
            <Card>
              <div className="flex flex-col gap-4">
                {generationError && (
                  <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2">
                    <p className="text-xs text-[#cf7b6b] leading-relaxed">{generationError}</p>
                  </div>
                )}

                <form action={runSequenceGenerationFromForm} className="flex flex-col gap-4">
                  <input type="hidden" name="projectId" value={String(pid)} />
                  <input type="hidden" name="sequenceId" value={String(sid)} />
                  <input type="hidden" name="workflowId" value={String(wid)} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="storyboardRefs" value={storyboardRefsParam} />
                  {Object.entries(selectedImageByNodeId).map(([nodeId, imageId]) => (
                    <input key={nodeId} type="hidden" name={`imageNode_${nodeId}`} value={String(imageId)} />
                  ))}
                  {Object.entries(scalarValueByNodeId).map(([nodeId, value]) => (
                    <input key={`scalar-${nodeId}`} type="hidden" name={`scalarNode_${nodeId}`} value={value} />
                  ))}
                  {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
                    <input key={`text-${nodeId}`} type="hidden" name={`textNode_${nodeId}`} value={value} />
                  ))}
                  {batchDetectionOk && (
                    <DynamicBatchFormSync
                      batchNodeId={batchNodeId}
                      workflowId={String(wid)}
                      initialValue={batchSelectedIds.join(",")}
                    />
                  )}

                  <WorkflowGenerateActions
                    initialJsonText={payloadPreview.patchedJsonText}
                    buttonLabel="Generate Sequence Storyboard"
                  />
                </form>
              </div>
            </Card>
          </>
        )}

        {/* ── Output ────────────────────────────────────────── */}
        {activeJobId !== null && (
          <>
            <SectionLabel label="Output" />
            <Card>
              <div className="flex flex-col gap-4">
                <GenerationJobStatusPanel jobId={activeJobId} />

                {draftError && <p className="text-xs text-[#cf7b6b]">{draftError}</p>}
                {draftSaved ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-[#6b9e72]">Saved as Sequence Storyboard draft.</p>
                    <Link
                      href={storyboardWorkspaceReturnTo}
                      className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                    >
                      ← Back to Storyboard Workspace
                    </Link>
                  </div>
                ) : canSaveDraft ? (
                  <form action={saveSequenceStoryboardDraftFromJob}>
                    <input type="hidden" name="sequenceId" value={String(sid)} />
                    <input type="hidden" name="jobId" value={String(activeJobId)} />
                    <input type="hidden" name="returnTo" value={outputReturnTo} />
                    <button
                      type="submit"
                      className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
                    >
                      Save as Sequence Storyboard Draft
                    </button>
                  </form>
                ) : null}
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-6">
        <Link
          href={`/projects/${pid}/sequences/${sid}/storyboard/workflows${storyboardRefsParam ? `?storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Workflows
        </Link>
        <Link
          href={storyboardWorkspaceReturnTo}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Storyboard Workspace
        </Link>
      </div>
    </div>
  );
}
