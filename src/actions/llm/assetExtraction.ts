"use server";

import { db } from "@/db";
import { projects, assets } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { GeneratedAssetCandidate } from "@/types/llm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

// LLMW.UNIFY.PANEL.3 — `generateAssetCandidatesDraft` is deleted:
// `AssetsLLMExtractPanel` now calls `runWorkspaceOperation` directly, naming
// `assets.fromProject` itself and building the two `intent.parameters`
// (`includeShots`, `assetTypes`) from its own checkbox state — the same
// seven-boolean-to-two-parameter conversion this adapter used to do, moved
// to the panel because there is no server-side translation left to perform
// (LLMW.UNIFY.LIST.1 already returns `result.items` keyed by the model's own
// JSON keys). `createSelectedAssets` below is untouched — it is the panel's
// own commit binding, not a generation function.
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

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) {
    errRedirect("Project not found.");
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
      sourceLevel: c.sourceLevel,
      sourceExcerpt: c.sourceExcerpt ?? null,
      duplicateWarning: c.duplicateWarning ?? null,
      orderIndex: startIndex + i,
    });
  }

  revalidatePath("/", "layout");
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}assetsCreated=${candidates!.length}`);
}
