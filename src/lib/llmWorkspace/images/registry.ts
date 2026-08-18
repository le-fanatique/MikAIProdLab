// ---------------------------------------------------------------------------
// images/registry.ts — LLMW.DESCRIPTOR.IMAGE.1 (B16a)
//
// The closed image-source registry: one entry per family of stored images the
// workspace may read. Mirrors `variables/registry.ts` in shape and in
// discipline — a descriptor names a `source`, never a path.
//
// **Why a source and not a path.** Every image family in this repository has
// its own storage root and its own confinement rule:
// `isConfinedReferenceImagePath` (`src/lib/projectStyle/uploadReferenceImage.ts`)
// governs Project Style's Reference Board;
// `isConfinedUploadedReferenceImagePath` (`src/lib/uploadImage.ts`) governs the
// Asset/Shot reference-image root; `isConfinedShotReferenceVideoPathForShot`
// governs another. Path policy therefore belongs to the family that owns the
// root — the registry borrows it, and neither the descriptor format nor the
// runner ever learns what a valid path looks like.
//
// **Why the selection is not a variable.** `docs/LLM_WORKSPACE_ARCHITECTURE.md`
// §11.3 ("B8 dissolved") recorded the gap in its own words: "No variable can
// express 'the ordered subset the user just ticked'." It is right — a variable
// resolves from the anchor and the database, with no user input in it. So the
// selection arrives beside `intent` on the run input, and this module's job is
// only to turn a caller-given list of ids into ordered, verified rows.
//
// `resolve` follows the pattern already proven by `resolveLookReferences`
// (`src/lib/lookDevelopment/resolveLookReferences.ts`) rather than inventing a
// second one: the caller's order is preserved and never re-sorted, duplicates
// are refused, an id belonging to another anchor is refused, a missing id is
// refused, and an unconfined stored path is refused before any file is read.
//
// Server-only: every resolver reads the database.
// ---------------------------------------------------------------------------

import "server-only";
import type { EntityKind, ImageSourceId } from "../types";
import type { ResolvedWorkspaceImage } from "./prepare";
import {
  MAX_REFERENCE_IMAGE_SIZE_BYTES,
  isConfinedUploadedReferenceImagePath,
} from "@/lib/uploadImage";
import {
  MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES,
  isConfinedReferenceImagePath,
} from "@/lib/projectStyle/uploadReferenceImage";

export type ResolveWorkspaceImagesResult =
  | { ok: true; images: ResolvedWorkspaceImage[] }
  | { ok: false; error: string };

export type ImageSourceEntry = {
  /** Which anchor id `resolve` scopes against — the runner checks it matches `descriptor.anchor.entity`. */
  anchor: EntityKind;
  /** The family's own per-file bound, not a number this module invents. */
  maxFileBytes: number;
  /** The family's own confinement predicate, borrowed from the module that owns the storage root. */
  isConfined: (imagePath: string) => boolean;
  resolve: (anchorId: number, selectedIds: number[]) => Promise<ResolveWorkspaceImagesResult>;
};

function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * `asset_reference_images` scoped to one Asset. `metadata` carries only what a
 * prompt may legitimately say about the image in words — its label, its role
 * and the user's notes. Never the path, never the bytes, never the row id:
 * the prompt identifies an image by its per-run key alone (`prepare.ts`).
 */
async function resolveAssetReferenceImages(
  assetId: number,
  selectedIds: number[]
): Promise<ResolveWorkspaceImagesResult> {
  const orderedIds: number[] = [];
  const seen = new Set<number>();
  for (const raw of selectedIds) {
    if (!isValidId(raw)) return { ok: false, error: "Invalid reference image id." };
    if (seen.has(raw)) return { ok: false, error: "The same reference image was selected twice." };
    seen.add(raw);
    orderedIds.push(raw);
  }
  if (orderedIds.length === 0) return { ok: true, images: [] };

  // `@/db` is imported dynamically for the same reason every variable
  // resolver does it (`variables/registry.ts`): `src/db/index.ts` binds one
  // better-sqlite3 handle at first import from `DB_PATH`, so a module-scope
  // import would bind it before a test's `setupTempDb()` can redirect it.
  const { db } = await import("@/db");
  const { assetReferenceImages } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: assetReferenceImages.id,
      assetId: assetReferenceImages.assetId,
      imagePath: assetReferenceImages.imagePath,
      label: assetReferenceImages.label,
      imageRole: assetReferenceImages.imageRole,
      notes: assetReferenceImages.notes,
    })
    .from(assetReferenceImages)
    .where(inArray(assetReferenceImages.id, orderedIds));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const images: ResolvedWorkspaceImage[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (!row) return { ok: false, error: "One or more selected reference images were not found." };
    if (row.assetId !== assetId) {
      return { ok: false, error: "One or more selected reference images belong to a different Asset." };
    }
    // Refused here, before `prepare.ts` ever builds an absolute path from it:
    // a corrupted or tampered row could store any string at all.
    if (!isConfinedUploadedReferenceImagePath(row.imagePath)) {
      return { ok: false, error: `Reference image ${row.id} has a path outside the expected storage root — refusing to use it.` };
    }
    images.push({
      id: row.id,
      imagePath: row.imagePath,
      metadata: { label: row.label, imageRole: row.imageRole, notes: row.notes },
    });
  }
  return { ok: true, images };
}

