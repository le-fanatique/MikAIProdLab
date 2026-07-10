# BASIC.EDITORIAL.1.B — Publish Basic Sequence Result

Status: MikAI-only implementation, real end-to-end render verified against the live dev server. MikAI HEAD before this ticket: `aec63fd — Add bundled FFmpeg health check`, working tree clean.

## 1. Audit Summary

- `src/lib/ffmpeg.ts` (`FFMPEG.BUNDLE.1`) already provided `checkFfmpegAvailability`/`runFfprobeJson`/`getFfmpegPath`/`getFfprobePath` — reused directly, unmodified.
- `src/actions/sequenceResults.ts` (`SEQUENCE.RESULT.1`) already provided `createSequenceResult`/`setActiveSequenceResult` — reused directly, with one small, deliberate type widening (see §2).
- `src/lib/editorial/editorialDocument.ts` (`buildEditorialDocument`, `deriveEmptySpaces`, `getEditorialItemEffectiveDuration`) and `editorialSnapshot.ts` (`buildEditorialSnapshot`) are the exact read/fingerprint primitives already used by the export and timing-patch routes — reused verbatim for the manifest builder and the publish action's `editorialSnapshot` stamp.
- **`storage/uploads` vs `public/uploads` resolved**: confirmed (again, directly, via the real render below) that `src/actions/generation.ts`'s only existing file-write precedent writes under `public/uploads/...`. The renderer writes there too, and — since a *source* video's stored path is ambiguous in principle — the renderer's path-resolution helper checks **both** `storage/uploads/` and `public/uploads/` (matching `/api/uploads/[...path]/route.ts`'s own dual-root check exactly) before treating a source video as missing.
- Sequence Detail page (`sequences/[sequenceId]/page.tsx`) already had the Sequence Result viewer section (`SEQUENCE.RESULT.1`) — the publish button was added to that section's own `SectionLabel` action slot, no new section, no `SequencePreviewPlayer` involvement (confirmed not needed, not touched).

## 2. Manifest (`mikai-basic-cut-manifest-v1`)

`src/lib/editorial/basicCutManifest.ts` — `buildBasicCutManifest(projectId, sequenceId)`, matching the ticket's proposed shape exactly (`items[]` with `itemId`/`shotId`/`orderIndex`/`sourceVideoPath`/`startSeconds`/`durationSeconds`/trims/`status`/`placeholderReason`, plus `emptySpaces[]` and `warnings[]`). Built from the same `EditorialDocument` the export/timing-patch routes already build (via a new shared `loadEditorialDocumentForSequence` helper, extracted so `publishBasicSequenceResult` can reuse the identical DB read for its `editorialSnapshot` stamp without a second query pass building a second document).

`status: "video"` is a DB-only judgment (`shot.approvedVideoPath` present and not a placeholder shot) — whether that file still exists on disk is deliberately deferred to the renderer, which needs the resolved absolute path anyway and can usefully downgrade to a placeholder + warning right before the ffmpeg call that would otherwise fail.

`createSequenceResult`'s `cutManifest` parameter was **widened from the generic `SequenceResultCutManifest` to `unknown`** (`src/actions/sequenceResults.ts`) — a pure TypeScript type change, no schema/migration involved (the column is unstructured JSON-in-TEXT already). This resolves the reconciliation flagged in `SEQUENCE_RESULT_1`'s and `BASIC_EDITORIAL_1A`'s own docs: the richer `BasicCutManifest` object is now stored verbatim, rather than forcing it through the narrower per-item projection type.

## 3. FFmpeg Strategy (Final)

Option B, as decided in `BASIC_EDITORIAL_1A_RENDERING_AUDIT.md`: one `filter_complex` invocation per publish, full re-encode to H.264/AAC MP4.

