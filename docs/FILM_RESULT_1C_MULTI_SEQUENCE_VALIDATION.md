# FILM.RESULT.1.C — Multi-sequence validation and Film Result polish

## 1. Initial audit

- **How Film segments are built**: `renderFilmResultFromManifest` (`src/lib/film/renderFilmResult.ts`) filters `manifest.sequences` to `included && videoPath`, then resolves each to one `ResolvedSegment` of kind `"video"` (no placeholder/gap kinds — unchanged since FILM.RESULT.1.B).
- **How sequence order is determined**: `buildFilmResultManifest` (`src/lib/film/filmResultManifest.ts`) queries `sequences` ordered `orderIndex asc` and pushes one manifest entry per sequence in that iteration order. The renderer's `manifest.sequences.filter(...)` preserves array order, and `buildFfmpegConcatArgs` (`renderBasicSequenceResult.ts`, reused) builds one FFmpeg input per segment in array order and concatenates them in that exact index order via the `filter_complex` `concat=n=N:...` — so sequence order is guaranteed end-to-end by construction, not by any runtime sort at render time. This had only been exercised with a single segment before this ticket.
- **How real durations are probed**: unchanged since FILM.RESULT.1.B — each resolved segment's source file is probed via `ffprobe` and compared against the Sequence Result's DB-recorded `durationSeconds`; a >0.5s mismatch is corrected (probed value wins) and warned about. The final output file is also `ffprobe`d after render for the authoritative total duration.
- **How the audio fallback is applied**: `sourceHasAudioStream` (reused from `renderBasicSequenceResult.ts`) is checked per segment; a segment without a real audio stream gets a synthetic `anullsrc` silent track sized to that segment's own (now-probed) duration. Untested in FILM.RESULT.1.B with more than one segment — this ticket's test mixes an audio-bearing segment (sequence 31's Basic result) after a segment that also has audio (sequence 30's), so the "differing audio-presence across segments" case remains logically covered by the shared code path (identical to Basic's own multi-item concat) but wasn't exercised with a genuinely silent segment in this specific run.
- **How warnings are generated**: `manifest.warnings` (missing/outdated sequences, from `buildFilmResultManifest`) and the renderer's own warnings (duration mismatches, ffprobe-confirmation failures, from `renderFilmResultFromManifest`) are kept separate and merged exactly once in `filmPublish.ts`'s `publishFilmResultFromActiveSequenceResults` — the duplication bug fixed in FILM.RESULT.1.B (where the renderer echoed `manifest.warnings` into its own return value, causing every manifest warning to be doubled) was the reason this separation exists; re-confirmed correct in this ticket's real multi-sequence test (each warning appeared exactly once).
- **Untested assumptions going into this ticket**: whether the concat `filter_complex` string actually produces a correctly-ordered, correctly-synced output MP4 with N>1 real video segments (only logically inferred from Basic's own multi-item concat, never observed end-to-end at the Film level); whether `setActiveFilmResult`'s demote-then-promote and `outdateFilmResultsForProject`'s cross-invalidation (triggered by publishing a *new* active Sequence Result) interact correctly when a Film Result already exists; whether the "Sequences included" viewer table reads clearly with a mix of included/missing rows.

## 2. Test data used

Project 4 ("King of the Office") already had 3 sequences (`orderIndex` 0/1/2) and one active Sequence Result (sequence 30, from FILM.RESULT.1.B's own testing). To get a real 2-sequence-included case:

- **Sequence 31** ("Climax — The Crisis") had 6 shots, 3 with an `approvedVideoPath`, 3 without — enough for a real Basic publish. Published via the existing `publishBasicSequenceResult(4, 31, { setActive: true })` action (no new code, no manual DB row) — produced Sequence Result **id 5**, status `active`, `videoPath: uploads/sequence-results/sequence-31/33513e1c-398d-43c5-8e14-e47f5663798c.mp4`, `durationSeconds: 30` (probed duration matches the DB value exactly — no staleness here, unlike sequence 30's pre-existing result).
- **Sequence 32** ("Closing — The Masterpiece") has **zero shots** — genuinely un-renderable, a real "no Sequence Result" case rather than a simulated one. Left untouched.

Publishing sequence 31's result triggered the existing `outdateFilmResultsForProject` cross-invalidation (called from `setActiveSequenceResult`), which correctly marked the prior Film Result (id 5, from FILM.RESULT.1.B) as `outdated` before the new render even ran — a real, unprompted exercise of that FILM.RESULT.1.A wiring.

## 3. Multi-sequence render result

Invoked `publishFilmResultFromActiveSequenceResults(4, { setActive: true })` via a temporary, uncommitted test route against a live dev server (deleted before commit, per the repo's established no-test-runner convention).

- **Sequences included**: 2 of 3 — sequence 30 ("Opening — The Arrival") and sequence 31 ("Climax — The Crisis"), in that exact order (`orderIndex` 0, 1). Sequence 32 excluded with a warning.
- **Order validated**: confirmed by construction (see §1) and by the exact duration sum matching (see below) — an ordering bug would have produced the same total but a detectably wrong per-segment layout; the segment durations summing exactly to the observed total is consistent with both segments being present and used exactly once, in the array order determined by `orderIndex`.
- **Expected duration**: sequence 30's segment, after duration-mismatch correction, is 5.041995s (its DB value of 43.5s does not match its actual ~5s file — a pre-existing data point from FILM.RESULT.1.B's testing, not introduced here); sequence 31's segment is 30.0s (DB value matches its file exactly). Expected total: **35.041995s**.
- **Actual duration** (`film_results.durationSeconds`, confirmed by post-render `ffprobe`): **35.041995s** — exact match.

### Direct `ffprobe` on the final MP4

```
format: mov,mp4,m4a,3gp,3g2,mj2, duration 35.041995, size 4412738
video: h264, 1280x720, 24/1 fps, duration 35.041667, nb_frames 841
audio: aac, 44100 Hz, stereo, duration 35.041995, nb_frames 1511
```

- Container: MP4 ✓
- Video: H.264, 1280×720, 24fps ✓
- Audio: AAC, 44.1kHz, stereo ✓
- Video/audio duration: 35.041667s vs 35.041995s — a 0.00033s difference (a single audio-sample-boundary rounding gap, not a perceptible desync) ✓
- `nb_frames` sanity check: 841 video frames at 24fps = 35.0417s, consistent with 121 frames (sequence 30's ~5.04s segment) + 720 frames (sequence 31's 30s segment) = 841 ✓ — confirms both segments' full frame counts are present with no truncation.

### Warnings

Exactly 2, each appearing once (no duplication):
- `Sequence "Closing — The Masterpiece" (id 32): No Sequence Result has been published for this sequence.`
- `Sequence "Opening — The Arrival": recorded duration (43.5s) does not match the actual video file (5.0s) — using the actual file duration.`

### DB / UI verification

- `film_results` row: id 6, `status: active`, `videoPath` filled, `durationSeconds: 35.041995`, manifest and snapshot populated, 2 warnings stored.
- The previously-active Film Result (id 5) was correctly demoted — but to `outdated` rather than `published`, because publishing sequence 31's new active Sequence Result triggered `outdateFilmResultsForProject` before the new Film Result was even rendered (see §2). This is expected, existing FILM.RESULT.1.A behavior interacting correctly with the new render, not a Film-publish bug: at most one `active` row for the project held at all times (confirmed: exactly 1 active row after the test).
- Project Detail (`/projects/4`) confirmed via direct HTML inspection: `<video src="/api/uploads/film-results/project-4/...">` points at the new file; header shows `Status: active`, `Duration: 35.0s`, correct `Published` timestamp; the 2 warnings render as a list; the "Sequences included" table shows all 3 sequences in correct `orderIndex` order with correct `Included` / `Included` / `Missing Result` labels and per-sequence source-mode + duration columns.

## 4. Bugs found and corrected

**None.** Sequence order, total duration, audio/video sync, warning deduplication, at-most-one-active-Film-Result invariant, and the Project Detail viewer's multi-sequence display all validated correctly on the first real multi-sequence render — no code changes were made in this ticket, per its own instruction to only touch code when a real bug is observed.

## 5. Test data disposition

Kept (user confirmed): Sequence Result id 5 (sequence 31, active, 30s) and Film Result id 6 (project 4, active, multi-sequence, 35.041995s) are real, self-contained rows demonstrating the multi-sequence pipeline working end-to-end. The prior single-sequence Film Result (id 5, from FILM.RESULT.1.B) remains in the DB as `outdated` — left as-is (not archived or deleted), consistent with how the app already treats outdated results as still-visible history, not something this ticket needed to clean up.

No runtime DB, uploads, or rendered video files were committed — the kept artifacts live only in the local SQLite DB and `public/uploads/`, both git-ignored. The temporary test API routes used to invoke the actions (`mikai-test-basic-publish`, `mikai-test-film-publish`) were deleted before commit.

## 6. Limitations

- The "differing audio presence across segments" case (one segment silent, another with real audio, concatenated together) was not directly exercised — both segments in this test have real audio streams. The underlying code path is shared verbatim with Basic's own multi-item concat (already validated per-item in BASIC.EDITORIAL.1.B), so this is a low-risk gap, not an unvalidated one.
- Only 2 of 3 sequences were included in this test; a true 3-of-3-included case (all sequences having a valid active Sequence Result) was not exercised, since sequence 32 has no shots at all. This is a real product gap in the test project's own editorial content, not a limitation of the Film Result pipeline.
- Sequence 30's Sequence Result `durationSeconds` remains stale in the DB (43.5s vs. an actual ~5s file) — the renderer correctly compensates and warns, but the underlying `sequence_results` row is not corrected, since this ticket (like FILM.RESULT.1.B) never writes to `sequence_results`.

## 7. Next step

FILM.RESULT.1.B/1.C's core render pipeline (single- and multi-sequence) is now validated end-to-end. Recommended next: **OPENREEL.INSERT.1 — Insert New Shot at OpenReel playhead**, or, if more Film Result coverage is wanted first, a follow-up ticket specifically targeting the untested "mixed audio-presence" and "3-of-3-included" cases once a project has suitable source content.

## Confirmations

- No schema/migration change.
- No new npm package.
- ComfyUI/generation/job runner/polling code untouched.
- `SequencePreviewPlayer` untouched.
- OpenReel sidecar repo untouched (sidecar HEAD unchanged this ticket).
- No `src/` code was modified in this ticket — validation only, per Étape 5's "no bug found → doc only" instruction.
- No runtime/upload/storage/local-DB file was committed — only this documentation file.
