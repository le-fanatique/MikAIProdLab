"use server";

import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getNomenclatureSettings } from "@/lib/settings";
import type { GeneratedSequence } from "@/types/llm";
import { generateSequentialCodes } from "@/lib/nomenclature";

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

// LLMW.UNIFY.PANEL.3 — `generateSequencesFromOutlineDraft` is deleted:
// `SequencesGenerationPanel` now calls `runWorkspaceOperation` directly,
// naming `sequences.fromOutline` itself. There is no server-side translation
// left for this adapter to perform — `runWorkspaceOperation` already returns
// `result.items` keyed by the model's own JSON keys (LLMW.UNIFY.LIST.1), the
// one gap that used to block this panel; the deterministic title/summary
// override (`sequencesFromOutlineDescriptor.postResponse`) is applied by
// `runOperation` itself regardless of caller, so nothing else moves.
// `createGeneratedSequences` below is untouched — it is the panel's own
// commit binding, not a generation function.
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
