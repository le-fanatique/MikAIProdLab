# FILM.RESULT.1.B — Render Film Result from active Sequence Results

## 1. Initial audit

- **Film Result draft creation today**: `createFilmResultDraftFromActiveSequenceResults` (`src/actions/filmResults.ts`) builds a manifest via `buildFilmResultManifest`, computes a `FilmProjectSnapshot`, and inserts a `status: "draft"` row with `videoPath: null` — no FFmpeg, no file. This ticket adds a parallel *render+publish* path; the draft primitive is untouched.
- **Fetching active Sequence Results**: `buildFilmResultManifest` (`src/lib/film/filmResultManifest.ts`, FILM.RESULT.1.A, unmodified) already reads sequences in `orderIndex` order and, per sequence, looks up its `active` Sequence Result. It returns one manifest entry per sequence regardless of outcome — `included: true` with `videoPath`/`durationSeconds` copied verbatim when an active, non-outdated result exists, or `included: false` with a `missingReason` and a pushed manifest warning otherwise. This is exactly the manifest this ticket needed — reused as-is.
- **How the manifest represents available/missing videos**: `FilmResultManifestSequence.included` + `videoPath`/`durationSeconds` (both `null` when not included) + `missingReason` string. `manifest.warnings` collects a human-readable line per missing/outdated sequence.
- **How Basic resolves video paths / writes to `public/uploads`**: `renderBasicSequenceResult.ts`'s `resolveExistingAbsolutePath` checks two candidate roots (`storage/uploads/...`, `public/uploads/...`), matching `/api/uploads/[...path]/route.ts`'s own dual-root serving logic. Output files are written to a `.tmp` path under `public/uploads/...`, then renamed to `.mp4` only on success (an explicit `-f mp4` flag is required because ffmpeg can't infer the container from a `.tmp`-suffixed path — a real bug fixed in BASIC.EDITORIAL.1.B).
- **Functions shared vs copied**: rather than duplicating FFmpeg logic, `renderBasicSequenceResult.ts` was extended to `export` three previously-private symbols it already contained — `resolveExistingAbsolutePath`, `sourceHasAudioStream`, and the `ResolvedSegment` type. `buildFfmpegConcatArgs` was already exported. `src/lib/film/renderFilmResult.ts` imports all four directly; no FFmpeg argument-building logic was re-implemented.
- **Where to place the button**: the existing "Film Result" `SectionLabel` in `src/app/projects/[projectId]/page.tsx` already has `CreateFilmResultDraftButton` in its action slot — `RenderFilmResultButton` was added alongside it (draft-only creation stays available; render+publish is a separate, additive action).

## 2. Film render strategy

One level up from Basic: each *included* Sequence Result's video becomes exactly one "video"-kind segment (no placeholder/gap kinds — V1 excludes non-renderable sequences instead of rendering a black placeholder, and never inserts an artificial gap between sequences, per the ticket). Segments are concatenated in Sequence `orderIndex` order via a single `filter_complex` invocation, full re-encode to H.264/AAC MP4, normalized to 1280×720@24fps / 44.1kHz stereo (same constants as Basic), with a silent-audio fallback per segment lacking a real audio stream.

## 3. Renderer added

`src/lib/film/renderFilmResult.ts` — `renderFilmResultFromManifest({ projectId, manifest })`:
- Requires FFmpeg to be available (via `getFfmpegPath`).
- Filters the manifest to `included && videoPath` sequences; throws `"No active sequence results with playable videos were found."` if none.
- Resolves each included sequence's video to an absolute path (dual-root check, reused from Basic). **Fails hard** (not a soft skip) if a file marked `included: true` is missing on disk — this indicates a storage/DB inconsistency, distinct from Basic's placeholder-downgrade behavior for a missing shot video.
- **Duration-mismatch detection (new, not present in Basic)**: probes each resolved source file's real duration via `ffprobe` and compares it against the Sequence Result's DB-recorded `durationSeconds`. If they differ by more than 0.5s, pushes a warning and uses the *probed* duration for the render instead of the stale DB value. This was found necessary during real validation (see §6) — trusting a stale DB duration produced a video track shorter than its silent-audio padding, a real audio/video desync.
- Builds FFmpeg args via the reused `buildFfmpegConcatArgs`, renders to a `.tmp` file, renames to `.mp4` on success, confirms final duration via `ffprobe` (falls back to the segment-duration sum + a warning if `ffprobe` fails).
- Returns `{ outputVideoPath, durationSeconds, warnings }` — `warnings` here are only this function's own (duration mismatches, ffprobe-confirmation failures); the caller is responsible for merging in `manifest.warnings`.

## 4. Action added

`src/actions/filmPublish.ts` (new file, kept separate from `filmResults.ts`'s CRUD/manifest primitives — same reasoning as `basicEditorial.ts` living apart from `sequenceResults.ts`) — `publishFilmResultFromActiveSequenceResults(projectId, { setActive? })`:
1. Verify FFmpeg availability.
2. `buildFilmResultManifest(projectId)`.
3. `computeFilmProjectSnapshot(manifest)` — reused as-is from FILM.RESULT.1.A (see §5).
4. `renderFilmResultFromManifest({ projectId, manifest })`.
5. Insert a `film_results` row (`status: "active"` if `setActive`, else `"published"`) with `videoPath`, `durationSeconds`, `sequenceResultManifest`, `projectSnapshot`, merged `warnings`, `publishedAt`.
6. If DB insert fails after a successful render, best-effort delete the now-orphaned rendered file.
7. If `setActive`, call the existing `setActiveFilmResult` (demotes any other active Film Result for the project) — a separate step after insert, same convention as `publishBasicSequenceResult`.
8. `revalidatePath`.

Render happens before any DB write — no transaction is held open across the FFmpeg call. `sequence_results` rows are never read for mutation and never written by this action.

## 5. Output path

- Uploads-relative (stored in `film_results.videoPath`): `uploads/film-results/project-{projectId}/{uuid}.mp4`
- Physical: `public/uploads/film-results/project-{projectId}/{uuid}.mp4`
- Servable via the existing `/api/uploads/[...path]` route (dual-root check already covers `public/uploads/...`).

## 6. Project snapshot

FILM.RESULT.1.A's existing `FilmProjectSnapshot` (`{schemaVersion: "mikai-film-project-snapshot-v1", projectId, generatedAt, fingerprint, sequenceCount}`, a sha256 fingerprint over sorted `[sequenceId, sequenceResultId, sequenceResultStatus]` tuples) was reused unmodified rather than introducing this ticket's alternative suggested shape (`sequenceResultIds` / `sequenceStates` array). The existing shape already answers "which Sequence Results was this Film Result built from" via the fingerprint, and `createFilmResultDraftFromActiveSequenceResults` already produces the same shape — introducing a second, differently-structured snapshot type for the render path would be the over-engineering the ticket explicitly warned against.

## 7. Warnings / errors

Errors (render aborts, `PublishFilmResultResult.ok: false`):
- FFmpeg unavailable
- No renderable Sequence Results (`"No active sequence results with playable videos were found."`)
- An `included: true` sequence's source video missing from disk (fail hard, per the ticket's explicit MVP decision)
- FFmpeg render failed
- Output file missing after a reported-successful render
- DB insert failure after render (orphaned file cleaned up best-effort)

Warnings (render still succeeds):
- Sequence missing an active result (from `buildFilmResultManifest`)
- Sequence Result outdated (from `buildFilmResultManifest`)
- Sequence Result missing `videoPath` (from `buildFilmResultManifest`)
- Duration mismatch between the DB-recorded duration and the actual file (new, added after real validation surfaced it — see §3/§8)
- `ffprobe` failed to confirm the final rendered duration (falls back to the computed segment total)

## 8. Real validation

Ran against **Project 4 ("King of the Office")**, which has 3 sequences; only sequence 30 ("Opening — The Arrival") had an active Sequence Result at test time (sequences 31/32 had none — a real "missing result" case, not simulated).

Via a temporary, uncommitted `src/app/api/mikai-test-film-publish/route.ts` (deleted before commit, per the session's established testing convention — no test runner in this repo), invoked `publishFilmResultFromActiveSequenceResults(4, { setActive: true })` against the live dev server.

**First run** surfaced two real bugs, both fixed and re-verified live:
1. **Duplicated warnings** — `renderFilmResultFromManifest` was seeding its own `warnings` array with a copy of `manifest.warnings`, and `filmPublish.ts` also prepended `manifest.warnings` — every manifest warning appeared twice in the stored row. Fixed by making the renderer track only its own warnings; the caller owns merging in `manifest.warnings`.
2. **Video/audio desync** — sequence 30's active Sequence Result had `durationSeconds: 43.5` in the DB, but its actual video file was only 5.04s long (a pre-existing stale-duration data point, not something introduced by this ticket). The renderer trusted the DB value for `-t` and for the silent-audio-fallback duration, producing an MP4 with a 5.04s video track under a 43.5s silent audio track. Fixed by probing the real file duration via `ffprobe` before rendering, warning on mismatch, and using the probed duration for both the video segment and its audio fallback.

**Final run** (kept as a real Film Result — user confirmed keep):
- `film_results` row: `id 5`, `status: active`, `videoPath: uploads/film-results/project-4/9790f15d-1cb6-4d12-af33-c42f77efb2e9.mp4`, `durationSeconds: 5.041995`, `sequenceResultManifest` and `projectSnapshot` populated, 3 warnings stored (2 "no result for this sequence", 1 duration-mismatch).
- Direct `ffprobe` on the output: H.264 / 1280×720 / 24fps / AAC 44.1kHz stereo, video and audio streams both 5.04s (in sync).
- Project Detail page (`/projects/4`) confirmed to reference and serve the new MP4 in its viewer.
- "Previous Film Results" demotion verified live as a side effect of testing the render twice in a row: the first render's row was correctly demoted from `active` to `published` when the second render activated — exercised the existing `setActiveFilmResult` demote-then-promote path exactly as intended. The superseded duplicate row/file from that second test run was deleted before finishing (kept only the final, bug-fixed render as the single test artifact).
- The zero-renderable-sequences error path was verified against Project 3 (no Sequence Results at all): returned exactly `{ ok: false, error: "No active sequence results with playable videos were found." }`.

## 9. Limitations

- No transitions between sequences, no advanced audio mixing, no film timeline UI, no chapter editing — all explicitly out of scope for V1.
- A Sequence Result's stored `durationSeconds` is now only a hint — the renderer always re-probes the real file and warns on drift, but the underlying Sequence Result row itself is not corrected (out of scope: this ticket never writes to `sequence_results`).
- No automated test coverage — this repo has no test runner (confirmed repeatedly across prior tickets); validation was manual, via a temporary test route against a live dev server and direct `ffprobe` inspection, both deleted/reverted before commit.

## 10. Next steps

- **FILM.RESULT.1.C** — Film Result polish / multi-sequence validation (a project with several concurrently-active Sequence Results would exercise the multi-segment concat path, not yet covered by real testing here — Project 4 currently has only one active Sequence Result).
- **OPENREEL.INSERT.1** — Insert New Shot at OpenReel playhead.

## Confirmations

- No schema/migration change (the `film_results` table already existed from FILM.RESULT.1.A).
- No new npm package.
- ComfyUI/generation/job runner/polling code untouched.
- `SequencePreviewPlayer` untouched.
- OpenReel sidecar repo untouched (sidecar HEAD unchanged this ticket).
- `sequence_results` rows are never read for mutation and never written by any code added in this ticket.
- All FFmpeg invocations use `execFile`, never `exec`; no raw user-supplied FFmpeg command is ever accepted.
- No runtime/upload/storage/local-DB/video file is committed — the kept test artifact (`film_results` row id 5 and its rendered MP4) lives only in the local SQLite DB and `public/uploads/`, both git-ignored.
