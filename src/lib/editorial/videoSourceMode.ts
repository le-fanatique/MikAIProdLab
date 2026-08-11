import "server-only";

// ---------------------------------------------------------------------------
// Video source mode resolver (EDITORIAL.SEQUENCE.RESULT.SOURCES.1)
//
// Canonical, testable resolution of "which video file represents each Shot
// of a Sequence" under one of two modes:
//
//   - "approved-only": strictly `shots.approvedVideoPath`. No fallback.
//   - "latest-generation": the newest durable row in the Shot Video Library
//     (`shot_videos`) for each Shot, regardless of its `source`
//     (`generation` or `sequence_split`). No fallback to `approvedVideoPath`.
//
// This is the SINGLE place both the Editorial page (preview), the
// editorial-export route (OpenReel) and `publishBasicSequenceResult`
// (publish) call to resolve sources — so they can never disagree about what
// a given mode means. Never reads `generation_jobs` (temporary render
// outputs) — a video must already be durable in `shot_videos` to be
// eligible. Never accepts a client-supplied path or shot_videos id; every
// path/provenance returned here comes only from a server-side DB read keyed
// by Shot id, which is itself only ever derived from the Sequence's own
// owned Shots.
//
// A DB candidate is NEVER trusted as `videoPath` on faith — every candidate
// (both modes) is verified for a plausible path shape AND a real file on
// disk (reusing `resolveExistingAbsolutePath`, already shared with the Film
// Result renderer) before it is ever counted as "available", surfaced in a
// URL, or frozen into a manifest. A rejected candidate keeps its
// `provenance` (so a caller can still explain WHY) but `videoPath` becomes
// `null` and `unavailableReason` is set. The renderer still re-checks at
// render time for the residual race where a file disappears AFTER this
// resolution but before FFmpeg actually reads it — this module's check
// closes the much larger, much more common gap: a stale/deleted file simply
// never being verified at all before being announced as available.
//
// Ownership (Project -> Sequence -> Shot) is deliberately NOT re-verified
// in here: both real callers (the Editorial page and
// `loadEditorialDocumentForSequence`/`buildBasicCutManifest`) already load
// their own ownership-checked Shot list before ever calling this — a
// second independent ownership check here would be redundant, not safer,
// and this module would otherwise carry an unused "convenience" entry point
// with no real caller. `publishBasicSequenceResult`'s own cross-Project
// refusal (proved end-to-end) is exactly this ownership guarantee, enforced
// at the one place a request actually enters the system.
//
// Server-only (`import "server-only"` above, imports `@/db` and touches the
// filesystem). The mode type/parsers/label/default and the two PURE
// resolution functions live in `videoSourceModeShared.ts` (no `db`/`fs`
// import) so a Client Component can import just those without pulling
// `better-sqlite3` into the browser bundle — this file re-exports them so
// every server caller can keep importing from here alone.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { shotVideos, shotVideoCandidates, type Shot } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { resolveExistingAbsolutePath } from "./renderBasicSequenceResult";
import {
  resolveApprovedOnlySources,
  pickLatestGenerationSources,
  checkOwnerConfinement,
  type VideoSourceMode,
  type ResolvedShotSource,
  type ShotVideoCandidateForConfinement,
} from "./videoSourceModeShared";

export {
  type VideoSourceMode,
  DEFAULT_VIDEO_SOURCE_MODE,
  parseVideoSourceMode,
  parseVideoSourceModeStrict,
  type VideoSourceModeParseResult,
  videoSourceModeLabel,
  type SourceProvenance,
  type ResolvedShotSource,
  type ShotForVideoSourceResolution,
  type ShotVideoRowForResolution,
  type ShotVideoCandidateForConfinement,
  isPlausibleUploadsRelativePath,
  checkOwnerConfinement,
  resolveApprovedOnlySources,
  pickLatestGenerationSources,
} from "./videoSourceModeShared";

