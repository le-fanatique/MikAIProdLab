"use server";

// ---------------------------------------------------------------------------
// Insert New Shot from Basic editorial context (EDITORIAL.INSERT.1)
//
// When the editorial order reveals a missing beat, this creates a REAL
// production Shot (a row in `shots`, exactly like any other shot in the
// sequence) — not an editorial-only placeholder item. It is inserted at a
// stable position (between two existing shots, or at the end), shifting
// every later shot's orderIndex by one. If the sequence already has an
// editorial-items layer (sequence_editorial_items — see
// initializeEditorialTimeline in src/actions/sequences.ts), a matching
// "shot" editorial item is inserted at the analogous position so the new
// shot is immediately visible to Basic publish (which reads exclusively
// from that layer, not from `shots` directly — see
// src/lib/editorial/basicCutManifest.ts). Sequences that never initialized
// the editorial layer are left alone; nothing forces that initialization
// here.
//
// Any structural change like this makes existing Sequence Results stop
// being a faithful representation of the sequence — outdateSequenceResultsForSequence
// (src/actions/sequenceResults.ts) is called right after, non-fatally.
//
// Never calls FFmpeg, never publishes a new Sequence Result automatically,
// never touches a video file — this ticket only changes production
// structure.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { sequences, shots, sequenceEditorialItems, projects } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getNomenclatureSettings, getLLMConfig } from "@/lib/settings";
import { generateNextCode } from "@/lib/nomenclature";
import { resolveShotPromptWithDefault } from "@/lib/prompts/defaultShotPrompt";
import { callLLMJson } from "@/lib/llm";
import { outdateSequenceResultsForSequence } from "./sequenceResults";
import type { LLMPrompt } from "@/types/llm";

// Not exported — a "use server" file may only export async functions.
// The UI's own default lives in InsertShotFromEditorialButton.tsx and must
// be kept in sync with this value by hand.
const DEFAULT_INSERTED_SHOT_DURATION_SECONDS = 5;
const MAX_TARGET_DURATION_SECONDS = 600;

export type InsertShotInput = {
  projectId: number;
  sequenceId: number;
  /** Insert immediately after this shot. Mutually exclusive with insertBeforeShotId in practice, but either alone is enough. */
  insertAfterShotId?: number | null;
  /** Insert immediately before this shot. Ignored if insertAfterShotId is also set. */
  insertBeforeShotId?: number | null;
  targetDurationSeconds?: number;
  title?: string;
  description?: string;
  notes?: string;
};

export type InsertShotResult =
  | { ok: true; shotId: number; outdatedResultsCount: number }
  | { ok: false; error: string };

