"use server";

// ---------------------------------------------------------------------------
// applyCameraConversions — B19f's write side.
//
// Applies the camera conversions the author selected in the ProposalPanel.
//
// Two disciplines, both deliberate:
//
// **Only what the proposal fills is written.** A null or blank field is left
// exactly as it stands. The operation's whole point is that an axis the legacy
// text says nothing about must stay empty rather than be guessed, and the write
// side has to honour that or the instruction is worthless.
//
// **`camera_pitch` is never touched.** It is the source being converted, and 88
// shots hold their only angle in it. It dies on the author's word, in its own
// ticket, once he has seen the result on his own sequences.
//
// Ownership is checked shot by shot against the sequence named in the request —
// never by bare id — following `applySelectedCastingSuggestions`.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { sequences, shots } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type ProposedConversion = {
  shotId: number;
  shotSize?: string | null;
  cameraPosition?: string | null;
  cameraMovement?: string | null;
  movementSpeed?: string | null;
  cameraSubject?: string | null;
  cameraLens?: string | null;
};

/** Trim, and treat blank as "not proposed" — the same rule the forms apply. */
function filled(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function applyCameraConversions(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;
  const selectedJson = (formData.get("selectedJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}cameraConversionError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) ||
    projectId <= 0 ||
    !Number.isInteger(sequenceId) ||
    sequenceId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) errRedirect("Invalid request.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(selectedJson);
  } catch {
    errRedirect("Nothing to apply.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) errRedirect("Nothing to apply.");

  const proposals: ProposedConversion[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const shotId = typeof r.shotId === "number" ? r.shotId : NaN;
    if (!Number.isInteger(shotId) || shotId <= 0) continue;
    proposals.push({
      shotId,
      shotSize: typeof r.shotSize === "string" ? r.shotSize : null,
      cameraPosition: typeof r.cameraPosition === "string" ? r.cameraPosition : null,
      cameraMovement: typeof r.cameraMovement === "string" ? r.cameraMovement : null,
      movementSpeed: typeof r.movementSpeed === "string" ? r.movementSpeed : null,
      cameraSubject: typeof r.cameraSubject === "string" ? r.cameraSubject : null,
      cameraLens: typeof r.cameraLens === "string" ? r.cameraLens : null,
    });
  }
  if (proposals.length === 0) errRedirect("Nothing to apply.");

  // Ownership, by set rather than by bare id: only shots that really belong to
  // this sequence survive. A proposal naming anything else is dropped, not
  // written.
  const ownedRows = await db
    .select({ id: shots.id })
    .from(shots)
    .where(
      and(
        eq(shots.sequenceId, sequenceId),
        inArray(
          shots.id,
          proposals.map((p) => p.shotId)
        )
      )
    );
  const owned = new Set(ownedRows.map((r) => r.id));

  const now = new Date().toISOString();
  for (const p of proposals) {
    if (!owned.has(p.shotId)) continue;

    // Only the axes the proposal actually fills. An omitted axis keeps
    // whatever the shot already holds — including nothing.
    const patch: Record<string, string> = {};
    const shotSize = filled(p.shotSize);
    const cameraPosition = filled(p.cameraPosition);
    const cameraMovement = filled(p.cameraMovement);
    const movementSpeed = filled(p.movementSpeed);
    const cameraSubject = filled(p.cameraSubject);
    const cameraLens = filled(p.cameraLens);
    if (shotSize) patch.shotSize = shotSize;
    if (cameraPosition) patch.cameraPosition = cameraPosition;
    if (cameraMovement) patch.cameraMovement = cameraMovement;
    if (movementSpeed) patch.movementSpeed = movementSpeed;
    if (cameraSubject) patch.cameraSubject = cameraSubject;
    if (cameraLens) patch.cameraLens = cameraLens;
    if (Object.keys(patch).length === 0) continue;

    await db
      .update(shots)
      .set({ ...patch, updatedAt: now })
      .where(eq(shots.id, p.shotId));
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  redirect(returnTo);
}
