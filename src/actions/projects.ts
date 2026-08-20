"use server";

import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  shotReferenceVideos,
  projectStyleReferenceImages,
  lookTests,
  lookTestResults,
  lookTestReferences,
  generationJobs,
  assets,
  shotVideos,
  shotVideoCandidates,
  shotReferenceImages,
  assetReferenceImages,
  shotStoryboardThumbnails,
  storyboardImages,
  sequenceStoryboardImages,
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
  sequenceVideoDrafts,
  sequenceVideoSplitRuns,
  sequenceVideoSplitSegments,
  sequenceResults,
  sequenceStyleOverrides,
  projectStyleResearchSources,
  projectStyleResearchCandidateRuleSources,
  projectStyleResearchClaimSources,
  projectStyleResearchSynthesisSources,
  projectStyleReferenceAnalysisRunReferences,
  projectStyleReferenceAnalysisObservations,
  projectStyleReferenceAnalysisCandidateRuleReferences,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { rename, unlink } from "node:fs/promises";
import path from "node:path";
import { isConfinedReferenceImagePath } from "@/lib/projectStyle/uploadReferenceImage";
import { isWithinLookDevelopmentRoot } from "@/lib/lookDevelopment/paths";
import { isConfinedNavigationBackgroundPathForOwner } from "@/lib/navigationBackground/legacyNavigationBackground";
import { assertConfinedOrThrow } from "@/lib/shotReferenceVideos/fileCleanup";
import { isConfinedUploadedReferenceImagePath } from "@/lib/uploadImage";
import { SHOT_VIDEOS_ROOT_RELATIVE } from "@/lib/shotVideoLibrary/paths";
import { SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE } from "@/lib/sequenceVideoPush/cutSegmentClip";
import { THUMBNAIL_ROOT_RELATIVE as SEQUENCE_VIDEO_SPLIT_THUMBNAIL_ROOT_RELATIVE } from "@/lib/sequenceVideoSplit/detectVideoSplits";
import { resolveExistingAbsolutePath as resolveSequenceResultAbsolutePath } from "@/lib/editorial/renderBasicSequenceResult";

// ---------------------------------------------------------------------------
// PROJ.DELETE.1 — a generic string+absolute confinement check shared by every
// NEW file family below (shot videos/candidates, reference images, generated
// storyboard/split/result media). Mirrors `isConfinedReferenceImagePath`'s
// (src/lib/projectStyle/uploadReferenceImage.ts) own string-then-absolute
// double check, parameterized by root instead of each family writing its own
// copy. `rootRelative` may be a per-row scoped root (e.g.
// `outputs/jobs/<jobId>`), not only a flat family root.
// ---------------------------------------------------------------------------
function isConfinedUnderRoot(relativePath: string, rootRelative: string): boolean {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.length > 1024) return false;
  if (relativePath.includes("..") || relativePath.includes("\\") || relativePath.includes("\0")) return false;
  if (path.isAbsolute(relativePath)) return false;
  if (!relativePath.startsWith(`${rootRelative}/`)) return false;
  const publicRoot = path.join(process.cwd(), "public");
  const absolutePath = path.join(publicRoot, relativePath);
  const safeBase = path.join(publicRoot, rootRelative);
  return absolutePath.startsWith(safeBase + path.sep);
}

const STORYBOARD_IMAGES_ROOT_RELATIVE = "uploads/storyboard-images";
const SEQUENCE_STORYBOARD_IMAGES_ROOT_RELATIVE = "uploads/sequence-storyboard-images";
const SEQUENCE_VIDEO_DRAFTS_ROOT_RELATIVE = "uploads/sequence-video-drafts";
const SEQUENCE_RESULTS_ROOT_RELATIVE = "uploads/sequence-results";

export async function createProject(formData: FormData) {
  const name = formData.get("name") as string;
  const pitch = (formData.get("pitch") as string) || null;
  const story = (formData.get("story") as string) || null;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "draft";

  if (!name?.trim()) return;

  const [project] = await db
    .insert(projects)
    .values({ name: name.trim(), pitch, story, description, status: status as "draft" | "active" | "archived" })
    .returning({ id: projects.id });

  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: number, formData: FormData) {
  const name = formData.get("name") as string;
  const pitch = (formData.get("pitch") as string) || null;
  const story = (formData.get("story") as string) || null;
  const description = (formData.get("description") as string) || null;
  const status = (formData.get("status") as string) || "draft";

  if (!name?.trim()) return;

  await db
    .update(projects)
    .set({
      name: name.trim(),
      pitch,
      story,
      description,
      status: status as "draft" | "active" | "archived",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, id));

  redirect(`/projects/${id}`);
}

/**
 * STYLE.1.B.CORE audit (retake — Codex REVISE) — `db.delete(projects)`
 * cascades every Project Style DB row (references, domains, consumers,
 * influences, influence domains, influence-reference links) automatically
 * under `PRAGMA foreign_keys=ON`, but a cascaded DB delete never touches the
 * filesystem. Without explicit handling, deleting a Project would silently
 * orphan every Reference Board file it owned.
 *
 * `deleteProject` has no user-facing error surface (it only ever redirects
 * to `/projects`), so a real failure at any stage below is a THROWN error
 * (Next.js's own error boundary renders it) rather than a logged-and-
 * ignored problem — this action must never redirect to `/projects` looking
 * like a clean success when it was not:
 *
 *   1. Every stored reference path is checked for confinement BEFORE
 *      anything is touched. An unconfined path (never produced by the real
 *      upload path, but defense in depth against a corrupted/tampered row)
 *      aborts the whole operation instead of being silently skipped.
 *   2. Every confined file is quarantined (same-directory rename) BEFORE
 *      the Project row is deleted — fully reversible up to this point. A
 *      quarantine failure restores everything already quarantined and
 *      aborts; nothing has been written to the DB yet.
 *   3. Only once every file is safely quarantined is the Project deleted
 *      (cascades all Style DB rows in one atomic statement). If this
 *      throws, every quarantined file is restored to its original path and
 *      the error is rethrown — the DB was never actually mutated in that
 *      case (a single `DELETE` either commits fully or not at all).
 *   4. After the DB delete commits, every quarantined file is permanently
 *      removed BEFORE the success redirect — never after it. If any
 *      permanent removal fails, a real error is thrown instead of
 *      redirecting to a false success; the DB rows are irreversibly gone
 *      at that point (compensating a whole Project's rows back is
 *      disproportionate for this ticket), but the leaked file is left
 *      under its durable, greppable `.trash-*` path and reported with its
 *      exact location rather than silently logged.
 *
 * STYLE.1.G.CORE.1 — Look Development results (`look_test_results`,
 * file-backed under `uploads/look-development/`) now go through this exact
 * same confine -> quarantine -> delete -> unlink discipline, sharing one
 * combined `filesToQuarantine` list with Project Style references rather
 * than a second independent implementation of the same lifecycle.
 *
 * PROJ.DELETE.1 — closes the "Asset/Shot reference-image file cleanup" gap
 * noted above (now handled, see the family list further down) and, more
 * importantly, fixes the reason this function had never actually SUCCEEDED
 * for any of the six real Projects in the database: eleven-plus `NO ACTION`
 * foreign keys inside this same subtree, several of them on columns whose
 * `schema.ts` declaration claims `cascade`/`set null` but whose real DB
 * definition (confirmed via `PRAGMA foreign_key_list`, never guessed) is
 * `NO ACTION` — SQLite does not honor an `onDelete` clause added through
 * `ALTER TABLE ADD COLUMN`, the same characteristic `generation_jobs.
 * lookTestId` already documented above. Every extra table this function now
 * reads/deletes/quarantines is either (a) a table this exact discipline
 * simply did not reach yet, or (b) an explicit, dependency-ordered delete
 * inside the SAME transaction that breaks a `NO ACTION` edge before the
 * final `tx.delete(projects)` cascade reaches it. No schema change, no
 * migration, no `PRAGMA` toggling — see `.agents/executor_report.md` for
 * the full dependency graph this was derived from.
 */
