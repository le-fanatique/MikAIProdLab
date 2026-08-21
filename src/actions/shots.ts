"use server";

import { db } from "@/db";
import { shots, sequences, sequenceEditorialItems, shotVideoCandidates, shotVideos, shotReferenceVideos } from "@/db/schema";
import { eq, max, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveShotPromptWithDefault } from "@/lib/prompts/defaultShotPrompt";
import { getNomenclatureSettings } from "@/lib/settings";
import { generateNextCode } from "@/lib/nomenclature";
import { quarantineReferenceVideoFiles, restoreQuarantinedReferenceVideoFiles, finalizeQuarantinedReferenceVideoFiles } from "@/lib/shotReferenceVideos/fileCleanup";

export async function createShot(
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const shotCode = (formData.get("shot_code") as string) || null;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const durationRaw = formData.get("duration_seconds") as string;
  const durationSeconds = durationRaw ? parseFloat(durationRaw) : null;
  const actionPitch = (formData.get("action_pitch") as string) || null;
  const cameraPitch = (formData.get("camera_pitch") as string) || null;
  const continuityNotes = (formData.get("continuity_notes") as string) || null;
  const framing = (formData.get("framing") as string) || null;
  const cameraMovement = (formData.get("camera_movement") as string) || null;
  const continuityIn = (formData.get("continuity_in") as string) || null;
  const continuityOut = (formData.get("continuity_out") as string) || null;

  if (!title?.trim()) return;

  const [maxResult] = await db
    .select({ max: max(shots.orderIndex) })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  const orderIndex = (maxResult?.max ?? -1) + 1;

  // Auto-generate shot code if not provided
  let resolvedShotCode = shotCode;
  if (!resolvedShotCode) {
    const { shotTemplate } = await getNomenclatureSettings();
    const existingCodes = await db
      .select({ shotCode: shots.shotCode })
      .from(shots)
      .where(eq(shots.sequenceId, sequenceId));
    resolvedShotCode = generateNextCode(shotTemplate, existingCodes.map((r) => r.shotCode));
  }

  const shotPrompt = resolveShotPromptWithDefault({ description, actionPitch, cameraPitch });

  await db.insert(shots).values({
    sequenceId,
    shotCode: resolvedShotCode,
    title: title.trim(),
    description,
    durationSeconds,
    actionPitch,
    cameraPitch,
    continuityNotes,
    shotSize: framing,
    cameraMovement,
    continuityIn,
    continuityOut,
    shotPrompt,
    orderIndex,
  });

  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}

