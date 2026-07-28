import "server-only";

// ---------------------------------------------------------------------------
// resolveAssetAlignmentOwnership.ts — STYLE.1.F.CORE
//
// Project -> Asset ownership + baseline field read for the Alignment
// generate flow. Kept out of the "use server" action file (mirrors
// assetBibleContext.ts's convention) purely as a naming/organization
// choice — this file does perform DB reads, so it is not independently
// unit-testable without a DB, but it stays a plain async function so it can
// still be exercised directly by a disposable-DB harness without going
// through a Server Action call. `server-only` (Codex Round 1 P2) keeps it
// out of any Client Component bundle, same as every other DB-backed module
// in this ticket.
//
// `asset.fields` is THE canonical Asset-field representation for this
// entire ticket — trimmed, "" for null/empty, never truncated. Context
// building, the prompt, the strict proposal parser's baseline comparison
// and Apply's already-aligned/real-change checks all consume this exact
// same representation (Codex Round 1 P1 — see alignmentContext.ts's header
// for the truncation bug this replaces).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects, assets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isValidId } from "../validation";
import type { AssetAlignmentFieldValues } from "./contracts";
import type { AssetAlignmentFingerprintInput } from "./fingerprint";

export type AssetAlignmentProjectContext = {
  id: number;
  name: string;
  pitch: string | null;
  story: string | null;
  outline: string | null;
};

export type AssetAlignmentAssetContext = {
  id: number;
  name: string;
  type: string;
  /** "" for a null/empty DB value — the representation the prompt and parser compare against. */
  fields: AssetAlignmentFieldValues;
  /** The exact DB values (null preserved) — the representation the fingerprint hashes, so a null vs "" distinction is never lost. */
  rawFields: AssetAlignmentFingerprintInput;
};

export type ResolveAssetAlignmentOwnershipResult =
  | { ok: true; project: AssetAlignmentProjectContext; asset: AssetAlignmentAssetContext }
  | { ok: false; error: string };

export async function resolveAssetAlignmentOwnership(projectId: number, assetId: number): Promise<ResolveAssetAlignmentOwnershipResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(assetId)) return { ok: false, error: "Invalid asset id." };

  const [project] = await db
    .select({ id: projects.id, name: projects.name, pitch: projects.pitch, story: projects.story, outline: projects.outline })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };

  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset || asset.projectId !== projectId) return { ok: false, error: "Asset not found." };

  return {
    ok: true,
    project,
    asset: {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      fields: {
        description: (asset.description ?? "").trim(),
        notes: (asset.notes ?? "").trim(),
        visualIdentity: (asset.visualIdentity ?? "").trim(),
        usageRules: (asset.usageRules ?? "").trim(),
        forbiddenVariations: (asset.forbiddenVariations ?? "").trim(),
      },
      rawFields: {
        description: asset.description,
        notes: asset.notes,
        visualIdentity: asset.visualIdentity,
        usageRules: asset.usageRules,
        forbiddenVariations: asset.forbiddenVariations,
      },
    },
  };
}
