"use server";

import { db } from "@/db";
import { projects, sequences, shots, assets, shotAssets, sequenceAssets } from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { callLLMJson } from "@/lib/llm";
import { buildCastingFromSequencePrompt } from "@/lib/prompts/casting-from-sequence";
import { getLLMConfig } from "@/lib/settings";
import type { GeneratedCastingSuggestion } from "@/types/llm";

const VALID_ASSET_TYPES = [
  "character",
  "environment",
  "prop",
  "vehicle",
  "crowd",
  "other",
] as const;
type AssetType = (typeof VALID_ASSET_TYPES)[number];

function normalizeAssetType(raw: unknown): AssetType {
  if (typeof raw === "string" && (VALID_ASSET_TYPES as readonly string[]).includes(raw)) {
    return raw as AssetType;
  }
  return "other";
}

function normalizeConfidence(
  raw: unknown
): "high" | "medium" | "low" {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function str(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, maxLen) : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  return null;
}

type RawSuggestion = {
  targetType: "sequence" | "shot";
  targetId: number;
  targetLabel: string;
  assetId: number;
  assetName: string;
  assetType: AssetType;
  reason: string | null;
  confidence: "high" | "medium" | "low";
};

function normalizeRawSuggestion(raw: unknown): RawSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const targetType =
    r.targetType === "sequence" || r.targetType === "shot" ? r.targetType : null;
  if (!targetType) return null;

  const targetId = num(r.targetId);
  if (!targetId) return null;

  const assetId = num(r.assetId);
  if (!assetId) return null;

  const targetLabel = str(r.targetLabel, 200) ?? "";
  const assetName = str(r.assetName, 200) ?? "";

  return {
    targetType,
    targetId,
    targetLabel,
    assetId,
    assetName,
    assetType: normalizeAssetType(r.assetType),
    reason: str(r.reason, 300),
    confidence: normalizeConfidence(r.confidence),
  };
}

