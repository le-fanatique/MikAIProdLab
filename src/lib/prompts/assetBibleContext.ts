// ---------------------------------------------------------------------------
// assetBibleContext.ts — ownership/validation lookups for "Enhance Asset
// Bible" (AI.ASSET.BIBLE.1), kept out of the "use server" action file so it
// can be imported and unit tested without pulling in src/lib/llm (which
// requires the "server-only" package, unavailable outside a Next.js build).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, assets } from "@/db/schema";
import { eq } from "drizzle-orm";

export type AssetBibleContextAsset = {
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
  visualIdentity: string | null;
  usageRules: string | null;
  forbiddenVariations: string | null;
};

export type AssetBibleContextResult =
  | { ok: true; asset: AssetBibleContextAsset }
  | { ok: false; error: string };

/**
 * Validates projectId/assetId, ownership, and the Description/Notes source
 * requirement. Performs reads only — never writes.
 */
export async function resolveAssetBibleContext(
  projectId: number,
  assetId: number
): Promise<AssetBibleContextResult> {
  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(assetId) || assetId <= 0
  ) {
    return { ok: false, error: "Invalid request." };
  }

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset || asset.projectId !== projectId) {
    return { ok: false, error: "Asset not found." };
  }

  if (!asset.description?.trim() && !asset.notes?.trim()) {
    return {
      ok: false,
      error: "Add a Description or Notes to this asset before generating an Asset Bible draft.",
    };
  }

  return {
    ok: true,
    asset: {
      name: asset.name,
      type: asset.type,
      description: asset.description ?? null,
      notes: asset.notes ?? null,
      visualIdentity: asset.visualIdentity ?? null,
      usageRules: asset.usageRules ?? null,
      forbiddenVariations: asset.forbiddenVariations ?? null,
    },
  };
}