/**
 * Verifies one resolved candidate against reality — owner-aware
 * confinement (Retake Round 2, Codex P1: WHOSE file this actually is, not
 * just whether the shape looks plausible) AND a real file on disk — before
 * it is ever trusted. Returns the SAME object unchanged when there is no
 * candidate to verify (`videoPath` was already `null`) or when it passes;
 * returns a downgraded copy (`videoPath: null`, `provenance` kept,
 * `unavailableReason` set) when rejected.
 */
async function verifyResolvedSource(
  candidate: ResolvedShotSource,
  candidatesById: ReadonlyMap<number, ShotVideoCandidateForConfinement>
): Promise<ResolvedShotSource> {
  if (candidate.videoPath === null) return candidate;

  const confinement = checkOwnerConfinement(candidate, candidatesById);
  if (!confinement.ok) {
    return { ...candidate, videoPath: null, unavailableReason: confinement.reason };
  }

  const absolute = await resolveExistingAbsolutePath(candidate.videoPath);
  if (!absolute) {
    return { ...candidate, videoPath: null, unavailableReason: "Source video file not found on disk." };
  }

  return candidate;
}

/**
 * Fetches the `shot_video_candidates` rows referenced by any
 * `sequence_split`-sourced candidate in `rawSources` — a single bounded
 * `inArray` query on exactly the (already deterministically picked-as-
 * newest) candidate ids that actually need cross-checking, never one query
 * per Shot. Empty map, zero queries, when nothing needs it (approved-only
 * mode, or a latest-generation resolution with no `sequence_split` winner).
 */