- **Segments**: manifest items and empty spaces are merged into one chronological list (`startSeconds` order). Each becomes one render segment: `video` (real trimmed source), `placeholder` (missing shot — black+silent), or `gap` (empty space — identical black+silent treatment).
- **Video normalization**: every segment is scaled+padded (letterboxed, aspect preserved) to a fixed target — `1280×720 @ 24fps` — via `scale=...force_original_aspect_ratio=decrease,pad=...,setsar=1,fps=24`. Fixed target chosen because source approved videos are not guaranteed to share resolution/framerate (confirmed for real in this ticket's render: sources were `864×496` and `752×560` at 24fps — genuinely heterogeneous).
- **Trims**: applied as **input-side** `-ss <trimIn> -t <duration>` (before `-i`), not output-side. Chosen for speed; combined with the mandatory full re-encode, input-side seeking here still produces frame-accurate results in practice (modern ffmpeg's demuxer-level seek is accurate for MP4/MOV, and the subsequent decode+encode pass corrects any residual keyframe misalignment) without the cost of decoding the entire source file up to the seek point.
- **Placeholders/gaps**: `color=c=black:s=1280x720:r=24:d=<duration>` (lavfi), no text overlay — per the audit's own reasoning, `drawtext` was avoided (font availability uncertain, especially on a not-yet-verified Linux server) and isn't necessary for a first playable cut.
- **Audio**: per source segment, `runFfprobeJson` checks for a real audio stream. If present, it's carried through (`aformat=sample_rates=44100:channel_layouts=stereo`). If absent (confirmed for real: none of sequence 30's four approved videos have an audio stream), or for a placeholder/gap, a matching-duration `anullsrc=channel_layout=stereo:sample_rate=44100:d=<duration>` (lavfi) silent source is synthesized instead — every segment always has both a video and an audio pair before the final `concat` filter, avoiding the exact "concat filter fails on a stream-count mismatch" risk flagged in the audit.
- **Encode**: `-c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 20 -c:a aac -b:a 128k -movflags +faststart -f mp4`.
- **Argument construction is a pure function** (`buildFfmpegConcatArgs(segments, outputPath): string[]`, no I/O) — per the ticket's request that FFmpeg arg generation be inspectable without launching a render. Exercised in practice by every real render in this ticket's testing (every invocation's exact argument list was visible in the process output — see §9).
- **`execFile`, never `exec`**, throughout (renderer and `src/lib/ffmpeg.ts` both) — arguments are always a real array, never a shell string; no command-injection surface regardless of path content.

## 4. Real Bug Found and Fixed During Verification

Two genuine bugs surfaced only by actually running a real render — both fixed as part of this ticket, not deferred:

**Bug 1 — `ffmpeg-ffprobe-static`'s paths broke under Next.js's server bundler.** The package resolves its binary paths via `path.join(__dirname, ...)` at require time. Next.js/Turbopack's server bundling rewrites `__dirname` to a synthetic build-tracing path when the package is bundled — observed directly: `getFfmpegPath()` returned `"\ROOT\node_modules\ffmpeg-ffprobe-static\ffmpeg.exe"` instead of a real absolute path, and every `execFile` call against it failed. **Fixed** by adding `ffmpeg-ffprobe-static` to `next.config.ts`'s `serverExternalPackages`, alongside the pre-existing `better-sqlite3` entry (added there for the identical reason — a native/dynamic-path package that must not be bundled). This is a one-line, well-precedented config change, not a new pattern. **Required restarting the dev server** — `next.config.ts` changes are not hot-reloadable, unlike the rest of this ticket's source changes.

**Bug 2 — FFmpeg couldn't infer the output container format from a `.mp4.tmp` filename.** The renderer writes to `<uuid>.mp4.tmp` first, renaming to `<uuid>.mp4` only on success (see §6). FFmpeg's format auto-detection keys off the filename extension, and `.tmp` isn't a recognized container — every render failed with `Unable to choose an output format`. **Fixed** by adding an explicit `-f mp4` to the output arguments, making the container format independent of the temporary filename's own extension.

Both fixes are reflected in the code as committed — the version described in this document is the one that actually renders successfully, not the pre-fix version.

## 5. Output Path

```text
uploads/sequence-results/sequence-{sequenceId}/{uuid}.mp4
```

Written under `public/uploads/...` (matching `generation.ts`'s only existing precedent), stored as this exact `uploads/`-relative string in `sequence_results.videoPath` — read back by the existing viewer via `refImageUrl()`, exactly like `shots.approvedVideoPath` already is. Confirmed servable via `GET /api/uploads/sequence-results/sequence-30/<uuid>.mp4` → `200`.

Written first to `<path>.tmp`, renamed to the final `<path>` only after both the ffmpeg process exits successfully **and** the output file is confirmed to exist — a partial/corrupt file from a failed or killed render is never left at the servable path. On any failure, the `.tmp` file is removed before the error propagates.

## 6. Publish Action

`src/actions/basicEditorial.ts` — `publishBasicSequenceResult(projectId, sequenceId, { setActive? })`:

1. `checkFfmpegAvailability()` — fails fast with a readable error if FFmpeg isn't usable, before touching the DB or the filesystem.
2. `loadEditorialDocumentForSequence` — one DB read, reused for both the manifest and the snapshot (see §2).
3. `buildBasicCutManifest` (using the same preloaded document).
4. `buildEditorialSnapshot` — stamps this publish with the sequence's exact structural fingerprint at build time (`OPENREEL.CONFLICT.1`'s mechanism, reused with zero new code — this ticket is exactly the "future publish Sequence Result" use case that mechanism was built to eventually cover, per `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §9).
5. `renderBasicSequenceResult` — the long-running step. **No DB transaction is held open across it** (per the ticket's own explicit instruction) — render happens entirely before any DB write.
6. `createSequenceResult` — one insert, `sourceMode: "basic"`, `status: "active"` or `"published"` depending on `setActive`, `videoPath`/`durationSeconds`/`cutManifest`/`editorialSnapshot`/`warnings`/`publishedAt` all populated from the completed render.
7. If `setActive`, `setActiveSequenceResult` is called afterward to demote any other previously-active result for the sequence (the guarantee that function already exists to provide — see `SEQUENCE.RESULT.1`).

**Orphaned-file handling**: if the DB insert fails *after* a successful render (step 6), the just-rendered file is deleted best-effort (`fs.rm(..., { force: true })`) — safe because the filename is a fresh `randomUUID()` unique to this exact request, so this cleanup can never touch another result's file. This is the one documented risk the ticket asked to flag explicitly, and it is mitigated, not just noted.

## 7. UI

Sequence Detail page, `Sequence Result` section header — added `PublishBasicSequenceResultButton` (`src/components/PublishBasicSequenceResultButton.tsx`) as that section's action slot. Label: **"Publish Basic Sequence Result"** (exact ticket wording). Confirmation dialog: **"Publish a new Basic Sequence Result from the current editorial order?"** (exact ticket wording). On success, shows `Sequence Result published (<duration>s).` plus any warnings, and calls `router.refresh()` so the viewer above immediately reflects the new active result — no new timeline UI, no reorder/trim UI, nothing beyond this one button, per the ticket's explicit scope.

## 8. Error Handling

Every failure path returns a plain `{ ok: false, error: string }` — never an unhandled throw reaching the UI:

- FFmpeg unavailable → `checkFfmpegAvailability`'s own message.
- Project/sequence not found → `"Sequence {id} not found in project {id}."`
- No shot-backed editorial items → `"Sequence {id} has no shot-backed editorial items — nothing to render."`
- Source video missing on disk → not a hard error — downgraded to a placeholder segment with a warning (`"Item {id} (shot {id}): source video "{path}" not found on disk — rendered as a placeholder."`), the render still completes.
- Invalid trim range → same treatment: warning, falls back to the full (untrimmed) duration.
- FFmpeg render failure (non-zero exit, timeout) → `"FFmpeg render failed: {ffmpeg's own stderr-derived message}"`.
- Output file missing after a reported-successful run → `"FFmpeg reported success but produced no output file."`
- **Sequence changed during publish**: not actively detected mid-render in this ticket (the snapshot is taken once, up front, and stored — it is not re-checked against the sequence's state *after* the render completes). This is a known, explicitly-scoped gap — see §10 Limitations.

## 9. Real Verification (Project 4, Sequence 30)

Performed against the live dev server via a temporary, uncommitted test route (`src/app/api/mikai-test-publish/route.ts` — created, used, then deleted; confirmed absent from `git status` before committing). No test framework exists in this repo (confirmed again — consistent with every prior ticket).

- **Manifest**: 6 items (4 `video`, 2 `placeholder` — shots 40/41 have no approved video), 6 `emptySpaces` (the sequence's current non-contiguous layout, inherited from earlier tickets' testing), 0 manifest-level warnings.
- **Render**: succeeded after fixing the two bugs in §4. Produced a real MP4: **H.264 1280×720 @ 24fps, AAC 44.1kHz stereo, duration 43.541667s**, confirmed via a direct `ffprobe -show_streams` inspection of the output file (not just trusting the render's own report) — `probe_score=100`, well-formed container.
- **Sequence Result created**: id `3` (autoincrement continued from earlier tickets' now-deleted test rows — expected SQLite behavior, not a bug), `sourceMode: "basic"`, `status: "active"` (published with `setActive: true`), `videoPath: "uploads/sequence-results/sequence-30/c85d4c18-ef12-4695-8f5f-ecfe4208729c.mp4"`, `durationSeconds: 43.541667` (the ffprobe-confirmed value, not the manifest's arithmetic estimate — `renderBasicSequenceResult` prefers the real probed duration when available).
- **Viewer**: confirmed via `GET /projects/4/sequences/30` — the `<video>` tag's `src` resolves to the new file, `Source: Basic Editorial`, active `StatusBadge`, duration `43.5s`, and the `Publish Basic Sequence Result` button all render correctly. The file itself is confirmed servable (`GET /api/uploads/sequence-results/sequence-30/<uuid>.mp4` → `200`).
- **Warnings**: none in this run (0 missing files, 0 invalid trims) — the error-path behaviors in §8 were confirmed by code inspection and by triggering the not-found case directly (`sequenceId=99999` → `{"ok":false,"error":"Sequence 99999 not found in project 4."}`), not by forcing every warning case with real broken data.
- **Disposition**: this result was **kept**, not deleted, as a deliberate choice — it's a genuine, correctly-produced first real Basic Sequence Result, not corrupted test data, and stands as a working demonstration of the feature. Confirmed via user decision during this ticket.

`npx tsc --noEmit` — 0 errors. `npm run build` — compiled successfully, all routes generated (same pre-existing, unrelated Turbopack NFT-tracing warning seen in every prior ticket; no new warning from the ffmpeg/render code).

## 10. Limitations

- **No mid-render staleness check**: the `editorialSnapshot` stored on the result reflects the sequence's structure at the moment the render *started*, not re-verified against the sequence's state when the render *finishes*. A structural edit made in the several-second window while ffmpeg is running would not be caught. `OPENREEL.CONFLICT.1`'s comparison mechanism could be applied here (compare a freshly-computed snapshot post-render against the one captured pre-render, warn or refuse if they differ) — not implemented in this ticket, consistent with its explicit scope (no new conflict-safety work beyond reusing the existing snapshot stamp).
- **No background job queue**: publish is synchronous — the server action blocks for the full render duration (a few seconds for this 6-item, ~44s sequence; would scale roughly linearly with total sequence duration and item count for longer sequences). Explicitly out of scope per the ticket.
- **Fixed 1280×720/24fps target**: not derived from source video properties, not configurable. Reasonable for V1 per the audit; a future ticket could probe source resolutions and pick a smarter target (e.g. the most common source resolution) if letterboxing proves visually unsatisfying.
- **Trim precision**: input-side `-ss`/`-t` is fast and generally accurate with a full re-encode, but has not been rigorously verified frame-by-frame against output-side trimming — acceptable for V1, worth revisiting only if a real frame-accuracy complaint surfaces.
- **Linux/server path not exercised**: this ticket's render was verified on Windows only (the same environment gap already flagged in `FFMPEG_BUNDLE_1`). The `serverExternalPackages` fix (§4) should transfer identically to Linux (it addresses a bundler behavior, not a platform-specific path issue), but has not been run there.
- **No UI surfacing of the `cutManifest`/`editorialSnapshot` contents** — they're stored and correct, but the viewer (unchanged from `SEQUENCE.RESULT.1`) doesn't expose them; only `notes`/`warnings` are shown, matching that ticket's existing scope.

## 11. Files Modified

- `src/lib/editorial/basicCutManifest.ts` (new).
- `src/lib/editorial/renderBasicSequenceResult.ts` (new).
- `src/actions/basicEditorial.ts` (new).
- `src/actions/sequenceResults.ts` — `createSequenceResult`'s `cutManifest` param widened to `unknown` (see §2).
- `src/components/PublishBasicSequenceResultButton.tsx` (new).
- `src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx` — publish button wired into the existing Sequence Result section header.
- `next.config.ts` — `ffmpeg-ffprobe-static` added to `serverExternalPackages` (bug fix, §4).
- `docs/BASIC_EDITORIAL_1B_PUBLISH_SEQUENCE_RESULT.md` (this document).

## 12. Next Steps

```text
1. OPENREEL.PUBLISH.1  — Advanced/OpenReel side of the same publish flow.
2. EDITORIAL.INSERT.1  — Insert New Shot from editorial context.
3. FILM.RESULT.1       — Assemble a final short film from active Sequence
                          Results across a project's sequences.
```

A dedicated follow-up to close the mid-render staleness gap (§10) against `OPENREEL.CONFLICT.1`'s mechanism would also be reasonable, if it becomes a real problem in practice rather than a theoretical one.

## 13. Confirmations

- No `src/db/schema.ts` change, no migration.
- No new `package.json` dependency (`ffmpeg-ffprobe-static` was already added in `FFMPEG.BUNDLE.1`).
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign.
- No `SequencePreviewPlayer` change — audited again this ticket, still not the right fit for a single-file `<video controls>` result (unchanged conclusion from `BASIC_EDITORIAL_1A`).
- No sidecar repo (`F:/AI/mikai-openreel-sidecar`) code touched or read.
- **No rendered video, runtime DB, or `uploads/`/`storage/` content committed** — confirmed via `git status`/`git diff --stat` before staging (only source files listed in §11 appear). The one real rendered file kept in `public/uploads/sequence-results/sequence-30/` and its `sequence_results` DB row are local runtime state, exactly like every other approved shot video in this repo — never intended for git, and not staged.
- Temporary verification-only files (`src/app/api/mikai-test-publish/`, `src/app/api/mikai-test-ffmpeg/`) were created, used, and deleted before this ticket's commit — confirmed absent from `git status` at commit time.
