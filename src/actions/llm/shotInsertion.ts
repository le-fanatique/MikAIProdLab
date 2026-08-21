"use server";

// ---------------------------------------------------------------------------
// createShotAtPosition — LLMW.ACTION.INSERT_AT.1 (B11-a)
//
// The write side of UC1's "insert a plan between two existing plans"
// (`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §4). Unlike the three insert
// actions LLMW.ACTION.INSERT.1 (B7c-w) declared — `createGeneratedShots`
// (`sequenceShots.ts`), `createSelectedAssets`, `createGeneratedSequences` —
// which all append at `max(orderIndex) + 1`, this one inserts at an
// arbitrary position named by `afterShotId` and must shift every later
// shot's `orderIndex` to make room. This file lives under `src/actions/llm/`
// rather than `src/actions/shots.ts`, on the same criterion the other three
// insert actions already settled: every write action an LLM Workspace
// descriptor's own `commit` array names lives here — `createGeneratedShots`
// and `createSelectedAssets` (`assetExtraction.ts`) both do — while
// `src/actions/shots.ts` hosts the plain-UI actions no descriptor ever
// invokes (`createShot`, `updateShot`, `updateSequenceShotOrder`, ...). This
// ticket declares the action and its registry entry only; the UC1
// descriptor, the `insertionPoint` anchor and the surface are B11-bd.
//
// Modelled on `createGeneratedShots` for its return shape (`Promise<void>`,
// `redirect()` on every path), its `shotCode` generation
// (`getNomenclatureSettings` + the nomenclature helpers — the model's own
// proposed code, if any, is read nowhere) and its `shotPrompt` derivation
// (`resolveShotPromptWithDefault`). Two points depart from that model on
// purpose, both required by this ticket's own contract:
//
//   - the proposed shot's fields are read directly under their entity field
//     names (`title`, `durationSeconds`, `actionPitch`, ...), not through a
//     `snake_case` model-key translation like `normalizeShot` — this ticket
//     defines only the write action, no descriptor exists yet to fix a
//     model-facing JSON shape, and the ticket's own field list is already
//     the entity's own names;
//   - a titled but otherwise-empty shot is a real, visible refusal
//     ("Invalid shot data.") rather than `createShot`'s silent
//     `if (!title?.trim()) return;` (`src/actions/shots.ts:31`) — arbitrated
//     out for this action specifically, not a change to `createShot` itself.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { sequences, shots } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getNomenclatureSettings } from "@/lib/settings";
import { generateNextCode } from "@/lib/nomenclature";
import { resolveShotPromptWithDefault } from "@/lib/prompts/defaultShotPrompt";

function str(value: unknown, maxLen = 1000): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, maxLen);
}

type ProposedShot = {
  title: string;
  description: string | null;
  durationSeconds: number | null;
  actionPitch: string | null;
  cameraPitch: string | null;
  continuityNotes: string | null;
  shotSize: string | null;
  cameraPosition: string | null;
  cameraMovement: string | null;
  movementSpeed: string | null;
  cameraSubject: string | null;
  cameraLens: string | null;
  continuityIn: string | null;
  continuityOut: string | null;
};

/** Same non-empty-title gate `normalizeShot` (`sequenceShots.ts:26`) uses to
 * drop an item — here it is the whole reason `shotJson` is refused, since
 * there is only ever one item, not a list to filter. The `durationSeconds`
 * bound (0, 120] is copied from `normalizeShot` (`sequenceShots.ts:28-33`),
 * the closest model this ticket names — no other bound is evidenced
 * anywhere in the ticket's own contract. */
function normalizeProposedShot(raw: unknown): ProposedShot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 200);
  if (!title) return null;

  const dur =
    typeof r.durationSeconds === "number" && r.durationSeconds > 0 && r.durationSeconds <= 120
      ? r.durationSeconds
      : null;

  return {
    title,
    description: str(r.description, 500),
    durationSeconds: dur,
    // 300 -> 500 (S7d), in step with the descriptor's own `truncateTo` — the
    // two must stay equal, or one side truncates what the other accepts.
    actionPitch: str(r.actionPitch, 500),
    // LLMW.UC1.TUNE.2 (S7b), défaut 2 — raised from 200 to 500, in step with
    // `descriptors/shotInsertDirected.ts`'s own `truncateTo: 500`: the two
    // bounds must stay equal, or one side truncates what the other accepts.
    cameraPitch: str(r.cameraPitch, 500),
    continuityNotes: str(r.continuityNotes, 500),
    shotSize: str(r.shotSize, 50),
    cameraPosition: str(r.cameraPosition, 50),
    cameraMovement: str(r.cameraMovement, 50),
    movementSpeed: str(r.movementSpeed, 50),
    // B19d — prose, not a palette value: the Seedance 2.5 formula wants the
    // subject the move targets plus where it starts and ends, so its bound
    // matches the descriptor's own `truncateTo: 300`. Equal on both sides,
    // like every pair above, or one truncates what the other accepts.
    cameraSubject: str(r.cameraSubject, 300),
    cameraLens: str(r.cameraLens, 80),
    continuityIn: str(r.continuityIn, 500),
    continuityOut: str(r.continuityOut, 500),
  };
}