export async function updateShot(
  id: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const shotCode = (formData.get("shot_code") as string) || null;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const durationRaw = formData.get("duration_seconds") as string;
  const durationSeconds = durationRaw ? parseFloat(durationRaw) : null;
  const actionPitch = (formData.get("action_pitch") as string) || null;
  const cameraPitch = (formData.get("camera_pitch") as string) || null;
  const continuityNotes = (formData.get("continuity_notes") as string) || null;
  const framing = (formData.get("framing") as string) || null;
  const cameraMovement = (formData.get("camera_movement") as string) || null;
  const continuityIn = (formData.get("continuity_in") as string) || null;
  const continuityOut = (formData.get("continuity_out") as string) || null;
  // LLMW.LIGHTING.SURFACE.1 (B15b) — joins this existing multi-column
  // action's own form/action pair rather than the mono-column
  // `updateShotLighting` (B15a), per this ticket's contract. The S4 trap in
  // reverse: this action rewrites every field below on every call, so
  // `lighting` MUST also be present in the Edit Shot form
  // (`src/app/projects/[projectId]/sequences/[sequenceId]/shots/[shotId]/edit/page.tsx`)
  // or every save of that page would silently clear it. Proven by
  // tests/actions/updateShot.test.ts ("preserves lighting on a save that
  // does not touch its field").
  const lighting = (formData.get("lighting") as string) || null;

  if (!title?.trim()) return;

  const [existing] = await db.select({ shotPrompt: shots.shotPrompt }).from(shots).where(eq(shots.id, id));
  const resolvedShotPrompt = resolveShotPromptWithDefault({
    shotPrompt: existing?.shotPrompt,
    description,
    actionPitch,
    cameraPitch,
  });

  await db
    .update(shots)
    .set({
      shotCode,
      title: title.trim(),
      description,
      durationSeconds,
      actionPitch,
      cameraPitch,
      continuityNotes,
      shotSize: framing,
      cameraMovement,
      continuityIn,
      continuityOut,
      lighting,
      shotPrompt: resolvedShotPrompt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(shots.id, id));

  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}

/**
 * Narrow, non-redirecting update for the three Narrative Context fields
 * shown on Shot Detail (UX.POLISH.2) — mirrors updateSequenceContext's
 * pattern exactly. updateShot (above) requires a non-empty title and
 * overwrites shotCode/duration/continuity/camera together, and always
 * redirects to Sequence Detail — unsuitable for an inline save that must
 * stay on Shot Detail and touch only description/actionPitch/cameraPitch.
 */
export async function updateShotNarrativeContext(
  shotId: number,
  sequenceId: number,
  projectId: number,
  data: {
    description: string | null;
    actionPitch: string | null;
    cameraPitch: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const [shot] = await db
      .select({ id: shots.id, sequenceId: shots.sequenceId })
      .from(shots)
      .where(eq(shots.id, shotId));
    if (!shot || shot.sequenceId !== sequenceId) return { ok: false, error: "Shot not found." };

    const [sequence] = await db
      .select({ id: sequences.id, projectId: sequences.projectId })
      .from(sequences)
      .where(eq(sequences.id, sequenceId));
    if (!sequence || sequence.projectId !== projectId) return { ok: false, error: "Sequence not found." };

    await db
      .update(shots)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(shots.id, shotId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save. Please try again." };
  }
}

export async function deleteShot(
  id: number,
  sequenceId: number,
  projectId: number
) {
  // SEQGEN.PUSH.1 — a Shot with any `shot_video_candidates` row (the new FK
  // this ticket adds) must never be deleted out from under them: there is
  // no onDelete action on that FK (defaults to RESTRICT), and a raw FK
  // error or an orphaned candidate file is explicitly forbidden. Policy
  // chosen: block deletion with a clear user-facing message asking the
  // candidates to be removed first, rather than an automatic
  // cleanup-with-restore cascade (a Shot can have several candidate clips
  // on disk; a safe automatic cascade would need the same quarantine/
  // restore machinery as `deleteShotVideoCandidate` repeated N times inside
  // one transaction — deferred as unnecessary complexity for this MVP since
  // the explicit per-candidate Delete action already exists on Shot Detail).
  //
  // The check and the delete run inside ONE synchronous `db.transaction`
  // callback — no `await` inside it — so a concurrent `pushSplitPlanToShots`
  // insert (also a single synchronous transaction) can never land in the
  // gap between "no candidates found" and "Shot deleted": on Node's
  // single-threaded event loop, one synchronous transaction always runs to
  // completion before another request's handler gets a turn, which is what
  // actually closes this race (better-sqlite3 itself is not otherwise
  // concurrent). Either the push's insert commits first (this check then
  // sees the candidate and blocks with the stable message below), or this
  // delete commits first (the push's own insert then correctly fails its
  // FK constraint inside ITS OWN transaction and reports a clean error via
  // its existing catch path) — never a raw, unhandled FK exception.
  // SHOT.VIDEO.LIBRARY.1 (REVISE round 1, finding 4) — `shot_videos.shotId`
  // uses `onDelete: "cascade"` (see schema.ts's own comment on why: that
  // table's scope explicitly excluded touching this file). Left unguarded,
  // deleting a Shot whose ONLY video is a "generation"-sourced library row
  // (no `shot_video_candidates` row at all, so the check below would miss
  // it) would cascade-delete the DB row while leaving its durable file on
  // disk permanently orphaned — the exact silent-orphan the ticket forbids.
  // Blocked here on ANY `shot_videos` row, not just "generation" ones: a
  // "sequence_split" row already implies a live candidate row that the
  // check below also catches, so this is a deliberately simple superset
  // rather than two narrower checks that must be kept in sync by hand.
  // SHOT.VIDEO.REFERENCES.1 — `shot_reference_videos.shotId` is `onDelete:
  // "cascade"` (mirrors `shot_reference_images`'s own convention, not
  // `shot_videos`' RESTRICT — a Video Reference is never blocking, unlike a
  // durable Shot Output). The FK cascade removes the ROWS; it can never
  // touch the FILESYSTEM, so every Video Reference file this Shot owns is
  // quarantined BEFORE the transaction and only permanently unlinked AFTER
  // it commits — same discipline as `deleteProject`'s own quarantine lists.
  const referenceVideoRows = await db
    .select({ id: shotReferenceVideos.id, shotId: shotReferenceVideos.shotId, videoPath: shotReferenceVideos.videoPath })
    .from(shotReferenceVideos)
    .where(eq(shotReferenceVideos.shotId, id));

  let quarantined;
  try {
    quarantined = await quarantineReferenceVideoFiles(referenceVideoRows, `deleteShot(${id})`);
  } catch (e) {
    redirect(`/projects/${projectId}/sequences/${sequenceId}?deleteShotError=${encodeURIComponent(e instanceof Error ? e.message : "Failed to prepare this Shot's Video References for deletion — nothing was changed. Please try again.")}`);
  }

  let blockedByCandidates = false;
  let blockedByLibraryVideos = false;
  try {
    db.transaction((tx) => {
      const existingCandidates = tx.select({ id: shotVideoCandidates.id }).from(shotVideoCandidates).where(eq(shotVideoCandidates.shotId, id)).all();
      if (existingCandidates.length > 0) {
        blockedByCandidates = true;
        throw new Error("SHOT_HAS_VIDEO_CANDIDATES");
      }
      const existingLibraryVideos = tx.select({ id: shotVideos.id }).from(shotVideos).where(eq(shotVideos.shotId, id)).all();
      if (existingLibraryVideos.length > 0) {
        blockedByLibraryVideos = true;
        throw new Error("SHOT_HAS_LIBRARY_VIDEOS");
      }
      // Anti-race: re-verify the exact set of reference-video rows/paths
      // collected above is still current, inside the same transaction that
      // is about to cascade-delete them — a Video Reference added or
      // changed after collection began rolls the whole delete back rather
      // than silently orphaning an unquarantined file.
      const currentRefVideos = tx.select({ id: shotReferenceVideos.id, videoPath: shotReferenceVideos.videoPath }).from(shotReferenceVideos).where(eq(shotReferenceVideos.shotId, id)).all();
      if (currentRefVideos.length !== referenceVideoRows.length || currentRefVideos.some((row) => referenceVideoRows.find((r) => r.id === row.id)?.videoPath !== row.videoPath)) {
        throw new Error("SHOT_REFERENCE_VIDEOS_CHANGED");
      }
      tx.delete(shots).where(eq(shots.id, id)).run();
    });
  } catch (e) {
    const restored = await restoreQuarantinedReferenceVideoFiles(quarantined);
    const restoreSuffix = restored ? "" : " Additionally, one or more Video Reference file(s) could not be automatically restored; please check this Shot manually.";
    if (blockedByCandidates) {
      redirect(`/projects/${projectId}/sequences/${sequenceId}?deleteShotError=${encodeURIComponent(`This Shot has one or more Sequence Video Candidates. Delete them from Shot Detail before deleting the Shot.${restoreSuffix}`)}`);
    }
    if (blockedByLibraryVideos) {
      redirect(`/projects/${projectId}/sequences/${sequenceId}?deleteShotError=${encodeURIComponent(`This Shot has one or more Shot Videos in its library. Delete them from Shot Detail before deleting the Shot.${restoreSuffix}`)}`);
    }
    redirect(`/projects/${projectId}/sequences/${sequenceId}?deleteShotError=${encodeURIComponent(`Failed to delete this Shot — nothing was changed. Please try again.${restoreSuffix}`)}`);
  }

  const allRemoved = await finalizeQuarantinedReferenceVideoFiles(quarantined);
  if (!allRemoved) {
    redirect(
      `/projects/${projectId}/sequences/${sequenceId}?deleteShotError=${encodeURIComponent(
        "This Shot was deleted, but one or more of its Video Reference files could not be fully removed from the server. This does not affect data integrity — please retry cleanup later or contact support."
      )}`
    );
  }
  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}

export async function updateSequenceShotDurations(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return;
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));

  if (!sequence || sequence.projectId !== projectId) return;

  const shotList = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  for (const shot of shotList) {
    const raw = formData.get(`duration_${shot.id}`);
    if (raw === null) continue;
    const rawStr = (raw as string).trim();

    let durationSeconds: number | null;
    if (rawStr === "") {
      durationSeconds = null;
    } else {
      const parsed = parseFloat(rawStr);
      if (isNaN(parsed) || parsed < 0) continue;
      durationSeconds = parsed;
    }

    await db
      .update(shots)
      .set({ durationSeconds, updatedAt: new Date().toISOString() })
      .where(eq(shots.id, shot.id));
  }

  // Optional returnTo — defaults to the existing Sequence Detail redirect
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}`;

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// updateSequenceShotOrder — batch rewrite of orderIndex for a sequence
// ---------------------------------------------------------------------------

export async function updateSequenceShotOrder(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const orderedIdsRaw = (formData.get("orderedIds") as string | null) ?? "";
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return;
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  // Parse ordered ids (comma-separated)
  const orderedIds = orderedIdsRaw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  // The ordered set must match the sequence's shots exactly:
  // no missing id, no extra id, no duplicate
  const currentShots = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const currentIds = new Set(currentShots.map((s) => s.id));

  if (orderedIds.length !== currentIds.size) return;
  const seen = new Set<number>();
  for (const id of orderedIds) {
    if (seen.has(id) || !currentIds.has(id)) return;
    seen.add(id);
  }

  // Idempotent rewrite 0..n-1 — also flattens any pre-existing collisions
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(shots)
      .set({ orderIndex: i, updatedAt: now })
      .where(eq(shots.id, orderedIds[i]));
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// initializeEditorialTimeline — create the editorial items layer from shots
// ---------------------------------------------------------------------------

/**
 * Creates one "shot" editorial item per existing shot of the sequence,
 * copying order, editorial duration, and trims. Idempotent: refuses to run
 * when the sequence already has editorial items. Never modifies the shots.
 */
export async function initializeEditorialTimeline(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}/editorial`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return;
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  // Idempotence: never create on top of an existing editorial layer
  const existingItems = await db
    .select({ id: sequenceEditorialItems.id })
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sequenceId));
  if (existingItems.length > 0) {
    redirect(returnTo);
  }

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex));

  // One "shot" item per shot, order normalized 0..n-1, no initial gaps
  for (let i = 0; i < shotList.length; i++) {
    const shot = shotList[i];
    await db.insert(sequenceEditorialItems).values({
      sequenceId,
      type: "shot",
      shotId: shot.id,
      orderIndex: i,
      durationSeconds: shot.durationSeconds,
      trimInSeconds: shot.trimInSeconds,
      trimOutSeconds: shot.trimOutSeconds,
      trackIndex: 0,
    });
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// updateShotTrim — non-destructive playback trim of the approved video
// ---------------------------------------------------------------------------

const MAX_TRIM_SECONDS = 36000; // safety bound — video duration is not known server-side

export async function updateShotTrim(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const clearTrim = formData.get("clearTrim") === "1";
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}/editorial`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0
  ) {
    return;
  }

  // Ownership: shot → sequence → project
  const [shot] = await db.select({ id: shots.id, sequenceId: shots.sequenceId }).from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return;
  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  let trimInSeconds: number | null = null;
  let trimOutSeconds: number | null = null;

  if (!clearTrim) {
    const trimIn = parseFloat((formData.get("trimInSeconds") as string | null) ?? "");
    const trimOut = parseFloat((formData.get("trimOutSeconds") as string | null) ?? "");
    if (
      !Number.isFinite(trimIn) ||
      !Number.isFinite(trimOut) ||
      trimIn < 0 ||
      trimOut <= trimIn ||
      trimOut > MAX_TRIM_SECONDS
    ) {
      // Invalid values — do not write, return to the page unchanged
      redirect(returnTo);
    }
    trimInSeconds = trimIn;
    trimOutSeconds = trimOut;
  }

  await db
    .update(shots)
    .set({ trimInSeconds, trimOutSeconds, updatedAt: new Date().toISOString() })
    .where(eq(shots.id, shotId));

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);

  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// createPlaceholderShot — minimal editorial placeholder at the end of a sequence
// ---------------------------------------------------------------------------

export async function createPlaceholderShot(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const durationRaw = (formData.get("durationSeconds") as string | null) ?? "";
  const returnToRaw = formData.get("returnTo");
  const returnTo =
    typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/")
      ? returnToRaw.trim()
      : `/projects/${projectId}/sequences/${sequenceId}`;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return;
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  const parsedDuration = parseFloat(durationRaw);
  const durationSeconds =
    Number.isFinite(parsedDuration) && parsedDuration > 0 && parsedDuration <= 600
      ? parsedDuration
      : 1.0;

  const [maxResult] = await db
    .select({ max: max(shots.orderIndex) })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const orderIndex = (maxResult?.max ?? -1) + 1;

  // Auto-generate shot code with the existing nomenclature logic
  const { shotTemplate } = await getNomenclatureSettings();
  const existingCodes = await db
    .select({ shotCode: shots.shotCode })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const shotCode = generateNextCode(shotTemplate, existingCodes.map((r) => r.shotCode));

  await db.insert(shots).values({
    sequenceId,
    shotCode,
    title: "Placeholder",
    durationSeconds,
    orderIndex,
  });

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);

  redirect(returnTo);
}

export async function updateShotPrompt(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const shotPromptRaw = formData.get("shotPrompt");
  const shotPrompt = typeof shotPromptRaw === "string" ? shotPromptRaw : "";
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}shotPromptError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Ownership: shot → sequence → project
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    errRedirect("Shot not found or does not belong to this sequence.");
  }

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  // Store null when empty (avoids storing empty string)
  const value = shotPrompt.trim() === "" ? null : shotPrompt;

  await db
    .update(shots)
    .set({ shotPrompt: value, updatedAt: new Date().toISOString() })
    .where(eq(shots.id, shotId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}shotPromptSaved=1`);
}

