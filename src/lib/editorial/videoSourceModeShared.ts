// ---------------------------------------------------------------------------
// Video source mode — shared, Node-free contract (EDITORIAL.SEQUENCE.RESULT.SOURCES.1)
//
// Deliberately has ZERO dependency on `@/db` (or anything else server-only)
// so a Client Component (PublishBasicSequenceResultButton.tsx) can import
// the mode type/label/default directly, without pulling `better-sqlite3`
// into the browser bundle — the same reason
// `src/lib/navigationBackground/rowBackgroundOpacity.ts` exists as its own
// file. `videoSourceMode.ts` re-exports everything here PLUS the DB/fs-backed
// resolvers; server code should keep importing from `videoSourceMode.ts`
// as usual — only a Client Component needs to import from this file
// directly.
// ---------------------------------------------------------------------------

export type VideoSourceMode = "approved-only" | "latest-generation";

export const DEFAULT_VIDEO_SOURCE_MODE: VideoSourceMode = "approved-only";

const VALID_MODES: readonly VideoSourceMode[] = ["approved-only", "latest-generation"];

/**
 * Lenient runtime parser for READ-ONLY contexts only (the Editorial page's
 * `?videoSourceMode=` query string) — accepts only the exact two mode
 * strings; anything else (undefined, an array, a stray query param value, a
 * forged/garbage client value) falls back to the default rather than
 * throwing, so a malformed URL never breaks the page.
 *
 * NEVER use this for a mutating entry point (a Server Action, a write
 * route) — a present-but-invalid value there must be REFUSED, not silently
 * downgraded to a different real mode the caller never asked for. Use
 * `parseVideoSourceModeStrict` instead.
 */
export function parseVideoSourceMode(value: unknown): VideoSourceMode {
  if (typeof value === "string" && (VALID_MODES as readonly string[]).includes(value)) {
    return value as VideoSourceMode;
  }
  return DEFAULT_VIDEO_SOURCE_MODE;
}

export type VideoSourceModeParseResult =
  | { ok: true; mode: VideoSourceMode }
  | { ok: false };

/**
 * Strict runtime parser for MUTATING/resource-heavy entry points
 * (`publishBasicSequenceResult`, the editorial-export route's optional
 * query param): `undefined` (the option/param genuinely absent) is
 * compatible and resolves to the default, exactly like every caller that
 * predates this ticket — but a value that IS present and NOT one of the two
 * exact mode strings returns `{ok:false}`, so the caller can refuse the
 * whole request BEFORE FFmpeg, DB reads, rendering, or any write — never
 * silently substitute `approved-only` for a forged/garbage mode and publish
 * under a mode nobody asked for.
 */
export function parseVideoSourceModeStrict(value: unknown): VideoSourceModeParseResult {
  if (value === undefined) return { ok: true, mode: DEFAULT_VIDEO_SOURCE_MODE };
  if (typeof value === "string" && (VALID_MODES as readonly string[]).includes(value)) {
    return { ok: true, mode: value as VideoSourceMode };
  }
  return { ok: false };
}

export function videoSourceModeLabel(mode: VideoSourceMode): string {
  return mode === "latest-generation" ? "Latest generation" : "Approved only";
}

export type SourceProvenance =
  | { kind: "approved" }
  | {
      kind: "shot-video";
      shotVideoId: number;
      source: "generation" | "sequence_split";
      createdAt: string;
      /** Set only when this row came from a Generate Content save — the other FK is then always null (shot_videos' own contract, see src/db/schema.ts). */
      generationJobId: number | null;
      /** Set only when this row came from a Split push — the other FK is then always null. */
      sourceCandidateId: number | null;
    };

export type ResolvedShotSource = {
  shotId: number;
  /** The confirmed-real, ready-to-use path — `null` whenever there is no candidate at all, OR a candidate existed but was rejected (see `unavailableReason`). Never a path whose file wasn't verified to actually exist. */
  videoPath: string | null;
  /**
   * The candidate row's own identity/provenance — kept even when
   * `videoPath` is `null` because a candidate was rejected (file missing,
   * implausible path), so a caller can still explain WHY a Shot has no
   * usable video instead of just saying "none". Only ever `null` when there
   * was no DB candidate at all.
   */
  provenance: SourceProvenance | null;
  /** Set ONLY when a DB candidate existed but was rejected before being trusted as `videoPath` — an honest, English, non-leaking diagnostic. Never set when there was genuinely no candidate. */
  unavailableReason?: string;
  /**
   * EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1 — additive: the durable,
   * probed duration of the resolved `shot_videos` row (`shot_videos
   * .durationSeconds`), never a guessed/derived value. `null` for
   * "approved-only" mode (which never resolves a `shot_videos` row, so
   * there is nothing durable to report) and for a "latest-generation" row
   * whose own `durationSeconds` was never probed. Always present (never
   * `undefined`) so a caller can distinguish "not applicable to this mode"
   * from "field not yet computed". Only a finite, positive value is ever
   * eligible to drive a compact-real-duration timeline — the consumer
   * (`computeCompactRealDurationPositions`) is the single place that
   * validates this, never this resolver.
   */
  durationSeconds: number | null;
};

