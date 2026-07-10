# OPENREEL.CONFLICT.1 — Structural Snapshot/Fingerprint Safety for Editorial Decisions

Status: MikAI + sidecar change, real end-to-end verification against live servers. MikAI HEAD before this ticket: `f0d26ec — Add editorial sequence result architecture`. Sidecar HEAD before this ticket: `50bfde1 — Keep MikAI timing patches start-only`.

## 1. Decision Inherited from EDITORIAL.ARCH.1

`docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §9 re-scoped conflict safety from "avoid a stale timing patch" to "protect editorial decisions from stale sequence state" — a mechanism meant to eventually cover the existing timing patch, a future publish-Sequence-Result flow, a future insert-shot flow, and a future push-duration-to-MikAI flow. This ticket builds that shared mechanism (a structural snapshot/fingerprint) and wires it into the one thing that exists today: the start-only timing patch. The other three remain future work, as this ticket's constraints require (no Sequence Result, no Insert Shot, no Push Duration, no trim/duration V2 implemented here).

## 2. Snapshot Structure

New module: `src/lib/editorial/editorialSnapshot.ts`.

```ts
schemaVersion: "mikai-editorial-snapshot-v1"

EditorialSnapshot = {
  schemaVersion: "mikai-editorial-snapshot-v1";
  fingerprint: string;   // sha256 hex, 64 chars
  itemCount: number;
  generatedAt: string;
}
```

Built from the same `EditorialDocument` shape both the export route and the timing-patch route already construct — not from the raw export payload — so the fingerprint's inputs are identical by construction at export time and at validate/apply time.

**Fields included in the hashed canonical payload** (per shot item, gaps excluded — gaps are never exported/stored as their own entity): `sequenceId`, `trackIndex`, `id`, `shotId`, `startSeconds`, `durationSeconds`, `trimInSeconds`, `trimOutSeconds`, `status` (already reflects `approved`/`missing`/`placeholder` — i.e. media presence, per `getEditorialItemStatus`). Item order is encoded by an explicit sort (`trackIndex`, then `id`) before hashing, so the fingerprint never depends on incidental iteration order.

**Fields deliberately excluded**: `exportedAt`/`generatedAt` (this module's own bookkeeping timestamp, never hashed), `title`/`shotCode` (renaming a shot is not a structural change that should invalidate an in-flight patch), and `updatedAt` — excluded specifically because `OPENREEL.V1.USERTEST` found that MikAI's apply handler bumps `updated_at` on *every* item in a patch, not just the one whose value changed; including it would have made the fingerprint change on every apply regardless of real structural drift, producing false-positive staleness on the very next validate.

Hashing uses Node's built-in `crypto.createHash("sha256")` — no new dependency.

## 3. Export Wiring (`mikai-editorial-export-v1`)

`schemaVersion` was **not** changed — `editorialSnapshot` is an additive field on the existing `mikai-editorial-export-v1` contract, per the ticket's preference to avoid an unnecessary version break. `buildEditorialExport` (`src/lib/editorial/editorialExport.ts`) now calls `buildEditorialSnapshot({ sequenceId, document })` and includes the result. No route file needed changes for the export side — `editorial-export/route.ts` already passes `document` into `buildEditorialExport`.

## 4. Timing-Patch Contract Wiring

`MikAIEditorialTimingPatchV1` (`src/lib/editorial/editorialTimingPatch.ts`) gained one optional field:

```ts
sourceEditorialSnapshot?: EditorialSnapshot;
```

`schemaVersion` (`mikai-editorial-timing-patch-v1`) was **not** changed — same additive-field reasoning as the export. `validateEditorialTimingPatchShape` validates the field's shape when present (must be a well-formed `mikai-editorial-snapshot-v1` object) and rejects the whole patch with a shape error if it's present but malformed — a corrupted/tampered snapshot is treated as suspicious, not silently ignored.

`editorial-timing-patch/route.ts` now:
1. Loads the sequence's shots (join, same pattern as `editorial-export/route.ts`) alongside the editorial items.
2. Builds the current `EditorialDocument` and its `EditorialSnapshot`.
3. **If `sourceEditorialSnapshot` is present**: compares fingerprints via `compareEditorialSnapshot`. On mismatch, both `validate` and `apply` return `{ ok: false, errors: [{ message: "Sequence has changed since it was opened in OpenReel. Reload the Advanced Editor before applying changes." }], items: [] }` at **HTTP 409** — before any of the existing item-level duration/overlap checks run, and before any DB write.
4. **If absent** (legacy patch): the request proceeds exactly as before this ticket, but the response gains a `warnings: ["Patch has no source snapshot — staleness could not be verified."]` field. This is additive on the existing response shape — existing consumers that don't read `warnings` are unaffected.

## 5. Sidecar Wiring

- `mikaiToOpenReelProject.ts`: the local mirror of `MikAIEditorialExportV1` gained an optional `editorialSnapshot` field (`MikaiEditorialSnapshot` type). `buildProjectFromMikaiExport` duplicates it onto every clip's `metadata.mikaiEditorialSnapshot` — OpenReel's `Project` type has no top-level extensible metadata bag, so this follows the same established pattern already used for `mikaiProjectId`/`mikaiSequenceId`.
- `openReelToMikaiPatch.ts`: `readMikaiMetadata` now also extracts and shape-validates `mikaiEditorialSnapshot` (optional — a clip without one doesn't disqualify the clip, unlike the five already-required fields). `buildMikaiTimingPatchFromOpenReelProject` picks the first snapshot found across all clips (every clip from one import carries the same sequence-level value) and includes it as `sourceEditorialSnapshot` in the built patch. If no clip carries one, the patch is still built (legacy-compatible) but gets one warning (`clipId: "sequence"`, `"No editorial snapshot found on any MikAI clip..."`).
- `MikaiBridgePanel.tsx`: gained a small `Snapshot: available` / `Snapshot: unavailable (legacy)` line. The pre-existing `Ignored non-MikAI clips` count (which already reused the same `warnings` array as the `Warnings` count before this ticket) now explicitly excludes the sequence-level snapshot warning (`clipId !== "sequence"`) so a legacy import with zero actually-ignored clips doesn't misleadingly show `Ignored: 1`. The total `Warnings` count is unaffected and still includes the snapshot notice.
- `applyMikaiTimingPatch.ts` needed no change — it forwards the patch object as-is via `JSON.stringify`, so the additive field passes through automatically.

## 6. Legacy Behavior (No Snapshot)

Chosen policy, per the ticket's own recommendation: **allow with a warning, not a hard reject.** A patch with no `sourceEditorialSnapshot` (built by an old sidecar version, or hand-constructed, e.g. in a test/script) is still validated and applied normally — MikAI just cannot verify it isn't stale, and says so via the `warnings` field. The current sidecar (as of this ticket) always sends a snapshot for any Project imported from a live MikAI export, so this path is a backward-compatibility allowance, not the expected normal case.

## 7. Tests

**MikAI**: no test runner is configured in this repo (confirmed again this ticket — no `vitest`/`jest` in `package.json`, no existing test files for `editorialTimingPatch.ts`/`editorialExport.ts`), consistent with every prior MikAI-side ticket in this series. Validated via real HTTP calls against the live dev server (`localhost:3000`, sequence 30, project 4) instead:
1. Two consecutive exports (different `exportedAt`) → identical fingerprint (stability confirmed).
2. A fresh patch built from the current snapshot → `validate` and `apply` both `ok: true`, 0 errors.
3. Re-exported after the apply → fingerprint changed (sensitivity to a real structural change confirmed).
4. A patch built from the *old* (now-stale) snapshot, proposing a different item's move → `validate` returns `ok: false`, HTTP 409, the exact expected message; `apply` also refused, `applied: false`.
5. Direct DB read before/after the stale `apply` attempt — every row (including `updated_at`) byte-for-byte identical — confirmed no write occurred.
6. A legacy patch (no `sourceEditorialSnapshot`) built from the current state → `validate` returns `ok: true` with `warnings: ["Patch has no source snapshot — staleness could not be verified."]`.
7. A patch with a malformed `sourceEditorialSnapshot` (wrong `schemaVersion`, wrong field types) → rejected as a shape error, HTTP 400.

**Sidecar**: full test suite updated and re-run.
- `mikaiToOpenReelProject.test.ts`: +2 tests — snapshot preserved on every clip's metadata; snapshot left `undefined` for a pre-`OPENREEL.CONFLICT.1` export missing the field.
- `openReelToMikaiPatch.test.ts`: +2 dedicated tests (`sourceEditorialSnapshot` included when present; omitted + warned when absent) plus existing fixtures updated to carry a sample snapshot where the test isn't specifically about snapshot absence, and the round-trip test (real `project-store`, real fixture) now asserts `patch.sourceEditorialSnapshot` matches the fixture export's `editorialSnapshot` exactly.
- `MikaiBridgePanel.test.tsx`: +1 dedicated test for the legacy/no-snapshot panel display (`Snapshot: unavailable (legacy)`, `Ignored non-MikAI clips: 0`, `Warnings: 1`); existing "warnings: 1" test updated to also assert `Snapshot: available`.
- Full sidecar suite: **22 test files, 220 tests passed**, 7 skipped (pre-existing, unrelated), 0 failures.
- `pnpm exec tsc --noEmit` across all workspace packages: 0 errors.

**Real end-to-end** (temporary Vitest tests, created and deleted within this ticket, run against both live servers — `localhost:3000` MikAI, `127.0.0.1:5173` sidecar dev server confirmed up beforehand):
1. Fetched the live sequence 30 export, confirmed `editorialSnapshot` present with the correct schema. Built a Project through the real `buildProjectFromMikaiExport`, built a patch through the real `buildMikaiTimingPatchFromOpenReelProject` (0 warnings, `sourceEditorialSnapshot` matches the export's), ran `validateThenApplyMikaiTimingPatch` end-to-end — `ok: true`, applied, 0 errors.
2. Captured a snapshot ("OpenReel opens the sequence"), then applied a *different*, independently-built, current-snapshot patch that moved item 3 (simulating a concurrent edit made elsewhere in MikAI while OpenReel stayed open). Then attempted to `validate` and `apply` the *original* (now-stale) patch — both correctly rejected with the exact expected message; a direct DB re-fetch before/after the stale `apply` attempt confirmed item 3's `startSeconds` was untouched by the rejected request. Reverted the earlier move back to its original value using a freshly-captured current snapshot.
3. Final DB state for sequence 30 confirmed identical to the pre-ticket baseline (`8.9`/`15.7`/`0.7`/`24.1`/`33`/`38.4` for items 1–6, all `duration`/`trim` fields unchanged).

## 8. Limits

- The fingerprint covers the sequence's editorial *item* structure (position, duration, trim, status, order) — it does **not** cover changes elsewhere that could still make an editorial decision stale in spirit, e.g. a shot's `title`/`description`/`approvedVideoPath` being regenerated without a position/status change of the *same* value already reflected in `status`. This was a deliberate scope choice (per the ticket: don't invalidate a patch over a text change) but means some categories of "the underlying material changed" are not caught by this mechanism.
- Legacy (no-snapshot) patches are still accepted with only a warning — a determined caller can bypass staleness detection entirely by omitting the field. This is an intentional backward-compatibility allowance, not a security boundary; MikAI's own server-side ownership/shape checks are unaffected and remain the actual authorization boundary.
- The mechanism is wired into the timing-patch endpoint only, as scoped. It is not yet used by anything else (there is nothing else to wire it into yet — no publish/insert/duration-push actions exist).
- No structural-version column was added to `sequence_editorial_items` or `sequences` — the fingerprint is recomputed from live data on every request rather than cached/stored, which is simple and always-correct but means every `validate`/`apply` call does one extra `shots` join versus before this ticket. Negligible at current scale (single-sequence, on-demand action), not benchmarked.

## 9. How This Prepares Future Work

- **Publish Sequence Result** (`SEQUENCE.RESULT.1` / a future `OPENREEL.PUBLISH.1`): a publish action can reuse `buildEditorialSnapshot`/`compareEditorialSnapshot` directly — compare the snapshot a draft/proposed result was built from against the sequence's current snapshot before promoting it to `active`, using the exact same "reject with a clear message" pattern established here.
- **Insert New Shot from editorial context** (`EDITORIAL.INSERT.1`): an insert action changes the sequence's item structure and therefore its fingerprint by construction (new item, shifted order) — any in-flight patch/publish built against the pre-insert snapshot will already fail this same staleness check with no further work required.
- **Push Duration to MikAI**: once this becomes its own explicit action (per `docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md` §8), it can gate on the same snapshot mechanism to ensure the duration push is applied to the shot the user actually saw, not one that moved/changed underneath them.
- The shared module (`editorialSnapshot.ts`) is intentionally generic (`sequenceId` + `EditorialDocument` in, fingerprint out) — no timing-patch-specific assumptions leaked into it, so it should not need modification to support these future call sites, only new call sites.

## 10. Files Modified

**MikAI**:
- `src/lib/editorial/editorialSnapshot.ts` (new)
- `src/lib/editorial/editorialExport.ts`
- `src/lib/editorial/editorialTimingPatch.ts`
- `src/app/api/projects/[projectId]/sequences/[sequenceId]/editorial-timing-patch/route.ts`
- `docs/OPENREEL_CONFLICT_1_SNAPSHOT_SAFETY.md` (this document)

**Sidecar**:
- `apps/web/src/integrations/mikai/mikaiToOpenReelProject.ts`
- `apps/web/src/integrations/mikai/mikaiToOpenReelProject.test.ts`
- `apps/web/src/integrations/mikai/openReelToMikaiPatch.ts`
- `apps/web/src/integrations/mikai/openReelToMikaiPatch.test.ts`
- `apps/web/src/integrations/mikai/MikaiBridgePanel.tsx`
- `apps/web/src/integrations/mikai/MikaiBridgePanel.test.tsx`
- `apps/web/src/integrations/mikai/__fixtures__/mikai-sequence-sample-export.json`
- `MIKAI_SIDECAR.md`

## 11. Confirmations

- No `src/db/schema.ts` change, no migration — the fingerprint is computed on demand from existing columns, never stored.
- No `package.json`/lockfile change on either repo (Node's built-in `crypto` module).
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign.
- No `SequencePreviewPlayer` change.
- No `SequenceResult`, Insert Shot, or Push Duration implementation — all three remain future tickets, exactly as scoped.
- Patch V1 remains strictly start-only — `sourceEditorialSnapshot` is a read-only safety field, not a new writable dimension; MikAI still only ever writes `startSeconds` on apply.
- No runtime DB/uploads/outputs/storage committed — the direct DB reads/writes used for verification were temporary and confirmed fully reverted (§7.3).
