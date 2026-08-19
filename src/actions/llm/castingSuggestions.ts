"use server";

import { db } from "@/db";
import { sequences, shots, assets, shotAssets, sequenceAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

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
