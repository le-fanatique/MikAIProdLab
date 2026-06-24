"use server";

import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { callOllama } from "@/lib/llm/ollama";
import { buildSequencesFromOutlinePrompt } from "@/lib/prompts/sequences-from-outline";
import type { OutlineSection } from "@/lib/prompts/sequences-from-outline";
import { getLLMConfig } from "@/lib/settings";
import type { GeneratedSequence } from "@/types/llm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOutlineSections(outline: string): OutlineSection[] {
  const sections: OutlineSection[] = [];
  const lines = outline.split("\n");
  let currentTitle: string | null = null;
  const currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle !== null) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
        currentBody.length = 0;
      }
      currentTitle = line.slice(3).trim();
    } else if (currentTitle !== null) {
      currentBody.push(line);
    }
  }
  if (currentTitle !== null) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }
  return sections;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : trimmed;
}

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

function parseSequencesResult(raw: string): GeneratedSequence[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("The model returned an unexpected format. Try again or use a different model.");
  }
  const arr = (parsed as Record<string, unknown>)?.sequences;
  if (!Array.isArray(arr)) {
    throw new Error("The model did not return a sequences array. Try again.");
  }
  const normalized = arr
    .map((item, i) => normalizeSequence(item, i))
    .filter((s): s is GeneratedSequence => s !== null);
  if (normalized.length === 0) {
    throw new Error("The model returned no valid sequences. Try again.");
  }
  return normalized.sort((a, b) => a.order_index - b.order_index);
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export async function generateSequencesFromOutlineDraft(
  formData: FormData
): Promise<{ ok: true; sequences: GeneratedSequence[] } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { ok: false, error: "Invalid request." };
    }

    const rawCount = parseInt(formData.get("targetCount") as string, 10);
    const targetCount =
      Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 20 ? rawCount : null;

    const config = await getLLMConfig();
    if (!config) {
      return {
        ok: false,
        error: "LLM provider not configured. Go to Settings to configure Ollama.",
      };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return { ok: false, error: "Project not found." };
    }

    if (!project.outline?.trim() && !project.pitch?.trim()) {
      return { ok: false, error: "Add a project pitch or outline first." };
    }

    const outlineSections = project.outline?.trim()
      ? parseOutlineSections(project.outline)
      : [];
    const sectionCount = outlineSections.length || null;

    const prompt = buildSequencesFromOutlinePrompt({
      name: project.name,
      pitch: project.pitch,
      story: project.story,
      outline: project.outline,
      targetCount,
      sectionCount,
      outlineSections: outlineSections.length > 0 ? outlineSections : undefined,
    });

    const raw = await callOllama(prompt, config);
    const seqs = parseSequencesResult(raw);

    // Deterministic override: when targetCount is unset and LLM returned exactly
    // the same number of sequences as outline sections, pin title and summary to
    // the parsed section values so no LLM paraphrase can slip through.
    if (targetCount === null && outlineSections.length > 0 && seqs.length === outlineSections.length) {
      for (let i = 0; i < seqs.length; i++) {
        seqs[i].title = outlineSections[i].title;
        if (outlineSections[i].body) {
          seqs[i].summary = outlineSections[i].body;
        }
      }
    }

    return { ok: true, sequences: seqs };
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

  for (let i = 0; i < candidates!.length; i++) {
    const seq = candidates![i];
    await db.insert(sequences).values({
      projectId,
      title: seq.title,
      summary: seq.summary ?? null,
      description: seq.description ?? null,
      narrativePurpose: seq.narrative_purpose ?? null,
      mood: seq.mood ?? null,
      locationHint: seq.location_hint ?? null,
      orderIndex: startIndex + i,
    });
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequencesCreated=${candidates!.length}`);
}
