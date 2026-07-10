# BUG.OPENREEL.MEDIA.1 — MikAI Media Hydration Fix in OpenReel Sidecar

Status: sidecar-only fix, real bug reproduced and fixed with real code against the live MikAI server. No MikAI code changed. MikAI HEAD unchanged at `75922d5 — Add OpenReel sidecar UX safety report`. Sidecar HEAD before this ticket: `eb66b0e — Polish MikAI bridge patch UI`.

## 1. Problem Reported

After `Open in Advanced Editor`, the sidecar correctly fetched MikAI's export JSON and the 4 approved shots' MP4 files (confirmed via real browser DevTools: `status 200, ok true, contentType video/mp4`, correct byte sizes), but every clip rendered as `missing` in OpenReel's timeline.

## 2. Audit Summary

Read the sidecar's media-hydration path (`mikaiToOpenReelProject.ts`, `useMikaiExportBootstrap.ts`) and OpenReel's own store/rendering code (`project-store.ts`, `Preview.tsx`) to find where OpenReel decides a clip is "missing":

- `AssetsPanel.tsx` uses `MediaItem.isPlaceholder` to label an asset "Missing" — the bootstrap's hydration call *did* set this to `false` correctly.
- `Preview.tsx` (the actual timeline/clip rendering path) explicitly gates video playback on **`mediaItem.blob && mediaItem.type === "video"`** — a separate, stricter check than `isPlaceholder`.
- The sidecar's bootstrap was calling project-store's `replacePlaceholderMedia` to attach each fetched blob. That function is written **only for OpenReel's own KieAI (AI image generation) flow** and **unconditionally sets `type: "image"`** on every call, regardless of the blob's actual content type — confirmed by reading its implementation directly (`project-store.ts`, `replacePlaceholderMedia`).

**Exact cause**: every MikAI video shot's `MediaItem.type` was silently overwritten from `"video"` to `"image"` the moment its blob was hydrated. The blob was present and correctly sized, `isPlaceholder` was `false`, but `type !== "video"` meant OpenReel's rendering pipeline never treated the clip as playable video — rendering it as broken/missing despite having valid data.

## 3. Fix

Entirely in the sidecar repo (`F:/AI/mikai-openreel-sidecar`), no MikAI code touched:

- Added `replaceMediaItemBlob(items, mediaId, blob)` in `mikaiToOpenReelProject.ts` — a type-preserving equivalent to the broken helper: attaches the blob, sets `isPlaceholder: false`, clears `fileHandle`, but **never overwrites `type`**, keeping whatever the item already had ("video" for every MikAI media item).
- Rewired `useMikaiExportBootstrap.ts`'s bootstrap to call this new function directly against the store (`useProjectStore.getState()`/`.setState()`), bypassing `replacePlaceholderMedia` entirely.
- Simplified away an unnecessary `File` wrapping step in the process (the original broken helper also wrapped every blob in `new File([blob], name)` for no functional reason — nothing downstream requires `mediaItem.blob` to specifically be a `File` rather than a plain `Blob`). Removing it also incidentally fixed a **test-environment-only** artifact (a cross-realm `Blob`/`File` mismatch under Vitest's jsdom when hydrating via a real Node `fetch()`) that doesn't affect real browser usage but was worth eliminating for more robust tests.

## 4. Real Verification (Sequence 30)

Two temporary Vitest tests (created and deleted within this ticket) ran real code against the actual live MikAI server:

- **Before removing the `File` wrap**: hydrated blobs came back at a suspicious, uniform 13 bytes each (traced to `"[object Blob]".length === 13` — a jsdom/Node cross-realm `File` construction artifact, not a real bug).
- **After the full fix**: `{"clipCount":6,"hydratedCount":4}`. All 4 approved shots: `type: "video"`, `isPlaceholder: false`, byte-exact blob sizes matching the real files (`3,356,065` / `4,017,591` / `3,040,846` / `2,874,988` — identical to the sizes the user's own browser DevTools test reported). Both missing shots (40, 41) correctly remain untouched placeholders (`blob: null`, `isPlaceholder: true`).
- **Validate Patch confirmed still functional**: a real `mode: "validate"` call against the live server after the fix returned `{"ok":true, items: [6 items]}` — the patch-generation/apply path was never affected by this bug (it only reads clip metadata, never media items), and remains fully working.

## 5. Tests

- New/updated tests: 4 in `mikaiToOpenReelProject.test.ts` (type preservation, other items untouched, metadata preserved, no-op on unknown id) + 1 real-store regression test in `useMikaiExportBootstrap.test.ts` reproducing the hook's exact wiring end-to-end.
- Full sidecar suite: **22 test files, 209 tests passed** (up from 204 before this ticket), 7 skipped (pre-existing, unrelated), **0 failures**.
- Typecheck: `tsc --noEmit` — **0 errors**.
- Dev server boot: verified on a fresh port, ready in 566ms, `HTTP 200`.

## 6. Confirmations

- Aucune migration, schema DB, fichier drizzle, package npm ajouté, ni côté MikAI ni côté sidecar.
- Aucune modification ComfyUI/generation/job runner/polling.
- Aucune refonte `/nle-prototype`, aucune modification `SequencePreviewPlayer`.
- Aucun runtime DB/uploads/outputs/storage committé.
- **Aucun code MikAI (`src/`) modifié** — bug entièrement côté sidecar.
- Round-trip trim/duration non touché ; contrat patch V1 inchangé (aucun champ ajouté).
- KieAI non retiré, toujours dormant — sa propre fonction `replacePlaceholderMedia` reste intacte et continue de fonctionner pour son cas d'usage original (génération d'images).

## 7. Commit / Push

- Sidecar commit: `e105720 — Fix MikAI media hydration in OpenReel`
- Pushé : `eb66b0e..e105720 main -> main` (`https://github.com/le-fanatique/mikai-openreel-sidecar.git`)
- MikAI : aucun changement de code, ce document uniquement.