async function fetchCandidatesForConfinement(
  rawSources: ReadonlyMap<number, ResolvedShotSource>
): Promise<Map<number, ShotVideoCandidateForConfinement>> {
  const candidateIds = [...rawSources.values()]
    .map((source) =>
      source.provenance?.kind === "shot-video" && source.provenance.source === "sequence_split"
        ? source.provenance.sourceCandidateId
        : null
    )
    .filter((id): id is number => id !== null);

  if (candidateIds.length === 0) return new Map();

  const rows = await db
    .select({ id: shotVideoCandidates.id, shotId: shotVideoCandidates.shotId, clipPath: shotVideoCandidates.clipPath })
    .from(shotVideoCandidates)
    .where(inArray(shotVideoCandidates.id, candidateIds));

  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Core resolution against an ALREADY-loaded, already-owned Shot list — no
 * ownership check, no Shot query of its own. Called by
 * `loadEditorialDocumentForSequence` (src/lib/editorial/basicCutManifest.ts,
 * shared by the Editorial page preview, the editorial-export route, and
 * `publishBasicSequenceResult`), which already has an ownership-checked
 * Shot list by the time it needs a resolution. The only DB access here is
 * the single bounded `shot_videos` query (only when
 * `mode === "latest-generation"`) plus, when at least one winner is
 * `sequence_split`-sourced, one further bounded `shot_video_candidates`
 * query for owner confinement — the actual winner-per-Shot decision is the
 * pure `pickLatestGenerationSources`, independently testable without a DB.
 * Every returned candidate has already been confinement- and
 * existence-verified (see `verifyResolvedSource`) — a caller never needs to
 * re-check.
 */
export async function resolveVideoSourcesForShotList(
  shotList: Shot[],
  mode: VideoSourceMode
): Promise<Map<number, ResolvedShotSource>> {
  const rawSources =
    mode === "approved-only" ? resolveApprovedOnlySources(shotList) : await resolveLatestGenerationRaw(shotList);

  const candidatesById = await fetchCandidatesForConfinement(rawSources);

  const verifiedEntries = await Promise.all(
    [...rawSources.values()].map(async (candidate) => [candidate.shotId, await verifyResolvedSource(candidate, candidatesById)] as const)
  );

  return new Map(verifiedEntries);
}

/**
 * EDITORIAL.APPROVED.REAL.DURATIONS.1 — augments an ALREADY-RESOLVED
 * "approved-only" sources map (`resolveApprovedOnlySources`, already
 * confinement/existence-verified by `resolveVideoSourcesForShotList`) with
 * each Shot's real, durable `durationSeconds`, but ONLY when
 * `shots.approvedVideoPath` maps to THAT EXACT Shot's own `shot_videos` row
 * (same `shotId` AND same `videoPath` — `shot_videos.videoPath` is globally
 * unique, so a path match alone would already be exact; the `shotId` check
 * is kept as an explicit belt-and-suspenders confinement guard, matching
 * this module's existing owner-confinement conventions). The match key is a
 * NESTED Map (`shotId -> videoPath -> durationSeconds`), never a
 * concatenated string — Codex retake review found a delimiter-joined
 * string key here had let literal NUL bytes slip into this file's source;
 * a nested Map has no string-join step at all, so that class of bug is
 * structurally impossible. Never falls back to the newest library entry,
 * never estimates from planned timing or file size — a Shot whose
 * approved path has no matching durable row (or whose row has no probed
 * duration) keeps `durationSeconds: null`, byte-identical to before this
 * ticket. Returns a NEW map — never mutates `approvedSources`, so a
 * caller that must keep the original (badges, preview,
 * `mediaUrl`/provenance overlay) is unaffected; this is used exclusively
 * to feed `computeCompactRealDurationPositions` for an EXPLICIT
 * `approved-only` export.
 */
export async function augmentApprovedSourcesWithDurableDuration(
  shotList: Shot[],
  approvedSources: ReadonlyMap<number, ResolvedShotSource>
): Promise<Map<number, ResolvedShotSource>> {
  const candidateShotIds = shotList.map((s) => s.id).filter((shotId) => approvedSources.get(shotId)?.videoPath != null);

  if (candidateShotIds.length === 0) return new Map(approvedSources);

  const rows = await db
    .select({ shotId: shotVideos.shotId, videoPath: shotVideos.videoPath, durationSeconds: shotVideos.durationSeconds })
    .from(shotVideos)
    .where(inArray(shotVideos.shotId, candidateShotIds));

  const durationByShotThenPath = new Map<number, Map<string, number | null>>();
  for (const row of rows) {
    let byPath = durationByShotThenPath.get(row.shotId);
    if (!byPath) {
      byPath = new Map<string, number | null>();
      durationByShotThenPath.set(row.shotId, byPath);
    }
    byPath.set(row.videoPath, row.durationSeconds);
  }

  const augmented = new Map<number, ResolvedShotSource>();
  for (const [shotId, source] of approvedSources) {
    if (source.videoPath === null) {
      augmented.set(shotId, source);
      continue;
    }
    const durableDuration = durationByShotThenPath.get(shotId)?.get(source.videoPath) ?? null;
    augmented.set(shotId, durableDuration === source.durationSeconds ? source : { ...source, durationSeconds: durableDuration });
  }
  return augmented;
}

async function resolveLatestGenerationRaw(shotList: Shot[]): Promise<Map<number, ResolvedShotSource>> {
  const shotIds = shotList.map((s) => s.id);
  if (shotIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: shotVideos.id,
      shotId: shotVideos.shotId,
      source: shotVideos.source,
      videoPath: shotVideos.videoPath,
      createdAt: shotVideos.createdAt,
      generationJobId: shotVideos.generationJobId,
      sourceCandidateId: shotVideos.sourceCandidateId,
      durationSeconds: shotVideos.durationSeconds,
    })
    .from(shotVideos)
    .where(inArray(shotVideos.shotId, shotIds));

  // SHOT.VIDEO.REFERENCES.1 — a "reference_copy" row (the explicit "Add to
  // Shot Videos" bridge from a Video Reference) is a real, deletable,
  // explicitly-approvable library entry, but it must NEVER win "Latest
  // generation" — that mode's whole contract is "the newest durable
  // GENERATION/SPLIT output", not an imported source a user merely copied
  // in. Excluded here (before the pure picker even sees it) rather than by
  // widening `ShotVideoRowForResolution`, so that type keeps meaning exactly
  // "a row this picker may legitimately choose". "Approved-only" is
  // unaffected: it never reads this table at all.
  const eligibleRows = rows.filter((row): row is typeof row & { source: "generation" | "sequence_split" } => row.source !== "reference_copy");

  return pickLatestGenerationSources(shotIds, eligibleRows);
}