export async function createShotAtPosition(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const afterShotIdRaw = ((formData.get("afterShotId") as string | null) ?? "").trim();
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;
  const shotJson = (formData.get("shotJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}shotInsertError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found.");
  }

  // `afterShotId` absent/blank -> insert at the very start of the sequence
  // (targetIndex 0). Present -> the named shot must exist AND belong to
  // this sequence — the check that stops an id from another project's
  // sequence being used to insert into this one.
  let afterShotOrderIndex: number | null = null;
  if (afterShotIdRaw !== "") {
    const afterShotId = parseInt(afterShotIdRaw, 10);
    if (!Number.isInteger(afterShotId) || afterShotId <= 0) {
      errRedirect("Shot not found.");
    }
    const [afterShot] = await db
      .select({ id: shots.id, sequenceId: shots.sequenceId, orderIndex: shots.orderIndex })
      .from(shots)
      .where(eq(shots.id, afterShotId));
    if (!afterShot || afterShot.sequenceId !== sequenceId) {
      errRedirect("Shot not found.");
    }
    afterShotOrderIndex = afterShot!.orderIndex;
  }

  let proposed: ProposedShot | null = null;
  try {
    proposed = normalizeProposedShot(JSON.parse(shotJson));
  } catch {
    proposed = null;
  }
  if (!proposed) {
    errRedirect("Invalid shot data.");
  }

  // shotCode: generated from the project's nomenclature template, never the
  // JSON's own value (if it carries one at all — the shape above does not
  // even declare a `shotCode` key to read).
  const { shotTemplate } = await getNomenclatureSettings();
  const existingCodeRows = await db
    .select({ shotCode: shots.shotCode })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const shotCode = generateNextCode(shotTemplate, existingCodeRows.map((r) => r.shotCode));

  const shotPrompt = resolveShotPromptWithDefault({
    description: proposed!.description,
    actionPitch: proposed!.actionPitch,
    cameraPitch: proposed!.cameraPitch,
  });

  const targetIndex = afterShotOrderIndex === null ? 0 : afterShotOrderIndex + 1;
  const now = new Date().toISOString();

  // The shift and the insert run inside ONE synchronous db.transaction —
  // deliberately NOT the plain for-loop LLMW.ACTION.INSERT.1's three
  // actions use (createGeneratedShots, createSelectedAssets,
  // createGeneratedSequences), and B7c-w2 (2026-08-16) is not being
  // silently contradicted here: that arbitration accepted an untransacted
  // loop because a mid-loop failure there only ever leaves FEWER rows than
  // requested — an incomplete but still internally coherent order. Here a
  // failure landing between the orderIndex shift and the new row's insert
  // leaves the sequence with a gap OR two shots sharing the same
  // orderIndex — a corrupted order, not an incomplete one — so the two
  // steps below commit together or not at all. Same primitive as
  // `assetAlignment.ts:174` and `cameraLabSnapshot.ts:237`: a synchronous
  // `db.transaction((tx) => { ... tx....run() })` callback, no `await`
  // inside it.
  db.transaction((tx) => {
    const toShift = tx
      .select({ id: shots.id, orderIndex: shots.orderIndex })
      .from(shots)
      .where(and(eq(shots.sequenceId, sequenceId), gte(shots.orderIndex, targetIndex)))
      .all();

    for (const row of toShift) {
      tx.update(shots)
        .set({ orderIndex: row.orderIndex + 1, updatedAt: now })
        .where(eq(shots.id, row.id))
        .run();
    }

    tx.insert(shots)
      .values({
        sequenceId,
        shotCode,
        title: proposed!.title,
        description: proposed!.description,
        durationSeconds: proposed!.durationSeconds,
        actionPitch: proposed!.actionPitch,
        cameraPitch: proposed!.cameraPitch,
        continuityNotes: proposed!.continuityNotes,
        shotSize: proposed!.shotSize,
        cameraPosition: proposed!.cameraPosition,
        cameraMovement: proposed!.cameraMovement,
        movementSpeed: proposed!.movementSpeed,
        cameraSubject: proposed!.cameraSubject,
        cameraLens: proposed!.cameraLens,
        continuityIn: proposed!.continuityIn,
        continuityOut: proposed!.continuityOut,
        shotPrompt,
        orderIndex: targetIndex,
      })
      .run();
  });

  revalidatePath("/", "layout");
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}shotInserted=1`);
}