/** Minimal shape this module needs from a Shot row — decoupled from the full Drizzle `Shot` type so the pure functions below can be unit-tested with plain fixtures, no DB import required. */
export type ShotForVideoSourceResolution = { id: number; approvedVideoPath: string | null };

/** Minimal shape of one `shot_videos` row this module needs. */
export type ShotVideoRowForResolution = {
  id: number;
  shotId: number;
  source: "generation" | "sequence_split";
  videoPath: string;
  createdAt: string;
  generationJobId: number | null;
  sourceCandidateId: number | null;
  /** EDITORIAL.LATEST.GENERATION.REAL.DURATIONS.1 — mirrors `shot_videos.durationSeconds` verbatim (see `ResolvedShotSource.durationSeconds`'s own doc comment for why this is never guessed). */
  durationSeconds: number | null;
};

/**
 * Pure, defensive sanity check on a stored `uploads/`-relative path BEFORE
 * it is ever trusted as a real filesystem candidate — catches an obviously
 * malformed/traversal-shaped value (never expected from our own trusted
 * writers, but this is the last gate before treating a DB string as a path
 * to check on disk). Deliberately NOT owner-subfolder-specific: unlike
 * `uploads/navigation-backgrounds/`, `shot_videos.videoPath` is legitimately
 * written under more than one root depending on `source`
 * (`uploads/shot-videos/shot-<id>/...` for `generation`,
 * `uploads/sequence-video-splits/...` for `sequence_split` pushes) — a
 * single fixed-subfolder check would incorrectly reject real, valid rows.
 */
