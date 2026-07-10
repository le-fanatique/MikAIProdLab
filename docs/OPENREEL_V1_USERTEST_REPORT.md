# OPENREEL.V1.USERTEST — Real Usage Validation Report

Mode: QA / validation pass. No new feature developed. One observation logged (not a bug, not fixed) — see §11.

## 1. Repos / Commits Tested

```text
MikAI HEAD:    09761a7 — Add configurable MikAI public base URL
Sidecar HEAD:  50bfde1 — Keep MikAI timing patches start-only
```

Both working trees were confirmed clean (`git status` → "nothing to commit, working tree clean") before and after this ticket. No sidecar code was modified — the sidecar HEAD is unchanged at `50bfde1`.

## 2. Local Settings Used

Checked `app_settings` directly before testing:

```text
openreel_sidecar_url:    (not set)
mikai_public_base_url:   (not set)
```

No settings configured → both fall back to their defaults, matching the ticket's recommended local test config:

```text
OpenReel Sidecar URL:    http://127.0.0.1:5173  (fallback)
MikAI Public Base URL:   http://localhost:3000  (fallback)
```

An additional manual check (temporary DB write, reverted immediately after) confirmed the settings mechanism itself still works: setting `openreel_sidecar_url = http://100.64.1.2:5173` and `mikai_public_base_url = http://100.64.1.2:3000/` (trailing slash) produced exactly:

```text
http://100.64.1.2:5173/?mikaiExportUrl=http%3A%2F%2F100.64.1.2%3A3000%2Fapi%2Fprojects%2F4%2Fsequences%2F30%2Feditorial-export&mikaiProjectId=4&mikaiSequenceId=30
```

— matching `MIKAI.ORIGIN.1`'s already-verified behavior. Settings were removed again immediately after this spot-check, restoring the fallback state used for the rest of this ticket.

## 3. Server URLs Used

```text
MikAI:    http://localhost:3000   (dev server, already running)
Sidecar:  http://127.0.0.1:5173   (dev server, already running at sidecar HEAD 50bfde1)
```

Both confirmed reachable (`HTTP 200`/`307`) before testing began.

## 4. Tested Sequences

Only two sequences in the current demo DB have populated editorial items (checked directly via DB query across all 23 sequences in the `sequences` table). Both were tested — a third populated sequence does not currently exist in this project's demo data; this is noted rather than fabricated.

| Project | Sequence | Title | Items | Approved | Missing | Duration | Gaps |
|---|---|---|---|---|---|---|---|
| 4 | 30 | Opening — The Arrival | 6 | 4 | 2 | 33.4s | 3 empty spaces |
| 4 | 31 | Climax — The Crisis | 6 | 0 | 6 | 30s | none (contiguous) |

Sequence 30 covers "multiple approved videos" + "missing shots" + "gaps/empty spaces" in one sequence. Sequence 31 covers "no approved media at all" (used for negative scenario §10.3).

**Note on Sequence 30's layout**: at the start of this ticket, item order/positions were already non-contiguous with gaps (item 3 @ 0s, item 1 @ 5s, item 2 @ 10s, gap, item 4 @ 15.2s, gap, item 5 @ 21.4s, gap, item 6 @ 28.4s) — different from the exact positions recorded in earlier tickets' reports (e.g. `BUG_OPENREEL_PATCH_1.md`, which had a fully contiguous layout). All 6 rows shared an identical `updated_at` timestamp, consistent with a demo-data reseed unrelated to this bridge's own code between tickets. This ticket treats the state found at its start as the authoritative baseline and reverts to it after testing (§9).

## 5. Export Validation Results

`GET /api/projects/{projectId}/sequences/{sequenceId}/editorial-export` for both sequences:

**Sequence 30**:
- `schemaVersion`: `mikai-editorial-export-v1` ✓
- `tracks.length`: 1 ✓
- 6 items total, 4 with `mediaUrl`, 2 without ✓
- 3 `emptySpaces` entries present, consistent with the gaps in the layout above
- `sequence.durationSeconds`: 33.4

**Sequence 31**:
- `schemaVersion`: `mikai-editorial-export-v1` ✓
- `tracks.length`: 1 ✓
- 6 items total, 0 with `mediaUrl`, 6 without ✓
- `sequence.durationSeconds`: 30

## 6. OpenReel Import Results

No browser automation tool is available in this environment (consistent with every prior ticket in this series) — import/hydration/patch behavior was verified with real, unmocked code: a temporary Vitest test (created and deleted within this ticket) exercising the sidecar's actual `buildProjectFromMikaiExport`, `hydrateMikaiMediaBlobs`, `replaceMediaItemBlob`, `buildMikaiTimingPatchFromOpenReelProject`, and `validateThenApplyMikaiTimingPatch` against the live MikAI server — the same functions the running sidecar app itself calls, with zero mocking of network or MikAI.

