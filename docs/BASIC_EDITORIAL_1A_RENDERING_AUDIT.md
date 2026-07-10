# Basic Editorial Rendering Audit

Status: audit only, no code/schema/package changes. MikAI HEAD: `eb4b63f — Add sequence result model and viewer`, working tree clean before and after this ticket.

## 1. Context

`SEQUENCE.RESULT.1` gave MikAI a `sequence_results` table, an active-result viewer, and the concept of `sourceMode: "basic" | "advanced"`. Nothing yet produces a Basic-mode result. This ticket audits **how** Basic Editorial Mode could turn a sequence's approved/missing/trimmed shots into a real, playable video file — without building any of it yet.

The question this document answers: *how can Basic Editorial transform a sequence of approved/missing/trimmed shots into a video Sequence Result?*

## 2. Current Editorial Stack

- **`sequence_editorial_items`** (`src/db/schema.ts`): the gap-aware montage layer. Each row is `type: "shot" | "gap"`, `shotId` (null for gaps), `orderIndex`, `durationSeconds`, `trimInSeconds`/`trimOutSeconds` (per-occurrence, non-destructive — the same shot can appear more than once with different trims), `trackIndex` (single-track V1), `startSeconds` (backfilled absolute position, read by `editorialDocument.ts`).
- **`editorialDocument.ts`**: builds an `EditorialDocument` (tracks → items) from raw rows + a shot lookup. `getEditorialItemEffectiveDuration` already encodes the trim-vs-duration-vs-placeholder-fallback logic Basic rendering would need to reuse verbatim rather than re-derive. `getEditorialItemStatus` already classifies each item `approved | placeholder | missing`. `deriveEmptySpaces` already computes gaps purely from item positions — Basic rendering's "gap → black clip" case can consume this directly.
- **`editorialExport.ts`**: converts an `EditorialDocument` into `mikai-editorial-export-v1` (adds `prompt`/`description`/`approvedVideoPath` per item, plus `editorialSnapshot`). This is MikAI's own external contract for OpenReel — Basic rendering doesn't need to go through this shape, but the *concept* (a canonical read of "the sequence as it stands right now") is exactly what a `buildBasicCutManifest` would build from, likely by calling `buildEditorialDocument` directly rather than the export wrapper (no need for OpenReel-only fields like `mediaUrl` resolved against an external origin).
- **`editorialSnapshot.ts`** (`OPENREEL.CONFLICT.1`): `buildEditorialSnapshot({sequenceId, document})` — already the exact mechanism a future `publishBasicSequenceResult` needs to stamp `sequence_results.editorialSnapshot`, with zero new code required for that part.
- **`editorialTimingPatch.ts`** / **`editorialTimeline.ts`** (`moveEditorialItem`, `updateEditorialItemTrim`, `resizeEditorialItemRightEdge`): the only mutation paths for the editorial layer today — irrelevant to *rendering* but confirm exactly which fields a render step can trust (`startSeconds`, `trimInSeconds`/`trimOutSeconds`, `durationSeconds`, `orderIndex`).
- **`sequence_results`** / **`sequenceResults.ts`** / **`types/sequenceResult.ts`** (`SEQUENCE.RESULT.1`): the write target. `createSequenceResult` already accepts `videoPath`, `durationSeconds`, `cutManifest`, `editorialSnapshot`, `warnings` — a future publish action is a straightforward caller, not a new write path.

## 3. Existing Video/File Handling

- **Storage convention**: uploaded/approved media lives under `uploads/<category>/<subfolder>/<filename>`, stored in the DB as a *relative* path (e.g. `uploads/shot-videos/shot-36/<uuid>.mp4`), resolved to a servable URL via `refImageUrl(path)` → `/api/uploads/<rest>`.
- **`src/actions/generation.ts`** (shot-video approval): the one existing place that copies a video file server-side with plain Node `fs`/`path` — `fs.mkdir(destDir, { recursive: true })` then `fs.copyFile(sourceAbsolute, destAbsolute)`, writing under `path.join(process.cwd(), "public", "uploads", "shot-videos", "shot-{id}")`. Validates the source path is confined to an allowed root (`outputs/jobs/`) before touching it, and best-effort deletes the shot's previous approved file. This is the template a Basic render's file-placement step should follow: validate/confine paths, `mkdir -p`, deterministic-but-unique filename (`randomUUID()`), no destructive delete of anything still referenced elsewhere.
- **`src/app/api/uploads/[...path]/route.ts`**: serves files by streaming (supports HTTP Range for video scrubbing), checking **two** candidate roots: `path.resolve(cwd, "storage", "uploads", relPath)` and `path.resolve(cwd, "public", "uploads", relPath)` — whichever exists first wins. This means there are currently **two possible physical storage roots** in this codebase (`storage/uploads/` and `public/uploads/`); `generation.ts` writes to `public/uploads/`. A future Basic render step must pick one deliberately and document it — see §9 Risks.
- No `ffmpeg`, `fluent-ffmpeg`, `ffmpeg-static`, or any shell/`child_process` media-processing call exists anywhere in `src/` today (confirmed via `grep -Rni "ffmpeg" src package.json` — zero matches). No video transcoding/concatenation capability of any kind exists in this codebase yet.