function parseSuggestionsResult(raw: string): RawSuggestion[] {
  let parsed: unknown;
  try {
    const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    parsed = JSON.parse(fenced ? fenced[1].trim() : raw.trim());
  } catch {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const arr = (parsed as Record<string, unknown>)?.suggestions;
  if (!Array.isArray(arr)) {
    throw new Error("The model did not return a suggestions array. Try again.");
  }
  const normalized = arr
    .map(normalizeRawSuggestion)
    .filter((s): s is RawSuggestion => s !== null);
  if (normalized.length === 0) {
    throw new Error("The model returned no valid suggestions. Try again.");
  }
  return normalized.slice(0, 60);
}

export async function generateCastingSuggestionsDraft(
  formData: FormData
): Promise<
  { ok: true; suggestions: GeneratedCastingSuggestion[] } | { ok: false; error: string }
> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const includeSequenceLevel = formData.get("includeSequenceLevel") === "true";

    if (
      !Number.isInteger(projectId) || projectId <= 0 ||
      !Number.isInteger(sequenceId) || sequenceId <= 0
    ) {
      return { ok: false, error: "Invalid request." };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM not configured. Go to Settings to set up Ollama." };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const [sequence] = await db
      .select()
      .from(sequences)
      .where(eq(sequences.id, sequenceId));
    if (!sequence || sequence.projectId !== projectId) {
      return { ok: false, error: "Sequence not found." };
    }

    const shotList = await db
      .select()
      .from(shots)
      .where(eq(shots.sequenceId, sequenceId))
      .orderBy(asc(shots.orderIndex));

    const assetLibrary = await db
      .select()
      .from(assets)
      .where(eq(assets.projectId, projectId))
      .orderBy(asc(assets.orderIndex));

    if (shotList.length === 0) {
      return { ok: false, error: "No shots in this sequence. Add shots first." };
    }
    if (assetLibrary.length === 0) {
      return {
        ok: false,
        error: "No assets in the project library. Extract or create assets first.",
      };
    }

    // Fetch existing shot castings for shots in this sequence
    const shotIds = shotList.map((s) => s.id);
    const existingShotCastingRows =
      shotIds.length > 0
        ? await db
            .select({ shotId: shotAssets.shotId, assetId: shotAssets.assetId })
            .from(shotAssets)
            .where(inArray(shotAssets.shotId, shotIds))
        : [];

    // Fetch existing sequence castings
    const existingSeqCastingRows = await db
      .select({ assetId: sequenceAssets.assetId })
      .from(sequenceAssets)
      .where(eq(sequenceAssets.sequenceId, sequenceId));

    const llmPrompt = buildCastingFromSequencePrompt({
      project: {
        name: project.name,
        pitch: project.pitch,
        story: project.story,
        outline: project.outline,
      },
      sequence: {
        id: sequence.id,
        title: sequence.title,
        summary: sequence.summary,
        description: sequence.description,
        narrativePurpose: sequence.narrativePurpose,
        mood: sequence.mood,
        locationHint: sequence.locationHint,
      },
      shots: shotList.map((s) => ({
        id: s.id,
        shotCode: s.shotCode,
        title: s.title,
        description: s.description,
        actionPitch: s.actionPitch,
        continuityIn: s.continuityIn,
        continuityOut: s.continuityOut,
      })),
      assets: assetLibrary.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description,
        notes: a.notes,
      })),
      existingShotCastings: existingShotCastingRows,
      existingSequenceCastings: existingSeqCastingRows,
      includeSequenceLevel,
    });

    const raw = await callLLMJson(llmPrompt, config);
    const rawSuggestions = parseSuggestionsResult(raw);

    // Server-side validation — filter hallucinated IDs
    const validShotIds = new Set(shotIds);
    const validAssetIds = new Set(assetLibrary.map((a) => a.id));

    // Existing castings sets for alreadyAssigned calculation
    const existingShotCastingSet = new Set(
      existingShotCastingRows.map((c) => `${c.shotId}:${c.assetId}`)
    );
    const existingSeqCastingSet = new Set(
      existingSeqCastingRows.map((c) => `${sequenceId}:${c.assetId}`)
    );

    const suggestions: GeneratedCastingSuggestion[] = [];
    for (const raw of rawSuggestions) {
      // Validate targetId
      if (raw.targetType === "shot" && !validShotIds.has(raw.targetId)) continue;
      if (raw.targetType === "sequence" && raw.targetId !== sequenceId) continue;
      // Validate assetId
      if (!validAssetIds.has(raw.assetId)) continue;

      // Calculate alreadyAssigned server-side
      let alreadyAssigned = false;
      if (raw.targetType === "shot") {
        alreadyAssigned = existingShotCastingSet.has(`${raw.targetId}:${raw.assetId}`);
      } else {
        alreadyAssigned = existingSeqCastingSet.has(`${sequenceId}:${raw.assetId}`);
      }

      // Enrich display fields from local data (don't trust LLM names)
      const assetRecord = assetLibrary.find((a) => a.id === raw.assetId);
      const shotRecord =
        raw.targetType === "shot" ? shotList.find((s) => s.id === raw.targetId) : null;
      const targetLabel =
        raw.targetType === "shot"
          ? shotRecord
            ? shotRecord.shotCode
              ? `${shotRecord.shotCode} — ${shotRecord.title}`
              : shotRecord.title
            : raw.targetLabel
          : sequence.title;

      suggestions.push({
        targetType: raw.targetType,
        targetId: raw.targetId,
        targetLabel,
        assetId: raw.assetId,
        assetName: assetRecord?.name ?? raw.assetName,
        assetType: assetRecord ? normalizeAssetType(assetRecord.type) : raw.assetType,
        reason: raw.reason,
        confidence: raw.confidence,
        alreadyAssigned,
      });
    }

    return { ok: true, suggestions };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

export async function applySelectedCastingSuggestions(
  formData: FormData
): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;
  const selectedJson = (formData.get("selectedJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}castingsError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found.");
  }

  const shotList = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  const assetList = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.projectId, projectId));

  const validShotIds = new Set(shotList.map((s) => s.id));
  const validAssetIds = new Set(assetList.map((a) => a.id));

  let selected: unknown[];
  try {
    const parsed = JSON.parse(selectedJson);
    if (!Array.isArray(parsed)) throw new Error();
    selected = parsed;
  } catch {
    errRedirect("Invalid suggestion data.");
  }

  let inserted = 0;
  for (const raw of selected!) {
    const s = normalizeRawSuggestion(raw);
    if (!s) continue;
    if (!validAssetIds.has(s.assetId)) continue;
    if (s.targetType === "shot" && !validShotIds.has(s.targetId)) continue;
    if (s.targetType === "sequence" && s.targetId !== sequenceId) continue;

    try {
      if (s.targetType === "shot") {
        await db.insert(shotAssets).values({ shotId: s.targetId, assetId: s.assetId });
      } else {
        await db
          .insert(sequenceAssets)
          .values({ sequenceId: s.targetId, assetId: s.assetId });
      }
      inserted++;
    } catch {
      // Duplicate — unique constraint, skip silently
    }
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}castingsApplied=${inserted}`);
}
