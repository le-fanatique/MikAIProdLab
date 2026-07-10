# OPENREEL.PUBLISH.1 — Publish Advanced Sequence Result from OpenReel

Status: MikAI + sidecar implementation, real end-to-end verification against live servers. MikAI HEAD before this ticket: `30fe974 — Publish basic sequence results`. Sidecar HEAD before this ticket: `b701875 — Include MikAI editorial snapshots in patches`. Both repos confirmed clean.

## 1. Audit Summary

**MikAI-side foundation** (from `SEQUENCE_RESULT_1`/`BASIC_EDITORIAL_1B`/`OPENREEL_CONFLICT_1`): `createSequenceResult`/`setActiveSequenceResult` (`src/actions/sequenceResults.ts`) already provide the write path; `buildEditorialDocument`/`buildEditorialSnapshot`/`compareEditorialSnapshot` (`src/lib/editorial/`) already provide the staleness mechanism used by `editorial-timing-patch/route.ts`. The Basic publish route's own patterns (`src/actions/basicEditorial.ts`: render/receive first, DB write after, best-effort orphan cleanup) were reused for the new route's own file-write step.

**OpenReel export capability — the critical open question**: a dedicated audit (subagent, read-only) found that OpenReel **already has a complete, non-stub, real MP4 export capability**: `ExportEngine.exportVideo()` (`packages/core/src/export/export-engine.ts`), a WebCodecs-based encoder using the `mediabunny` muxing library, already wired to the Toolbar's own "Export" dialog (`ExportDialog.tsx`). It composites every renderable clip/track active at each timestamp (`VideoEngine.renderFrame`) into H.264/AAC MP4 (or WebM/MOV/other codecs), with a full preset library, cancellation, and error handling — not a TODO/stub. Critically, its frame-render and blob-write paths key only on `mediaItem.blob` and never inspect `clip.metadata`, so MikAI-hydrated clips (which get a real `.blob` via `replaceMediaItemBlob`, `BUG.OPENREEL.MEDIA.1`) render/export identically to natively-imported ones. **This meant the ticket's "stop and audit-only" branch did not apply — a real renderer already exists, and no parallel FFmpeg renderer was built in the sidecar**, per the ticket's explicit constraint.

## 2. API Route Added

```text
POST /api/projects/{projectId}/sequences/{sequenceId}/sequence-results/publish-advanced
```

`multipart/form-data`, mirroring the ticket's recommended payload exactly:

```text
video: File
sourceMode: "advanced"
durationSeconds: number
cutManifest: JSON string
sourceEditorialSnapshot: JSON string (optional)
notes: string (optional)
warnings: JSON string (optional)
setActive: "true" | "false"
```

`src/app/api/projects/[projectId]/sequences/[sequenceId]/sequence-results/publish-advanced/route.ts`:

