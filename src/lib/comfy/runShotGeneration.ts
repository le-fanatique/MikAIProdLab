import "server-only";

// ---------------------------------------------------------------------------
// runShotGeneration.ts — STYLE.1.E.SURFACES.1 (retake Round 1)
//
// Codex Round 1, P1 "The supposedly server-owned Style mode is still an
// exported, caller-controlled Server Action parameter": `src/actions/
// generation.ts` has "use server" at the top of the FILE, so every exported
// async function in it is a potential Server Action reference — including
// one that merely accepted a `styleMode`/`styleConsumer` argument, even if
// no client code happened to call it that way today. Moving the actual
// policy-taking implementation into this PLAIN module (no "use server")
// removes that surface entirely: nothing here can ever be invoked as a
// Server Action, regardless of what argument shape it accepts, because the
// file itself was never marked as one. `import "server-only"` still makes
// an accidental Client Component import a build-time error.
//
// The only callers are trusted server code that already decided the exact
// Style policy before calling in:
//   - src/actions/generation.ts's `submitShotGeneration` (normal Shot form,
//     Storyboard form — passes "auto" or "shot-storyboard" respectively, or
//     "none" when the user unchecked "Append Project Style" —
//     GEN.PROJECT_STYLE.APPEND.TOGGLE.1);
//   - src/actions/generation.ts's `runWorkflowGeneration` (Camera Lab,
//     always passes "none" — no user-facing toggle exists for this path);
//   - src/actions/generationJobs.ts's `retryGenerationJob` (passes the
//     job's own preserved consumer, "none" to preserve an explicit prior
//     opt-out, or "auto" for a legacy job).
// None of these pass a value that ever crossed an untrusted boundary raw —
// see each call site's own comment for where its literal comes from.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { generationJobs, projects, sequences, shots, comfyWorkflows, assets, shotAssets, promptSegments, shotReferenceImages, assetReferenceImages } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import { type ShotPromptCompileKind } from "@/lib/prompts/compileShotPrompt";
import { buildPromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";
import { buildOrderedShotReferenceInputs, composeShotGenerationPrompt } from "@/lib/prompts/composeShotGenerationPrompt";
import { resolveProjectStyleTextForComposition } from "@/lib/projectStyle/resolveProjectStyleTextForComposition";
import { resolveStoryboardLighting } from "@/lib/llmWorkspace/composition/resolveStoryboardLighting";
import { buildRuntimeImageOptions } from "@/lib/comfy/mapWorkflowInputs";
import { prepareComfyPayloadForQueue } from "@/lib/comfy/prepareComfyPayload";
import { queueComfyPrompt } from "@/lib/comfy/comfyServerClient";
import { queueCloudPrompt } from "@/lib/comfy/comfyCloudClient";
import { getComfySettings } from "@/lib/settings";
import { maybeUnloadOllamaBeforeComfy } from "@/lib/vramManager";
import { type DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import { buildGenerationPayload, detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import { serializeGenerationSnapshot, type GenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { isSingleGenerationTarget } from "@/lib/comfy/generationTarget";
import {
  verifyPrePatchMutations,
  verifyPostUploadMutations,
  deriveQueuedPromptText,
} from "@/lib/comfy/verifyWorkflowMutations";
import { loadRuntimeVideoOptionsForShot } from "@/lib/shotVideoLibrary/loadRuntimeVideoOptions";
import { prepareGenerationStyleSource, type PreparedGenerationStyleSource } from "@/lib/projectStyle/generationStylePreparation";
import type { GenerationConsumer } from "@/lib/projectStyle/generationStyleSource";
import {
  checkCloudPreflightGate,
  findEditedStyleTextMismatch,
  markJobFailed,
  summarizeComfyNodeErrors,
  type RunWorkflowGenerationResult,
} from "@/lib/comfy/generationActionHelpers";

export type ShotGenerationArgs = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  workflowId: number;
  selectedImageByNodeId?: Record<string, string>;
  /** SHOT.VIDEO.LIBRARY.1, Lot C */
  selectedVideoByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
  textOverrideByNodeId?: Record<string, string>;
  /** Only treated as authoritative when the user actually edited the JSON — see EditablePatchedJsonPanel/patchedJsonOverrideActive. */
  patchedJsonOverride?: Record<string, unknown>;
  batchImagesByNodeId?: Record<string, DynamicBatchExpansionImage[]>;
  /**
   * REFROLE.INTENT.1 — the job-level role overlay for the same Dynamic
   * Batch node's selected images (`batchImageRoles_<nodeId>`, `id -> role`),
   * keyed identically to `batchImagesByNodeId`. Only the single node V1
   * supports is ever read (same convention as `batchImagesByNodeId`'s own
   * `Object.entries(...)[0]` below). Never written back to the library.
   */
  batchImageRoleOverridesByNodeId?: Record<string, Record<string, string>>;
  /**
   * SHOTPROMPT.REFS.2 — the job-level free-text note overlay for the same
   * Dynamic Batch node's selected images (`batchImageNotes_<nodeId>`,
   * `id -> note`), keyed identically to `batchImagesByNodeId`. Only the
   * single node V1 supports is ever read. Never written back to the
   * library — job-only, ephemeral.
   */
  batchImageNoteOverridesByNodeId?: Record<string, Record<string, string>>;
  /** COMFY.PROVIDER.1 — explicit acknowledgment that this Cloud submission may call paid Partner Node(s). Ignored for the local provider. */
  confirmPartnerNodeCost?: boolean;
  /** CAMLAB.POLISH.1 — set only by the Camera Lab's Gaussian-to-image caller; recorded as-is on the job's payloadSnapshot, never inferred here. */
  cameraLabProvenance?: GenerationSnapshot["cameraLabProvenance"];
  /**
   * GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — the user's explicit Append Project
   * Style form choice (or its exact preserved value on retry), recorded
   * as-is on the job's `payloadSnapshot`; never inferred here. Only set by
   * `submitShotGeneration` (fresh Shot generation) and `retryGenerationJob`
   * (preserving the prior job's exact choice). Camera Lab's
   * `runWorkflowGeneration` never sets it — its `styleIntent` is always
   * `"none"` independent of any user-facing toggle, so no `appendProjectStyle`
   * field is written to that job's snapshot at all.
   */
  appendProjectStyleRequested?: boolean;
};

/**
 * The one Style policy this module accepts:
 *   - "none"           — never resolves or injects a Style, byte-identical
 *                        to pre-Style behavior. Used by Camera Lab (always)
 *                        and by a normal Shot generation whose user
 *                        explicitly unchecked "Append Project Style"
 *                        (GEN.PROJECT_STYLE.APPEND.TOGGLE.1) — both reuse
 *                        this exact same escape hatch rather than a second
 *                        one;
 *   - "auto"           — normal Shot generation: the trusted consumer
 *                        ("shot-image"/"shot-video") is derived from the
 *                        workflow's CURRENT persisted kind, inside this
 *                        function, every call;
 *   - a specific Shot consumer ("shot-image" | "shot-video" |
 *     "shot-storyboard") — used only by the dedicated Storyboard wrapper
 *     (always "shot-storyboard") and by retry preserving an exact prior
 *     consumer. Every explicit value is verified against the workflow's
 *     CURRENT persisted kind before it is trusted (see the coherence check
 *     below) — Codex Round 1, P1 "Shot Storyboard does not reject video
 *     workflows" and "retry does not preserve original normal consumers".
 */
export type ShotStyleIntent = "none" | "auto" | "shot-image" | "shot-video" | "shot-storyboard";

export type ShotGenerationCoreResult = RunWorkflowGenerationResult;

export async function runShotGenerationCore(args: ShotGenerationArgs, styleIntent: ShotStyleIntent): Promise<ShotGenerationCoreResult> {
  const { projectId, sequenceId, shotId, workflowId } = args;

  const comfySettings = await getComfySettings();
  if (comfySettings.provider === "cloud" && !comfySettings.hasCloudApiKey) {
    return { ok: false, error: "Comfy Cloud is selected but no Comfy Cloud API key is configured." };
  }

  // --- 1. Validate numeric IDs ---
  if (
    !Number.isInteger(projectId) ||
    !Number.isInteger(sequenceId) ||
    !Number.isInteger(shotId) ||
    !Number.isInteger(workflowId) ||
    projectId <= 0 ||
    sequenceId <= 0 ||
    shotId <= 0 ||
    workflowId <= 0
  ) {
    return { ok: false, error: "Invalid IDs provided." };
  }

  // --- 2. Fetch and validate hierarchy ---
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return { ok: false, error: "Sequence not found or does not belong to this project." };

  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return { ok: false, error: "Shot not found or does not belong to this sequence." };

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };

  // --- STYLE.1.E.SURFACES.1 — trusted consumer resolution, ALWAYS re-checked
  // against the workflow's CURRENT persisted kind, never merely the caller's
  // intent:
  //   - "none"  -> null, no Style ever (Camera Lab);
  //   - "auto"  -> shot-video for a video workflow, shot-image otherwise;
  //   - a specific consumer -> only trusted if the workflow's current kind
  //     still matches it (shot-video requires kind "video"; shot-image and
  //     shot-storyboard both require kind "image"). A mismatch — e.g. the
  //     library workflow's kind changed since a Storyboard/retry request was
  //     built, or a Storyboard request naming a video workflow — is refused
  //     explicitly, before Style resolution, job insertion or any provider
  //     access. This is the single coherence check that makes both "Shot
  //     Storyboard must reject video workflows" and "retry must not
  //     silently switch consumer when the workflow changed" true by
  //     construction, from one code path. ---
  let styleConsumer: GenerationConsumer | null;
  if (styleIntent === "none") {
    styleConsumer = null;
  } else if (styleIntent === "auto") {
    styleConsumer = workflow.kind === "video" ? "shot-video" : "shot-image";
  } else {
    const requiredKind = styleIntent === "shot-video" ? "video" : "image";
    if (workflow.kind !== requiredKind) {
      return {
        ok: false,
        error: `This workflow is a ${workflow.kind} workflow, incompatible with the '${styleIntent}' Style consumer.`,
      };
    }
    styleConsumer = styleIntent;
  }

  // --- 3. Parse workflow JSON ---
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null) return { ok: false, error: "Workflow JSON could not be parsed. Check the workflow file." };

  // --- 4. Fetch shot context (mirrors map page logic) ---
  const assignedRows = await db
    .select({
      assetId: assets.id,
      assetName: assets.name,
      assetType: assets.type,
      assetDescription: assets.description,
      // SHOTPROMPT.SHOT.1 — the Asset Bible fields `composeStoryboardShot`'s
      // Subject/Constraints parts read (`context.castAssets[].assetBible`).
      // Previously not selected here, so the queued job's own "Subject"/
      // "Constraints" text would have silently diverged from the preview's
      // (ShotGenerationPanel/`/map` select these same columns already) — the
      // exact drift the shared composer exists to prevent. ASSET.PROMPTCARD.1
      // adds `promptCard`, the fourth of these — same reasoning.
      assetVisualIdentity: assets.visualIdentity,
      assetUsageRules: assets.usageRules,
      assetForbiddenVariations: assets.forbiddenVariations,
      assetPromptCard: assets.promptCard,
    })
    .from(shotAssets)
    .innerJoin(assets, eq(shotAssets.assetId, assets.id))
    .where(eq(shotAssets.shotId, shotId))
    .orderBy(asc(assets.name));

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  const segmentList = await db.select().from(promptSegments).where(eq(promptSegments.shotId, shotId)).orderBy(asc(promptSegments.orderIndex));

  const shotRefImages = await db
    .select({
      id: shotReferenceImages.id,
      imagePath: shotReferenceImages.imagePath,
      label: shotReferenceImages.label,
      imageRole: shotReferenceImages.imageRole,
      sourceFilename: shotReferenceImages.sourceFilename,
    })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shotId))
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
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, assignedAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];

  // --- 5. Recompute prompt + canonical payload (mirrors map page / panels — GEN.SEEDANCE.1) ---
  const compiledPrompt = compilePromptSegments(segmentList);
  const hasRealPromptSegments = segmentList.length > 0;

  const availableImages = buildRuntimeImageOptions(
    shotRefImages,
    castAssetRefImages,
    assignedRows.map((r) => ({ assetId: r.assetId, assetName: r.assetName, assetType: r.assetType }))
  );

  // Collect batch images: read from args.batchImagesByNodeId (only one
  // Dynamic Batch node is supported in V1), resolve placeholder ids to
  // actual imagePaths using availableImages, preserving selection order.
  const batchUiInfo = detectDynamicBatchUiInfo(workflow.workflowJson);
  const hasDynamicBatch = batchUiInfo.kind === "ready";
  const batchEntry = args.batchImagesByNodeId ? Object.entries(args.batchImagesByNodeId)[0] : undefined;

  const resolvedBatchImages: DynamicBatchExpansionImage[] = [];
  if (batchEntry) {
    for (const placeholder of batchEntry[1]) {
      const found = availableImages.find((img) => img.id === placeholder.id);
      if (!found) {
        return { ok: false, error: `Selected batch image "${placeholder.id}" not found in available images.` };
      }
      resolvedBatchImages.push({ id: found.id, imagePath: found.imagePath });
    }
  }
  const batchSelectedIds = resolvedBatchImages.map((img) => img.id);
  // REFROLE.INTENT.1 — same single-node convention as batchEntry above.
  const roleOverrideEntry = args.batchImageRoleOverridesByNodeId
    ? Object.entries(args.batchImageRoleOverridesByNodeId)[0]
    : undefined;
  const batchRoleOverrides = roleOverrideEntry?.[1] ?? undefined;
  // SHOTPROMPT.REFS.2 — same single-node convention as batchEntry above.
  const noteOverrideEntry = args.batchImageNoteOverridesByNodeId
    ? Object.entries(args.batchImageNoteOverridesByNodeId)[0]
    : undefined;
  const batchNoteOverrides = noteOverrideEntry?.[1] ?? undefined;

  // SHOT.VIDEO.LIBRARY.1, Lot C
  const availableVideos = await loadRuntimeVideoOptionsForShot(shotId);

  // SHOTPROMPT.SHOT.1 — the single shared composer, also called by
  // ShotGenerationPanel.tsx and the /map page: `@ImageN` follows this exact
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
    references: buildOrderedShotReferenceInputs({
      hasDynamicBatch,
      batchSelectedIds,
      availableImages,
      roleOverrides: batchRoleOverrides,
      noteOverrides: batchNoteOverrides,
      // SHOTPROMPT.REFS.1 — case 2/3: `@ImageN` follows actual per-node
      // assignment (never "everything selectable") when there is no batch.
      imageInputs: parsed.inputs,
      selectedImageByNodeId: args.selectedImageByNodeId,
    }),
    assetBibles: assignedRows.map((r) => ({
      assetId: r.assetId,
      assetName: r.assetName,
      assetType: r.assetType,
      visualIdentity: r.assetVisualIdentity,
      usageRules: r.assetUsageRules,
      forbiddenVariations: r.assetForbiddenVariations,
      // ASSET.PROMPTCARD.1 — same shared composer this ticket's own header
      // comment warns against re-diverging: without this line, a filled
      // Prompt Card would never reach `composeStoryboardShot`'s Subject part
      // for a queued generation, even though the preview surfaces already
      // select it (map page / ShotGenerationPanel).
      promptCard: r.assetPromptCard,
    })),
    sequenceContext: {
      title: sequence.title,
      summary: sequence.summary,
      mood: sequence.mood,
      locationHint: sequence.locationHint,
      narrativePurpose: sequence.narrativePurpose,
    },
    projectContext: { name: project.name, pitch: project.pitch, story: project.story },
    sources: { casting: true, references: true, assetBibles: true, sequenceContext: true, projectContext: true },
  });

  const [resolvedProjectStyle, shotLighting] = await Promise.all([
    resolveProjectStyleTextForComposition(projectId),
    resolveStoryboardLighting(sequenceId, [{ id: shotId, lighting: shot.lighting }]),
  ]);

  // SHOTPROMPT.STYLE.1 (Part A, regression fix) — the compositeur is now the
  // SOLE source of Style TEXT: it receives `projectStyle`/`projectStyleAvoid`
  // only when the user actually requested Style (`styleConsumer !== null`,
  // derived above from the real "Append Project Style" form choice), never
  // unconditionally. Previously this passed `projectStyleText` regardless of
  // that choice, so an unchecked box still got one "Style:" (from here) and
  // a checked box got two (this one, plus `prepareGenerationStyleSource`'s
  // own copy appended below).
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
    lighting: shotLighting.byShotId[shotId] ?? null,
    projectStyle: styleConsumer !== null ? resolvedProjectStyle.styleText : null,
    projectStyleAvoid: styleConsumer !== null ? resolvedProjectStyle.avoidText : null,
    // SHOT.NEGATIVE.1 — the plan's own exclusions, no resolver needed.
    negativeConstraints: shot.negativeConstraints ?? null,
  });

  let preparedStyle: PreparedGenerationStyleSource | null = null;
  // SHOTPROMPT.STYLE.1 (Part A) — `composedPrompt.text` above already
  // carries the Style segment, once, when requested. `prepareGenerationStyleSource`
  // is still resolved below so `hasEffectiveStyle` / `provenanceCandidate` /
  // `compiledSegment` keep feeding `styleActuallyInjected` and
  // `findEditedStyleTextMismatch` further down — but its own
  // `composedSuggestedPrompt` / `composeTextOverride` outputs (which would
  // compose that same segment a second time) are deliberately not used to
  // build the queued text any more.
  const effectiveSuggestedText = composedPrompt.text;
  const effectiveTextOverrideByNodeId = args.textOverrideByNodeId;

  if (styleConsumer !== null) {
    preparedStyle = await prepareGenerationStyleSource(styleConsumer, { kind: "shot", projectId, sequenceId, shotId }, composedPrompt.text);
    if (!preparedStyle.ok) {
      return { ok: false, error: preparedStyle.error };
    }
  }

  const built = buildGenerationPayload({
    workflowJson: workflow.workflowJson,
    inputs: parsed.inputs,
    suggestedText: effectiveSuggestedText,
    availableImages,
    availableVideos,
    textOverrideByNodeId: effectiveTextOverrideByNodeId,
    selectedImageByNodeId: args.selectedImageByNodeId,
    selectedVideoByNodeId: args.selectedVideoByNodeId,
    scalarOverrideByNodeId: args.scalarOverrideByNodeId,
    batchSelectedImages: resolvedBatchImages,
  });

  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  // GEN.ASSET.INPUT.ISOLATION.1 — see the identical check/comment in
  // src/actions/generation.ts's runAssetGeneration.
  const prePatchCheck = verifyPrePatchMutations({
    beforePatchJson: built.expansion.workflowJson,
    patchedJson: built.patch.patchedJson,
    patches: built.patch.patches,
  });
  if (!prePatchCheck.ok) {
    return { ok: false, error: prePatchCheck.error };
  }

  // REVISE (round 1, finding 5) — a video input can be MAPPED (preview
  // works, `Video Sources`/`Video Inputs` shows a real selector) but
  // ComfyUI generation must still be explicitly refused here: unlike
  // `/upload/image`, no confirmed ComfyUI endpoint exists to upload a local
  // video file for a `LoadVideo`-class node (`prepareComfyPayloadForQueue`
  // deliberately does not attempt one — see its own doc comment). Refusing
  // BEFORE any `generation_jobs` row is created means Generate never
  // silently queues a payload ComfyUI cannot actually run.
  if (built.displayMappings.some((m) => m.mappingKind === "video")) {
    return {
      ok: false,
      error:
        "This workflow requires a video input, but MikAI has no confirmed way to upload a video to ComfyUI yet. Generation is blocked for this workflow until that transport is confirmed.",
    };
  }

  const overrideUsed = args.patchedJsonOverride !== undefined;
  const finalPatchedJson: Record<string, unknown> = args.patchedJsonOverride ?? built.patch.patchedJson;

  if (Object.keys(finalPatchedJson).length === 0) {
    return { ok: false, error: "No compatible payload could be generated from this workflow and shot." };
  }

  // --- STYLE.1.E.SURFACES.1 (retake) — "actually injected" is derived
  // strictly from the canonical payload result (a real `kind === "text"`
  // patch entry — i.e. `buildGenerationPayload` found a patchable
  // text/prompt/string/value field on a real text-kind node), never merely
  // from "an effective Style existed". A workflow with zero text-kind
  // inputs, or whose only declared text input has no patchable field,
  // produces zero text patches here — Style was resolved but never touched
  // the queued payload, so neither the snapshot nor its provenance may
  // claim otherwise. ---
  const textPatches = built.patch.patches.filter((p) => p.kind === "text");
  const preparedStyleOk = preparedStyle !== null && preparedStyle.ok ? preparedStyle : null;
  const styleActuallyInjected = preparedStyleOk !== null && preparedStyleOk.hasEffectiveStyle && textPatches.length > 0;

  if (overrideUsed && preparedStyleOk !== null && preparedStyleOk.hasEffectiveStyle && textPatches.length > 0) {
    const mismatch = findEditedStyleTextMismatch(textPatches, finalPatchedJson);
    if (mismatch) return { ok: false, error: mismatch };
  }

  // GEN.ASSET.INPUT.ISOLATION.1 (Round 2) — `promptText` must never
  // represent a compiled-but-never-injected Shot prompt (FB-20260724-001),
  // AND must never represent a stale computed string once an Advanced
  // Payload Override has changed/restored the real queued text. Read back
  // the actual value(s) sitting at each real text patch's exact location in
  // `finalPatchedJson` (the payload actually queued) instead — see
  // `deriveQueuedPromptText`'s own doc comment for the full contract.
  const promptTextForSnapshot = deriveQueuedPromptText(textPatches, finalPatchedJson);

  // --- 5b. Comfy Cloud preflight (COMFY.PROVIDER.1) — before any job row is
  //         created, never a silent paid submission. No-op for local. ---
  if (comfySettings.provider === "cloud") {
    const gate = await checkCloudPreflightGate(finalPatchedJson, comfySettings.cloudApiKey, args.confirmPartnerNodeCost);
    if (gate) return gate;
  }

  // --- 6. Create generation_jobs row (pending) ---
  if (!isSingleGenerationTarget({ shotId, assetId: null, sequenceId: null })) {
    return { ok: false, error: "Invalid generation job target." };
  }

  const clientId = `mikai-${shotId}-${workflowId}-${Date.now()}`;
  const now = new Date().toISOString();

  const [inserted] = await db
    .insert(generationJobs)
    .values({
      shotId,
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

  // --- 7. Prepare payload — upload local images to ComfyUI. Its output
  //        (prepared.workflow) is the *sole* input to queueComfyPrompt
  //        below — no second, divergent recomputation happens after this. ---
  try {
    await db.update(generationJobs).set({ status: "uploading", updatedAt: new Date().toISOString() }).where(eq(generationJobs.id, jobId));

    const prepared = await prepareComfyPayloadForQueue(
      finalPatchedJson,
      comfySettings.provider === "cloud" ? { provider: "cloud", cloudApiKey: comfySettings.cloudApiKey } : { provider: "local" }
    );

    // GEN.ASSET.INPUT.ISOLATION.1 — see the identical check/comment in
    // src/actions/generation.ts's runAssetGeneration.
    const postUploadCheck = verifyPostUploadMutations({
      prePatchedJson: finalPatchedJson,
      uploadedJson: prepared.workflow,
      uploadedImages: prepared.uploadedImages,
    });
    if (!postUploadCheck.ok) {
      await markJobFailed(jobId, postUploadCheck.error);
      return { ok: false, error: postUploadCheck.error };
    }

    // --- 7a. Snapshot (GEN.SEEDANCE.1) — created before queueing, from the
    //        exact payload about to be sent, so it stays accurate even if
    //        the queue call itself fails or the library workflow changes later. ---
    const snapshot: GenerationSnapshot = {
      workflowId,
      contextType: "shot",
      contextId: shotId,
      createdAt: new Date().toISOString(),
      selections: {
        selectedImageByNodeId: args.selectedImageByNodeId ?? {},
        scalarOverrideByNodeId: args.scalarOverrideByNodeId ?? {},
        textOverrideByNodeId: args.textOverrideByNodeId ?? {},
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
      ...(promptTextForSnapshot !== undefined ? { promptText: promptTextForSnapshot } : {}),
      overrideUsed,
      // REVISE (GEN.SEEDANCE.1) — prepared.warnings (e.g. "local images were
      // uploaded to ComfyUI and LoadImage inputs rewritten") were previously
      // dropped; the snapshot must reflect every warning produced across the
      // whole pipeline, not just the pre-upload patch step.
      warnings: [...new Set([...built.patch.warnings, ...prepared.warnings])],
      uploadedImages: prepared.uploadedImages,
      queuedWorkflow: prepared.workflow,
      ...(args.cameraLabProvenance ? { cameraLabProvenance: args.cameraLabProvenance } : {}),
      // STYLE.1.E.SURFACES.1 — recorded only when a non-empty Style was
      // actually injected into at least one queued text input; never a
      // provenance claim for an unused/empty Style contribution.
      ...(styleActuallyInjected && preparedStyleOk?.provenanceCandidate ? { styleProvenance: preparedStyleOk.provenanceCandidate } : {}),
      // GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — see the field's own doc comment
      // in generationSnapshot.ts for why this must be distinct from
      // `styleProvenance`'s presence.
      ...(args.appendProjectStyleRequested !== undefined ? { appendProjectStyle: args.appendProjectStyleRequested } : {}),
    };
    await db
      .update(generationJobs)
      .set({ payloadSnapshot: serializeGenerationSnapshot(snapshot), updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    // --- 8. Queue prompt ---
    await maybeUnloadOllamaBeforeComfy();
    const queued =
      comfySettings.provider === "cloud"
        ? await queueCloudPrompt({ workflow: prepared.workflow, cloudApiKey: comfySettings.cloudApiKey, partnerNodeApiKey: comfySettings.apiKey })
        : await queueComfyPrompt({ workflow: prepared.workflow, clientId });

    // --- 9. Update job → queued ---
    const nodeErrorSummary = summarizeComfyNodeErrors(queued.node_errors);
    await db
      .update(generationJobs)
      .set({ status: "queued", promptId: queued.prompt_id, errorMessage: nodeErrorSummary, updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    return { ok: true, jobId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during generation.";
    await markJobFailed(jobId, message);
    return { ok: false, error: message };
  }
}