## 4. FFmpeg Availability

Tested directly in this environment (both Git Bash and PowerShell, no repo changes):

```text
$ ffmpeg -version
bash: ffmpeg: command not found

$ ffprobe -version
bash: ffprobe: command not found

PS> ffmpeg -version
CommandNotFoundException: The term 'ffmpeg' is not recognized...

PS> Get-Command ffmpeg
ffmpeg not found in PowerShell PATH
```

**FFmpeg and ffprobe are both absent** from this development machine's PATH, in both shells. Not installed at all (not merely unreachable from Node — genuinely not present as a system binary), so nothing is currently callable from Node's `child_process` either.

**Implications for a server/Tailscale deployment**: if MikAI is ever run as a standalone server (per `docs/OPENREEL_URL_1_CONFIGURABLE_SIDECAR_URL.md`/`docs/MIKAI_ORIGIN_1_CONFIGURABLE_PUBLIC_BASE_URL.md`'s Tailscale scenario), whatever FFmpeg strategy is chosen must be installed on **that** machine, not the developer's local machine — an environment/deployment dependency, not a code dependency. This argues for depending on a system-installed `ffmpeg` (option 1 below) being clearly documented as a deployment prerequisite, or bundling a static binary (option 2) so the deployment doesn't silently break.

**Options, not decided in this ticket** (per the ticket's explicit "ne pas ajouter de dépendance" constraint):
1. **Require a system-installed FFmpeg**, invoked via `child_process.execFile`. Zero new npm dependency. Requires documenting an install step for every environment (dev machine, server, Tailscale host) — the current gap, since it's absent here today.
2. **Add `ffmpeg-static`** (or similar) as a future dependency — bundles a platform-specific binary via npm, removing the system-install requirement. This is a `package.json` change and therefore explicitly out of scope for this ticket; would need its own explicit approval in `BASIC.EDITORIAL.1.B`.
3. **Defer video rendering entirely for a first pass** — `createSequenceResult` can already store a `cutManifest` with no `videoPath`, so a "manifest-only" Basic result is technically representable today with zero new capability. Rejected as the *final* shape (see §7 Option C) because a manifest with no video is not "a real Sequence Result video file lisible dans MikAI" — the ticket's own stated goal — but could be a legitimate **staging step** inside `BASIC.EDITORIAL.1.B` if FFmpeg turns out to be unavailable at implementation time.

**Recommendation**: proceed on the assumption that `BASIC.EDITORIAL.1.B` will need to pick option 1 or 2 explicitly, as its own decision (with the user), before writing any render code — this audit does not resolve it, since it requires a `package.json`/environment decision outside this ticket's authority.

## 5. Basic Cut Manifest

Proposed shape (not implemented, no schema change — this would live as the return type of a future `buildBasicCutManifest()` in `src/lib/editorial/basicCutManifest.ts`):

```ts
type BasicCutManifest = {
  schemaVersion: "mikai-basic-cut-manifest-v1";
  projectId: number;
  sequenceId: number;
  createdAt: string;
  sourceMode: "basic";
  items: Array<{
    itemId: number;             // sequence_editorial_items.id
    shotId: number | null;      // null only if a future non-shot item type is ever added; always set today
    orderIndex: number;
    sourceVideoPath: string | null;   // shots.approvedVideoPath, or null for a missing shot
    startSeconds: number;
    durationSeconds: number;          // effective duration (post-trim), matches getEditorialItemEffectiveDuration
    trimInSeconds: number | null;
    trimOutSeconds: number | null;
    status: "video" | "placeholder";  // "placeholder" = missing shot, gap is a separate top-level array (below)
    placeholderReason?: string;       // e.g. "No approved video for this shot"
  }>;
  emptySpaces: Array<{
    startSeconds: number;
    durationSeconds: number;
  }>;
  warnings: string[];
};
```

This is built almost entirely from data `buildEditorialDocument` + `deriveEmptySpaces` already expose — `buildBasicCutManifest` would be a thin, pure mapping layer over them (same "pure, DB-agnostic" convention as `editorialExport.ts`/`editorialSnapshot.ts`), not a new read path.

**Relationship to `sequence_results.cutManifest`** (the generic JSON column from `SEQUENCE.RESULT.1`): the existing `SequenceResultCutManifestItem` type (`src/types/sequenceResult.ts`) is narrower (`shotId`, `trimInSeconds`, `trimOutSeconds`, `sourcePath` only) than `BasicCutManifest` above. `BASIC.EDITORIAL.1.B` will need to either (a) widen `SequenceResultCutManifestItem` to match, or (b) store the full `BasicCutManifest` object as-is in the `cutManifest` TEXT column (it's schemaless JSON, so this requires no DB change) and treat `SequenceResultCutManifestItem` as a deliberately-simplified read-side projection for any future UI that lists manifest items generically across both modes. Not decided here — flagged as an implementation-time choice for `.1.B`.

## 6. Rendering Cases

### Approved video
A straight concat of already-approved MP4/WebM/MOV files recorded at different times by different generation jobs is **not** guaranteed to share codec, resolution, framerate, or pixel format — ComfyUI workflows can change between shots, and nothing in this codebase currently normalizes output video parameters at generation time. **Re-encoding to a common target (fixed resolution, fixed framerate, H.264/AAC) is necessary**, not optional, for a reliable concat — a stream-copy concat would silently fail or produce corrupted output the moment two source clips disagree on any of these parameters, which is likely across a real sequence's worth of shots generated over time.

### Trim
`-ss`/`-to` (or `-t` for duration) is the correct approach. **Re-encode, not stream-copy**, for trim precision: stream-copy trim (`-c copy`) can only cut on keyframe boundaries, producing trims that are off by up to a GOP length — unacceptable for shot-level in/out points that are meant to be exact. Given re-encoding is already required for the concat step (previous point), trimming during the same re-encode pass (via `-ss`/`-t` per input, or via `filter_complex` trim filters) costs nothing extra.

### Missing shot
Recommendation: **a black clip of the item's duration with a simple text label** (e.g. "Missing Shot" or the shot's code/title, via FFmpeg's `drawtext` filter) — silent audio track matching the target output's audio layout. This keeps the assembled video's total duration accurate to the editorial timeline (useful for continuity review) while making it visually obvious which beats aren't real footage yet. A plain black clip with no label would be indistinguishable from an intentional black gap; skipping the shot entirely would silently shorten the sequence and desync it from the editorial timeline's own duration math.

### Gaps (empty spaces)
Recommendation: **a silent black clip of the gap's duration**, generated the same way as a missing-shot placeholder but with no text overlay (or a very light one, e.g. nothing at all — a gap is intentional empty space, not something to flag as a problem). Skipping gaps would desync the rendered video's length from the editorial timeline; a warning-only approach (no clip, just a log entry) would still leave the video shorter than the sequence's own reported duration, which is worse for review purposes than a black silent placeholder.

### Audio
Recommendation for V1: **video-first, keep source audio when present via the same re-encode pass, fall back to silence for placeholder/gap segments.** Since re-encoding is already mandatory for the video track (parameter normalization + precise trims), carrying the audio stream through the same `filter_complex` graph (`concat` filter with `a=1`) costs little extra complexity — FFmpeg's concat filter handles mismatched/absent audio streams per-segment reasonably well when every segment is given an explicit audio stream (real audio or a `anullsrc` silent one) before the concat. Stripping audio entirely would be simpler but throws away real signal MikAI already has (approved shots may carry dialogue/SFX from generation); a full audio *mix* (levels, ducking, music bed) is explicitly out of scope for `BASIC.EDITORIAL.1.B` per the ticket's own scope recommendation in §10.

## 7. FFmpeg Strategy Options

### Option A — concat demuxer, no re-encode
`ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`. Fast, lossless. **Rejected for V1**: requires every input to already share codec/resolution/framerate/pixel-format (not guaranteed here, see §6), makes frame-accurate trims unreliable (keyframe-boundary-only), and has no mechanism for synthesizing placeholder/gap clips inline (they'd need to be pre-rendered as separate files and added to the concat list, which is more moving parts, not fewer).

### Option B — `filter_complex` concat with re-encode
Build one `ffmpeg` invocation with each segment (real trimmed clip, or a `color=black`/`anullsrc` synthetic source for a placeholder/gap) as a labeled input, scaled/padded to a common resolution and framerate via `scale`/`fps` filters, then joined with the `concat` filter (`n=<count>:v=1:a=1`), output to a single H.264/AAC MP4. Slower (full re-encode of every segment), but **robust**: handles heterogeneous sources, exact trims, inline placeholder/gap synthesis, and guarantees a single consistent output format — the actual requirements from §6.

### Option C — no video render in V1, cutManifest only
`createSequenceResult` stores a `BasicCutManifest` with `videoPath: null`. Trivial to implement (no FFmpeg dependency at all), but **does not satisfy the ticket's actual goal** — a `SequenceResult` with no playable video is not "a real Sequence Result video file lisible dans MikAI," and contradicts the product's stated finality (a short film assembled from real video, per `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §2).

## 8. Recommended MVP Strategy

**Option B** — `filter_complex` concat with full re-encode to H.264/AAC MP4, matching the ticket author's own stated intuition. Justification: this is the only option that satisfies every rendering case in §6 (heterogeneous approved-video sources, precise trims, synthetic placeholders/gaps) with a single, well-understood FFmpeg invocation shape. The slower render time is an acceptable MVP tradeoff — Basic publish is expected to be an explicit, occasional user action (not a hot path triggered continuously), and correctness/robustness matters far more than speed for a first playable cut.

## 9. Output Storage

Recommended path shape, following the existing `uploads/<category>/<subfolder>/<filename>` convention exactly (`uploads/shot-videos/shot-{id}/{uuid}.mp4`):

```text
uploads/sequence-results/sequence-{sequenceId}/{uuid}.mp4
```

Stored as this exact relative string in `sequence_results.videoPath` — consistent with how `shots.approvedVideoPath` is stored (relative, `uploads/`-prefixed, resolved via `refImageUrl()` at read time, which the Sequence Result viewer already does — see `SEQUENCE.RESULT.1`).

**Open point, not resolved here**: `src/app/api/uploads/[...path]/route.ts` currently checks two possible physical roots (`storage/uploads/` and `public/uploads/`), while `generation.ts`'s only existing file-write path uses `public/uploads/`. `BASIC.EDITORIAL.1.B` should write to `public/uploads/sequence-results/...` for consistency with that precedent, unless a deliberate reason emerges to prefer `storage/uploads/` (e.g. a Docker-volume separation from the Next.js `public/` build output) — this is worth a one-line confirmation at the start of `.1.B`, not a re-audit.

Filename collisions are avoided via `randomUUID()`, matching `generation.ts`'s convention exactly. Cleanup of old/orphaned render outputs (e.g. after a result is archived, or on re-publish) is **not** addressed by this ticket — flagged in §11 Risks.

## 10. Future Implementation Plan

Proposed files for `BASIC.EDITORIAL.1.B` (none created in this ticket):

```text
src/lib/editorial/basicCutManifest.ts       — buildBasicCutManifest(document): BasicCutManifest (pure)
src/lib/editorial/renderBasicSequenceResult.ts — renderBasicSequenceResult(manifest, outputPath): Promise<RenderResult> (FFmpeg child_process wrapper)
src/actions/basicEditorial.ts               — publishBasicSequenceResult(projectId, sequenceId): server action orchestrating the below
```

Conceptual `publishBasicSequenceResult` flow:
1. Load the sequence's current editorial state (`buildEditorialDocument`, same as `editorial-export`/`editorial-timing-patch` routes already do).
2. `buildBasicCutManifest(document)` → `BasicCutManifest`.
3. `renderBasicSequenceResult(manifest, targetPath)` → invokes FFmpeg, produces the MP4 at `uploads/sequence-results/sequence-{id}/{uuid}.mp4`.
4. `buildEditorialSnapshot({sequenceId, document})` → stamp the result with the exact structural state it was rendered from (reuses `OPENREEL.CONFLICT.1` verbatim, no new code).
5. `createSequenceResult({..., sourceMode: "basic", videoPath, durationSeconds, cutManifest, editorialSnapshot, warnings})` — the existing `SEQUENCE.RESULT.1` write path, unchanged.
6. Optionally `setActiveSequenceResult(...)` if the publish flow is "publish and activate" in one step (still an open question from `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §11, not resolved by this ticket).

## 11. Risks

- **FFmpeg absent on this dev machine** (confirmed §4) — blocks any local testing of `.1.B` until resolved (system install or `ffmpeg-static` dependency decision).
- **Heterogeneous codecs/resolutions/framerates** across approved shot videos — addressed by Option B's mandatory re-encode, but the *scale/pad* filter parameters (target resolution, letterbox vs. crop vs. stretch) still need a concrete decision in `.1.B`.
- **Missing source files** — a shot's `approvedVideoPath` pointing at a file that no longer exists on disk (deleted, moved, or a stale DB reference) would need to be caught before invoking FFmpeg (treat as a placeholder + warning, not a hard render failure).
- **Long render times** — a full re-encode of a multi-minute sequence is not instant; `.1.B` needs to decide whether publish is synchronous (blocks the request) or needs some minimal async handling. The ticket's own scope explicitly excludes a background job queue, implying a synchronous (if slow) first version — worth confirming explicitly in `.1.B`.
- **Windows path escaping** — `child_process.execFile` (not `exec`) with an argument array avoids shell-quoting issues entirely; this dev environment is Windows, so this must be gotten right from the first implementation, not discovered later. `execFile`, never string-concatenated `exec`, is the correct choice regardless of platform but especially here.
- **Temp file cleanup** — if any intermediate files are ever written (unlikely with a single `filter_complex` invocation, but possible if a two-pass approach is ever needed), they must be cleaned up on both success and failure paths.
- **Placeholder/gap synthesis correctness** — `drawtext` requires a font file to be locatable by FFmpeg on the host system; this is another environment dependency worth confirming during `.1.B`'s own audit-on-implementation, not assumed here.
- **Audio stream mismatches** — some approved videos may have no audio track at all; the `concat` filter graph must give every segment an explicit audio input (real or `anullsrc`) or the graph will fail to build, not just render silently wrong.
- **Concurrent modification during render** — a render that takes several seconds/minutes leaves a window where the user could edit the sequence (move a shot, insert one) while rendering is in progress. `OPENREEL.CONFLICT.1`'s snapshot mechanism can detect this *after the fact* (the stored `editorialSnapshot` would disagree with the sequence's state at completion), but does not by itself prevent starting a render against soon-to-be-stale data — worth a decision in `.1.B` on whether to snapshot before or after render, and whether to warn/fail on drift.
- **Double-render / duplicate publish** — nothing in this audit's proposed flow prevents a user (or a double form-submit) from triggering two renders of the same sequence concurrently; `.1.B` should consider a simple in-flight guard (e.g. a `status: "draft"` row created immediately, checked before starting a second render for the same sequence).
- **Storage root ambiguity** — the two-candidate-root behavior in `uploads/[...path]/route.ts` (§9) means writing to the wrong root would make the file invisible to serving even though the DB row looks correct; must be resolved explicitly, not left to trial-and-error.

## 12. Recommended Next Ticket

```text
BASIC.EDITORIAL.1.B — Publish Basic Sequence Result

Scope:
- render approved videos in current editorial order
- support trims if already present
- generate black placeholders for missing shots
- generate black silent gaps for empty spaces
- reencode to MP4 H.264/AAC (or silent audio where source has none)
- create a Sequence Result (sourceMode: "basic")
- store cutManifest (mikai-basic-cut-manifest-v1) and editorialSnapshot
- show the result in the existing Sequence Result viewer (SEQUENCE.RESULT.1, unmodified)

Out of scope:
- fancy timeline UI
- audio mixing/leveling
- transitions
- speed changes
- split clips
- background job queue
- Film Result

Prerequisite decision needed before implementation:
- FFmpeg strategy: system-installed binary (child_process) vs. an
  ffmpeg-static npm dependency — requires explicit package.json approval
  either way, and must be resolved before any render code is written.
```

---

## Confirmations

- Documentary ticket only — no code, schema, migration, or dependency changed.
- `npx tsc --noEmit` / `npm run build` not run — no source files were modified (ticket explicitly waives this requirement for a docs-only change).
- No `package.json`/lockfile change.
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign.
- No `SequencePreviewPlayer` change.
- No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched or read.
- No runtime DB/uploads/outputs/storage modified — the `ffmpeg -version`/`ffprobe -version` checks and `grep` audits were read-only; no temporary scripts, render outputs, or DB writes were made or left behind.
