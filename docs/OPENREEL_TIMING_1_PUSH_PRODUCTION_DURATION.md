# OPENREEL.TIMING.1 — Push Production Target Duration from Advanced Editor

## 1. Audit summary

- `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §8 already names this exact future action: **"Push Duration to MikAI"**, distinct from any editorial trim/split/speed operation, and explicitly recommends that once it exists, the epsilon-reject behavior in the start-only timing patch should stay in force for every *other* path — this ticket does not touch `mikai-editorial-timing-patch-v1` at all, keeping that boundary intact.
- `docs/OPENREEL_CONFLICT_1_SNAPSHOT_SAFETY.md` and `docs/OPENREEL_INSERT_1_INSERT_SHOT_AT_PLAYHEAD.md` gave the exact CORS + staleness pipeline to replicate (`resolveEditorSidecarCorsHeaders` → `buildEditorialDocument` → `buildEditorialSnapshot` → `compareEditorialSnapshot`), already proven three times over (`editorial-timing-patch`, `publish-advanced`, `editorial-insert-shot`).
- `shots.durationSeconds` (`src/db/schema.ts`) already exists as a nullable `real` column — no schema/migration needed, confirmed by reading the table definition directly.
- `src/actions/shots.ts` has no existing JSON-friendly single-field duration update (`updateSequenceShotDurations` takes `FormData` for a batch of shots) — the new route writes directly via `db.update(shots)...`, same inline-write pattern `editorial-timing-patch/route.ts` already uses for its own item updates, rather than adding a new server action.
- Sidecar audit: `MikaiBridgePanel.tsx`'s playhead comes from `useTimelineStore((s) => s.playheadPosition)` (already wired in for Insert Shot); `openReelToMikaiPatch.ts` confirmed the existing, load-bearing distinction between `clip.duration` (live, OpenReel-side) and `meta.mikaiOriginalDurationSeconds` (frozen at import time, exclusively for the start-only patch) — this ticket's push must use `clip.duration`, never the frozen value, and does.

## 2. MikAI route

`POST /api/projects/[projectId]/sequences/[sequenceId]/editorial-push-duration`

Payload:
```ts
{ shotId: number; targetDurationSeconds: number; sourceEditorialSnapshot: EditorialSnapshot }
```

Behavior:
1. CORS via the existing scoped sidecar allowlist (`resolveEditorSidecarCorsHeaders`), `OPTIONS` handler included.
2. Validates `projectId`/`sequenceId` as positive integers.
3. **`sourceEditorialSnapshot` is required** — malformed or absent is a hard `400`, no legacy bypass (same reasoning as `editorial-insert-shot`: brand-new route, nothing to stay backward-compatible with).
4. Validates `shotId` (positive integer) and `targetDurationSeconds` (finite, `> 0`, `<= 600` — same ceiling as `EDITORIAL.INSERT.1`'s own target-duration input).
5. Ownership chain: project exists (`404`), sequence belongs to project (`404`), **shot belongs to that sequence** (`404` — new check, not present in either prior route since neither operates on a single shot).
6. Recomputes the sequence's current `EditorialSnapshot` and compares — mismatch → `409` with the exact established message.
7. The one and only write: `shots.durationSeconds` + `updatedAt`. No `sequence_editorial_items` touch, no `outdateSequenceResultsForSequence`/`outdateFilmResultsForProject` call — deliberately absent.
8. `revalidatePath` on the Sequence Detail, `/editorial`, and Shot Detail pages.

## 3. Sidecar

- `apps/web/src/integrations/mikai/pushMikaiTargetDuration.ts` (new):
  - `resolveMikaiClipAtPlayhead(project, playheadSeconds)` — pure, finds the single MikAI-tagged clip whose *live* `[startTime, startTime + duration)` contains the playhead (containment, not gap/insertion-position reasoning like `insertMikaiShotAtPlayhead.ts`'s resolver). Returns `liveDurationSeconds: clip.duration` — never `mikaiOriginalDurationSeconds`.
  - `pushMikaiTargetDuration(...)` — same POST/error-handling convention as `insertMikaiShotAtPlayhead`/`applyMikaiTimingPatch` (`PushMikaiTargetDurationError` with a `stale: boolean` flag on `HTTP 409`).
- `MikaiBridgePanel.tsx`: new "Push Duration to MikAI" section — shows the targeted shot label + live clip duration (or an explanatory "No MikAI clip at the current playhead" when none), a confirm dialog naming the exact duration and stating the production-vs-editorial distinction, success/error feedback, and a "Reload from MikAI" button on success (same `window.location.reload()` pattern already validated in `OPENREEL.INSERT.1`). The button is disabled whenever there's no clip at the playhead or no editorial snapshot available — `handlePushDuration` returns early without any network call in both cases, matching the ticket's "no request when required MikAI metadata or snapshot is unavailable" requirement.

## 4. Confirmation: only the production target changes

Verified directly (see §6): a push writes exactly `shots.durationSeconds` and `shots.updatedAt`. `sequence_editorial_items` rows (including the one referencing the same shot) are byte-for-byte unchanged. No trim, start position, order, source media, or rendered file is touched.

## 5. Confirmation: existing results remain unchanged

Verified directly: `sequence_results` and `film_results` statuses for the affected project were identical before and after every successful push. This is by construction — the route never calls `outdateSequenceResultsForSequence`/`outdateFilmResultsForProject`, unlike `editorial-insert-shot`, which calls them because inserting a shot *is* a structural editorial change.

**A related, non-obvious finding**: pushing a duration does **not** change the sequence's editorial-structure fingerprint either, because `computeEditorialFingerprint` (`editorialSnapshot.ts`) hashes only `sequence_editorial_items` fields (`durationSeconds` there is the *editorial usage* duration, a separate DB value from `shots.durationSeconds`). Two consecutive duration pushes against the *same* snapshot both succeed — confirmed live (see §6) — which is correct: a production-duration push is not a structural change and must not itself invalidate a sidecar session's snapshot.

## 6. Real validation

Ran against **Project 4, Sequence 30** (6 shots, active Sequence Result, active Film Result), via `npm run dev:all`, real unmocked calls on both sides.

**MikAI-side, direct HTTP** (simulating the sidecar's exact request, `Origin: http://127.0.0.1:5173`):
- Fresh push (shot 36, 5s → 8.5s): `200`, `shots.durationSeconds` confirmed changed, `sequence_editorial_items` row for the same shot confirmed **unchanged** (still 5s — the editorial-usage value), `sequence_results`/`film_results` statuses confirmed **identical** before/after.
- A second push with the *same* snapshot (shot 37, → 12s): also `200` — confirms §5's fingerprint-independence finding, not a bug.
- Staleness: used the existing `editorial-insert-shot` route to make a genuine structural change (a real shot insert), then retried a push with the **pre-insert** snapshot → `409`, exact expected message, confirmed **zero write** (target shot's duration unchanged, `updatedAt` unchanged).
- Invalid `shotId` (not in this sequence): `404`, `"Shot not found in this sequence."`
- Invalid duration (`0`, and `9999`): both `400`, `"targetDurationSeconds must be a finite number > 0 and <= 600."`
- Missing `sourceEditorialSnapshot`: `400`, clear schema-validation message.

**Full sidecar-side, real end-to-end** (temporary, uncommitted Vitest file, deleted before commit): fetched a real export → built a real `Project` via `buildProjectFromMikaiExport` → `resolveMikaiClipAtPlayhead` correctly found the clip at a computed mid-clip playhead → `pushMikaiTargetDuration` → `200` → **re-pushed with the same snapshot** → `200` again (confirms §5 live) → separately, a deliberately garbage-fingerprint snapshot → `PushMikaiTargetDurationError` with `stale: true`, exact expected message.

**Test data disposition**: all test writes (two duration pushes, one structural test-insert used only to exercise staleness, and its cascade onto `sequence_results`/`film_results` statuses) were fully reverted to the exact pre-test baseline (user's explicit choice), verified field-for-field.

## 7. Validations run

- MikAI: `npx tsc --noEmit` clean, `npm run build` clean (new route listed in the build output).
- Sidecar: 12 new focused tests (`pushMikaiTargetDuration.test.ts`) covering the resolver (before-first/after-last exclusion, gap exclusion, live-vs-original duration, label fallback, native-clip exclusion, boundary exclusivity) and the network helper (success, `409`→`stale:true`, network error, non-JSON, `ok:false`) — all pass. Full sidecar suite: **256 tests passing** (up from 244), zero regressions, `pnpm --filter @openreel/web exec tsc --noEmit` clean, `pnpm --filter @openreel/web build` clean.

## 8. Known limitations

- The confirm dialog and success feedback are text-only (native `window.confirm`), consistent with every other `MikaiBridgePanel` action — no new UI pattern introduced.
- `resolveMikaiClipAtPlayhead` iterates all tracks flatly, same single-track assumption already documented as a limitation in `OPENREEL.INSERT.1` — unaffected by this ticket, not revisited.
- No batch/multi-shot push — one explicit action per shot, per the ticket's "no bulk-push" constraint.

## Confirmations

- No schema/migration change (`shots.durationSeconds` already existed).
- No new npm package on either repo.
- `mikai-editorial-timing-patch-v1` and its start-only contract untouched.
- `sequence_editorial_items` never written by this route.
- No Sequence Result / Film Result outdating, archiving, deletion, or rewrite.
- ComfyUI/generation runtime/job runner/polling/KieAI untouched.
- `SequencePreviewPlayer` untouched.
- OpenReel core/store untouched — only additive sidecar integration files and the existing `MikaiBridgePanel` changed.
- No runtime/upload/storage/local-DB file committed on either repo — all test writes reverted and verified before this report was finalized.
