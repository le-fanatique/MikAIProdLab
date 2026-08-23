"use server";

// ---------------------------------------------------------------------------
// lookDevelopment.ts — STYLE.1.G.CORE.1
//
// Server Actions for the Look Development Bench CORE: create+queue a test,
// list/inspect, publish a done job's output, update review notes,
// candidate/rejected toggle, mark-as-Look-Target (with project-scoped
// uniqueness), duplicate, delete a result. Never creates/mutates an Asset,
// Shot or Sequence; never publishes the Project Style.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { lookTests, lookTestReferences, lookTestResults, generationJobs } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { runLookTestGenerationCore } from "@/lib/lookDevelopment/runLookTestGeneration";
import { runExistingLookTestCore, type RunExistingLookTestArgs } from "@/lib/lookDevelopment/runExistingLookTest";
import { ensureLookResultPublished } from "@/lib/lookDevelopment/publishLookResult";
import { deleteLookResult as deleteLookResultCore } from "@/lib/lookDevelopment/deleteLookResult";
import {
  isValidId,
  isBoundedOptionalText,
  MAX_NOTES_LENGTH,
  type LookResultStatus,
  type LookStyleSourceRequest,
  type LookTestSource,
  type LookMode,
  type LookWorkflowInputSelections,
} from "@/lib/lookDevelopment/contracts";

// ---------------------------------------------------------------------------
// Create + queue
// ---------------------------------------------------------------------------

export type CreateLookTestInput = {
  projectId: number;
  source: LookTestSource;
  mode: LookMode;
  subject: string;
  action: string;
  styleSource: LookStyleSourceRequest;
  referenceImageIds?: number[];
  workflowId: number;
  workflowInputSelections?: LookWorkflowInputSelections;
  confirmPartnerNodeCost?: boolean;
};

export async function createLookTestAction(input: CreateLookTestInput) {
  return runLookTestGenerationCore(input);
}

// ---------------------------------------------------------------------------
// Run an existing pre-run Look Test (duplicate -> edit -> run contract)
// ---------------------------------------------------------------------------

export type RunExistingLookTestInput = {
  projectId: number;
  lookTestId: number;
  styleSource: LookStyleSourceRequest;
  referenceImageIds?: unknown;
  workflowInputSelections?: LookWorkflowInputSelections;
  confirmPartnerNodeCost?: boolean;
};

export async function runExistingLookTestAction(input: RunExistingLookTestInput) {
  if (!isValidId(input.projectId)) return { ok: false as const, error: "Invalid Project id." };
  if (!isValidId(input.lookTestId)) return { ok: false as const, error: "Invalid Look Test id." };
  return runExistingLookTestCore(input as RunExistingLookTestArgs);
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type LookTestListItem = {
  id: number;
  source: LookTestSource;
  mode: LookMode;
  subject: string;
  action: string;
  // WF.DETACH.1 — null once this test's workflow has been deleted
  // (detached, never cascaded). `workflowName` then carries the name
  // stamped at deletion time (see deleteComfyWorkflow), for display only.
  workflowId: number | null;
  workflowName: string | null;
  createdAt: string;
  job: { id: number; status: string } | null;
  result: { id: number; status: LookResultStatus; filePath: string } | null;
};

export type ListLookTestsResult = { ok: true; tests: LookTestListItem[] } | { ok: false; error: string };

export async function listLookTestsAction(projectId: number): Promise<ListLookTestsResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid Project id." };

  const tests = await db.select().from(lookTests).where(eq(lookTests.projectId, projectId)).orderBy(desc(lookTests.createdAt));
  const items: LookTestListItem[] = [];
  for (const test of tests) {
    const [job] = await db
      .select({ id: generationJobs.id, status: generationJobs.status })
      .from(generationJobs)
      .where(eq(generationJobs.lookTestId, test.id));
    const [result] = await db
      .select({ id: lookTestResults.id, status: lookTestResults.status, filePath: lookTestResults.filePath })
      .from(lookTestResults)
      .where(eq(lookTestResults.lookTestId, test.id));
    items.push({
      id: test.id,
      source: test.source as LookTestSource,
      mode: test.mode as LookMode,
      subject: test.subject,
      action: test.action,
      workflowId: test.workflowId,
      workflowName: test.workflowName,
      createdAt: test.createdAt,
      job: job ?? null,
      result: result ? { id: result.id, status: result.status as LookResultStatus, filePath: result.filePath } : null,
    });
  }
  return { ok: true, tests: items };
}