export async function insertShotInSequenceFromEditorialContext(
  input: InsertShotInput
): Promise<InsertShotResult> {
  const { projectId, sequenceId } = input;

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    return { ok: false, error: "Invalid request." };
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    return { ok: false, error: "Sequence not found." };
  }

  const targetDurationSeconds = input.targetDurationSeconds ?? DEFAULT_INSERTED_SHOT_DURATION_SECONDS;
  if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0 || targetDurationSeconds > MAX_TARGET_DURATION_SECONDS) {
    return { ok: false, error: "Target duration must be greater than 0." };
  }

  const shotList = await db
    .select({ id: shots.id, orderIndex: shots.orderIndex })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex));

  let insertOrderIndex: number;
  if (input.insertAfterShotId != null) {
    const target = shotList.find((s) => s.id === input.insertAfterShotId);
    if (!target) return { ok: false, error: "Invalid insertion position." };
    insertOrderIndex = target.orderIndex + 1;
  } else if (input.insertBeforeShotId != null) {
    const target = shotList.find((s) => s.id === input.insertBeforeShotId);
    if (!target) return { ok: false, error: "Invalid insertion position." };
    insertOrderIndex = target.orderIndex;
  } else {
    insertOrderIndex = shotList.length > 0 ? shotList[shotList.length - 1].orderIndex + 1 : 0;
  }

  // "Placeholder" is this codebase's existing missing/draft-shot convention
  // (see createPlaceholderShot in src/actions/shots.ts, and
  // isPlaceholder: shot.title === "Placeholder" throughout the editorial
  // code) — used verbatim so this new shot is recognized the same way an
  // already-established missing shot is, with no new status concept.
  const title = input.title?.trim() || "Placeholder";
  const description = input.description?.trim() || null;
  const continuityNotes = input.notes?.trim() || null;
  const shotPrompt = resolveShotPromptWithDefault({ description, actionPitch: null, cameraPitch: null });

  const { shotTemplate } = await getNomenclatureSettings();
  const existingCodes = await db.select({ shotCode: shots.shotCode }).from(shots).where(eq(shots.sequenceId, sequenceId));
  const shotCode = generateNextCode(shotTemplate, existingCodes.map((r) => r.shotCode));

  const now = new Date().toISOString();

  const { newShotId } = db.transaction((tx) => {
    // Shift every shot at/after the insertion point.
    for (const s of shotList) {
      if (s.orderIndex >= insertOrderIndex) {
        tx.update(shots).set({ orderIndex: s.orderIndex + 1, updatedAt: now }).where(eq(shots.id, s.id)).run();
      }
    }

    const insertedRows = tx
      .insert(shots)
      .values({
        sequenceId,
        shotCode,
        title,
        description,
        durationSeconds: targetDurationSeconds,
        continuityNotes,
        shotPrompt,
        orderIndex: insertOrderIndex,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: shots.id })
      .all() as unknown as { id: number }[];
    const newShotId = insertedRows[0].id;

    // Mirror into the editorial-items layer, if this sequence already has
    // one — matched by shotId (not shots.orderIndex, which has just
    // changed) so the insertion point is found in the editorial layer's
    // own, independent ordering.
    const editorialItemRows = tx
      .select({ id: sequenceEditorialItems.id, shotId: sequenceEditorialItems.shotId, orderIndex: sequenceEditorialItems.orderIndex })
      .from(sequenceEditorialItems)
      .where(eq(sequenceEditorialItems.sequenceId, sequenceId))
      .all() as unknown as { id: number; shotId: number | null; orderIndex: number }[];

    if (editorialItemRows.length > 0) {
      let editorialInsertOrderIndex: number;
      if (input.insertAfterShotId != null) {
        const match = editorialItemRows.find((r) => r.shotId === input.insertAfterShotId);
        editorialInsertOrderIndex = match ? match.orderIndex + 1 : editorialItemRows.length;
      } else if (input.insertBeforeShotId != null) {
        const match = editorialItemRows.find((r) => r.shotId === input.insertBeforeShotId);
        editorialInsertOrderIndex = match ? match.orderIndex : editorialItemRows.length;
      } else {
        editorialInsertOrderIndex = editorialItemRows.length;
      }

      for (const row of editorialItemRows) {
        if (row.orderIndex >= editorialInsertOrderIndex) {
          tx.update(sequenceEditorialItems)
            .set({ orderIndex: row.orderIndex + 1, updatedAt: now })
            .where(eq(sequenceEditorialItems.id, row.id))
            .run();
        }
      }

      tx.insert(sequenceEditorialItems)
        .values({
          sequenceId,
          type: "shot",
          shotId: newShotId,
          orderIndex: editorialInsertOrderIndex,
          durationSeconds: targetDurationSeconds,
          trimInSeconds: null,
          trimOutSeconds: null,
          trackIndex: 0,
          // Not backfilled — matches sequence_editorial_items.startSeconds's
          // documented "NULL means not yet positioned" convention (see
          // src/db/schema.ts). buildEditorialDocument's cumulative-cursor
          // fallback places it correctly relative to its neighbors either way.
          startSeconds: null,
          createdAt: now,
          updatedAt: now,
        } as const)
        .run();
    }

    return { newShotId };
  });

  const outdated = await outdateSequenceResultsForSequence(projectId, sequenceId);

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/editorial`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/nle-prototype`);

  return {
    ok: true,
    shotId: newShotId,
    outdatedResultsCount: outdated.ok ? outdated.count : 0,
  };
}

// ---------------------------------------------------------------------------
// Generate Shot Brief from Neighbors — optional LLM assist, preview only.
// Never creates anything itself; the caller must still submit
// insertShotInSequenceFromEditorialContext with the (possibly edited)
// result. Mirrors the existing generateShotsFromSequenceDraft /
// createGeneratedShots two-step pattern (src/actions/llm/sequenceShots.ts).
// ---------------------------------------------------------------------------

export type InsertedShotBrief = {
  title: string;
  description: string;
  notes?: string;
};

export type GenerateInsertedShotBriefResult =
  | { ok: true; brief: InsertedShotBrief }
  | { ok: false; error: string };

