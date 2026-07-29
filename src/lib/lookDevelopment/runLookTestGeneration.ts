import "server-only";

// ---------------------------------------------------------------------------
// runLookTestGeneration.ts — STYLE.1.G.CORE.1 (Scope D)
//
// Creates a Look Test row and queues its ComfyUI job — the Look Development
// mirror of src/lib/comfy/runShotGeneration.ts's `runShotGenerationCore`,
// reusing the EXACT same canonical runtime: buildGenerationPayload,
// prepareComfyPayloadForQueue, queueComfyPrompt/queueCloudPrompt,
// checkCloudPreflightGate, markJobFailed. No second runner, poller, client
// or payload-snapshot format is created here.
//
// Everything that can be refused (invalid input, incompatible workflow,
// refused Style source, invalid references, Cloud preflight) is refused
// BEFORE any DB row is created — a Look Test row only ever exists once its
// full definition is known-valid.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, comfyWorkflows, lookTests, lookTestReferences, generationJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { buildGenerationPayload, detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import { prepareComfyPayloadForQueue } from "@/lib/comfy/prepareComfyPayload";
import { queueComfyPrompt } from "@/lib/comfy/comfyServerClient";
import { queueCloudPrompt } from "@/lib/comfy/comfyCloudClient";
import { getComfySettings } from "@/lib/settings";
import { maybeUnloadOllamaBeforeComfy } from "@/lib/vramManager";
import { serializeGenerationSnapshot, type GenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import { isSingleGenerationTarget } from "@/lib/comfy/generationTarget";
import { checkCloudPreflightGate, markJobFailed, summarizeComfyNodeErrors, type RunWorkflowGenerationResult } from "@/lib/comfy/generationActionHelpers";
import { resolveLookStyleSource } from "./resolveLookStyleSource";
import { resolveLookReferences } from "./resolveLookReferences";
import { compileLookPrompt } from "./compileLookPrompt";
import { resolveLookWorkflowInputSelections, verifyLookWorkflowOverridesApplied } from "./resolveWorkflowInputSelections";
import {
  isLookTestSource,
  isLookMode,
  isBoundedNonEmptyText,
  isValidId,
  isValidLookStyleSourceRequest,
  isValidLookWorkflowInputSelections,
  MAX_SUBJECT_LENGTH,
  MAX_ACTION_LENGTH,
  type LookTestSource,
  type LookMode,
  type LookStyleSourceRequest,
  type LookWorkflowInputSelections,
} from "./contracts";
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";

export type CreateLookTestArgs = {
  projectId: number;
  source: LookTestSource;
  mode: LookMode;
  subject: string;
  action: string;
  styleSource: LookStyleSourceRequest;
  referenceImageIds?: unknown;
  workflowId: number;
  /**
   * STYLE.1.G.CORE.1 Round 3 — explicit, server-validated node mapping.
   * Every selected reference must be reachable through this contract or the
   * request is refused; there is no more implicit "zip references onto
   * image nodes in order" fallback.
   */
  workflowInputSelections?: LookWorkflowInputSelections;
  confirmPartnerNodeCost?: boolean;
};

export async function runLookTestGenerationCore(args: CreateLookTestArgs): Promise<RunWorkflowGenerationResult & { lookTestId?: number }> {
  // --- 1. Validate primitive input shapes, before any DB access ---
  if (!isValidId(args.projectId)) return { ok: false, error: "Invalid Project id." };
  if (!isLookTestSource(args.source)) return { ok: false, error: "Invalid test source." };
  if (!isLookMode(args.mode)) return { ok: false, error: "Invalid test mode." };
  if (!isBoundedNonEmptyText(args.subject, MAX_SUBJECT_LENGTH)) return { ok: false, error: "Subject is required and must be reasonably short." };
  if (!isBoundedNonEmptyText(args.action, MAX_ACTION_LENGTH)) return { ok: false, error: "Action is required and must be reasonably short." };
  if (!isValidLookStyleSourceRequest(args.styleSource)) return { ok: false, error: "Invalid Style source." };
  if (!isValidId(args.workflowId)) return { ok: false, error: "Invalid workflow id." };
  if (!isValidLookWorkflowInputSelections(args.workflowInputSelections)) return { ok: false, error: "Invalid workflow input selections." };

  const comfySettings = await getComfySettings();
  if (comfySettings.provider === "cloud" && !comfySettings.hasCloudApiKey) {
    return { ok: false, error: "Comfy Cloud is selected but no Comfy Cloud API key is configured." };
  }

  // --- 2. Ownership / existence ---
  const [project] = await db.select().from(projects).where(eq(projects.id, args.projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, args.workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };
  if (workflow.kind !== args.mode) {
    return { ok: false, error: `This workflow is a ${workflow.kind} workflow, incompatible with the '${args.mode}' Look test mode.` };
  }

  // --- 3. Resolve Style source and references explicitly ---
  const styleResolved = await resolveLookStyleSource(args.projectId, args.styleSource);
  if (!styleResolved.ok) return { ok: false, error: styleResolved.error };

  const referencesResolved = await resolveLookReferences(args.projectId, args.referenceImageIds);
  if (!referencesResolved.ok) return { ok: false, error: referencesResolved.error };

  // Defensive: the resolver's own compiledText must match a fresh
  // recompilation of the snapshot it returned — never trust a mismatched
  // pair onto the immutable look_tests row.
  if (compileStyleSnapshot(styleResolved.result.snapshot) !== styleResolved.result.compiledText) {
    return { ok: false, error: "Resolved Style content is inconsistent — refusing to create this test." };
  }

  const compiled = compileLookPrompt({
    subject: args.subject,
    action: args.action,
    styleCompiledText: styleResolved.result.compiledText,
    references: referencesResolved.references,
  });

  // --- 4. Parse workflow + build canonical payload ---
  //     Map resolved Project Style references to RuntimeImageOption[]
  //     so they reach the workflow's real image inputs.
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null) return { ok: false, error: "Workflow JSON could not be parsed. Check the workflow file." };

  const lookRefImages: RuntimeImageOption[] = referencesResolved.references.map((ref) => ({
    id: `look-ref-${ref.id}`,
    source: "board" as const,
    imagePath: ref.imagePath,
    label: ref.label ?? "Reference",
    role: null,
  }));

  // Explicit, validated node mapping — every selected reference must be
  // reachable through the caller's contract or the request is refused.
  // No implicit "zip references onto image nodes in order" fallback.
  const batchInfo = detectDynamicBatchUiInfo(workflow.workflowJson);
  if (batchInfo.kind === "error") return { ok: false, error: batchInfo.message };
  const inputSelections = resolveLookWorkflowInputSelections({
    inputs: parsed.inputs,
    batchInfo,
    references: referencesResolved.references,
    selections: args.workflowInputSelections ?? {},
  });
  if (!inputSelections.ok) return { ok: false, error: inputSelections.error };
  const { selectedImageByNodeId, batchSelectedImages, textOverrideByNodeId, scalarOverrideByNodeId } = inputSelections.result;

  const built = buildGenerationPayload({
    workflowJson: workflow.workflowJson,
    inputs: parsed.inputs,
    suggestedText: compiled.prompt,
    availableImages: lookRefImages,
    selectedImageByNodeId,
    batchSelectedImages,
    textOverrideByNodeId,
    scalarOverrideByNodeId,
  });
  if (!built.ok) return { ok: false, error: built.error };

  const overridesApplied = verifyLookWorkflowOverridesApplied({
    patches: built.patch.patches,
    textOverrideByNodeId,
    scalarOverrideByNodeId,
  });
  if (!overridesApplied.ok) return { ok: false, error: overridesApplied.error };

  if (built.displayMappings.some((m) => m.mappingKind === "video")) {
    return {
      ok: false,
      error: "This workflow requires a video input, but MikAI has no confirmed way to upload a video to ComfyUI yet. Look Development is blocked for this workflow until that transport is confirmed.",
    };
  }

  const textPatches = built.patch.patches.filter((p) => p.kind === "text");
  if (textPatches.length === 0) {
    return { ok: false, error: "This workflow has no compatible text input to receive the Look Development prompt." };
  }

  const finalPatchedJson = built.patch.patchedJson;
  if (Object.keys(finalPatchedJson).length === 0) {
    return { ok: false, error: "No compatible payload could be generated from this workflow." };
  }

  // --- 5. Cloud preflight — before any row is created ---
  if (comfySettings.provider === "cloud") {
    const gate = await checkCloudPreflightGate(finalPatchedJson, comfySettings.cloudApiKey, args.confirmPartnerNodeCost);
    if (gate) return gate;
  }

  // --- 6. Create the Look Test row, its references and the generation job
  //     inside one atomic transaction. If any insert fails, the whole
  //     batch is rolled back — no partial immutable test, no orphaned
  //     reference links, no dangling pending job.
  const now = new Date().toISOString();
  let lookTestId: number;
  let jobId: number;
  let clientId: string;
  try {
    const result = db.transaction((tx) => {
      const insertedTests = tx
        .insert(lookTests)
        .values({
          projectId: args.projectId,
          source: args.source,
          mode: args.mode,
          subject: args.subject.trim(),
          action: args.action.trim(),
          styleSourceKind: styleResolved.result.styleSourceKind,
          styleDraftRevision: styleResolved.result.styleDraftRevision,
          styleVersionId: styleResolved.result.styleVersionId,
          styleSnapshot: JSON.stringify(styleResolved.result.snapshot),
          styleCompiledText: styleResolved.result.compiledText,
          workflowId: args.workflowId,
          workflowKind: workflow.kind as LookMode,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: lookTests.id })
        .all();
      const insertedTest = insertedTests[0];

      if (referencesResolved.references.length > 0) {
        tx.insert(lookTestReferences).values(
          referencesResolved.references.map((ref, index) => ({
            lookTestId: insertedTest.id,
            referenceImageId: ref.id,
            orderIndex: index,
            createdAt: now,
          }))
        ).run();
      }

      if (!isSingleGenerationTarget({ shotId: null, assetId: null, sequenceId: null, lookTestId: insertedTest.id })) {
        throw new Error("Invalid generation job target.");
      }

      const generatedClientId = `mikai-look-${insertedTest.id}-${args.workflowId}-${Date.now()}`;
      const insertedJobs = tx
        .insert(generationJobs)
        .values({
          lookTestId: insertedTest.id,
          workflowId: args.workflowId,
          status: "pending",
          clientId: generatedClientId,
          runtimeProvider: comfySettings.provider,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: generationJobs.id })
        .all();
      const insertedJob = insertedJobs[0];

      return { lookTestId: insertedTest.id, jobId: insertedJob.id, clientId: generatedClientId };
    });
    lookTestId = result.lookTestId;
    jobId = result.jobId;
    clientId = result.clientId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create Look Test and job." };
  }

  // --- 8. Prepare payload, snapshot, queue — identical shape to runShotGenerationCore ---
  try {
    await db.update(generationJobs).set({ status: "uploading", updatedAt: new Date().toISOString() }).where(eq(generationJobs.id, jobId));

    const prepared = await prepareComfyPayloadForQueue(
      finalPatchedJson,
      comfySettings.provider === "cloud" ? { provider: "cloud", cloudApiKey: comfySettings.cloudApiKey } : { provider: "local" }
    );

    const snapshot: GenerationSnapshot = {
      workflowId: args.workflowId,
      contextType: "look-test",
      contextId: lookTestId,
      createdAt: new Date().toISOString(),
      selections: {
        selectedImageByNodeId,
        scalarOverrideByNodeId,
        textOverrideByNodeId,
        batchSelectedImageIds: batchSelectedImages.map((img) => img.id),
      },
      dynamicBatch: {
        active: built.expansion.expandedNodeIds.length > 0,
        batchNodeId: built.expansion.batchNodeId || null,
        templateChainNodeIds: built.expansion.templateChainNodeIds,
        expandedNodeIds: built.expansion.expandedNodeIds,
        batchInputKeys: built.expansion.batchInputKeys,
        selectedImageCount: built.expansion.preview.selectedImageCount,
        clonedNodeCount: built.expansion.preview.clonedNodeCount,
      },
      promptText: compiled.prompt,
      overrideUsed: Object.keys(textOverrideByNodeId).length > 0 || Object.keys(scalarOverrideByNodeId).length > 0,
      warnings: [...new Set([...built.patch.warnings, ...prepared.warnings])],
      uploadedImages: prepared.uploadedImages,
      queuedWorkflow: prepared.workflow,
    };
    await db.update(generationJobs).set({ payloadSnapshot: serializeGenerationSnapshot(snapshot), updatedAt: new Date().toISOString() }).where(eq(generationJobs.id, jobId));

    await maybeUnloadOllamaBeforeComfy();
    const queued =
      comfySettings.provider === "cloud"
        ? await queueCloudPrompt({ workflow: prepared.workflow, cloudApiKey: comfySettings.cloudApiKey, partnerNodeApiKey: comfySettings.apiKey })
        : await queueComfyPrompt({ workflow: prepared.workflow, clientId });

    const nodeErrorSummary = summarizeComfyNodeErrors(queued.node_errors);
    await db
      .update(generationJobs)
      .set({ status: "queued", promptId: queued.prompt_id, errorMessage: nodeErrorSummary, updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId));

    return { ok: true, jobId, lookTestId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during generation.";
    await markJobFailed(jobId, message);
    return { ok: false, error: message, lookTestId };
  }
}