**Sequence 30**: `buildProjectFromMikaiExport` produced exactly **6 clips** (not 7 — the historical "7 clips" anomaly from `BUG.OPENREEL.PATCH.1` did not reproduce). `buildMikaiTimingPatchFromOpenReelProject` on the freshly-imported, unmodified Project produced 6 patch items and **0 warnings** (no non-MikAI clips, no duration drift).

**Sequence 31**: same — 6 clips, 6 patch items, 0 warnings.

**Advanced Editor link** for both sequences, confirmed via direct page fetch:

```text
http://127.0.0.1:5173/?mikaiExportUrl=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fprojects%2F4%2Fsequences%2F30%2Feditorial-export&mikaiProjectId=4&mikaiSequenceId=30
http://127.0.0.1:5173/?mikaiExportUrl=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fprojects%2F4%2Fsequences%2F31%2Feditorial-export&mikaiProjectId=4&mikaiSequenceId=31
```

Both: use the configured `OpenReel Sidecar URL`, `mikaiExportUrl` uses `MikAI Public Base URL`, no double slash, `mikaiProjectId`/`mikaiSequenceId` present and correct.

**Duplicate-clip / refresh scenario**: `bootstrapMikaiProject` was called twice in sequence against the same live store (simulating a page refresh re-triggering the bootstrap) — the second call's `loadProject` fully replaced the store's project (confirmed in `BUG.OPENREEL.MEDIA.1`/`.PATCH.1`), leaving exactly **6 clips**, not 12. No duplicate-count anomaly.

## 7. Media Hydration Results

**Sequence 30**: `hydrateMikaiMediaBlobs` fetched and attached **4** real video blobs (all non-zero size, `type: "video"`, `isPlaceholder: false`); the 2 missing shots correctly remained placeholders (`blob: null`, `isPlaceholder: true`).

**Sequence 31**: `hydrateMikaiMediaBlobs` fetched **0** blobs (no `mediaUrl` on any of the 6 items); all 6 media items correctly remained placeholders (`blob: null`, `isPlaceholder: true`). No crash, no exception — the "sequence with zero approved media" path behaves as a clean all-placeholder import.

## 8. Patch Validate/Apply Results

For both sequences, one approved (seq 30) / one missing-placeholder (seq 31) clip was moved to a position guaranteed not to overlap any other item, then `validateThenApplyMikaiTimingPatch` was run (validate → apply), then reverted with a second validate → apply back to the original `startSeconds`.

| Sequence | Moved item | Validate | Apply | Errors |
|---|---|---|---|---|
| 30 | id 1 (shot 36) | ok | applied | 0 |
| 30 | revert | ok | applied | 0 |
| 31 | id 7 (shot 49) | ok | applied | 0 |
| 31 | revert | ok | applied | 0 |

`durationSeconds` in every patch item matched the item's original MikAI duration exactly (echoed from `mikaiOriginalDurationSeconds`, never OpenReel's live `clip.duration`) — 0 duration-related warnings or errors in any run, confirming the start-only contract holds on real, current sequences.

**Overlap protection confirmed working correctly**: an early attempt to move sequence 30's item 1 by a small `+3s` offset collided with item 2 (the current layout is non-contiguous — see §4) and was correctly rejected server-side with `"Overlap detected on track 0 between item 1 and item 2."` This is the server's existing overlap validator functioning as intended, not a bridge bug; the test was adjusted to move clips to a guaranteed-clear position instead.

## 9. DB Verification

Direct DB reads (`better-sqlite3`) before and after the Sequence 30 test:

**Before** (baseline, id 1 = shot 36):
```json
{ "id": 1, "shot_id": 36, "start_seconds": 5, "duration_seconds": 5, "trim_in_seconds": null, "trim_out_seconds": null }
```

**After apply** (moved to a clear position past the sequence end):
- `start_seconds` updated to the new value.
- `duration_seconds`, `trim_in_seconds`, `trim_out_seconds`: unchanged (verified equal to before, for every one of the 6 items in the sequence, not just the moved one).

**After revert**:
- `start_seconds` back to `5`.
- All other fields unchanged throughout.

