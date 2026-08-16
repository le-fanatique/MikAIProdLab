"use server";

import { db } from "@/db";
import { sequences, shots } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { GeneratedSequenceShot } from "@/lib/prompts/shots-from-sequence";
import { getNomenclatureSettings } from "@/lib/settings";
import { resolveShotPromptWithDefault } from "@/lib/prompts/defaultShotPrompt";
import { generateSequentialCodes } from "@/lib/nomenclature";
import { runOperation } from "@/lib/llmWorkspace/runner";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";
import { mapListItemToModelKeys } from "@/lib/llmWorkspace/benchRun";

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
    camera_pitch: str(r.camera_pitch, 200),
    framing: str(r.framing, 50),
    camera_movement: str(r.camera_movement, 50),
    continuity_out: str(r.continuity_out, 500),
    shot_prompt: str(r.shot_prompt, 1000),
  };
}

/**
 * Thin adapter over `runOperation(shotsFromSequenceDescriptor, ...)`
 * (LLMW.MIGRATE.LIST.1, B7e): keeps the exact `{ok:true, shots}` return
 * shape `SequenceShotsLLMAssistPanel` depends on. The 1-30 bound and the 6
 * default for `shotCount` are declared on the descriptor's own
 * `intent.parameters` (`descriptors/shotsFromSequence.ts`), but the runner
 * does not enforce that bound itself — the render forms
 * (`variables/registry.ts`) only apply `?? 6` when `targetCount` is
 * `undefined`, never clamping an out-of-range value back into [1, 30]. That
 * gap is reported, not papered over here with a re-implemented bound check
 * (see `.agents/executor_report.md`): an absent/non-integer `shotCount`
 * still defaults to 6 (parameters omitted entirely), matching the old
 * behaviour; an out-of-range integer now reaches the prompt unclamped, which
 * the old code never allowed.
 *
 * `result.items` are keyed by entity field name (`shotCode`,
 * `durationSeconds`); `mapListItemToModelKeys` (`benchRun.ts`, B7d's bridge
 * extracted for reuse) translates each item to the model's own JSON keys
 * (`shot_code`, `duration_seconds`), matching `GeneratedSequenceShot`'s own
 * field names one for one. Two gaps remain after that translation, both
 * named in the ticket's own risk section: `readStringField` (`runner.ts`)
 * always produces a value — `""` where the old `normalizeShot` produced
 * `null` for an absent or blank field — and `readNumberField`'s
 * `fallback: "omit"` drops an out-of-bounds `duration_seconds` from the
 * object entirely, where the old code kept the key with a `null` value. Both
 * are filled back to `null` below so this adapter's output is indiscernible
 * from the pre-migration `parseShotsResult` + `normalizeShot` chain
 * (`tests/llmWorkspace/shotsFromSequence.migration.test.ts`). `title` is
 * never `null` — `item.validity` already filtered out any item missing it.
 */
export async function generateShotsFromSequenceDraft(
  formData: FormData
): Promise<{ ok: true; shots: GeneratedSequenceShot[] } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const shotCountRaw = parseInt(formData.get("shotCount") as string, 10);

    const result = await runOperation(
      shotsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: Number.isInteger(shotCountRaw) ? { targetCount: shotCountRaw } : {} }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `shotsFromSequenceDescriptor.output.kind` is always `"list"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "list") {
      throw new Error("generateShotsFromSequenceDraft: expected a list-kind result.");
    }
    if (shotsFromSequenceDescriptor.output.kind !== "list") {
      throw new Error("generateShotsFromSequenceDraft: descriptor output is not list-kind.");
    }

    const fields = shotsFromSequenceDescriptor.output.item.fields;
    const generatedShots: GeneratedSequenceShot[] = result.items.map((item) => {
      const mapped = mapListItemToModelKeys(fields, item);
      const shot: Record<string, string | number | null> = {};
      for (const field of fields) {
        const key = field.jsonKey;
        if (!(key in mapped)) {
          shot[key] = null;
          continue;
        }
        const value = mapped[key];
        shot[key] = value === "" ? null : value;
      }
      return shot as unknown as GeneratedSequenceShot;
    });

    return { ok: true, shots: generatedShots };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

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
    const shotPrompt = resolveShotPromptWithDefault({
      shotPrompt: shot.shot_prompt,
      description: shot.description,
      actionPitch: shot.action_pitch,
      cameraPitch: shot.camera_pitch,
    });
    await db.insert(shots).values({
      sequenceId,
      shotCode,
      title: shot.title,
      description: shot.description ?? null,
      durationSeconds: shot.duration_seconds ?? null,
      actionPitch: shot.action_pitch ?? null,
      cameraPitch: shot.camera_pitch ?? null,
      framing: shot.framing ?? null,
      cameraMovement: shot.camera_movement ?? null,
      continuityIn: shot.continuity_in ?? null,
      continuityOut: shot.continuity_out ?? null,
      shotPrompt,
      orderIndex: startIndex + i,
    });
  }

  revalidatePath("/", "layout");
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}shotsCreated=${parsedShots!.length}`);
}