/**
 * Project Style's Reference Board, scoped to one Project — LLMW.IMAGE.SOURCE.2
 * (B20c), the second family and the one B20e migrates onto.
 *
 * Three things differ from `ASSET.REFERENCE_IMAGES`, and they are exactly why
 * the registry exists rather than one hard-coded query:
 *
 *   - a different storage root, so a different confinement predicate
 *     (`isConfinedReferenceImagePath`, Project Style's own);
 *   - a different per-file bound (`MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES`);
 *   - **an approval gate the other family does not have.**
 *     `approved_for_analysis` is checked by `runReferenceAnalysisAction` today
 *     (its `not_approved` branch), so a source that ignored it would silently
 *     drop a gate the moment B20e switched over. Refused here, by name.
 *
 * `metadata` carries the four fields the analysis prompt already puts in words
 * (`referenceAnalysis/prompt.ts`'s own context block): label, provenance
 * notes, what interests the author, what to avoid. Deliberately **not**
 * `sourceUrl` — that module refuses to mention it, and B20d recorded that the
 * guarantee is enforced by `canonicalizeReferenceMetadata` dropping it. This
 * source must not be the hole that reintroduces it.
 */
async function resolveProjectStyleReferences(
  projectId: number,
  selectedIds: number[]
): Promise<ResolveWorkspaceImagesResult> {
  const orderedIds: number[] = [];
  const seen = new Set<number>();
  for (const raw of selectedIds) {
    if (!isValidId(raw)) return { ok: false, error: "Invalid reference id." };
    if (seen.has(raw)) return { ok: false, error: "The same reference was selected twice." };
    seen.add(raw);
    orderedIds.push(raw);
  }
  if (orderedIds.length === 0) return { ok: true, images: [] };

  const { db } = await import("@/db");
  const { projectStyleReferenceImages } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: projectStyleReferenceImages.id,
      projectId: projectStyleReferenceImages.projectId,
      imagePath: projectStyleReferenceImages.imagePath,
      label: projectStyleReferenceImages.label,
      provenanceNotes: projectStyleReferenceImages.provenanceNotes,
      whatInterestsMe: projectStyleReferenceImages.whatInterestsMe,
      whatToAvoid: projectStyleReferenceImages.whatToAvoid,
      approvedForAnalysis: projectStyleReferenceImages.approvedForAnalysis,
    })
    .from(projectStyleReferenceImages)
    .where(inArray(projectStyleReferenceImages.id, orderedIds));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const images: ResolvedWorkspaceImage[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (!row) return { ok: false, error: "One or more selected references were not found." };
    if (row.projectId !== projectId) {
      return { ok: false, error: "One or more selected references belong to a different Project." };
    }
    if (!row.approvedForAnalysis) {
      return { ok: false, error: `Reference ${row.id} is not approved for analysis.` };
    }
    if (!isConfinedReferenceImagePath(row.imagePath)) {
      return { ok: false, error: `Reference ${row.id} has a path outside the expected storage root — refusing to use it.` };
    }
    images.push({
      id: row.id,
      imagePath: row.imagePath,
      metadata: {
        label: row.label,
        provenanceNotes: row.provenanceNotes,
        whatInterestsMe: row.whatInterestsMe,
        whatToAvoid: row.whatToAvoid,
      },
    });
  }
  return { ok: true, images };
}

export const IMAGE_SOURCE_REGISTRY = {
  "ASSET.REFERENCE_IMAGES": {
    anchor: "asset",
    maxFileBytes: MAX_REFERENCE_IMAGE_SIZE_BYTES,
    isConfined: isConfinedUploadedReferenceImagePath,
    resolve: resolveAssetReferenceImages,
  },
  "PROJECT_STYLE.REFERENCES": {
    anchor: "project",
    maxFileBytes: MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES,
    isConfined: isConfinedReferenceImagePath,
    resolve: resolveProjectStyleReferences,
  },
} satisfies Record<ImageSourceId, ImageSourceEntry>;

// ---------------------------------------------------------------------------
// The `{images: true, render}` block's render forms — LLMW.DESCRIPTOR.IMAGE.1
// (B16a). Dispatched by name through a `satisfies`-constrained table, on the
// precedent B7c-n4 set for the seventh `Block` variant: an unmatched name
// throws in the runner rather than silently rendering `undefined`.
//
// A form here receives keys and words only. It never sees a path or a byte —
// see the `{images}` variant's own note in `types.ts` for why that boundary is
// the point rather than an omission.
// ---------------------------------------------------------------------------

export type AttachedImageForRender = {
  key: string;
  metadata: Record<string, string | null>;
};

/** Per-value bound, so a long `notes` field cannot run away with the prompt — the same discipline `referenceAnalysis/prompt.ts` applies to its own context lines. */
const MAX_IMAGE_METADATA_VALUE_LENGTH = 500;

/** `imageRole` -> `Image role`. Mechanical, so this generic form needs no per-family knowledge of what a metadata key means. */
function humanizeMetadataKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * One labelled block per attached image, in attachment order:
 *
 *   [R1]
 *   Label: rooftop at dusk
 *   Image role: lighting
 *
 * The key is what the model is told to cite, which is why it leads the block.
 * An image whose metadata is entirely empty still gets its `[key]` line: the
 * prompt states how many images are attached and in what order, and a silently
 * skipped block would break that correspondence.
 */
export function renderAttachedImagesContextLines(images: AttachedImageForRender[]): string {
  if (images.length === 0) return "";
  return images
    .map((image) => {
      const lines = [`[${image.key}]`];
      for (const [rawKey, rawValue] of Object.entries(image.metadata)) {
        const value = rawValue?.slice(0, MAX_IMAGE_METADATA_VALUE_LENGTH).trim();
        if (!value) continue;
        lines.push(`${humanizeMetadataKey(rawKey)}: ${value}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export const IMAGE_RENDER_FORMS = {
  "images.attachedContextLines": renderAttachedImagesContextLines,
} as const;
