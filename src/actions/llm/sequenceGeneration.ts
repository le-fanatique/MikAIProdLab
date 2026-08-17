"use server";

import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getNomenclatureSettings } from "@/lib/settings";
import type { GeneratedSequence } from "@/types/llm";
import { generateSequentialCodes } from "@/lib/nomenclature";
import { runOperation } from "@/lib/llmWorkspace/runner";
import { sequencesFromOutlineDescriptor } from "@/lib/llmWorkspace/descriptors/sequencesFromOutline";
import { mapListItemToModelKeys } from "@/lib/llmWorkspace/benchRun";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(value: unknown, maxLen = 1000): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, maxLen);
}

function normalizeSequence(raw: unknown, fallbackIndex: number): GeneratedSequence | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 200);
  if (!title) return null;

  const orderIdx =
    typeof r.order_index === "number" && Number.isFinite(r.order_index)
      ? r.order_index
      : fallbackIndex;

  return {
    title,
    summary: str(r.summary, 500),
    description: str(r.description, 1000),
    narrative_purpose: str(r.narrative_purpose, 300),
    mood: str(r.mood, 100),
    location_hint: str(r.location_hint, 300),
    order_index: orderIdx,
  };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Thin adapter over `runOperation(sequencesFromOutlineDescriptor, ...)`
 * (LLMW.MIGRATE.LIST.2, B7g-m), on the model of
 * `generateShotsFromSequenceDraft` (`src/actions/llm/sequenceShots.ts`,
 * post-B7e): keeps the exact `{ok:true, sequences}` return shape
 * `SequencesGenerationPanel` depends on.
 *
 * The deterministic title/summary override that used to live here
 * (`sequenceGeneration.ts:148-158` pre-migration) is now the descriptor's own
 * `postResponse` (`sequencesFromOutlineDescriptor.postResponse`,
 * LLMW.POSTRESPONSE.1, B7g) — `runOperation` applies it itself once the
 * result is a successful list. No local copy of that rule is kept here: it
 * is idempotent, so keeping it would not have broken anything observably,
 * which is exactly why it had to be found and removed by reading rather than
 * by a failing test (see `.agents/executor_report.md`, mutation control).
 *
 * `result.items` are keyed by entity field name (`orderIndex`); the same
 * `mapListItemToModelKeys` bridge `generateShotsFromSequenceDraft` uses
 * translates each item back to the model's own JSON keys (`order_index`),
 * matching `GeneratedSequence`'s own field names. Only the six string fields
 * need the `"" -> null` fill-back `readStringField` (`runner.ts`) does not
 * do itself — `order_index` does not: the descriptor declares
 * `fallback: "index"` for it (not `fallback: "omit"`, unlike
 * `duration_seconds` on the shots side), and `readNumberField` makes that
 * fallback branch `present: true` unconditionally, so the field is always
 * in `result.items` and never needs a null fill. `title` is never `null` —
 * `item.validity` already filtered out any item missing it.
 */
export async function generateSequencesFromOutlineDraft(
  formData: FormData
): Promise<{ ok: true; sequences: GeneratedSequence[] } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const rawCount = parseInt(formData.get("targetCount") as string, 10);

    const result = await runOperation(
      sequencesFromOutlineDescriptor,
      { projectId },
      { parameters: Number.isInteger(rawCount) ? { targetCount: rawCount } : {} }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `sequencesFromOutlineDescriptor.output.kind` is always `"list"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "list") {
      throw new Error("generateSequencesFromOutlineDraft: expected a list-kind result.");
    }
    if (sequencesFromOutlineDescriptor.output.kind !== "list") {
      throw new Error("generateSequencesFromOutlineDraft: descriptor output is not list-kind.");
    }

    const fields = sequencesFromOutlineDescriptor.output.item.fields;
    const generatedSequences: GeneratedSequence[] = result.items.map((item) => {
      const mapped = mapListItemToModelKeys(fields, item);
      const seq: Record<string, string | number | null> = {};
      for (const field of fields) {
        const key = field.jsonKey;
        if (!(key in mapped)) {
          seq[key] = null;
          continue;
        }
        const value = mapped[key];
        seq[key] = value === "" ? null : value;
      }
      return seq as unknown as GeneratedSequence;
    });

    return { ok: true, sequences: generatedSequences };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
    return { ok: false, error: message };
  }
}

export async function createGeneratedSequences(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/outline`;
  const sequencesJson = (formData.get("sequencesJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}sequencesCreateError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(projectId) || projectId <= 0) {
    errRedirect("Invalid request.");
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) {
    errRedirect("Project not found.");
  }

  let candidates: GeneratedSequence[];
  try {
    const raw = JSON.parse(sequencesJson);
    if (!Array.isArray(raw)) throw new Error();
    candidates = raw
      .map((item, i) => normalizeSequence(item, i))
      .filter((s): s is GeneratedSequence => s !== null)
      .sort((a, b) => a.order_index - b.order_index);
  } catch {
    errRedirect("Invalid sequence data.");
  }

  if (candidates!.length === 0) {
    errRedirect("No valid sequences to create.");
  }

  const [maxResult] = await db
    .select({ max: max(sequences.orderIndex) })
    .from(sequences)
    .where(eq(sequences.projectId, projectId));

  const startIndex = (maxResult?.max ?? -1) + 1;

  // Generate sequential sequence codes for the batch
  const { sequenceTemplate } = await getNomenclatureSettings();
  const existingCodeRows = await db
    .select({ sequenceCode: sequences.sequenceCode })
    .from(sequences)
    .where(eq(sequences.projectId, projectId));
  const existingCodes = existingCodeRows.map((r) => r.sequenceCode);
  const newCodes = generateSequentialCodes(sequenceTemplate, existingCodes, candidates!.length);

  for (let i = 0; i < candidates!.length; i++) {
    const seq = candidates![i];
    await db.insert(sequences).values({
      projectId,
      sequenceCode: newCodes[i],
      title: seq.title,
      summary: seq.summary ?? null,
      description: seq.description ?? null,
      narrativePurpose: seq.narrative_purpose ?? null,
      mood: seq.mood ?? null,
      locationHint: seq.location_hint ?? null,
      orderIndex: startIndex + i,
    });
  }

  revalidatePath("/", "layout");
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequencesCreated=${candidates!.length}`);
}
