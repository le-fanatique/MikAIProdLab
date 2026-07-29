import "server-only";

// ---------------------------------------------------------------------------
// runExistingLookTest.ts — STYLE.1.G.CORE.1 (Lot A.4)
//
// Queues a generation job for an EXISTING, pre-run Look Test definition.
// This is the second half of the "duplicate -> edit Style/settings -> run"
// contract: `duplicateLookTestAction` creates a mutable pre-run definition,
// then the caller edits Style source and/or references, then calls this
// action to queue the job against that already-stored definition.
//
// Reuses the exact same canonical runtime as `runLookTestGenerationCore`:
// buildGenerationPayload, prepareComfyPayloadForQueue, queueComfyPrompt,
// queueCloudPrompt, checkCloudPreflightGate, markJobFailed.  No second
// runner, poller, client or payload format.
//
// Invariants:
// - the Look Test must already exist and belong to this Project;
// - the Look Test must NOT already have a generation job (a pre-run
//   definition only; never re-queue a historical test);
// - Style source and references are re-resolved from their stored
//   provenance so the snapshot/compiledText pair can be refreshed to the
//   current draft state before queueing, while the original immutable
//   test definition rows remain unchanged.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { lookTests, lookTestReferences, generationJobs } from "@/db/schema";
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
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import { isValidId, isValidLookWorkflowInputSelections, type LookStyleSourceRequest, type LookWorkflowInputSelections } from "./contracts";
import { comfyWorkflows } from "@/db/schema";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";

class LookTestGoneError extends Error {}
class LookTestAlreadyQueuedError extends Error {}

export type RunExistingLookTestArgs = {
  projectId: number;
  lookTestId: number;
  /** Updated Style source — the caller may have changed the selection since duplication. */
  styleSource: LookStyleSourceRequest;
  /** Updated reference selection — the caller may have changed the selection since duplication. */
  referenceImageIds?: unknown;
  /** STYLE.1.G.CORE.1 Round 3 — same explicit, validated node mapping contract as `runLookTestGenerationCore`. */
  workflowInputSelections?: LookWorkflowInputSelections;
  confirmPartnerNodeCost?: boolean;
};

