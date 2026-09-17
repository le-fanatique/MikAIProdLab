import "server-only";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildSendToMikaiWorkflow, buildSendToMikaiWorkflowForUpdate } from "@/lib/invoke/invokeSendToMikaiWorkflow";
import { createInvokeWorkflow, updateInvokeWorkflow } from "@/lib/invoke/invokeServerClient";

// INVOKE.PUSH.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.1 step 5, §5.2, ticket
// §1.4. A single app_settings row holds the installed workflow's id — "une
// valeur unique, pas une table" (ticket §1.4).
export const SEND_TO_MIKAI_WORKFLOW_ID_SETTING_KEY = "invoke_send_to_mikai_workflow_id";

async function readStoredWorkflowId(): Promise<string | null> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SEND_TO_MIKAI_WORKFLOW_ID_SETTING_KEY));
  return rows[0]?.value?.trim() || null;
}

async function storeWorkflowId(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: SEND_TO_MIKAI_WORKFLOW_ID_SETTING_KEY, value: id, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: id, updatedAt: now } });
}

function isInvokeNotFoundError(err: unknown): boolean {
  return err instanceof Error && /responded 404/.test(err.message);
}

/**
 * Ensures the "Send to MikAI" workflow exists in Invoke with its board
 * field defaulted to `boardId`.
 *
 * `boardId` is null only at the first successful Test Connection, before
 * any entity has ever been pushed (ticket §1.4): the workflow is created
 * with no board default, and the next push PATCHes it in.
 *
 * Self-healing against a workflow deleted on the Invoke side (ticket §1.5,
 * "Board or workflow deleted (404)"): an update that 404s falls through to
 * creating a fresh workflow and re-storing its id, rather than surfacing
 * the 404 to the caller.
 */
export async function ensureSendToMikaiWorkflowInstalled(boardId: string | null): Promise<{ workflowId: string }> {
  const storedId = await readStoredWorkflowId();

  if (storedId) {
    try {
      const { workflowId } = await updateInvokeWorkflow(storedId, buildSendToMikaiWorkflowForUpdate(storedId, boardId));
      return { workflowId };
    } catch (err) {
      if (!isInvokeNotFoundError(err)) throw err;
      // Stored id no longer resolves in Invoke — fall through and recreate.
    }
  }

  const { workflowId } = await createInvokeWorkflow(buildSendToMikaiWorkflow(boardId));
  await storeWorkflowId(workflowId);
  return { workflowId };
}