**`updated_at` observation** (see §11 for why this is not filed as a bug): every apply call bumped `updated_at` on **all 6 rows** in the patched sequence, not only the row whose `startSeconds` actually changed. This is because the bridge always sends a full patch (every MikAI-tagged clip currently in the OpenReel Project, not a diff), and MikAI's apply handler (`route.ts` lines 176–184) writes `startSeconds` + `updatedAt` for every item in `plan.items` — which is every validated item in the patch, regardless of whether its value actually changed. The write is idempotent for unchanged items (`startSeconds` is set to the same value it already had), so this has no data-correctness impact, but `updated_at` is not a reliable "this specific row changed" signal under this contract. Confirmed against the same baseline as above and against Sequence 31.

Both sequences were fully restored to their pre-test state (confirmed via direct DB comparison: `start_seconds`, `duration_seconds`, `trim_in_seconds`, `trim_out_seconds` all identical to the captured before-snapshot) before this ticket concluded.

## 10. Negative Scenarios

1. **OpenReel Sidecar URL misconfigured**: confirmed via code inspection (`nle-prototype/page.tsx`) that the `Open in Advanced Editor` link is built as a plain string from the stored setting — there is no reachability check before rendering the `<Link href>`. The button will open whatever URL is configured even if nothing is listening there; the browser itself would then show a connection error. This matches the ticket's expected behavior ("le bouton doit ouvrir l'URL configurée, même si le serveur ne répond pas").
2. **MikAI Public Base URL misconfigured**: confirmed via existing test coverage (`useMikaiExportBootstrap.test.ts`'s "throws on a non-OK export fetch" and the network-failure test in `MikaiBridgePanel.test.tsx`) plus code inspection of `useMikaiExportBootstrap.ts`'s `.catch()` — a fetch failure against a wrong/unreachable MikAI origin is caught and surfaced via `toast.error("Failed to load MikAI sequence", message)`, a readable message, not a crash.
3. **Sequence with zero approved media** (Sequence 31): tested live in §6/§7 — import completes normally, all 6 items become placeholders, `hydratedCount: 0`, no exception thrown, no crash.
4. **Refresh with query params (double import)**: tested live in §6 — calling the bootstrap pipeline twice against the same store leaves exactly 6 clips (`loadProject`'s full-replace semantics), not 12. The dedicated idempotency guard added in `BUG.OPENREEL.PATCH.1` (`getMikaiProjectSequenceFromLocation`/`mikaiProjectIdFor`, unit-tested) additionally skips a redundant real bootstrap entirely when the exact same MikAI sequence is already loaded in the live store.

## 11. Bugs Found

**None requiring a fix.** One behavioral observation logged, not a bug:

- **`updated_at` is bumped for every item in a patch on every apply, not just the changed one** (§9). This is inherent to the V1 patch contract being a full-sequence snapshot rather than a diff, and has no correctness impact (writes are idempotent for unchanged values). Not a blocker, not fixed in this ticket per its "validation pass, not a feature ticket" scope — flagged here for awareness if a future ticket ever wants `updated_at` to reflect only genuinely-changed rows.

No import bugs, no hydration bugs, no duplicate-clip bugs, no double-import bugs, and no duration-contract violations were found on either tested sequence. The historical "7 clips instead of 6" anomaly from `BUG.OPENREEL.PATCH.1` did not reproduce on Sequence 30 at the current sidecar HEAD.

## 12. Recommended Next Step

The V1 bridge is validated as working correctly on real data for both currently-populated demo sequences, including one edge case (zero approved media) not previously exercised end-to-end. No corrective ticket is needed. If a third sequence with more asset variety (e.g. multiple gaps *and* mixed approved/missing shots on the same track, or multiple tracks) becomes available in the demo data, a follow-up spot-check would be low-cost but is not currently blocking anything.

---

## Technical Checks

- `npx tsc --noEmit` (MikAI) — 0 errors.
- `npm run build` (MikAI) — compiled successfully, all routes generated (same pre-existing, unrelated Turbopack NFT-tracing warning on `next.config.ts`/`api/uploads/[...path]/route.ts` seen in prior tickets).
- Sidecar: no code modified this ticket; dev server confirmed running and reachable at `http://127.0.0.1:5173` (HTTP 200) at sidecar HEAD `50bfde1`. Sidecar's own test suite was not re-run since nothing in the sidecar changed.

## Confirmations

- No schema/drizzle change.
- No migration added.
- No `package.json`/lockfile change.
- No ComfyUI/generation/job runner/polling code touched.
- No `/nle-prototype` redesign.
- No `SequencePreviewPlayer` change.
- No runtime DB/uploads/outputs/storage committed (all DB reads/writes used for verification were temporary and fully reverted — confirmed via before/after comparison in §9).
- **No sidecar repo code touched** — sidecar HEAD unchanged at `50bfde1`.
- Patch V1 contract unchanged — every validate/apply in this ticket used the existing `mikai-editorial-timing-patch-v1` shape with no field additions.