export async function deleteProject(id: number) {
  const styleReferences = await db
    .select({ id: projectStyleReferenceImages.id, imagePath: projectStyleReferenceImages.imagePath })
    .from(projectStyleReferenceImages)
    .where(eq(projectStyleReferenceImages.projectId, id));

  for (const ref of styleReferences) {
    if (!isConfinedReferenceImagePath(ref.imagePath)) {
      throw new Error(
        `deleteProject(${id}): refusing to delete — Project Style reference ${ref.id} has an unconfined stored path ("${ref.imagePath}"). Fix this row manually before retrying.`
      );
    }
  }

  // UX.MEDIA.PREVIEW.1 — the Project's own row background AND every child
  // Sequence's row background are file-backed under
  // uploads/navigation-backgrounds/. The DB rows are cascade-deleted with
  // the Project (FK onDelete: "cascade"), but a cascade never touches the
  // filesystem — every confined path found here joins the same
  // quarantine/unlink discipline as Style references and Look results.
  const [projectRow] = await db
    .select({ rowBackgroundImagePath: projects.rowBackgroundImagePath })
    .from(projects)
    .where(eq(projects.id, id));
  const projectBackgroundPath = projectRow?.rowBackgroundImagePath ?? null;
  // Retake Round 2 (Codex P1) — owner-aware: the path must be confined to
  // THIS Project's own `project-<id>` subfolder, not just somewhere under
  // the shared navigation-backgrounds root (a corrupted row pointing at a
  // DIFFERENT owner's subfolder must never be treated as this Project's own
  // file to quarantine/delete).
  if (projectBackgroundPath && !isConfinedNavigationBackgroundPathForOwner(projectBackgroundPath, "project", id)) {
    throw new Error(
      `deleteProject(${id}): refusing to delete — the Project's row background is not confined to this Project's own subfolder ("${projectBackgroundPath}"). Fix this row manually before retrying.`
    );
  }

  const sequenceBackgrounds = await db
    .select({ id: sequences.id, imagePath: sequences.rowBackgroundImagePath })
    .from(sequences)
    .where(eq(sequences.projectId, id));
  for (const seq of sequenceBackgrounds) {
    if (seq.imagePath && !isConfinedNavigationBackgroundPathForOwner(seq.imagePath, "sequence", seq.id)) {
      throw new Error(
        `deleteProject(${id}): refusing to delete — Sequence ${seq.id}'s row background is not confined to that Sequence's own subfolder ("${seq.imagePath}"). Fix this row manually before retrying.`
      );
    }
  }

  // SHOT.VIDEO.REFERENCES.1 — `shot_reference_videos.shotId` is `onDelete:
  // "cascade"`, so deleting this Project cascades every Shot (via each
  // Sequence, also cascade), which transitively cascades every Video
  // Reference row across the whole Project. Same confine -> quarantine ->
  // delete -> unlink discipline as Style references / Look results /
  // navigation backgrounds above, sharing the one combined
  // `filesToQuarantine` list below rather than a second independent cleanup
  // pass.
  const projectShotIds = sequenceBackgrounds.length > 0 ? (await db.select({ id: shots.id }).from(shots).where(inArray(shots.sequenceId, sequenceBackgrounds.map((s) => s.id)))).map((s) => s.id) : [];
  const referenceVideos =
    projectShotIds.length > 0
      ? await db
          .select({ id: shotReferenceVideos.id, shotId: shotReferenceVideos.shotId, videoPath: shotReferenceVideos.videoPath })
          .from(shotReferenceVideos)
          .where(inArray(shotReferenceVideos.shotId, projectShotIds))
      : [];
  for (const ref of referenceVideos) {
    assertConfinedOrThrow(ref, `deleteProject(${id})`);
  }
  const initialReferenceVideoPathById = new Map(referenceVideos.map((r) => [r.id, r.videoPath] as const));

  // STYLE.1.G.CORE.1 — Look Development results are file-backed exactly
  // like Project Style references, under their own dedicated confined
  // root (uploads/look-development/), and must leave zero orphaned file on
  // Project delete. Same confine-then-quarantine-then-delete-then-unlink
  // discipline as the Style reference block above, sharing the one
  // `quarantined`/`publicRoot` loop below rather than a second copy of it.
  const publicRoot = path.join(process.cwd(), "public");
  const lookResults = await db
    .select({ id: lookTestResults.id, filePath: lookTestResults.filePath })
    .from(lookTestResults)
    .where(eq(lookTestResults.projectId, id));

  for (const result of lookResults) {
    const absolute = path.resolve(publicRoot, result.filePath);
    if (!isWithinLookDevelopmentRoot(absolute)) {
      throw new Error(
        `deleteProject(${id}): refusing to delete — Look Test result ${result.id} has an unconfined stored path ("${result.filePath}"). Fix this row manually before retrying.`
      );
    }
  }

  // STYLE.1.G.CORE.1 Round 6 — the exact initial snapshot of Look-result
  // identities/paths, kept SEPARATE from `quarantined` (the subset of
  // files that were physically found and renamed). A row whose confined
  // file was already missing at collection time (ENOENT during
  // quarantine, see the loop below) never enters `quarantined`, but it
  // MUST still count as "known and expected" for the anti-race recheck —
  // otherwise it is indistinguishable from a brand-new concurrent
  // publication and permanently blocks deletion (Round 5 Finding).
  const initialLookResultPathById = new Map(lookResults.map((r) => [r.id, r.filePath] as const));
  // UX.MEDIA.PREVIEW.1 (Retake Round 1) — same anti-race discipline for the
  // Project's own row background and every child Sequence's row background:
  // `sequenceBackgrounds` already covers every Sequence of this Project
  // (not just ones with a background), so a missing entry below can only
  // mean a Sequence created after collection began.
  const initialSequenceBackgroundPathById = new Map(sequenceBackgrounds.map((s) => [s.id, s.imagePath] as const));

  // ---------------------------------------------------------------------------
  // PROJ.DELETE.1 — the rest of the project subtree's file-backed tables (see
  // ticket's "Les tables à fichiers du sous-arbre"). Every column below was
  // checked against the code that WRITES it, not its name, before being
  // treated as owned:
  //
  //   - `shots.approvedVideoPath` is NEVER independently owned — it is always
  //     a copy of either `shot_videos.videoPath` (src/lib/shotVideoLibrary/
  //     approve.ts) or `shot_video_candidates.clipPath`
  //     (src/actions/sequenceVideoPush.ts:433). Deleting via the two owning
  //     tables below already removes that same physical file exactly once;
  //     `approvedVideoPath` itself is excluded from this list so the SAME
  //     file is never queued for quarantine twice under two different
  //     source labels.
  //   - `sequence_video_split_runs.sourceVideoPathSnapshot` is a read-only
  //     PROVENANCE copy of `sequence_video_drafts.videoPath` at run-creation
  //     time (src/actions/sequenceVideoSplitDetection.ts:101/269 — literally
  //     `sourceVideoPathSnapshot: draft.videoPath`), never a file this row
  //     owns. Excluded.
  //   - `sequence_storyboard_extractions.sourceImagePath` is the same kind of
  //     PROVENANCE snapshot of `sequence_storyboard_images.imagePath`
  //     (src/actions/storyboardExtractionStart.ts:166 — `sourceImagePath:
  //     source.imagePath`; the schema's own comment confirms: "kept even if
  //     the source draft row above is later deleted"). Excluded.
  //   - `shot_reference_images.imagePath` can ALSO be a shared alias of a
  //     `storyboard_images.imagePath` / `sequence_storyboard_extraction_
  //     regions.cropImagePath` file for an extracted panel — all three are
  //     written to `c.destRelative`, the exact same path, in
  //     storyboardExtractionConfirm.ts. Rows under `uploads/storyboard-images/`
  //     are confinement-checked here but NOT separately queued — the
  //     `storyboard-image` family below already owns that path, so it is
  //     unlinked exactly once (a second attempt would be a harmless
  //     ENOENT-tolerated no-op regardless, but this avoids a confusing
  //     duplicate bookkeeping entry).
  // ---------------------------------------------------------------------------

  const projectSequenceIds = sequenceBackgrounds.map((s) => s.id);
  const projectAssetRows = await db.select({ id: assets.id }).from(assets).where(eq(assets.projectId, id));
  const projectAssetIds = projectAssetRows.map((a) => a.id);
  const initialLookTestRows = await db.select({ id: lookTests.id }).from(lookTests).where(eq(lookTests.projectId, id));
  const initialLookTestIds = initialLookTestRows.map((t) => t.id);
  // Note: the id lists for `project_style_reference_images` and
  // `project_style_research_sources` used by the relational NO ACTION
  // fixes below are deliberately NOT collected here — they are re-derived
  // fresh from `tx` at the point of use (see the transaction body), never
  // trusted from a pre-transaction snapshot.

  const shotVideoRows =
    projectShotIds.length > 0 ? await db.select({ id: shotVideos.id, videoPath: shotVideos.videoPath }).from(shotVideos).where(inArray(shotVideos.shotId, projectShotIds)) : [];
  const shotVideoCandidateRows =
    projectShotIds.length > 0
      ? await db.select({ id: shotVideoCandidates.id, clipPath: shotVideoCandidates.clipPath }).from(shotVideoCandidates).where(inArray(shotVideoCandidates.shotId, projectShotIds))
      : [];
  const shotReferenceImageRows =
    projectShotIds.length > 0
      ? await db.select({ id: shotReferenceImages.id, imagePath: shotReferenceImages.imagePath }).from(shotReferenceImages).where(inArray(shotReferenceImages.shotId, projectShotIds))
      : [];
  const shotReferenceImageOwnRows = shotReferenceImageRows.filter((r) => !r.imagePath.startsWith(`${STORYBOARD_IMAGES_ROOT_RELATIVE}/`));
  const shotReferenceImageSharedStoryboardRows = shotReferenceImageRows.filter((r) => r.imagePath.startsWith(`${STORYBOARD_IMAGES_ROOT_RELATIVE}/`));
  const assetReferenceImageRows =
    projectAssetIds.length > 0
      ? await db.select({ id: assetReferenceImages.id, imagePath: assetReferenceImages.imagePath }).from(assetReferenceImages).where(inArray(assetReferenceImages.assetId, projectAssetIds))
      : [];
  const storyboardImageRows =
    projectShotIds.length > 0
      ? await db.select({ id: storyboardImages.id, imagePath: storyboardImages.imagePath }).from(storyboardImages).where(inArray(storyboardImages.shotId, projectShotIds))
      : [];
  const projectExtractionRows =
    projectSequenceIds.length > 0
      ? await db.select({ id: sequenceStoryboardExtractions.id }).from(sequenceStoryboardExtractions).where(inArray(sequenceStoryboardExtractions.sequenceId, projectSequenceIds))
      : [];
  const projectExtractionIds = projectExtractionRows.map((e) => e.id);
  const extractionRegionRows =
    projectExtractionIds.length > 0
      ? await db
          .select({ id: sequenceStoryboardExtractionRegions.id, cropImagePath: sequenceStoryboardExtractionRegions.cropImagePath })
          .from(sequenceStoryboardExtractionRegions)
          .where(inArray(sequenceStoryboardExtractionRegions.extractionId, projectExtractionIds))
      : [];
  const extractionRegionRowsWithCrop = extractionRegionRows.filter((r): r is { id: number; cropImagePath: string } => !!r.cropImagePath);
  const sequenceStoryboardImageRows =
    projectSequenceIds.length > 0
      ? await db.select({ id: sequenceStoryboardImages.id, imagePath: sequenceStoryboardImages.imagePath }).from(sequenceStoryboardImages).where(inArray(sequenceStoryboardImages.sequenceId, projectSequenceIds))
      : [];
  const sequenceVideoDraftRows =
    projectSequenceIds.length > 0
      ? await db.select({ id: sequenceVideoDrafts.id, videoPath: sequenceVideoDrafts.videoPath }).from(sequenceVideoDrafts).where(inArray(sequenceVideoDrafts.sequenceId, projectSequenceIds))
      : [];
  const projectSplitRunRows =
    projectSequenceIds.length > 0
      ? await db.select({ id: sequenceVideoSplitRuns.id }).from(sequenceVideoSplitRuns).where(inArray(sequenceVideoSplitRuns.sequenceId, projectSequenceIds))
      : [];
  const projectSplitRunIds = projectSplitRunRows.map((r) => r.id);
  const splitSegmentRows =
    projectSplitRunIds.length > 0
      ? await db
          .select({ id: sequenceVideoSplitSegments.id, thumbnailPath: sequenceVideoSplitSegments.thumbnailPath })
          .from(sequenceVideoSplitSegments)
          .where(inArray(sequenceVideoSplitSegments.splitRunId, projectSplitRunIds))
      : [];
  const splitSegmentRowsWithThumbnail = splitSegmentRows.filter((r): r is { id: number; thumbnailPath: string } => !!r.thumbnailPath);
  const sequenceResultRows = await db.select({ id: sequenceResults.id, videoPath: sequenceResults.videoPath }).from(sequenceResults).where(eq(sequenceResults.projectId, id));
  const sequenceResultRowsWithVideo = sequenceResultRows.filter((r): r is { id: number; videoPath: string } => !!r.videoPath);

  const jobsByShot =
    projectShotIds.length > 0 ? await db.select({ id: generationJobs.id, outputPath: generationJobs.outputPath }).from(generationJobs).where(inArray(generationJobs.shotId, projectShotIds)) : [];
  const jobsByAsset =
    projectAssetIds.length > 0
      ? await db.select({ id: generationJobs.id, outputPath: generationJobs.outputPath }).from(generationJobs).where(inArray(generationJobs.assetId, projectAssetIds))
      : [];
  const jobsBySequence =
    projectSequenceIds.length > 0
      ? await db.select({ id: generationJobs.id, outputPath: generationJobs.outputPath }).from(generationJobs).where(inArray(generationJobs.sequenceId, projectSequenceIds))
      : [];
  const jobsByLookTest =
    initialLookTestIds.length > 0
      ? await db.select({ id: generationJobs.id, outputPath: generationJobs.outputPath }).from(generationJobs).where(inArray(generationJobs.lookTestId, initialLookTestIds))
      : [];
  // "Exactly one target" is an application-level invariant (assertSingleGenerationTarget,
  // src/actions/generation.ts) — the four sets above never overlap.
  const projectGenerationJobRows = [...jobsByShot, ...jobsByAsset, ...jobsBySequence, ...jobsByLookTest];
  const projectGenerationJobRowsWithOutput = projectGenerationJobRows.filter((r): r is { id: number; outputPath: string } => !!r.outputPath);

  function assertConfinedFile(label: string, rowId: number, value: string, isConfined: (p: string) => boolean): void {
    if (!isConfined(value)) {
      throw new Error(`deleteProject(${id}): refusing to delete — ${label} ${rowId} has an unconfined stored path ("${value}"). Fix this row manually before retrying.`);
    }
  }

  for (const r of shotVideoRows) assertConfinedFile("Shot Video", r.id, r.videoPath, (p) => isConfinedUnderRoot(p, SHOT_VIDEOS_ROOT_RELATIVE));
  for (const r of shotVideoCandidateRows) assertConfinedFile("Shot Video Candidate", r.id, r.clipPath, (p) => isConfinedUnderRoot(p, SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE));
  for (const r of shotReferenceImageOwnRows) assertConfinedFile("Shot Reference Image", r.id, r.imagePath, isConfinedUploadedReferenceImagePath);
  for (const r of shotReferenceImageSharedStoryboardRows) assertConfinedFile("Shot Reference Image", r.id, r.imagePath, (p) => isConfinedUnderRoot(p, STORYBOARD_IMAGES_ROOT_RELATIVE));
  for (const r of assetReferenceImageRows) assertConfinedFile("Asset Reference Image", r.id, r.imagePath, isConfinedUploadedReferenceImagePath);
  for (const r of storyboardImageRows) assertConfinedFile("Storyboard Image", r.id, r.imagePath, (p) => isConfinedUnderRoot(p, STORYBOARD_IMAGES_ROOT_RELATIVE));
  for (const r of extractionRegionRowsWithCrop) assertConfinedFile("Storyboard Extraction Region", r.id, r.cropImagePath, (p) => isConfinedUnderRoot(p, STORYBOARD_IMAGES_ROOT_RELATIVE));
  for (const r of sequenceStoryboardImageRows) assertConfinedFile("Sequence Storyboard Image", r.id, r.imagePath, (p) => isConfinedUnderRoot(p, SEQUENCE_STORYBOARD_IMAGES_ROOT_RELATIVE));
  for (const r of sequenceVideoDraftRows) assertConfinedFile("Sequence Video Draft", r.id, r.videoPath, (p) => isConfinedUnderRoot(p, SEQUENCE_VIDEO_DRAFTS_ROOT_RELATIVE));
  for (const r of splitSegmentRowsWithThumbnail) assertConfinedFile("Split Segment thumbnail", r.id, r.thumbnailPath, (p) => isConfinedUnderRoot(p, SEQUENCE_VIDEO_SPLIT_THUMBNAIL_ROOT_RELATIVE));
  for (const r of sequenceResultRowsWithVideo) assertConfinedFile("Sequence Result video", r.id, r.videoPath, (p) => isConfinedUnderRoot(p, SEQUENCE_RESULTS_ROOT_RELATIVE));
  for (const r of projectGenerationJobRowsWithOutput) assertConfinedFile("Generation Job output", r.id, r.outputPath, (p) => isConfinedUnderRoot(p, `outputs/jobs/${r.id}`));

  type QuarantineSource =
    | "style-reference"
    | "look-result"
    | "navigation-background"
    | "shot-reference-video"
    | "shot-video"
    | "shot-video-candidate"
    | "shot-reference-image"
    | "asset-reference-image"
    | "storyboard-image"
    | "sequence-storyboard-image"
    | "sequence-video-draft"
    | "sequence-video-split-thumbnail"
    | "sequence-result-video"
    | "generation-job-output";

  type QuarantineEntry = { source: QuarantineSource; id: number; imagePath: string; resolveAbsolute?: () => Promise<string | null> };
  const filesToQuarantine: QuarantineEntry[] = [
    ...styleReferences.map((ref): QuarantineEntry => ({ source: "style-reference", id: ref.id, imagePath: ref.imagePath })),
    ...lookResults.map((r): QuarantineEntry => ({ source: "look-result", id: r.id, imagePath: r.filePath })),
    ...(projectBackgroundPath
      ? [{ source: "navigation-background" as const, id, imagePath: projectBackgroundPath }]
      : []),
    ...sequenceBackgrounds
      .filter((seq) => seq.imagePath)
      .map((seq): QuarantineEntry => ({ source: "navigation-background", id: seq.id, imagePath: seq.imagePath! })),
    ...referenceVideos.map((ref): QuarantineEntry => ({ source: "shot-reference-video", id: ref.id, imagePath: ref.videoPath })),
    ...shotVideoRows.map((r): QuarantineEntry => ({ source: "shot-video", id: r.id, imagePath: r.videoPath })),
    ...shotVideoCandidateRows.map((r): QuarantineEntry => ({ source: "shot-video-candidate", id: r.id, imagePath: r.clipPath })),
    ...shotReferenceImageOwnRows.map((r): QuarantineEntry => ({ source: "shot-reference-image", id: r.id, imagePath: r.imagePath })),
    ...assetReferenceImageRows.map((r): QuarantineEntry => ({ source: "asset-reference-image", id: r.id, imagePath: r.imagePath })),
    ...storyboardImageRows.map((r): QuarantineEntry => ({ source: "storyboard-image", id: r.id, imagePath: r.imagePath })),
    ...sequenceStoryboardImageRows.map((r): QuarantineEntry => ({ source: "sequence-storyboard-image", id: r.id, imagePath: r.imagePath })),
    ...sequenceVideoDraftRows.map((r): QuarantineEntry => ({ source: "sequence-video-draft", id: r.id, imagePath: r.videoPath })),
    ...splitSegmentRowsWithThumbnail.map((r): QuarantineEntry => ({ source: "sequence-video-split-thumbnail", id: r.id, imagePath: r.thumbnailPath })),
    ...projectGenerationJobRowsWithOutput.map((r): QuarantineEntry => ({ source: "generation-job-output", id: r.id, imagePath: r.outputPath })),
    // PROJ.DELETE.1 piège #2 — a physical file never gets queued twice: the
    // shared shot_reference_images rows under uploads/storyboard-images/ are
    // confinement-checked above but deliberately NOT added here (the
    // "storyboard-image" entries above already own that exact path).
    //
    // Dual-root family (public/uploads vs storage/uploads — see
    // resolveSequenceResultAbsolutePath's own header comment): resolved at
    // quarantine time, not here.
    ...sequenceResultRowsWithVideo.map(
      (r): QuarantineEntry => ({
        source: "sequence-result-video",
        id: r.id,
        imagePath: r.videoPath,
        resolveAbsolute: () => resolveSequenceResultAbsolutePath(r.videoPath),
      })
    ),
  ];

  const quarantined: { source: QuarantineSource; id: number; imagePath: string; originalAbsolute: string; quarantineAbsolute: string }[] = [];

  for (const ref of filesToQuarantine) {
    const originalAbsolute = ref.resolveAbsolute ? await ref.resolveAbsolute() : path.join(publicRoot, ref.imagePath);
    if (originalAbsolute === null) continue; // already gone under every candidate root — nothing to quarantine or restore
    const quarantineAbsolute = `${originalAbsolute}.trash-${Date.now()}-${ref.source}-${ref.id}`;
    try {
      await rename(originalAbsolute, quarantineAbsolute);
      quarantined.push({ source: ref.source, id: ref.id, imagePath: ref.imagePath, originalAbsolute, quarantineAbsolute });
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") continue; // already gone — nothing to quarantine or restore

      const quarantineRestoreResults: { source: QuarantineEntry["source"]; original: string; quarantine: string; restored: boolean; error?: string }[] = [];
      for (const q of quarantined) {
        try {
          await rename(q.quarantineAbsolute, q.originalAbsolute);
          quarantineRestoreResults.push({ source: q.source, original: q.originalAbsolute, quarantine: q.quarantineAbsolute, restored: true });
        } catch (restoreErr) {
          quarantineRestoreResults.push({
            source: q.source,
            original: q.originalAbsolute,
            quarantine: q.quarantineAbsolute,
            restored: false,
            error: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
          });
        }
      }
      const failedQRestores = quarantineRestoreResults.filter((r) => !r.restored);
      const baseMsg = `deleteProject(${id}): failed to prepare ${ref.source} file "${ref.imagePath}" for deletion — nothing was changed in the database: ${e instanceof Error ? e.message : String(e)}`;
      if (failedQRestores.length > 0) {
        // SHOT.VIDEO.REFERENCES.1 (Retake Round 1, Codex P2) — same
        // source-based sanitization split as the two blocks below.
        const refVideoFailed = failedQRestores.filter((r) => r.source === "shot-reference-video");
        const otherFailed = failedQRestores.filter((r) => r.source !== "shot-reference-video");
        if (refVideoFailed.length > 0) console.error(`deleteProject(${id}): failed to restore ${refVideoFailed.length} Video Reference file(s) from quarantine during rollback:`, refVideoFailed);
        const detailParts = [
          ...otherFailed.map((r) => `"${r.quarantine}" → "${r.original}" (${r.error})`),
          ...(refVideoFailed.length > 0 ? [`${refVideoFailed.length} Video Reference file(s) could not be automatically restored (see server log)`] : []),
        ];
        throw new Error(
          `${baseMsg}. ${quarantineRestoreResults.length - failedQRestores.length} file(s) restored, ${failedQRestores.length} file(s) still under quarantine: ${detailParts.join("; ")}`
        );
      }
      throw new Error(`${baseMsg}. All ${quarantineRestoreResults.length} already-quarantined file(s) were restored.`);
    }
  }

  // STYLE.1.G.CORE.1 Round 5 (Finding 1) — the only recoverable copy of
  // each file (its quarantined, still-renamed-not-deleted form) must never
  // be destroyed before the DB commit is KNOWN to have succeeded. Round 4
  // permanently unlinked files before the transaction, which meant a later
  // failure in that same loop left EARLIER files already gone forever even
  // though the whole operation still reported (or attempted) a rollback —
  // an unrecoverable, incoherent state. The fix: quarantine (reversible
  // rename, already done above) -> DB transaction -> ONLY THEN permanently
  // unlink. Every failure branch before the transaction commits is a
  // simple, deterministic rename-back (never an unlink, so never
  // irreversible); the only irreversible step (permanent unlink) happens
  // strictly after the DB has durably recorded the deletion.
  try {
    // Atomically delete Look jobs and the Project in ONE synchronous
    // transaction, with a race-safe completeness check: before the
    // cascade deletes, re-read the current look_test_results rows for
    // this Project. If a result was published between the initial file
    // collection and now (i.e. it has a filePath not present in our
    // quarantined list), the transaction throws and is rolled back —
    // nothing has been deleted, permanently or otherwise, at this point.
    db.transaction((tx) => {
      const currentLookResults = tx
        .select({ id: lookTestResults.id, filePath: lookTestResults.filePath })
        .from(lookTestResults)
        .where(eq(lookTestResults.projectId, id))
        .all();
      // STYLE.1.G.CORE.1 Round 6 — compare against the INITIAL DB
      // snapshot of Look-result identities/paths (`initialLookResultPathById`),
      // never against `quarantined` (only the subset of files that were
      // physically found on disk). A row that was already known at
      // collection time, even one whose confined file was already
      // missing (a stale-but-expected no-op for cleanup purposes), must
      // never be treated the same as a genuinely new concurrent
      // publication or a concurrent path change on an existing row.
      for (const r of currentLookResults) {
        const initialPath = initialLookResultPathById.get(r.id);
        if (initialPath === undefined) {
          throw new Error(
            `deleteProject(${id}): a new Look result (#${r.id}) was published after file collection began (filePath: "${r.filePath}"). Rollback — quarantine this file and retry.`
          );
        }
        if (initialPath !== r.filePath) {
          throw new Error(
            `deleteProject(${id}): Look result #${r.id}'s file path changed after file collection began (was "${initialPath}", now "${r.filePath}"). Rollback — quarantine the new file and retry.`
          );
        }
      }

      // UX.MEDIA.PREVIEW.1 (Retake Round 1, Codex P1) — re-verify the exact
      // Project background path AND every Sequence's exact background path
      // inside this same transaction, immediately before the cascade
      // delete. A background published/replaced between collection and now
      // rolls the whole transaction back (its file was never quarantined,
      // so it must not be cascade-deleted from the DB while surviving,
      // orphaned, on disk).
      const currentProjectRows = tx
        .select({ rowBackgroundImagePath: projects.rowBackgroundImagePath })
        .from(projects)
        .where(eq(projects.id, id))
        .all() as { rowBackgroundImagePath: string | null }[];
      const currentProjectRow = currentProjectRows[0];
      if (!currentProjectRow) {
        throw new Error(`deleteProject(${id}): Project disappeared before delete.`);
      }
      if (currentProjectRow.rowBackgroundImagePath !== projectBackgroundPath) {
        throw new Error(
          `deleteProject(${id}): the Project's row background changed after file collection began (was ${JSON.stringify(projectBackgroundPath)}, now ${JSON.stringify(currentProjectRow.rowBackgroundImagePath)}). Rollback — quarantine the new file and retry.`
        );
      }

      const currentSequenceRows = tx
        .select({ id: sequences.id, rowBackgroundImagePath: sequences.rowBackgroundImagePath })
        .from(sequences)
        .where(eq(sequences.projectId, id))
        .all() as { id: number; rowBackgroundImagePath: string | null }[];
      for (const seqRow of currentSequenceRows) {
        const initialPath = initialSequenceBackgroundPathById.has(seqRow.id)
          ? initialSequenceBackgroundPathById.get(seqRow.id)!
          : null;
        if (initialPath !== seqRow.rowBackgroundImagePath) {
          throw new Error(
            `deleteProject(${id}): Sequence #${seqRow.id}'s row background changed after file collection began (was ${JSON.stringify(initialPath)}, now ${JSON.stringify(seqRow.rowBackgroundImagePath)}). Rollback — quarantine the new file and retry.`
          );
        }
      }

      // SHOT.VIDEO.REFERENCES.1 — same anti-race recheck, against the
      // INITIAL DB snapshot of Video Reference identities/paths
      // (`initialReferenceVideoPathById`), for every Shot this Project
      // still owns (re-derived here, inside the transaction, rather than
      // trusted from `projectShotIds` collected earlier).
      const currentProjectShotIds = tx
        .select({ id: shots.id })
        .from(shots)
        .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
        .where(eq(sequences.projectId, id))
        .all()
        .map((r) => r.id);
      const currentReferenceVideos =
        currentProjectShotIds.length > 0
          ? tx.select({ id: shotReferenceVideos.id, videoPath: shotReferenceVideos.videoPath }).from(shotReferenceVideos).where(inArray(shotReferenceVideos.shotId, currentProjectShotIds)).all()
          : [];
      for (const r of currentReferenceVideos) {
        const initialPath = initialReferenceVideoPathById.get(r.id);
        if (initialPath === undefined) {
          throw new Error(`deleteProject(${id}): a new Video Reference (#${r.id}) was added after file collection began (videoPath: "${r.videoPath}"). Rollback — quarantine this file and retry.`);
        }
        if (initialPath !== r.videoPath) {
          throw new Error(`deleteProject(${id}): Video Reference #${r.id}'s file path changed after file collection began (was "${initialPath}", now "${r.videoPath}"). Rollback — quarantine the new file and retry.`);
        }
      }

      // ---------------------------------------------------------------------
      // PROJ.DELETE.1 — explicit, dependency-ordered deletes for every `NO
      // ACTION` foreign key the real DB carries in this subtree (see
      // `.agents/executor_report.md` for the full graph, captured via
      // `PRAGMA foreign_key_list` — never guessed from `schema.ts`, which
      // several of these columns misrepresent: SQLite does not honor an
      // `onDelete` clause added through `ALTER TABLE ADD COLUMN`). Every row
      // touched below is re-derived fresh from `tx` (never trusted from a
      // pre-transaction snapshot) and belongs to THIS project's own subtree
      // only — nothing here can affect another project's rows. Each step is
      // a pure relational delete/null (no filesystem I/O — the files
      // themselves were already quarantined above); after this block, every
      // `NO ACTION` edge back into the subtree is broken, so the final
      // `tx.delete(projects)` cascade below can run all the way through.
      // ---------------------------------------------------------------------
      // Reuses `currentProjectShotIds`, already re-derived fresh above for
      // the Video Reference anti-race recheck — never a second, possibly
      // divergent query for the same set.
      const currentProjectSequenceIds = tx.select({ id: sequences.id }).from(sequences).where(eq(sequences.projectId, id)).all().map((r) => r.id);
      const currentProjectReferenceImageIds = tx
        .select({ id: projectStyleReferenceImages.id })
        .from(projectStyleReferenceImages)
        .where(eq(projectStyleReferenceImages.projectId, id))
        .all()
        .map((r) => r.id);
      const currentProjectResearchSourceIds = tx
        .select({ id: projectStyleResearchSources.id })
        .from(projectStyleResearchSources)
        .where(eq(projectStyleResearchSources.projectId, id))
        .all()
        .map((r) => r.id);

      // shot_reference_images.sourceShotVideoCandidateId -> shot_video_candidates
      // (NO ACTION, nullable) — same fix as deleteShotVideoCandidate's own
      // REVISE round 2 (src/actions/sequenceVideoPush.ts), applied to every
      // candidate this Project owns at once.
      if (currentProjectShotIds.length > 0) {
        tx.update(shotReferenceImages)
          .set({ sourceShotVideoCandidateId: null, updatedAt: new Date().toISOString() })
          .where(inArray(shotReferenceImages.shotId, currentProjectShotIds))
          .run();
      }

      // shot_storyboard_thumbnails.referenceImageId -> shot_reference_images
      // (NO ACTION) — the selector row is always cleared before its
      // Reference Image, exactly like deleteShotReferenceImage's own
      // discipline (src/actions/shotReferenceImages.ts).
      if (currentProjectShotIds.length > 0) {
        tx.delete(shotStoryboardThumbnails).where(inArray(shotStoryboardThumbnails.shotId, currentProjectShotIds)).run();
      }

      // shot_videos.shotId -> shots (NO ACTION) — never cascades on its own;
      // must be deleted before its Shot.
      if (currentProjectShotIds.length > 0) {
        tx.delete(shotVideos).where(inArray(shotVideos.shotId, currentProjectShotIds)).run();
      }

      // shot_video_candidates.shotId / splitRunId / splitSegmentId (all NO
      // ACTION) — deleted before its Shot AND before the Split Run/Segment it
      // was cut from (both below).
      if (currentProjectShotIds.length > 0) {
        tx.delete(shotVideoCandidates).where(inArray(shotVideoCandidates.shotId, currentProjectShotIds)).run();
      }

      // sequence_video_split_runs.sequenceVideoDraftId -> sequence_video_drafts
      // (NO ACTION, notNull) — deleted before its source draft. Cascades its
      // own sequence_video_split_segments rows (real onDelete: cascade).
      if (currentProjectSequenceIds.length > 0) {
        tx.delete(sequenceVideoSplitRuns).where(inArray(sequenceVideoSplitRuns.sequenceId, currentProjectSequenceIds)).run();
      }

      // generation_jobs.sequenceId -> sequences (NO ACTION) — the
      // look_test_id sibling below already gets this same explicit
      // treatment; sequence-target jobs need it too (shot/asset-target jobs
      // are real `onDelete: cascade` and need no explicit handling).
      if (currentProjectSequenceIds.length > 0) {
        tx.delete(generationJobs).where(inArray(generationJobs.sequenceId, currentProjectSequenceIds)).run();
      }

      // storyboard_images.extractionRegionId -> sequence_storyboard_extraction_regions
      // (NO ACTION in the real DB despite schema.ts's "set null" — see that
      // column's own comment) — nulled before its Region's Extraction cascades
      // away with the Sequence. The draft row itself is untouched here (its
      // file/row were already collected/deleted through the storyboard-image
      // family above).
      if (currentProjectShotIds.length > 0) {
        tx.update(storyboardImages)
          .set({ extractionRegionId: null, updatedAt: new Date().toISOString() })
          .where(inArray(storyboardImages.shotId, currentProjectShotIds))
          .run();
      }

      // sequence_style_overrides.sourceProjectStyleVersionId -> project_style_versions
      // (NO ACTION, notNull) — deleted before Style versions cascade away
      // with the Project.
      if (currentProjectSequenceIds.length > 0) {
        tx.delete(sequenceStyleOverrides).where(inArray(sequenceStyleOverrides.sequenceId, currentProjectSequenceIds)).run();
      }

      // Every join/observation row whose NO ACTION FK points at
      // project_style_reference_images — deleted before the Reference Board
      // cascades away with the Project (mirrors the already-accepted
      // last-resort-backstop framing in projectStyleAnalysis.ts's own header
      // comment).
      if (currentProjectReferenceImageIds.length > 0) {
        tx.delete(lookTestReferences).where(inArray(lookTestReferences.referenceImageId, currentProjectReferenceImageIds)).run();
        tx.delete(projectStyleReferenceAnalysisRunReferences).where(inArray(projectStyleReferenceAnalysisRunReferences.referenceId, currentProjectReferenceImageIds)).run();
        tx.delete(projectStyleReferenceAnalysisObservations).where(inArray(projectStyleReferenceAnalysisObservations.referenceId, currentProjectReferenceImageIds)).run();
        tx.delete(projectStyleReferenceAnalysisCandidateRuleReferences).where(inArray(projectStyleReferenceAnalysisCandidateRuleReferences.referenceId, currentProjectReferenceImageIds)).run();
      }

      // Every join row whose NO ACTION FK points at
      // project_style_research_sources — deleted before Sources cascade away
      // with the Project.
      if (currentProjectResearchSourceIds.length > 0) {
        tx.delete(projectStyleResearchCandidateRuleSources).where(inArray(projectStyleResearchCandidateRuleSources.sourceId, currentProjectResearchSourceIds)).run();
        tx.delete(projectStyleResearchClaimSources).where(inArray(projectStyleResearchClaimSources.sourceId, currentProjectResearchSourceIds)).run();
        tx.delete(projectStyleResearchSynthesisSources).where(inArray(projectStyleResearchSynthesisSources.sourceId, currentProjectResearchSourceIds)).run();
      }

      const projectLookTestIds = tx
        .select({ id: lookTests.id })
        .from(lookTests)
        .where(eq(lookTests.projectId, id))
        .all()
        .map((r) => r.id);
      if (projectLookTestIds.length > 0) {
        tx.delete(generationJobs).where(inArray(generationJobs.lookTestId, projectLookTestIds)).run();
      }
      tx.delete(projects).where(eq(projects.id, id)).run();
    });
  } catch (e) {
    // The transaction rolled back — no DB row was touched. Every
    // quarantined file is still a simple rename away from its original
    // path (nothing was ever permanently deleted), so restoration is
    // deterministic: no ENOENT ambiguity, no "was this really restored"
    // question, because no unlink has happened yet at this point.
    const restoreResults: { source: QuarantineEntry["source"]; original: string; quarantine: string; restored: boolean; error?: string }[] = [];
    for (const q of quarantined) {
      try {
        await rename(q.quarantineAbsolute, q.originalAbsolute);
        restoreResults.push({ source: q.source, original: q.originalAbsolute, quarantine: q.quarantineAbsolute, restored: true });
      } catch (restoreErr) {
        restoreResults.push({
          source: q.source,
          original: q.originalAbsolute,
          quarantine: q.quarantineAbsolute,
          restored: false,
          error: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
        });
      }
    }
    const failedRestores = restoreResults.filter((r) => !r.restored);
    const base = `deleteProject(${id}): DB delete failed — ${e instanceof Error ? e.message : String(e)}`;
    if (failedRestores.length > 0) {
      // SHOT.VIDEO.REFERENCES.1 (Retake Round 1, Codex P2) — Video Reference
      // failures are reported sanitized (no absolute path); every other,
      // pre-existing source keeps its exact established path-reporting
      // format unchanged (own accepted precedent, out of this ticket's scope).
      const refVideoFailed = failedRestores.filter((r) => r.source === "shot-reference-video");
      const otherFailed = failedRestores.filter((r) => r.source !== "shot-reference-video");
      if (refVideoFailed.length > 0) console.error(`deleteProject(${id}): failed to restore ${refVideoFailed.length} Video Reference file(s) from quarantine:`, refVideoFailed);
      const detailParts = [
        ...otherFailed.map((r) => `"${r.quarantine}" → "${r.original}" (${r.error})`),
        ...(refVideoFailed.length > 0 ? [`${refVideoFailed.length} Video Reference file(s) could not be automatically restored (see server log)`] : []),
      ];
      throw new Error(
        `${base}. ${restoreResults.length - failedRestores.length} file(s) restored, ${failedRestores.length} file(s) still under quarantine: ${detailParts.join("; ")}`
      );
    }
    throw new Error(`${base} — nothing was changed (all ${restoreResults.length} file(s) restored).`);
  }

  // PROJ.DELETE.1 piège #2 — several of the NEW families above have no DB
  // uniqueness on their path column (unlike `shot_reference_videos.videoPath`
  // or `shot_videos.videoPath`, both DB-unique, or the Style/Look families,
  // both namespaced one-per-project): a `shot_reference_images` row can
  // legitimately share its exact file with a `storyboard_images` draft (an
  // extracted panel — storyboardExtractionConfirm.ts writes the SAME
  // `destRelative` into both), and nothing stops two rows in DIFFERENT
  // Projects from independently pointing at the same physical path either.
  // The DB transaction above has ALREADY committed — every row THIS Project
  // owned is gone — so a match found now can only be a genuine survivor
  // (a live row this deletion must never have touched). Checked per family
  // against the exact table(s) that can hold that family's path; the four
  // pre-existing sources are structurally exempt (DB-unique or
  // one-per-project namespaced — no survivor is possible for them, matching
  // their unchanged pre-PROJ.DELETE.1 behavior).
  async function isPathStillReferenced(source: QuarantineSource, imagePath: string): Promise<boolean> {
    switch (source) {
      case "shot-reference-image":
      case "asset-reference-image":
        return (
          (await db.select({ id: shotReferenceImages.id }).from(shotReferenceImages).where(eq(shotReferenceImages.imagePath, imagePath))).length > 0 ||
          (await db.select({ id: assetReferenceImages.id }).from(assetReferenceImages).where(eq(assetReferenceImages.imagePath, imagePath))).length > 0
        );
      case "storyboard-image":
        return (
          (await db.select({ id: storyboardImages.id }).from(storyboardImages).where(eq(storyboardImages.imagePath, imagePath))).length > 0 ||
          (await db.select({ id: shotReferenceImages.id }).from(shotReferenceImages).where(eq(shotReferenceImages.imagePath, imagePath))).length > 0 ||
          (await db.select({ id: sequenceStoryboardExtractionRegions.id }).from(sequenceStoryboardExtractionRegions).where(eq(sequenceStoryboardExtractionRegions.cropImagePath, imagePath))).length > 0
        );
      case "shot-video":
        return (await db.select({ id: shotVideos.id }).from(shotVideos).where(eq(shotVideos.videoPath, imagePath))).length > 0;
      case "shot-video-candidate":
        return (await db.select({ id: shotVideoCandidates.id }).from(shotVideoCandidates).where(eq(shotVideoCandidates.clipPath, imagePath))).length > 0;
      case "sequence-storyboard-image":
        return (await db.select({ id: sequenceStoryboardImages.id }).from(sequenceStoryboardImages).where(eq(sequenceStoryboardImages.imagePath, imagePath))).length > 0;
      case "sequence-video-draft":
        return (await db.select({ id: sequenceVideoDrafts.id }).from(sequenceVideoDrafts).where(eq(sequenceVideoDrafts.videoPath, imagePath))).length > 0;
      case "sequence-video-split-thumbnail":
        return (await db.select({ id: sequenceVideoSplitSegments.id }).from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.thumbnailPath, imagePath))).length > 0;
      case "sequence-result-video":
        return (await db.select({ id: sequenceResults.id }).from(sequenceResults).where(eq(sequenceResults.videoPath, imagePath))).length > 0;
      case "generation-job-output":
        return (await db.select({ id: generationJobs.id }).from(generationJobs).where(eq(generationJobs.outputPath, imagePath))).length > 0;
      default:
        return false;
    }
  }

  // The DB transaction is now committed and durable: the Project and its
  // Look/Style rows are gone. Every quarantined file is now a plain,
  // unreferenced leftover — permanently removing it is pure cleanup, not
  // a step whose failure can put the DB and filesystem out of sync (no DB
  // row points to it anymore either way). A failure here is reported
  // honestly with the EXACT recoverable path — never a claim that some
  // separate durable record (a ledger) captured it, and never silence.
  const finalCleanupFailures: { source: QuarantineEntry["source"]; originalAbsolute: string; quarantineAbsolute: string; error: string }[] = [];
  const survivorRestoreFailures: { source: QuarantineEntry["source"]; originalAbsolute: string; quarantineAbsolute: string; error: string }[] = [];
  for (const q of quarantined) {
    if (await isPathStillReferenced(q.source, q.imagePath)) {
      // A live row outside this Project still needs this exact file — the
      // opposite of a leaked file: restore it to its ORIGINAL path instead
      // of unlinking it. A failed restore here is worse than the ordinary
      // "leftover at quarantine path" case (the live row now shows a broken
      // reference), so it is reported separately and explicitly below.
      try {
        await rename(q.quarantineAbsolute, q.originalAbsolute);
      } catch (e) {
        survivorRestoreFailures.push({ source: q.source, originalAbsolute: q.originalAbsolute, quarantineAbsolute: q.quarantineAbsolute, error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }
    let lastError: string | null = null;
    let removed = false;
    for (let attempt = 1; attempt <= 3 && !removed; attempt++) {
      try {
        await unlink(q.quarantineAbsolute);
        removed = true;
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
          removed = true; // already gone — nothing left to do
          break;
        }
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
    if (!removed) {
      finalCleanupFailures.push({ source: q.source, originalAbsolute: q.originalAbsolute, quarantineAbsolute: q.quarantineAbsolute, error: lastError ?? "unknown error" });
    }
  }

  if (survivorRestoreFailures.length > 0) {
    console.error(`deleteProject(${id}): Project and DB rows deleted successfully; ${survivorRestoreFailures.length} file(s) still needed by a surviving row could not be restored to their original path`, survivorRestoreFailures);
    throw new Error(
      `deleteProject(${id}): the Project and its database rows were deleted successfully. ${survivorRestoreFailures.length} file(s) still needed by another, surviving row could not be restored to their expected location and remain under a quarantine path — fix this manually before that surviving row is used: ${survivorRestoreFailures
        .map((f) => `"${f.quarantineAbsolute}" (expected at "${f.originalAbsolute}")`)
        .join("; ")}.`
    );
  }

  if (finalCleanupFailures.length > 0) {
    console.error(`deleteProject(${id}): Project and DB rows deleted successfully; ${finalCleanupFailures.length} leftover file(s) could not be removed after 3 attempts`, finalCleanupFailures);
    // SHOT.VIDEO.REFERENCES.1 (Retake Round 1, Codex P2) — same source-based
    // split as the rollback branch above: Video Reference failures never
    // interpolate an absolute path into the thrown message.
    const refVideoFailures = finalCleanupFailures.filter((f) => f.source === "shot-reference-video");
    const otherFailures = finalCleanupFailures.filter((f) => f.source !== "shot-reference-video");
    const detailParts = [
      ...otherFailures.map((f) => `"${f.quarantineAbsolute}"`),
      ...(refVideoFailures.length > 0 ? [`${refVideoFailures.length} Video Reference file(s) (see server log)`] : []),
    ];
    throw new Error(
      `deleteProject(${id}): the Project and its database rows were deleted successfully. ${finalCleanupFailures.length} leftover file(s) could not be removed after 3 attempts and remain, unreferenced by any data, at: ${detailParts.join("; ")}. This does not affect data integrity — retry removing them manually or via a future cleanup pass.`
    );
  }

  redirect("/projects");
}

export async function saveProjectStoryFoundation(
  projectId: number,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const pitch = (formData.get("pitch") as string | null)?.trim() || null;
    const story = (formData.get("story") as string | null)?.trim() || null;
    const description = (formData.get("description") as string | null)?.trim() || null;
    await db
      .update(projects)
      .set({ pitch, story, description, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save. Please try again." };
  }
}

export async function saveProjectOutline(
  projectId: number,
  outline: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const trimmed = outline?.trim() || null;
    await db
      .update(projects)
      .set({ outline: trimmed, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save the outline. Please try again." };
  }
}
