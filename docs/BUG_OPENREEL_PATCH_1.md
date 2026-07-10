# BUG.OPENREEL.PATCH.1 — Start-Only Timing Patch Fix in OpenReel Sidecar

Status: sidecar-only fix, real bug reproduced and fixed with real code against the live MikAI server. No MikAI code changed. MikAI HEAD unchanged at `9e11f06 — Add OpenReel media hydration bug report`. Sidecar HEAD before this ticket: `e105720 — Fix MikAI media hydration in OpenReel`.

## 1. Problem Reported

The MikAI Bridge panel showed:

```
MikAI Bridge
Project: 4
Sequence: 30
MikAI clips: 7
Ignored non-MikAI clips: 0
Warnings: 0
Source: http://localhost:3000
Validation failed: Duration changes are not supported by this importer yet. Duration changes are not supported by this importer yet.
```

Sequence 30's live export has 6 items (4 approved videos, 2 missing placeholders), so the panel should have shown `MikAI clips: 6`, and no duration errors at all (MikAI V1 never accepts duration changes by design).

## 2. Audit Summary

- The duplicated error text is simply MikAI's server reporting one error per invalid item — two items were each failing the same duration check, and the sidecar joins error messages with a space, producing the repeated sentence. Not a bug on its own; it was expected to disappear once the underlying duration mismatch was fixed.
- Read the sidecar's `openReelToMikaiPatch.ts` (the OpenReel Project → MikAI patch builder): it was sending `durationSeconds: clip.duration` — OpenReel's **live** clip duration — instead of the duration MikAI originally reported for that item. MikAI's own `editorialTimingPatch.ts` validator (`TIMING_EPSILON_SECONDS = 0.05`) rejects the **whole patch** if any item's `durationSeconds` disagrees with the current DB value, by design (V1 only ever writes `startSeconds` server-side). OpenReel's internal clip model normalizes/derives `clip.duration` in ways that drift from the original MikAI value even with zero user edits, so this was failing on real data.
- The "7 vs 6" count could not be reproduced or pinned to a specific line via static analysis. `project-store.ts`'s `loadProject()` was confirmed to do a full state replace (not a merge), and `useProjectRecovery`'s auto-save/recovery dialog was confirmed to require explicit user action, not a silent auto-merge. The most plausible mechanism is a React Fast Refresh/HMR remount during a dev session resetting the sidecar's bootstrap guard and triggering a second import on top of an already-loaded project — this is a hardening fix, not a proven single root cause.

## 3. Fix (sidecar only)

- Added `mikaiOriginalDurationSeconds` to each clip's metadata at import time (`mikaiToOpenReelProject.ts`), preserving MikAI's own reported duration for that item.
- `openReelToMikaiPatch.ts`'s `buildMikaiTimingPatchFromOpenReelProject` now always sends `mikaiOriginalDurationSeconds` as `durationSeconds` — **never** `clip.duration`. The patch is start-only by construction.
- If OpenReel's live `clip.duration` has drifted from the original by more than 0.05s, a non-fatal warning is added (`"Duration changed in OpenReel (...) — ignored. MikAI V1 only supports startSeconds changes."`), shown in the bridge panel's warnings list — the start-only patch still goes out.
- Defense-in-depth: a duplicate `mikaiItemId` across two clips in the same Project is now skipped (with a warning) rather than double-counted or sent twice.
- `useMikaiExportBootstrap.ts`'s bootstrap effect gained an idempotency guard: before importing, it checks whether the live store already holds the exact target MikAI sequence and skips re-bootstrapping if so — hardens against the HMR-remount hypothesis above.
- Incidentally found and fixed a real bug in `getMikaiProjectSequenceFromLocation` while adding this guard: `Number(null)` coerces to `0`, and `Number.isInteger(0)` is `true`, so the function returned `{projectId: 0, sequenceId: 0}` instead of `null` when the query params were absent. Fixed by checking for `null` before the `Number()` conversion.

## 4. Real Verification (Sequence 30, Project 4)

Ran real code (temporary Vitest test, created and deleted within this ticket) against the live MikAI server:

- Export genuinely has 6 items (4 approved, 2 missing) — `buildProjectFromMikaiExport` correctly produces **6 clips, not 7**.
- Built a patch from the unmodified imported Project: 6 items, 0 warnings.
- Moved MikAI item 2 (shot 37) from `startSeconds: 5` to `50` via a real `moveClip` call.
- Rebuilt the patch: 6 items, 0 warnings, `durationSeconds` for item 2 still `2.7` (the original), not the drifted OpenReel value.
- `validateThenApplyMikaiTimingPatch` → validate `ok: true`, apply `ok: true`, 0 errors.
- Re-fetched the export from the live server: `startSeconds: 50` confirmed for item 2, `durationSeconds` unchanged at `2.7`.
- Reverted `startSeconds` back to `5` via the same apply path and confirmed the DB matches the original state exactly (all 6 items' `start`/`dur` unchanged from before the test).

## 5. Tests

- New/updated tests: `openReelToMikaiPatch.test.ts` (duration-preservation, drift-warning, no-warning-within-epsilon, duplicate-item-id skip — 14 tests total, up from 10), `MikaiBridgePanel.test.tsx` fixtures updated for the new required metadata field (14 tests, all passing), `useMikaiExportBootstrap.test.ts` gained coverage for the idempotency guard's pure helpers (12 tests, up from 8).
- Full sidecar suite: **22 test files, 215 tests passed**, 7 skipped (pre-existing, unrelated), **0 failures**.
- Typecheck: `tsc --noEmit` across all workspace packages — **0 errors**.

## 6. Confirmations

- Only `startSeconds` (and `updatedAt`) were ever written to MikAI's DB during real verification — `durationSeconds` was read/validated but never changed by this ticket's patch.
- Aucune migration, schema DB, fichier drizzle, package npm ajouté, ni côté MikAI ni côté sidecar.
- Aucune modification ComfyUI/generation/job runner/polling.
- Aucun runtime DB/uploads/outputs/storage committé.
- **Aucun code MikAI (`src/`) modifié** — bug entièrement côté sidecar.
- Contrat patch V1 inchangé (aucun champ ajouté/retiré dans le schema envoyé à MikAI) ; trim/duration round-trip toujours non implémenté, intentionnellement.
- KieAI non retiré, toujours dormant.

## 7. Commit / Push

- Sidecar commit: `50bfde1 — Keep MikAI timing patches start-only`
- Pushé : `e105720..50bfde1 main -> main` (`https://github.com/le-fanatique/mikai-openreel-sidecar.git`)
- MikAI : aucun changement de code, ce document uniquement.