export async function runExistingLookTestCore(args: RunExistingLookTestArgs): Promise<RunWorkflowGenerationResult & { lookTestId?: number }> {
  if (!isValidId(args.projectId)) return { ok: false, error: "Invalid Project id." };
  if (!isValidId(args.lookTestId)) return { ok: false, error: "Invalid Look Test id." };
  if (!isValidLookWorkflowInputSelections(args.workflowInputSelections)) return { ok: false, error: "Invalid workflow input selections." };

  // --- 1. Load the existing pre-run Look Test ---
  const [test] = await db.select().from(lookTests).where(eq(lookTests.id, args.lookTestId));
  if (!test || test.projectId !== args.projectId) return { ok: false, error: "Look Test not found." };

  // A pre-run definition must not already have a job — this action only
  // fires the first generation for a duplicated definition.
  const [existingJob] = await db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(eq(generationJobs.lookTestId, args.lookTestId));
  if (existingJob) return { ok: false, error: "This Look Test already has a generation job. Duplicate it again to create a new pre-run definition.", lookTestId: args.lookTestId };

  // --- 2. Load the workflow ---
  const [workflow] = await db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, test.workflowId));
  if (!workflow) return { ok: false, error: "Workflow not found." };
  if (workflow.kind !== test.mode) {
    return { ok: false, error: `Workflow kind mismatch: this test expects ${test.mode}, but the workflow is ${workflow.kind}.` };
  }

  // --- 3. Re-resolve Style source and references to current state ---
  const comfySettings = await getComfySettings();
  if (comfySettings.provider === "cloud" && !comfySettings.hasCloudApiKey) {
    return { ok: false, error: "Comfy Cloud is selected but no Comfy Cloud API key is configured." };
  }

  const styleResolved = await resolveLookStyleSource(args.projectId, args.styleSource);
  if (!styleResolved.ok) return { ok: false, error: styleResolved.error };

  const referencesResolved = await resolveLookReferences(args.projectId, args.referenceImageIds);
  if (!referencesResolved.ok) return { ok: false, error: referencesResolved.error };

  if (compileStyleSnapshot(styleResolved.result.snapshot) !== styleResolved.result.compiledText) {
    return { ok: false, error: "Resolved Style content is inconsistent — refusing to queue this test." };
  }

  const compiled = compileLookPrompt({
    subject: test.subject,
    action: test.action,
    styleCompiledText: styleResolved.result.compiledText,
    references: referencesResolved.references,
  });

  // --- 4. Parse workflow + build canonical payload ---
  const parsed = parseComfyWorkflow(workflow.workflowJson);
  if (parsed === null) return { ok: false, error: "Workflow JSON could not be parsed." };

  const lookRefImages: RuntimeImageOption[] = referencesResolved.references.map((ref) => ({
    id: `look-ref-${ref.id}`,
    source: "board" as const,
    imagePath: ref.imagePath,
    label: ref.label ?? "Reference",
    role: null,
  }));

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
    return { ok: false, error: "This workflow requires a video input, but MikAI has no confirmed way to upload a video to ComfyUI yet." };
  }

  const textPatches = built.patch.patches.filter((p) => p.kind === "text");
  if (textPatches.length === 0) {
    return { ok: false, error: "This workflow has no compatible text input to receive the Look Development prompt." };
  }

  const finalPatchedJson = built.patch.patchedJson;
  if (Object.keys(finalPatchedJson).length === 0) {
    return { ok: false, error: "No compatible payload could be generated from this workflow." };
  }

  // --- 5. Cloud preflight ---
  if (comfySettings.provider === "cloud") {
    const gate = await checkCloudPreflightGate(finalPatchedJson, comfySettings.cloudApiKey, args.confirmPartnerNodeCost);
    if (gate) return gate;
  }

  // --- 6. Atomic: recheck ownership/existence + no-job, update Style
  //     snapshot, replace refs, insert job — ALL inside one synchronous
  //     transaction. There is no UNIQUE constraint on
  //     generation_jobs.look_test_id (it is a plain nullable FK — a Look
  //     Test legitimately gets multiple jobs over retries/history), so the
  //     "run-once for a pre-run definition" rule is enforced purely by this
  //     transaction's own recheck: better-sqlite3 transactions run fully
  //     synchronously with no `await` inside their callback, so two
  //     concurrent callers that both observed "no job" before their
  //     transaction started are still fully serialized here — whichever
  //     commits first wins, and the second one's recheck of the SAME
  //     synchronous read now sees that job and throws, rolling back its own
  //     Style/reference mutation entirely (SQLite transactions are all-or-
  //     nothing). A raw SQLite/driver error is never returned to the
  //     caller — only this module's own typed, sanitized messages are.
  const now = new Date().toISOString();
  const lookTestId = test.id;
  let jobId: number;
  let clientId: string;
  try {
    const result = db.transaction((tx) => {
      // Re-verify ownership/existence AND no job exists — a concurrent
      // caller may have deleted the Project/test, or already won the race
      // to queue the first job for this pre-run definition.
      const [currentTest] = tx.select({ id: lookTests.id, projectId: lookTests.projectId }).from(lookTests).where(eq(lookTests.id, lookTestId)).all();
      if (!currentTest || currentTest.projectId !== args.projectId) {
        throw new LookTestGoneError("This Look Test no longer exists.");
      }
      const [existingJob] = tx
        .select({ id: generationJobs.id })
        .from(generationJobs)
        .where(eq(generationJobs.lookTestId, lookTestId))
        .all();
      if (existingJob) {
        throw new LookTestAlreadyQueuedError("This Look Test already has a generation job. Duplicate it again to create a new pre-run definition.");
      }

      // Update Style source snapshot.
      tx.update(lookTests)
        .set({
          styleSourceKind: styleResolved.result.styleSourceKind,
          styleDraftRevision: styleResolved.result.styleDraftRevision,
          styleVersionId: styleResolved.result.styleVersionId,
          styleSnapshot: JSON.stringify(styleResolved.result.snapshot),
          styleCompiledText: styleResolved.result.compiledText,
          updatedAt: now,
        })
        .where(eq(lookTests.id, lookTestId))
        .run();

      // Replace references.
      tx.delete(lookTestReferences).where(eq(lookTestReferences.lookTestId, lookTestId)).run();
      if (referencesResolved.references.length > 0) {
        tx.insert(lookTestReferences)
          .values(
            referencesResolved.references.map((ref, index) => ({
              lookTestId,
              referenceImageId: ref.id,
              orderIndex: index,
              createdAt: now,
            }))
          )
          .run();
      }

      // Insert the generation job.
      if (!isSingleGenerationTarget({ shotId: null, assetId: null, sequenceId: null, lookTestId })) {
        throw new Error("Invalid generation job target.");
      }
      const generatedClientId = `mikai-look-${lookTestId}-${test.workflowId}-${Date.now()}`;
      const insertedJobs = tx
        .insert(generationJobs)
        .values({
          lookTestId,
          workflowId: test.workflowId,
          status: "pending",
          clientId: generatedClientId,
          runtimeProvider: comfySettings.provider,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: generationJobs.id })
        .all();
      return { jobId: insertedJobs[0].id, clientId: generatedClientId };
    });
    jobId = result.jobId;
    clientId = result.clientId;
  } catch (e) {
    if (e instanceof LookTestGoneError || e instanceof LookTestAlreadyQueuedError) {
      return { ok: false, error: e.message, lookTestId };
    }
    // Never surface a raw SQLite/driver error (e.g. SQLITE_BUSY under real
    // contention) to the caller — log it server-side and return a fixed,
    // sanitized message instead.
    console.error(`runExistingLookTestCore(lookTestId=${lookTestId}): transaction failed`, e);
    return { ok: false, error: "A database error occurred while queueing this Look Test. Please try again.", lookTestId };
  }

  // --- 8. Prepare payload, snapshot, queue ---
  try {
    await db.update(generationJobs).set({ status: "uploading", updatedAt: new Date().toISOString() }).where(eq(generationJobs.id, jobId));

    const prepared = await prepareComfyPayloadForQueue(
      finalPatchedJson,
      comfySettings.provider === "cloud" ? { provider: "cloud", cloudApiKey: comfySettings.cloudApiKey } : { provider: "local" }
    );

    const snapshot: GenerationSnapshot = {
      workflowId: test.workflowId,
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