export type GetLookTestResult =
  | {
      ok: true;
      test: typeof lookTests.$inferSelect;
      references: (typeof lookTestReferences.$inferSelect)[];
      job: typeof generationJobs.$inferSelect | null;
      result: typeof lookTestResults.$inferSelect | null;
    }
  | { ok: false; error: string };

export async function getLookTestAction(projectId: number, lookTestId: number): Promise<GetLookTestResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid Project id." };
  if (!isValidId(lookTestId)) return { ok: false, error: "Invalid Look Test id." };

  const [test] = await db.select().from(lookTests).where(eq(lookTests.id, lookTestId));
  if (!test || test.projectId !== projectId) return { ok: false, error: "Look Test not found." };

  const references = await db
    .select()
    .from(lookTestReferences)
    .where(eq(lookTestReferences.lookTestId, lookTestId))
    .orderBy(lookTestReferences.orderIndex);
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.lookTestId, lookTestId));
  const [result] = await db.select().from(lookTestResults).where(eq(lookTestResults.lookTestId, lookTestId));

  return { ok: true, test, references, job: job ?? null, result: result ?? null };
}

// ---------------------------------------------------------------------------
// Publish a done job's output into a durable result
// ---------------------------------------------------------------------------

export async function publishLookResultAction(projectId: number, lookTestId: number, jobId: number) {
  if (!isValidId(projectId)) return { ok: false as const, error: "Invalid Project id." };
  if (!isValidId(lookTestId)) return { ok: false as const, error: "Invalid Look Test id." };
  if (!isValidId(jobId)) return { ok: false as const, error: "Invalid job id." };
  return ensureLookResultPublished(jobId, lookTestId, projectId);
}

// ---------------------------------------------------------------------------
// Review: notes, candidate/rejected, mark as Look Target
// ---------------------------------------------------------------------------

export type LookResultMutationResult = { ok: true } | { ok: false; error: string };

export async function updateLookResultNotesAction(projectId: number, resultId: number, notes: string | null): Promise<LookResultMutationResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid Project id." };
  if (!isValidId(resultId)) return { ok: false, error: "Invalid result id." };
  if (!isBoundedOptionalText(notes, MAX_NOTES_LENGTH)) return { ok: false, error: "Notes are too long." };

  const [existing] = await db.select({ projectId: lookTestResults.projectId }).from(lookTestResults).where(eq(lookTestResults.id, resultId));
  if (!existing || existing.projectId !== projectId) return { ok: false, error: "Result not found." };

  await db
    .update(lookTestResults)
    .set({ notes: notes?.trim() || null, updatedAt: new Date().toISOString() })
    .where(eq(lookTestResults.id, resultId));
  return { ok: true };
}

/** `status` here is only ever "candidate" or "rejected" — Look Target has its own dedicated action below, since it carries a project-scoped uniqueness rule the other two states do not. */
export async function setLookResultStatusAction(projectId: number, resultId: number, status: "candidate" | "rejected"): Promise<LookResultMutationResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid Project id." };
  if (!isValidId(resultId)) return { ok: false, error: "Invalid result id." };
  if (status !== "candidate" && status !== "rejected") return { ok: false, error: "Invalid status." };

  const [existing] = await db.select({ projectId: lookTestResults.projectId }).from(lookTestResults).where(eq(lookTestResults.id, resultId));
  if (!existing || existing.projectId !== projectId) return { ok: false, error: "Result not found." };

  await db.update(lookTestResults).set({ status, updatedAt: new Date().toISOString() }).where(eq(lookTestResults.id, resultId));
  return { ok: true };
}

/**
 * At most one `look-target` result per Project — enforced transactionally
 * (clear every other look-target for this Project, then set this one),
 * never a DB constraint. better-sqlite3 transactions run fully
 * synchronously with no `await` inside their callback, so two concurrent
 * "mark as target" calls are fully serialized: the second one to actually
 * run always clears whatever the first just set, leaving exactly one
 * project-wide winner — the one that committed last, deterministically.
 */