/**
 * LLMW.JAR.1 (B12a) — the narrative prompt jar's write side. Mirrors
 * `updateShotPrompt` above exactly: same FormData input shape, same
 * shot→sequence→project ownership chain (two separate SELECTs, no
 * db.transaction), same redirect-only outcome on both the success and the
 * error path. The only difference is the column: this action writes
 * `narrativePrompt` alone, never `shotPrompt` — the two jars coexist by
 * construction, not by omission (§5.3 of
 * docs/LLM_WORKSPACE_PRODUCT_VISION.md).
 */
export async function updateShotNarrativePrompt(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const narrativePromptRaw = formData.get("narrativePrompt");
  const narrativePrompt = typeof narrativePromptRaw === "string" ? narrativePromptRaw : "";
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}narrativePromptError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Ownership: shot → sequence → project
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    errRedirect("Shot not found or does not belong to this sequence.");
  }

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  // Store null when empty (avoids storing empty string)
  const value = narrativePrompt.trim() === "" ? null : narrativePrompt;

  await db
    .update(shots)
    .set({ narrativePrompt: value, updatedAt: new Date().toISOString() })
    .where(eq(shots.id, shotId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}narrativePromptSaved=1`);
}

/**
 * LLMW.LIGHTING.1 (B15a) — the Shot-level lighting field's write side (§5.9
 * of docs/LLM_WORKSPACE_PRODUCT_VISION.md). Mirrors `updateShotNarrativePrompt`
 * above exactly: same FormData input shape, same shot→sequence→project
 * ownership chain (two separate SELECTs, no db.transaction), same
 * redirect-only outcome on both the success and the error path. Writes
 * `lighting` alone — no other column, per this ticket's own instruction.
 */
export async function updateShotLighting(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const lightingRaw = formData.get("lighting");
  const lighting = typeof lightingRaw === "string" ? lightingRaw : "";
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}shotLightingError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Ownership: shot → sequence → project
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    errRedirect("Shot not found or does not belong to this sequence.");
  }

  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  // Store null when empty (avoids storing empty string)
  const value = lighting.trim() === "" ? null : lighting;

  await db
    .update(shots)
    .set({ lighting: value, updatedAt: new Date().toISOString() })
    .where(eq(shots.id, shotId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}shotLightingSaved=1`);
}