function buildInsertedShotBriefPrompt(args: {
  project: { name: string; pitch: string | null; story: string | null };
  sequence: { title: string; summary: string | null; mood: string | null; narrativePurpose: string | null };
  prevShot: { title: string; description: string | null; continuityOut: string | null } | null;
  nextShot: { title: string; description: string | null; continuityIn: string | null } | null;
}): LLMPrompt {
  const { project, sequence, prevShot, nextShot } = args;

  const system =
    "You are a production assistant for a short film. A shot is missing between two existing shots (or at the start/end) " +
    "of a sequence, and the editor needs a brief for it. Propose ONE production-ready shot that bridges the gap naturally. " +
    "Keep it concise — this is a brief, not a script. Always respond with a valid JSON object matching exactly this schema: " +
    '{ "title": "string — brief label for the shot", "description": "string — narrative description of what happens", ' +
    '"notes": "string or null — short editorial reasoning for why this shot belongs here" }';

  const lines: string[] = [
    `Project: ${project.name}`,
    project.pitch ? `Pitch: ${project.pitch}` : "",
    project.story ? `Story: ${project.story}` : "",
    `Sequence: ${sequence.title}`,
    sequence.summary ? `Sequence summary: ${sequence.summary}` : "",
    sequence.narrativePurpose ? `Narrative purpose: ${sequence.narrativePurpose}` : "",
    sequence.mood ? `Mood: ${sequence.mood}` : "",
    "",
    prevShot
      ? `Previous shot: "${prevShot.title}"${prevShot.description ? ` — ${prevShot.description}` : ""}${prevShot.continuityOut ? ` (ends with: ${prevShot.continuityOut})` : ""}`
      : "This is the first shot of the sequence.",
    nextShot
      ? `Next shot: "${nextShot.title}"${nextShot.description ? ` — ${nextShot.description}` : ""}${nextShot.continuityIn ? ` (starts with: ${nextShot.continuityIn})` : ""}`
      : "This is the last shot of the sequence.",
    "",
    "Propose the missing shot that belongs between them.",
  ].filter(Boolean);

  return { system, user: lines.join("\n") };
}

function parseInsertedShotBrief(raw: string): GenerateInsertedShotBriefResult {
  let parsed: unknown;
  try {
    const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    parsed = JSON.parse(fenced ? fenced[1].trim() : raw.trim());
  } catch {
    return { ok: false, error: "The model returned an unexpected format. Try again." };
  }
  const r = parsed as Record<string, unknown>;
  const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 200) : null;
  const description = typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 800) : null;
  if (!title || !description) {
    return { ok: false, error: "The model did not return a usable brief. Try again." };
  }
  const notes = typeof r.notes === "string" && r.notes.trim() ? r.notes.trim().slice(0, 400) : undefined;
  return { ok: true, brief: { title, description, notes } };
}

export async function generateInsertedShotBriefFromNeighbors(input: {
  projectId: number;
  sequenceId: number;
  insertAfterShotId?: number | null;
  insertBeforeShotId?: number | null;
}): Promise<GenerateInsertedShotBriefResult> {
  try {
    const config = await getLLMConfig();
    if (!config) return { ok: false, error: "LLM not configured. Go to Settings to set up Ollama." };

    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const [sequence] = await db.select().from(sequences).where(eq(sequences.id, input.sequenceId));
    if (!sequence || sequence.projectId !== input.projectId) return { ok: false, error: "Sequence not found." };

    const prevShot =
      input.insertAfterShotId != null
        ? (await db.select().from(shots).where(eq(shots.id, input.insertAfterShotId)))[0] ?? null
        : null;
    const nextShot =
      input.insertBeforeShotId != null
        ? (await db.select().from(shots).where(eq(shots.id, input.insertBeforeShotId)))[0] ?? null
        : null;

    const prompt = buildInsertedShotBriefPrompt({
      project: { name: project.name, pitch: project.pitch, story: project.story },
      sequence: { title: sequence.title, summary: sequence.summary, mood: sequence.mood, narrativePurpose: sequence.narrativePurpose },
      prevShot: prevShot ? { title: prevShot.title, description: prevShot.description, continuityOut: prevShot.continuityOut } : null,
      nextShot: nextShot ? { title: nextShot.title, description: nextShot.description, continuityIn: nextShot.continuityIn } : null,
    });

    const raw = await callLLMJson(prompt, config);
    return parseInsertedShotBrief(raw);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unexpected error. Please try again." };
  }
}