1. CORS preflight (`OPTIONS`) + scoped origin check on `POST`, via the existing `resolveEditorSidecarCorsHeaders` helper with the same `POST, OPTIONS` / `Content-Type` options shape as `editorial-timing-patch`'s own CORS config — no new allowlist logic.
2. Parses and validates every multipart field individually, with a specific `400` message per missing/malformed field (see §7).
3. Project/sequence ownership check → `404` if not found.
4. **Staleness check** (identical pipeline to `editorial-timing-patch/route.ts`): builds the sequence's current `EditorialDocument`/`EditorialSnapshot` from live DB state, compares against the request's `sourceEditorialSnapshot` if present. Mismatch → `409`, **no file write, no DB write**. Absent snapshot → allowed, with a `"Publish has no source snapshot — staleness could not be verified."` warning appended (same legacy-tolerant policy as the timing-patch route).
5. Writes the video file to `public/uploads/sequence-results/sequence-{sequenceId}/{uuid}.mp4` — no DB transaction held open across this write.
6. `createSequenceResult({ sourceMode: "advanced", status: setActive ? "active" : "published", videoPath, durationSeconds, cutManifest, editorialSnapshot: <freshly recomputed current snapshot>, notes, warnings, publishedAt })`.
7. On DB-insert failure after a successful file write: best-effort `fs.rm` of the just-written file (unique UUID filename, can never collide with another result's file) — same pattern as `publishBasicSequenceResult`.
8. If `setActive`, calls `setActiveSequenceResult` to demote any other active result for the sequence.

**Note**: `editorialSnapshot` stored on the created row is the **freshly recomputed current snapshot** (step 4/6), not a passthrough of the request's `sourceEditorialSnapshot` — this is deliberate: the stored snapshot should describe the state the *result actually reflects* (the DB state at the moment of successful publish, which — having passed the staleness check — equals what OpenReel had), not merely echo back whatever the client claimed.

## 3. Advanced Cut Manifest (`mikai-advanced-cut-manifest-v1`)

Built sidecar-side, matching the ticket's proposed shape exactly:

```ts
{
  schemaVersion: "mikai-advanced-cut-manifest-v1";
  projectId: number;
  sequenceId: number;
  createdAt: string;
  sourceMode: "advanced";
  editor: "openreel";
  items: Array<{
    mikaiItemId?: number; mikaiShotId?: number;
    clipId: string; trackId?: string;
    startSeconds: number; durationSeconds: number;
    trimInSeconds?: number | null; trimOutSeconds?: number | null;
    mediaType?: string; isPlaceholder?: boolean;
  }>;
  warnings: string[];
}
```

Deliberately a **trace, not a save** — per the ticket's own instruction and `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §6 ("Advanced Mode's finality is a playable result, not a synchronizable timeline"). A clip with no `mikaiItemId` (added natively in OpenReel) is still included, with a warning, rather than silently dropped or causing a hard failure.

## 4. Sidecar Helper

`apps/web/src/integrations/mikai/publishMikaiSequenceResult.ts`:

- `buildAdvancedCutManifestFromOpenReelProject(project, projectId, sequenceId)` — pure, sync.
- `renderOpenReelProjectToBlob(project, onProgress?)` — calls `getExportEngine()` from `@openreel/core` (the Toolbar's own export engine — **no OpenReel core file imported or modified beyond its already-public export surface**), driving `exportVideo()`'s async generator to completion via an in-memory duck-typed writable-stream shim (`InMemoryWritable`) that resolves a real `Blob` instead of triggering a browser download — the same technique `Toolbar.tsx`'s own non-File-System-Access-API fallback already uses, reimplemented locally in the MikAI integration folder rather than importing from a core UI file.
- `publishAdvancedSequenceResultToMikai(...)` — orchestrates manifest build → render → multipart POST, throwing `PublishAdvancedSequenceResultError` (with a `stale: true` flag on HTTP 409) for every failure mode: network error, non-JSON response, stale rejection, or a well-formed-but-`ok:false` response.

## 5. Sidecar UI

`MikaiBridgePanel.tsx` — one more button, below a divider under the existing Validate/Apply buttons:

- Label (exact): **"Publish Sequence Result to MikAI"**.
- States: idle → `publishing` (shows live phase/progress, e.g. `"rendering (42%)"`) → `published` (green, **"Advanced Sequence Result published to MikAI."**, plus any warnings) or `publish-error` (red, readable message).
- No confirm dialog (unlike Basic's publish button) — matches this ticket's own UI spec, which lists render→POST→result but doesn't call for a confirmation step.
- Calls `publishAdvancedSequenceResultToMikai` with `setActive: true` and `sourceEditorialSnapshot: summary.patch.sourceEditorialSnapshot` (reusing the already-computed patch summary's snapshot — no duplicate metadata-extraction logic added).

## 6. Real Bug Found and Fixed

**`InMemoryWritable.write()`'s `data instanceof ArrayBuffer` check failed across a realm boundary** — discovered while writing this ticket's own tests (Vitest/jsdom), the same class of issue as `BUG.OPENREEL.MEDIA.1`'s Blob/File realm mismatch. A buffer created by a different global `ArrayBuffer` constructor than the one this module's `instanceof` check compares against fails the check silently, producing a zero-length "video". **Fixed** by duck-typing the check (`typeof data.byteLength === "number"`) instead of relying on `instanceof` — `ArrayBuffer.isView` (used for the typed-array-view branch) is unaffected, since it uses an internal-slot check rather than prototype identity. This matters for the real browser path too, not just tests: `mediabunny`'s internal buffer allocation is not guaranteed to share a realm with this integration module in every embedding scenario, so this was a latent correctness risk, not merely a test artifact.

## 7. Tests

**Sidecar** (`publishMikaiSequenceResult.test.ts`, new — 10 tests, `getExportEngine` mocked since real WebCodecs encoding isn't available under Vitest/jsdom, same reason every other test in this repo never invokes the real export engine):
- Manifest builder: preserves MikAI metadata per item; includes a native (non-MikAI) clip with a warning instead of dropping it; throws `AdvancedCutManifestError` for an empty timeline.
- `renderOpenReelProjectToBlob`: resolves a real `Blob` assembled from bytes written through the (real, unmocked) `InMemoryWritable` shim — this is what caught the realm bug in §6; throws on an export-engine-reported failure.
- `publishAdvancedSequenceResultToMikai`: renders and POSTs the expected multipart fields (verified by inspecting the captured `FormData`); throws a `stale: true`-flagged error on HTTP 409; throws a readable error on a network failure; throws on a non-JSON response; fails gracefully with **zero** fetch/render calls attempted for an empty-timeline project (manifest build fails first).
- Full sidecar suite: **23 test files, 230 tests passed**, 7 skipped (pre-existing, unrelated), 0 failures.
- `pnpm exec tsc --noEmit` across all workspace packages: 0 errors.

**MikAI**: no test runner exists in this repo (confirmed again, consistent with every prior ticket) — validated via real multipart HTTP requests against the live dev server instead (see §8).

## 8. Real Verification (Project 4, Sequence 30)

Performed against the live MikAI dev server (`localhost:3000`). Since real WebCodecs encoding requires an actual browser (not available in this environment — Node has no `VideoEncoder`/`AudioEncoder`), the sidecar's render step was verified via its own unit tests (§7, exercising the real `InMemoryWritable`/Blob-assembly logic against a mocked-but-realistic export-engine generator) — the **MikAI-side route** was verified for real, end-to-end, with a real multipart POST containing a real (pre-existing) MP4 file standing in for OpenReel's render output:

- **Fresh publish**: POSTed a real multipart request (video = an existing approved shot MP4, `sourceMode: advanced`, a real `sourceEditorialSnapshot` fetched from the live `editorial-export` endpoint, `setActive: true`) → `{"ok":true,"resultId":4,"videoPath":"uploads/sequence-results/sequence-30/e630f9df-....mp4","durationSeconds":43.5}`, HTTP 200.
- **DB state confirmed**: the prior `BASIC.EDITORIAL.1.B` result (id 3, `sourceMode: basic`) correctly demoted from `active` → `published`; the new result (id 4, `sourceMode: advanced`) correctly `active`, with `cutManifest` (`mikai-advanced-cut-manifest-v1`, 1 item) and `editorialSnapshot` (freshly recomputed, matching the live sequence's current fingerprint) both stored and parseable.
- **Viewer confirmed**: `GET /projects/4/sequences/30` shows the new video's `src`, `Source: Advanced Editor`, and an `active` badge.
- **Stale rejection confirmed**: moved editorial item 1's `startSeconds` directly in the DB (simulating a structural change made in MikAI while OpenReel stayed open), then attempted to publish using the *pre-move* snapshot → `{"ok":false,"error":"Sequence has changed since it was opened in OpenReel. Reload the Advanced Editor before applying changes."}`, HTTP 409. **No new `sequence_results` row was created** (count unchanged at 2), and **no file was written at all** (the staleness check runs before the file-write step, so this scenario produces zero orphaned files, not just a best-effort-cleaned one). Reverted the DB move afterward; confirmed sequence 30's editorial items match the pre-test baseline exactly.
- **Disposition**: both results (Basic id 3, Advanced id 4) were **kept**, not deleted — genuine, correctly-processed records, consistent with the decision made for the Basic result in the prior ticket.

`npx tsc --noEmit` — 0 errors. `npm run build` — compiled successfully, all routes generated including the new `publish-advanced` route (same pre-existing, unrelated Turbopack NFT-tracing warning as every prior ticket).

## 9. Limitations

- **The sidecar's actual WebCodecs render was not exercised in a real browser in this ticket** — verified via unit tests (real Blob-assembly logic, mocked encoder) and via a real MikAI-side multipart request using a stand-in video file. A genuine end-to-end run (open OpenReel in a real browser, click Publish, confirm the resulting MP4 is a true render of the timeline) was not performed — no browser automation tool is available in this environment. The MikAI-side contract, staleness check, and file/DB handling are fully verified for real; the OpenReel-side render call is verified by code audit + unit test only.
- **`durationSeconds` sent by the sidecar is `project.timeline.duration`** (OpenReel's own tracked duration), not independently re-verified by MikAI via `ffprobe` on the received file (unlike Basic's renderer, which trusts its own `ffprobe` output). Could drift if OpenReel's internal duration tracking disagrees with the actual encoded file's real duration — not currently cross-checked.
- **No mid-render staleness re-check** — same limitation as `BASIC.EDITORIAL.1.B`: the snapshot is captured once (implicitly, via whatever `sourceEditorialSnapshot` the sidecar had cached from its last MikAI fetch), not re-verified at the instant the render *completes* versus when it *started*. A structural edit made in MikAI during the render window would not be caught until the publish POST itself (which does check against the *then-current* DB state) — so a genuinely concurrent edit during the multi-second render is actually still caught (staleness is checked at POST time, not at render-start time), but the race window between "OpenReel decides to render" and "the file finishes encoding" is not separately flagged.
- **Advanced cut manifest is a trace, not a full save** — by design (§3), not a limitation to fix, but worth restating: OpenReel-side edits like transitions, effects, or speed changes are not represented in the manifest and are not expected to be, per this ticket's explicit scope.

## 10. Files Modified

**MikAI**:
- `src/app/api/projects/[projectId]/sequences/[sequenceId]/sequence-results/publish-advanced/route.ts` (new).
- `docs/OPENREEL_PUBLISH_1_ADVANCED_SEQUENCE_RESULT.md` (this document).

**Sidecar**:
- `apps/web/src/integrations/mikai/publishMikaiSequenceResult.ts` (new).
- `apps/web/src/integrations/mikai/publishMikaiSequenceResult.test.ts` (new).
- `apps/web/src/integrations/mikai/MikaiBridgePanel.tsx` — publish button + state added.
- `MIKAI_SIDECAR.md` — new "Publish Advanced Sequence Result flow" section, roadmap updated.

## 11. Next Steps

```text
1. EDITORIAL.INSERT.1 — Insert New Shot from editorial context.
2. FILM.RESULT.1      — Assemble a final short film from active Sequence
                         Results (Basic or Advanced) across a project's
                         sequences.
```

A real-browser end-to-end pass (§9's first limitation) would be a reasonable low-cost follow-up whenever manual QA access to a real browser session against both live servers is available, but is not required before either of the above.

## 12. Confirmations

- No `src/db/schema.ts` change, no migration.
- No new MikAI `package.json` dependency; no new sidecar dependency (no `package.json`/lockfile change in either repo).
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign.
- No `SequencePreviewPlayer` change.
- No parallel FFmpeg renderer built in the sidecar — OpenReel's own existing `ExportEngine` was reused as-is, confirmed via audit to be complete and non-stub before any implementation began.
- No OpenReel core file modified — only its already-public `@openreel/core` export surface (`getExportEngine`, types) was imported.
- Patch V1 (`mikai-editorial-timing-patch-v1`) contract unchanged — this ticket added a wholly separate route/contract for publish, never touched the timing-patch endpoint or its schema.
- KieAI untouched.
- No runtime DB/uploads/outputs/storage committed — the real `sequence_results` rows and MP4 files created during verification are local runtime state (kept per explicit decision, same as `BASIC.EDITORIAL.1.B`), never staged; confirmed via `git status`/`git diff --stat` in both repos before committing (only source files listed in §10 appear).