export async function markLookResultAsTargetAction(projectId: number, resultId: number): Promise<LookResultMutationResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid Project id." };
  if (!isValidId(resultId)) return { ok: false, error: "Invalid result id." };

  const [existing] = await db.select({ projectId: lookTestResults.projectId }).from(lookTestResults).where(eq(lookTestResults.id, resultId));
  if (!existing || existing.projectId !== projectId) return { ok: false, error: "Result not found." };

  const now = new Date().toISOString();
  try {
    db.transaction((tx) => {
      tx.update(lookTestResults)
        .set({ status: "candidate", updatedAt: now })
        .where(and(eq(lookTestResults.projectId, projectId), eq(lookTestResults.status, "look-target")))
        .run();
      tx.update(lookTestResults).set({ status: "look-target", updatedAt: now }).where(eq(lookTestResults.id, resultId)).run();
    });
  } catch {
    return { ok: false, error: "A database error occurred while marking this result as Look Target. Please try again." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Duplicate — definition only, never job/output/notes/status history.
// ---------------------------------------------------------------------------

export type DuplicateLookTestResult = { ok: true; lookTestId: number } | { ok: false; error: string };

class LookTestNotFoundError extends Error {}

/**
 * STYLE.1.G.CORE.1 Round 3 (Finding 4) — the source definition AND its
 * ordered references are now read INSIDE the same synchronous transaction
 * that inserts the duplicate, instead of two separate queries before the
 * transaction. better-sqlite3 transactions run fully synchronously with no
 * `await` inside their callback, so no concurrent edit of the source Look
 * Test (Style source update, reference replacement) can interleave between
 * the read and the write — the duplicate is always a consistent snapshot of
 * one single point in time, never a hybrid of an old definition with new
 * references or vice versa.
 */
export async function duplicateLookTestAction(projectId: number, lookTestId: number): Promise<DuplicateLookTestResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid Project id." };
  if (!isValidId(lookTestId)) return { ok: false, error: "Invalid Look Test id." };

  const now = new Date().toISOString();
  try {
    const result = db.transaction((tx) => {
      const [source] = tx.select().from(lookTests).where(eq(lookTests.id, lookTestId)).all();
      if (!source || source.projectId !== projectId) {
        throw new LookTestNotFoundError("Look Test not found.");
      }

      const references = tx
        .select()
        .from(lookTestReferences)
        .where(eq(lookTestReferences.lookTestId, lookTestId))
        .orderBy(lookTestReferences.orderIndex)
        .all();

      const insertedTests = tx
        .insert(lookTests)
        .values({
          projectId: source.projectId,
          source: source.source,
          mode: source.mode,
          subject: source.subject,
          action: source.action,
          styleSourceKind: source.styleSourceKind,
          styleDraftRevision: source.styleDraftRevision,
          styleVersionId: source.styleVersionId,
          styleSnapshot: source.styleSnapshot,
          styleCompiledText: source.styleCompiledText,
          workflowId: source.workflowId,
          workflowKind: source.workflowKind,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: lookTests.id })
        .all();
      const inserted = insertedTests[0];

      if (references.length > 0) {
        tx.insert(lookTestReferences).values(
          references.map((ref) => ({
            lookTestId: inserted.id,
            referenceImageId: ref.referenceImageId,
            orderIndex: ref.orderIndex,
            createdAt: now,
          }))
        ).run();
      }

      return { ok: true as const, lookTestId: inserted.id };
    });
    return result;
  } catch (e) {
    if (e instanceof LookTestNotFoundError) return { ok: false, error: e.message };
    console.error(`duplicateLookTestAction(${projectId}, ${lookTestId}): transaction failed`, e);
    return { ok: false, error: "A database error occurred while duplicating this Look Test. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Delete a durable result
// ---------------------------------------------------------------------------

export async function deleteLookResultAction(projectId: number, resultId: number) {
  if (!isValidId(projectId)) return { ok: false as const, error: "Invalid Project id." };
  if (!isValidId(resultId)) return { ok: false as const, error: "Invalid result id." };
  return deleteLookResultCore(projectId, resultId);
}
