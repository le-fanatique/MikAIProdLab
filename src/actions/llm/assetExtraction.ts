"use server";

import { db } from "@/db";
import { projects, sequences, shots, assets } from "@/db/schema";
import { eq, max, inArray, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { callOllama } from "@/lib/llm/ollama";
import { buildAssetsFromProjectPrompt } from "@/lib/prompts/assets-from-project";
import { getLLMConfig } from "@/lib/settings";
import type { GeneratedAssetCandidate } from "@/types/llm";

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

function str(v: unknown, maxLen = 1000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, maxLen) : null;
}

function normalizeCandidate(raw: unknown): GeneratedAssetCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 200);
  if (!name) return null;

  const rawSourceLevel = r.sourceLevel ?? r.source_level;
  const sourceLevel: GeneratedAssetCandidate["sourceLevel"] =
    rawSourceLevel === "outline" ||
    rawSourceLevel === "sequence" ||
    rawSourceLevel === "shot" ||
    rawSourceLevel === "story"
      ? rawSourceLevel
      : "outline";

  return {
    name,
    assetType: normalizeAssetType(r.assetType ?? r.asset_type),
    description: str(r.description, 500),
    notes: str(r.notes, 500),
    sourceLevel,
    sourceExcerpt: str(r.sourceExcerpt ?? r.source_excerpt, 200),
    duplicateWarning: str(r.duplicateWarning ?? r.duplicate_warning, 200),
  };
}

function parseAssetsResult(raw: string): GeneratedAssetCandidate[] {
  let parsed: unknown;
  try {
    const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    parsed = JSON.parse(fenced ? fenced[1].trim() : raw.trim());
  } catch {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const arr = (parsed as Record<string, unknown>)?.assets;
  if (!Array.isArray(arr)) {
    throw new Error("The model did not return an assets array. Try again.");
  }
  const normalized = arr
    .map(normalizeCandidate)
    .filter((c): c is GeneratedAssetCandidate => c !== null);
  if (normalized.length === 0) {
    throw new Error("The model returned no valid assets. Try again.");
  }
  return normalized.slice(0, 20);
}

export async function generateAssetCandidatesDraft(
  formData: FormData
): Promise<{ ok: true; assets: GeneratedAssetCandidate[] } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { ok: false, error: "Invalid request." };
    }

    const bool = (key: string) => formData.get(key) === "true";
    const includeShots = bool("includeShots");

    const assetTypes: AssetType[] = [];
    if (bool("includeCharacters")) assetTypes.push("character");
    if (bool("includeEnvironments")) assetTypes.push("environment");
    if (bool("includeProps")) assetTypes.push("prop");
    if (bool("includeVehicles")) assetTypes.push("vehicle");
    if (bool("includeCrowds")) assetTypes.push("crowd");
    if (bool("includeOther")) assetTypes.push("other");

    if (assetTypes.length === 0) {
      return { ok: false, error: "Select at least one asset type." };
    }

    const config = await getLLMConfig();
    if (!config) {
      return {
        ok: false,
        error: "LLM not configured. Go to Settings to set up Ollama.",
      };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const seqs = await db
      .select()
      .from(sequences)
      .where(eq(sequences.projectId, projectId))
      .orderBy(asc(sequences.orderIndex));

    const existingAssets = await db
      .select({ name: assets.name, type: assets.type })
      .from(assets)
      .where(eq(assets.projectId, projectId));

    const hasNarrative =
      project.outline?.trim() ||
      project.story?.trim() ||
      project.pitch?.trim() ||
      seqs.length > 0;

    if (!hasNarrative) {
      return {
        ok: false,
        error:
          "No narrative content found. Add a pitch, story, outline, or sequences first.",
      };
    }

    let shotRows: Array<{
      title: string;
      description: string | null;
      actionPitch: string | null;
      continuityIn: string | null;
      continuityOut: string | null;
    }> = [];

    if (includeShots && seqs.length > 0) {
      const seqIds = seqs.map((s) => s.id);
      shotRows = await db
        .select({
          title: shots.title,
          description: shots.description,
          actionPitch: shots.actionPitch,
          continuityIn: shots.continuityIn,
          continuityOut: shots.continuityOut,
        })
        .from(shots)
        .where(inArray(shots.sequenceId, seqIds))
        .orderBy(asc(shots.orderIndex));
    }

    const llmPrompt = buildAssetsFromProjectPrompt({
      project: {
        name: project.name,
        pitch: project.pitch,
        story: project.story,
        outline: project.outline,
      },
      sequences: seqs.map((s) => ({
        title: s.title,
        summary: s.summary,
        description: s.description,
        narrativePurpose: s.narrativePurpose,
        mood: s.mood,
        locationHint: s.locationHint,
      })),
      shots: shotRows,
      existingAssets,
      includeShots,
      assetTypes,
    });

    const raw = await callOllama(llmPrompt, config);
    const candidates = parseAssetsResult(raw);

    return { ok: true, assets: candidates };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

export async function createSelectedAssets(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/assets`;
  const selectedJson = (formData.get("selectedJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}assetsCreateError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(projectId) || projectId <= 0) {
    errRedirect("Invalid request.");
  }

  let candidates: GeneratedAssetCandidate[];
  try {
    const raw = JSON.parse(selectedJson);
    if (!Array.isArray(raw)) throw new Error();
    candidates = raw
      .map(normalizeCandidate)
      .filter((c): c is GeneratedAssetCandidate => c !== null);
  } catch {
    errRedirect("Invalid asset data.");
  }

  if (candidates!.length === 0) {
    errRedirect("No valid assets to create.");
  }

  const [maxResult] = await db
    .select({ max: max(assets.orderIndex) })
    .from(assets)
    .where(eq(assets.projectId, projectId));

  const startIndex = (maxResult?.max ?? -1) + 1;

  for (let i = 0; i < candidates!.length; i++) {
    const c = candidates![i];
    await db.insert(assets).values({
      projectId,
      name: c.name,
      type: c.assetType,
      description: c.description ?? null,
      notes: c.notes ?? null,
      orderIndex: startIndex + i,
    });
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}assetsCreated=${candidates!.length}`);
}