export function isPlausibleUploadsRelativePath(value: string): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  if (!value.startsWith("uploads/")) return false;
  if (value.includes("..") || value.includes("\\") || value.includes("\0")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Owner-aware confinement (Retake Round 2, Codex P1) — `isPlausibleUploadsRelativePath`
// above only rejects an obviously malformed SHAPE; it says nothing about
// WHOSE file a plausible-looking path actually is. Without this check, a
// `shot_videos` row (or a legacy `approvedVideoPath`) for Shot A that
// happens to store a real, existing path under Shot B's own durable folder
// — or under a Sequence Result's own output folder — would pass the old
// gate and get exposed to the viewer/manifest/OpenReel as if it belonged to
// Shot A.
//
// These two root constants deliberately duplicate the literal string
// constants already defined in `src/lib/shotVideoLibrary/paths.ts`
// (`SHOT_VIDEOS_ROOT_RELATIVE`) and `src/lib/sequenceVideoPush/cutSegmentClip.ts`
// (`SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE`) rather than importing them — both
// of those files `import path from "node:path"` at module scope, which
// would pull a Node builtin into this file's Client-Component-safe bundle
// even for an unused re-export (the same reason this file exists as its
// own module in the first place — see the header comment above). Keep
// these three conventions in sync by hand if either canonical root ever
// changes.
// ---------------------------------------------------------------------------

const SHOT_VIDEOS_ROOT_RELATIVE = "uploads/shot-videos";
const SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE = "uploads/shot-video-candidates";

/** Minimal shape this module needs from a `shot_video_candidates` row to verify a `sequence_split`-sourced `shot_videos` row actually mirrors it. */
export type ShotVideoCandidateForConfinement = { id: number; shotId: number; clipPath: string };

/**
 * The actual owner-confinement decision for one already-resolved candidate
 * (called AFTER `resolveApprovedOnlySources`/`pickLatestGenerationSources`,
 * BEFORE the real filesystem existence check in `videoSourceMode.ts`). Pure
 * — `candidatesById` is a plain, already-fetched lookup (not a live DB
 * call), so this stays unit-testable with in-memory fixtures exactly like
 * the two resolvers above.
 *
 * - `videoPath: null` (nothing to confine) -> ok.
 * - `provenance: {kind:"approved"}` (legacy `shots.approvedVideoPath`, never
 *   linked to a `shot_videos` row) -> path must sit under EITHER of the two
 *   known historical Shot roots, scoped to THIS Shot's own id.
 * - `provenance: {kind:"shot-video", source:"generation"}` -> path must sit
 *   under this Shot's own `uploads/shot-videos/shot-<id>/` folder, and the
 *   FK pair must be coherent (`sourceCandidateId` null for a generation row).
 * - `provenance: {kind:"shot-video", source:"sequence_split"}` -> the FK
 *   pair must be coherent (`generationJobId` null for a split row),
 *   `sourceCandidateId` must resolve to a real `shot_video_candidates` row
 *   in `candidatesById`, and that row's `shotId`/`clipPath` must match this
 *   Shot and this EXACT path — not merely share the same folder prefix.
 */
export function checkOwnerConfinement(
  candidate: ResolvedShotSource,
  candidatesById: ReadonlyMap<number, ShotVideoCandidateForConfinement>
): { ok: true } | { ok: false; reason: string } {
  const { videoPath, provenance, shotId } = candidate;
  if (videoPath === null || provenance === null) return { ok: true };

  if (!isPlausibleUploadsRelativePath(videoPath)) {
    return { ok: false, reason: "Stored video path is malformed." };
  }

  if (provenance.kind === "approved") {
    const ownedByThisShot =
      videoPath.startsWith(`${SHOT_VIDEOS_ROOT_RELATIVE}/shot-${shotId}/`) ||
      videoPath.startsWith(`${SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE}/shot-${shotId}/`);
    return ownedByThisShot ? { ok: true } : { ok: false, reason: "Approved video path does not belong to this Shot." };
  }

  if (provenance.source === "generation") {
    if (provenance.sourceCandidateId !== null) {
      return { ok: false, reason: "Generation-sourced video has an inconsistent candidate reference." };
    }
    const ownedByThisShot = videoPath.startsWith(`${SHOT_VIDEOS_ROOT_RELATIVE}/shot-${shotId}/`);
    return ownedByThisShot ? { ok: true } : { ok: false, reason: "Generated video path does not belong to this Shot." };
  }

  // provenance.source === "sequence_split"
  if (provenance.generationJobId !== null) {
    return { ok: false, reason: "Split-sourced video has an inconsistent generation reference." };
  }
  if (provenance.sourceCandidateId === null) {
    return { ok: false, reason: "Split-sourced video is missing its candidate reference." };
  }
  const candidateRow = candidatesById.get(provenance.sourceCandidateId);
  if (!candidateRow) {
    return { ok: false, reason: "Split-sourced video's candidate record could not be found." };
  }
  if (candidateRow.shotId !== shotId || candidateRow.clipPath !== videoPath) {
    return { ok: false, reason: "Split-sourced video does not match its own candidate record." };
  }
  return { ok: true };
}

/**
 * Pure — "approved-only" resolution needs nothing but each Shot's own
 * `approvedVideoPath`. No fallback: a Shot with no approved video simply
 * has no resolved source, never a Shot Video Library substitute.
 *
 * Existence/plausibility of the resulting path is NOT verified here (this
 * function has no filesystem access, by design, so it stays unit-testable
 * with plain fixtures) — `resolveVideoSourcesForShotList`
 * (videoSourceMode.ts) verifies every candidate this returns before ever
 * treating it as usable.
 */
export function resolveApprovedOnlySources(
  shotList: readonly ShotForVideoSourceResolution[]
): Map<number, ResolvedShotSource> {
  const sources = new Map<number, ResolvedShotSource>();
  for (const shot of shotList) {
    sources.set(shot.id, {
      shotId: shot.id,
      videoPath: shot.approvedVideoPath,
      provenance: shot.approvedVideoPath !== null ? { kind: "approved" } : null,
      // "approved-only" never resolves a shot_videos row — there is no
      // durable, probed duration to report. Compact-real-duration timing is
      // exclusive to "latest-generation" (see the Product Decision this
      // field exists for) and never applies here.
      durationSeconds: null,
    });
  }
  return sources;
}

/**
 * Pure — picks the single newest `shot_videos` row per Shot id from an
 * already-fetched row list, deterministically: `createdAt` descending, `id`
 * descending as the tie-break (so two rows sharing the exact same
 * timestamp — plausible with sub-second precision loss, or a genuine batch
 * insert — still resolve to exactly one winner, always the same one on
 * repeated calls). Every requested `shotIds` entry is present in the
 * result even with zero matching rows (`videoPath: null`) — a Shot with no
 * durable generation is a real, honest "no source", never an absent map
 * key a caller could mistake for "not yet resolved". No fallback to
 * `approvedVideoPath` — that never enters this function at all.
 *
 * Existence/plausibility of the resulting path is NOT verified here (no
 * filesystem access, by design) — see `resolveApprovedOnlySources`'s own
 * doc comment for why, and `resolveVideoSourcesForShotList` for where that
 * verification actually happens.
 */
export function pickLatestGenerationSources(
  shotIds: readonly number[],
  rows: readonly ShotVideoRowForResolution[]
): Map<number, ResolvedShotSource> {
  const sources = new Map<number, ResolvedShotSource>();
  for (const shotId of shotIds) sources.set(shotId, { shotId, videoPath: null, provenance: null, durationSeconds: null });

  const sorted = [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return b.id - a.id;
  });

  const seen = new Set<number>();
  for (const row of sorted) {
    if (!sources.has(row.shotId)) continue; // not one of the requested Shots
    if (seen.has(row.shotId)) continue; // already resolved to a newer row
    seen.add(row.shotId);
    sources.set(row.shotId, {
      shotId: row.shotId,
      videoPath: row.videoPath,
      provenance: {
        kind: "shot-video",
        shotVideoId: row.id,
        source: row.source,
        createdAt: row.createdAt,
        generationJobId: row.generationJobId,
        sourceCandidateId: row.sourceCandidateId,
      },
      durationSeconds: row.durationSeconds,
    });
  }

  return sources;
}
