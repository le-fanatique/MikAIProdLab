# OPENREEL.INSERT.1 — Insert New Shot at OpenReel playhead

## 1. Audit summary

- **`insertShotInSequenceFromEditorialContext`** (`src/actions/editorialInsert.ts`, EDITORIAL.INSERT.1, unchanged) already does exactly what this ticket needs: creates a real `shots` row at a stable position (between two shots, or at the start/end), shifts every later shot's `orderIndex`, mirrors the insertion into `sequence_editorial_items` (matched by `shotId`, not `shots.orderIndex`, so the editorial layer's own independent ordering stays correct), and calls `outdateSequenceResultsForSequence` afterward — which itself calls `outdateFilmResultsForProject` (existing FILM.RESULT.1.A wiring). This ticket calls it directly, unmodified.
- **Arguments needed**: `projectId`, `sequenceId`, `insertAfterShotId?`, `insertBeforeShotId?`, `targetDurationSeconds?` (defaults to 5), `title?` (defaults to `"Placeholder"`), `description?`, `notes?`.
- **CORS**: `resolveEditorSidecarCorsHeaders` (`src/lib/cors/editorSidecarCors.ts`) — same scoped allowlist (`http://localhost:5173`, `http://127.0.0.1:5173`, plus `MIKAI_EDITOR_CORS_ORIGINS`) used by `editorial-timing-patch` and `publish-advanced`. Reused verbatim with the same `{ methods: "POST, OPTIONS", headers: "Content-Type", exposeHeaders: null }` options.
- **Staleness validation**: `buildEditorialDocument` → `buildEditorialSnapshot` → `compareEditorialSnapshot` (`src/lib/editorial/editorialSnapshot.ts`), same pipeline as `editorial-timing-patch`/`publish-advanced`. `compareEditorialSnapshot`'s mismatch message is already the exact string this ticket specifies — reused directly, no new copy to keep in sync.
- **New route**: `POST /api/projects/{projectId}/sequences/{sequenceId}/editorial-insert-shot`.

## 2. Insertion context rules (final)

Implemented in the sidecar's `resolveMikaiInsertionContextFromPlayhead` (pure, no network):

1. Playhead at/before the first MikAI-tagged clip → insert **before** it (`label: "Before first shot"`).
2. Playhead at/after the last clip's end → insert **after** it (`label: "After {shot}"`).
3. Playhead in a gap between two clips, or at/near a cut (near-zero gap) → insert **between** them (`label: "Between {shot} and {shot}"`) — both cases are handled by the same branch: a cut is just a gap of ~0 width, so no special-casing was needed.
4. Playhead inside a clip → **no split**. Resolves to "insert after the current clip" (`label: "After current clip {shot}"`) with a `warning` field set — the UI requires this to still go through the same explicit confirmation dialog as every other case, per the ticket's V1 recommendation.
5. Zero MikAI-tagged clips in the Project → resolver returns `null`; the UI shows "Could not resolve an insertion position from the current playhead."

A 0.05s epsilon absorbs floating-point boundary noise so a playhead landing a fraction of a millisecond inside/outside a clip doesn't spuriously flip branches.

## 3. MikAI API route

`src/app/api/projects/[projectId]/sequences/[sequenceId]/editorial-insert-shot/route.ts`

Payload (JSON):

```ts
{
  sourceEditorialSnapshot: EditorialSnapshot; // REQUIRED — see below
  insertAfterShotId?: number | null;
  insertBeforeShotId?: number | null;
  playheadSeconds?: number;
  targetDurationSeconds?: number;
  title?: string;
  description?: string;
  notes?: string;
}
```

