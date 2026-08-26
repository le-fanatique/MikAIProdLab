"use server";

import { db } from "@/db";
import { sequences, shots } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { GeneratedSequenceShot } from "@/lib/prompts/shots-from-sequence";
import { getNomenclatureSettings } from "@/lib/settings";
import { generateSequentialCodes } from "@/lib/nomenclature";

function str(value: unknown, maxLen = 1000): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, maxLen);
}

function normalizeShot(raw: unknown): GeneratedSequenceShot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 200);
  if (!title) return null;

  const dur =
    typeof r.duration_seconds === "number" &&
    r.duration_seconds > 0 &&
    r.duration_seconds <= 120
      ? r.duration_seconds
      : null;

  return {
    title,
    shot_code: str(r.shot_code, 50),
    description: str(r.description, 500),
    duration_seconds: dur,
    continuity_in: str(r.continuity_in, 500),
    action_pitch: str(r.action_pitch, 300),
    shot_size: str(r.shot_size, 50),
    // CAM.POSITION.COMPOSITE.1 — this is the bound that actually cut the
    // author's data: three of Sq_5000's six shots were stored as
    // `role: Over-` / `role: Rear Vie` / `role: Establish`. `cameraPosition`
    // is three independent questions, so a correct answer names all three
    // and the catalogue's longest is 80 characters. Kept in step with
    // `shots.fromSequence`'s declared `truncateTo`, which mirrors this line.
    camera_position: str(r.camera_position, 120),
    camera_movement: str(r.camera_movement, 50),
    movement_speed: str(r.movement_speed, 50),
    camera_subject: str(r.camera_subject, 300),
    camera_lens: str(r.camera_lens, 80),
    // SHOTGEN.INSTRUCTION.1 — same 300-character bound as `camera_subject`,
    // which mirrors this line: prose, not a palette code.
    lighting: str(r.lighting, 300),
    continuity_out: str(r.continuity_out, 500),
    shot_prompt: str(r.shot_prompt, 1000),
  };
}

// LLMW.UNIFY.PANEL.3 — `generateShotsFromSequenceDraft` is deleted:
// `SequenceShotsLLMAssistPanel` now calls `runWorkspaceOperation` directly,
// naming `shots.fromSequence` itself. There is no server-side translation
// left for this adapter to perform — `runWorkspaceOperation` already returns
// `result.items` keyed by the model's own JSON keys (LLMW.UNIFY.LIST.1), the
// one gap that used to block this panel. `createGeneratedShots` below is
// untouched — it is the panel's own commit binding, not a generation
// function.
export async function createGeneratedShots(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;
  const shotsJson = (formData.get("shotsJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}shotsCreateError=${encodeURIComponent(msg)}`);
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

  let parsedShots: GeneratedSequenceShot[];
  try {
    const raw = JSON.parse(shotsJson);
    if (!Array.isArray(raw)) throw new Error();
    parsedShots = raw.map(normalizeShot).filter((s): s is GeneratedSequenceShot => s !== null);
  } catch {
    errRedirect("Invalid shot data.");
  }

  if (parsedShots!.length === 0) {
    errRedirect("No valid shots to create.");
  }

  const [maxResult] = await db
    .select({ max: max(shots.orderIndex) })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  const startIndex = (maxResult?.max ?? -1) + 1;

  // LLM-provided shot codes are ignored. Settings templates are the source of truth.
  const { shotTemplate } = await getNomenclatureSettings();
  const existingCodeRows = await db
    .select({ shotCode: shots.shotCode })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));
  const existingCodes = existingCodeRows.map((r) => r.shotCode);
  const generatedCodes = generateSequentialCodes(shotTemplate, existingCodes, parsedShots!.length);

  for (let i = 0; i < parsedShots!.length; i++) {
    const shot = parsedShots![i];
    const shotCode = generatedCodes[i];
    // SHOTPROMPT.DERIVE.1 — `shot_prompt` is exactly what the model returned
    // for this shot (already normalized by `normalizeShot`'s own `str(...)`),
    // never re-derived from description/actionPitch.
    await db.insert(shots).values({
      sequenceId,
      shotCode,
      title: shot.title,
      description: shot.description ?? null,
      durationSeconds: shot.duration_seconds ?? null,
      actionPitch: shot.action_pitch ?? null,
      shotSize: shot.shot_size ?? null,
      cameraPosition: shot.camera_position ?? null,
      cameraMovement: shot.camera_movement ?? null,
      movementSpeed: shot.movement_speed ?? null,
      cameraSubject: shot.camera_subject ?? null,
      cameraLens: shot.camera_lens ?? null,
      lighting: shot.lighting ?? null,
      continuityIn: shot.continuity_in ?? null,
      continuityOut: shot.continuity_out ?? null,
      shotPrompt: shot.shot_prompt ?? null,
      orderIndex: startIndex + i,
    });
  }

  revalidatePath("/", "layout");
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}shotsCreated=${parsedShots!.length}`);
}