/**
 * LLMW.LIGHTING.SHOTFILL.1 — the write side of the "Fill from sequence"
 * button on the Edit Shot form (§5.9 of
 * docs/LLM_WORKSPACE_PRODUCT_VISION.md). Never called automatically — a form
 * submit, the same "the user clicks" discipline as every other action here.
 *
 * `updateShotLighting` above is this button's actual write path, not a
 * parallel one: this action only ever computes the text to copy
 * (`computeShotLightingFill`, `src/lib/llmWorkspace/shotLightingFill.ts` —
 * which itself reuses `resolveSeqLighting`, the same effective-lighting
 * resolution `SEQ.LIGHTING` uses, never a second query) and hands it to
 * `updateShotLighting` as a plain FormData `lighting` value, exactly as a
 * human typing it in would. Ownership, redirect shape and the
 * blank-becomes-null rule are therefore inherited, not reimplemented.
 *
 * Refuses (no write) when there is nothing to copy — the Shot's Sequence has
 * neither its own lighting nor an environment Asset with one — the same "no
 * election rule, but no button that writes empty either" contract the page
 * itself uses to decide whether to render the button at all. Both call sites
 * share the one function so they cannot disagree.
 */
export async function fillShotLightingFromSequence(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}shotLightingError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  // Ownership: shot → sequence → project
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) {
    errRedirect("Shot not found or does not belong to this sequence.");
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  const { computeShotLightingFill } = await import("@/lib/llmWorkspace/shotLightingFill");
  const fillText = await computeShotLightingFill(sequenceId);
  if (fillText === null) {
    errRedirect("This shot's sequence has no lighting — of its own or from an environment Asset — to copy.");
  }

  const writeFormData = new FormData();
  writeFormData.set("projectId", String(projectId));
  writeFormData.set("sequenceId", String(sequenceId));
  writeFormData.set("shotId", String(shotId));
  writeFormData.set("lighting", fillText);
  writeFormData.set("returnTo", returnTo);

  await updateShotLighting(writeFormData);
}