Behavior:
1. CORS preflight/response headers via `resolveEditorSidecarCorsHeaders`.
2. Validate `projectId`/`sequenceId`.
3. **`sourceEditorialSnapshot` is required**, not optional-with-a-legacy-warning like `editorial-timing-patch`/`publish-advanced` — this is a brand-new endpoint with no pre-OPENREEL.CONFLICT.1 caller to stay backward-compatible with, so a missing/malformed snapshot is a hard `400`, not a warned-and-allowed legacy path.
4. Project/sequence ownership check (`404` if not found).
5. Recompute the sequence's current `EditorialSnapshot` and compare against the request's — mismatch → `409` with the exact message: `"Sequence has changed since it was opened in OpenReel. Reload the Advanced Editor before applying changes."`
6. Call `insertShotInSequenceFromEditorialContext` — any of its own validation failures (invalid duration, invalid insertion position) map to `400`.
7. Success response:

```ts
{ ok: true; shotId: number; sequenceId: number; projectId: number; message: "Shot created in MikAI."; reloadRequired: true }
```

No file is written, no FFmpeg is invoked, no long-lived transaction — the write is a single call into the existing action's own short transaction.

## 4. Sidecar changes

- `apps/web/src/integrations/mikai/insertMikaiShotAtPlayhead.ts` (new) — `resolveMikaiInsertionContextFromPlayhead(project, playheadSeconds)` and `insertMikaiShotAtPlayhead({...})`, following the exact network-call/error-handling convention already established by `applyMikaiTimingPatch.ts` (JSON POST) and `publishMikaiSequenceResult.ts` (`InsertMikaiShotError` with a `stale: boolean` flag, same as `PublishAdvancedSequenceResultError`).
- `apps/web/src/integrations/mikai/MikaiBridgePanel.tsx` — new "Insert New Shot at Playhead" section: reads the live playhead via `useTimelineStore((s) => s.playheadPosition)` (found during the sidecar audit — not `useProjectStore`, which only holds the Project itself), shows the resolved insertion context/warning, a form (Target Duration default 5, Title default "Placeholder", optional Description/Notes), a confirm dialog (`"Create a new production shot in MikAI at this playhead position?"`), and on success a `"Reload from MikAI"` button.
- **Reload mechanism**: audited `useMikaiExportBootstrap.ts` before choosing — its bootstrap effect always re-fetches from `mikaiExportUrl` (a URL query parameter, so it survives a reload) on mount, with an idempotency guard keyed off the *already-loaded* project id, not off "has this page ever loaded before." A full `window.location.reload()` resets the store from scratch, so the guard never blocks the re-fetch — confirmed this is correct and sufficient, no custom re-fetch logic was needed in the button handler itself.
- No OpenReel core file, bridge, or store was modified — only this repo's own `integrations/mikai/` files, consistent with every prior MikAI-integration ticket in this repo.

## 5. Generate Shot Brief

Not implemented in this ticket, per its own explicit scope boundary — the sidecar form only takes manual Title/Description/Notes input (default title `"Placeholder"`, empty description). `generateInsertedShotBriefFromNeighbors` already exists on the MikAI side (used by Basic's own LLM-assist button) but exposing it to the sidecar is left as a separate future ticket if wanted.

## 6. Stale behavior

Identical contract to `editorial-timing-patch`/`publish-advanced`: a fingerprint mismatch between the snapshot the sidecar last saw and the sequence's current DB state returns `HTTP 409` with the exact message `"Sequence has changed since it was opened in OpenReel. Reload the Advanced Editor before applying changes."`, and — verified directly (see §8) — writes nothing to the database.

## 7. DB effects

Per successful insert: one new `shots` row; `orderIndex` shifted for every shot at/after the insertion point; a matching `sequence_editorial_items` row (if the sequence already has that layer initialized) at the analogous position; every active/published `sequence_results` row for that sequence marked `outdated`; every active/published `film_results` row for that project marked `outdated` (a `draft` Film Result is deliberately left alone — same rule as every other structural-change trigger in this codebase). No video file is touched, no FFmpeg runs, no Sequence Result or Film Result is deleted.

## 8. Real validation

Ran against **Project 4**, sequences 30 and 31 (both already had shots, an editorial-items layer, and active Sequence/Film Results), via `npm run dev:all` and real, unmocked calls — no mocked `fetch`, no stub server.

**MikAI-side, direct HTTP** (simulating the sidecar's exact request, `Origin: http://127.0.0.1:5173`):
- Fresh insert (sequence 30, after shot "Sh1", no `targetDurationSeconds` sent): `200`, new shot id 76, `duration_seconds: 5` (default confirmed), `orderIndex` correctly `1` (right after the target), every later shot's `orderIndex` shifted by exactly 1, the mirrored `sequence_editorial_items` row inserted at the analogous position with the same shift applied to its siblings, all 3 of sequence 30's `sequence_results` rows marked `outdated`, and **every** active/published `film_results` row for project 4 marked `outdated` (the one pre-existing `draft` row correctly untouched).
- Stale re-attempt (same, now-outdated snapshot, different target shot): `409`, exact expected message, shot count for sequence 30 unchanged (still 7 — confirming nothing was written).
- Invalid position (fresh snapshot, `insertAfterShotId: 999999`): `400`, `"Invalid insertion position."`
- Missing `sourceEditorialSnapshot`: `400`, clear schema-validation message.
- `OPTIONS` preflight: `204` with the correct `Access-Control-Allow-*` headers for the sidecar's origin.

**Full sidecar-side, real end-to-end** (a temporary, uncommitted Vitest file — deleted before commit — that ran the sidecar's own unmocked code against the live MikAI server, no simulation): fetched a real `editorial-export` for sequence 31 → built a real `Project` via `buildProjectFromMikaiExport` → resolved a real insertion context via `resolveMikaiInsertionContextFromPlayhead` (playhead past the sequence end → correctly resolved `"After Shot 6 - Order Restored"`) → `insertMikaiShotAtPlayhead` → `200`, shot 77 created → re-attempted the same call with the now-stale snapshot → `InsertMikaiShotError` thrown with `stale: true`, exact expected message. This exercises the entire real code path (adapter, resolver, POST helper) with nothing mocked except the initial MikAI-side test data.

**Test data disposition**: reverted to the exact pre-test baseline (user's explicit choice) — both test shots (76, 77) and their mirrored editorial items deleted, every shifted `orderIndex` restored, and every `sequence_results`/`film_results` row whose status the two test inserts changed restored to its prior value. Verified the post-revert DB state matches the pre-test snapshot field-for-field.

## 9. Limitations

- V1 does not touch the OpenReel timeline after a successful insert — the user must reload (by design, per this ticket's explicit scope).
- No shot brief generation from the sidecar (see §5) — manual title/description only.
- The insertion resolver treats all MikAI-tagged clips as one flattened, sorted sequence regardless of which OpenReel track they're on — correct for MikAI's current single-track model, but would need revisiting if multi-track MikAI sequences are ever introduced.

## 10. Next step

A natural follow-up (not started here): exposing `generateInsertedShotBriefFromNeighbors` to the sidecar so "Insert New Shot at Playhead" can also propose a brief instead of requiring a fully manual title/description — same pattern Basic's own LLM-assist button already uses.

## Confirmations

- No schema/migration change.
- No new npm package (either repo).
- ComfyUI/generation/job runner/polling code untouched.
- `SequencePreviewPlayer` untouched.
- KieAI untouched.
- The existing start-only timing-patch contract (`editorial-timing-patch`) was not modified — confirmed via its own unaffected test/behavior; `Validate Patch`, `Apply Patch to MikAI`, and `Publish Sequence Result to MikAI` all still function (full sidecar test suite — 244 tests, including all `MikaiBridgePanel` tests — still passes with zero regressions).
- OpenReel sidecar's functional/core code untouched — only this repo's own additive `integrations/mikai/` files were touched, same non-modification posture as every prior MikAI-bridge ticket.
- No runtime/upload/storage/local-DB file was committed from either repo — the two test shots created during real validation were fully reverted, verified field-for-field against the pre-test baseline, before this commit.
