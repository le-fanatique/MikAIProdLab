# NLE.OPENREEL.5 — Export Timing Patch from Sidecar and Apply to MikAI

Status: full round-trip verified with real code against the live MikAI dev server, including a real DB write and revert. No schema/package/runtime touched. MikAI HEAD at time of writing: `0cc6fed — Add OpenReel advanced editor link`. Sidecar HEAD: `3dfd0e3 — Load MikAI export from sidecar URL`.

## 1. Goal

Close the last gap in the MikAI ↔ OpenReel bridge: let the sidecar actually send its edited timing back to MikAI, over the network, and have MikAI write it to the database. Every prior `NLE.OPENREEL.*` ticket built one piece of this (import, patch generation, auto-load) without ever making the final network call — this ticket makes that call and verifies it lands correctly in the DB.

## 2. MikAI-Side Changes

**Commit**: this ticket's own MikAI commit (hash reported in the final summary below, per this project's convention of committing docs+code together in one commit for a MikAI-side ticket).

- **`src/lib/cors/editorSidecarCors.ts`** — extended `resolveEditorSidecarCorsHeaders` with an optional `options` parameter (`methods`, `headers`, `exposeHeaders`) so a non-media route can request a different `Access-Control-Allow-Methods`/`-Headers`/`-Expose-Headers` set than the existing media-route defaults (`GET, HEAD, OPTIONS` / `Range, Content-Type` / `Content-Length, Content-Range, Accept-Ranges`), **without duplicating the allowlist or origin-matching logic**. All existing callers (`/api/uploads/[...path]`, `editorial-export`) call the function with no `options`, so they get exactly the same defaults as before — confirmed via curl showing byte-identical CORS headers pre/post this change.
- **`src/app/api/projects/[projectId]/sequences/[sequenceId]/editorial-timing-patch/route.ts`** — added an `OPTIONS` preflight handler and applied `resolveEditorSidecarCorsHeaders(origin, { methods: "POST, OPTIONS", headers: "Content-Type", exposeHeaders: null })` to every response in the `POST` handler (every early-return error path, the `validate`/rejected-patch path, and the final success path) — no logic change to import validation/planning/apply itself, only headers added.

## 3. Sidecar-Side Changes

**Commit**: `c032f5a — Apply MikAI timing patches from sidecar` (on top of `3dfd0e3`), pushed to `origin`.

- **`apps/web/src/integrations/mikai/applyMikaiTimingPatch.ts`** (new):
  - `deriveMikaiBaseUrl(mikaiExportUrl)` — derives MikAI's origin from the export URL the sidecar was booted with (`new URL(url).origin`), falling back to `http://localhost:3000` if absent or unparseable.
  - `applyMikaiTimingPatch({ mikaiBaseUrl, projectId, sequenceId, patch, mode })` — POSTs `{ mode, patch }` to `.../editorial-timing-patch`. Network failures and non-JSON/malformed-shape responses throw `MikaiPatchApplyError`; a well-formed server response — even one with `ok: false` (e.g. MikAI rejecting the patch) — is returned normally, not thrown, so the caller can show the real server error rather than a generic crash.
  - `validateThenApplyMikaiTimingPatch(...)` — calls `mode: "validate"` first; only calls `mode: "apply"` if validation returned `ok: true`. Never applies an un-validated or rejected patch.
- **`apps/web/src/integrations/mikai/applyMikaiTimingPatch.test.ts`** (new) — 10 tests, `fetch` mocked throughout: `deriveMikaiBaseUrl` (3), `applyMikaiTimingPatch` (5: success round-trip with exact request-body assertion, server `ok: false` returned not thrown, network error throws, non-JSON response throws, unexpected shape throws), `validateThenApplyMikaiTimingPatch` (2: apply only runs after a successful validate, apply never runs after a failed validate).
- **`apps/web/src/integrations/mikai/MikaiApplyPatchButton.tsx`** (new) — the UI. A small fixed-position button, **mounted in `App.tsx` exactly like the existing `<ToastContainer />`** (not inside OpenReel's own toolbar/menu component tree, so no core editor UI file needed changing). Renders `null` entirely unless the sidecar session started from a MikAI export URL. On click: `window.confirm("Apply timing changes back to MikAI?")` → build patch → `validateThenApplyMikaiTimingPatch` → `toast.success`/`toast.error` via the existing notification store. Labels: `"Apply Timing Patch to MikAI"` (idle), `"Applying…"` (in flight).
- **`apps/web/src/App.tsx`** (2-line diff) — one new import, one new `<MikaiApplyPatchButton />` render call next to `<ToastContainer />`.
- **`MIKAI_SIDECAR.md`** (updated) — documented the apply-patch flow, the MikAI-side CORS extension needed, updated "Limits," and marked all 5 roadmap steps done with a closing note that the bridge is now end-to-end complete.

## 4. CORS Verification (MikAI)

Reproduced the exact browser negotiation sequence via `curl`, same method used throughout `NLE.VENDOR.BRIDGE.1`/`SPIKE.4`/`OPENREEL.4`:

**Preflight, allowed origin**:
```
OPTIONS .../editorial-timing-patch, Origin: http://localhost:5173, Access-Control-Request-Method: POST
→ 204, access-control-allow-methods: POST, OPTIONS
       access-control-allow-headers: Content-Type
       access-control-allow-origin: http://localhost:5173
       vary: Origin
```

**Actual POST validate, allowed origin** → `200`, same CORS headers, real `{"ok":true,...}` body.

**Refused origin** (`http://evil.localhost:9999`) → `200` at the network level, but **no CORS headers at all** — a real browser would block reading the response body, no wildcard anywhere.

**No `Origin` header (same-origin behavior)** → identical response, unaffected by the CORS change.

**Regression check on the two pre-existing CORS routes** (`/api/uploads/...`, `editorial-export`) — headers confirmed byte-identical to before this ticket's helper refactor.

## 5. Payload (Validate / Apply)

Both modes share the same envelope, differing only in `mode`:

```json
{
  "mode": "validate",
  "patch": {
    "schemaVersion": "mikai-editorial-timing-patch-v1",
    "sourceSchemaVersion": "mikai-editorial-export-v1",
    "projectId": 4,
    "sequenceId": 30,
    "createdAt": "2026-07-10T00:00:00.000Z",
    "items": [{ "id": 1, "shotId": 36, "startSeconds": 0, "durationSeconds": 5 }]
  }
}
```

Response (both modes share the same shape MikAI's existing `editorial-timing-patch` route already returns — unchanged by this ticket): `{ ok, mode, applied, errors: [...], items: [...] }`.

## 6. Test Results (Sidecar)

- New file alone: `npx vitest run src/integrations/mikai/applyMikaiTimingPatch.test.ts` → **10/10 passed**.
- Full suite regression check: `npx vitest run` (entire `apps/web`) → **21 test files, 190 tests passed** (up from 180 before this ticket), **7 skipped** (pre-existing), **0 failures**.
- Typecheck: `pnpm run typecheck` (`tsc --noEmit`) → **0 errors**.
- Dev server boot: verified on a fresh port (`vite --port 5176`, since 5173–5175 were already occupied by prior tickets' still-running instances) — ready in 547ms, `HTTP 200`.

## 7. Real Round-Trip Test (Beyond Unit Tests)

No browser automation tool is available in this environment (same disclosed limitation as every prior ticket). In its place, the strongest available substitute: a real, temporary Vitest test (created and deleted within this ticket) that used **entirely real code and a real network connection to the live MikAI dev server** — no mocked `fetch` for MikAI calls (only the browser-only OpenReel bridges were mocked, same pattern as every prior real-execution test in this series):

1. Fetched the real sequence-30 export from MikAI.
2. Built a real `Project` via `buildProjectFromMikaiExport`, loaded it via the real `loadProject()`.
3. Called the real `moveClip("mikai-item-1", 50)` — moved shot 36 from `startSeconds: 0` to `50`.
4. Built a real patch via `buildMikaiTimingPatchFromOpenReelProject`, filtered to just the moved item.
5. Called `validateThenApplyMikaiTimingPatch` for real — `validate` then `apply`, both against the live MikAI server. Result: `{"stage":"applied","result":{"ok":true,"mode":"apply","applied":true,"items":[{"id":1,"shotId":36,"currentStartSeconds":0,"nextStartSeconds":50,...}]}}`.
6. **Verified MikAI's actual SQLite database directly**: `start_seconds` for item 1 was `50` after the apply.
7. Reverted via a second real apply (`startSeconds: 0`), verified `validateThenApplyMikaiTimingPatch` returned `{"stage":"applied", ok:true}` again.
8. **Verified the DB one more time**: item 1 back to `start_seconds: 0`, `duration_seconds: 5`, `order_index: 0`, `track_index: 0`, `trim_in/out_seconds: null` — every non-`startSeconds` field byte-identical to before the test, only `updated_at` refreshed.
9. Confirmed the **entire sequence 30** (all 6 items) matches its pre-test baseline exactly — nothing else was touched.

## 8. Confirmation DB After Apply

```json
// Before this ticket's test
{ "id": 1, "shot_id": 36, "start_seconds": 0, "duration_seconds": 5, "updated_at": "2026-07-09T17:26:24.816Z" }

// After apply (startSeconds: 50)
{ "id": 1, "shot_id": 36, "start_seconds": 50, ... }

// After revert apply (startSeconds: 0) — final state
{
  "id": 1, "shot_id": 36, "start_seconds": 0, "duration_seconds": 5,
  "order_index": 0, "track_index": 0,
  "trim_in_seconds": null, "trim_out_seconds": null,
  "updated_at": "2026-07-10T00:01:57.081Z"
}
```

Only `startSeconds`/`updatedAt` ever changed, exactly matching `editorialTimingPatch.ts`'s documented V1 write scope — confirmed by direct inspection, not assumption.

## 9. Limits

- **Literal browser click-through not observed** — same standing limitation across the entire series; the round-trip above is the strongest available substitute (real code, real network, real DB verification), not a visual confirmation of the button/toast UI rendering correctly.
- **Trim/duration edits still not round-tripped** — unchanged, deliberate `NLE.PLUGIN.SYNC` V1 boundary; a patch with a changed `durationSeconds` is still rejected by MikAI's own validator (`editorialTimingPatch.ts`), not something this ticket touches.
- **No conflict handling** — if MikAI's data changed between when the sidecar loaded its export and when the user clicks "Apply," the current behavior is whatever MikAI's existing `planEditorialTimingPatch` does (compares against current DB state, rejects mismatched durations) — no sidecar-side staleness warning beyond that.
- **`window.confirm` is the only safety gate** — a native browser confirm dialog, not a custom UI; adequate for this ticket's "minimal UI" scope, not a polished experience.

## 10. Next Ticket Recommended

The five-step roadmap from `docs/NLE_VENDOR_DECISION_OPENREEL.md` is now complete — the bridge is closed end-to-end (import → edit → apply, verified with real code and a real DB write/revert). No further bridge-plumbing ticket is strictly required. Recommended next steps, in order of likely value, left for a future product decision rather than assumed here:

1. **`NLE.OPENREEL.6` — UI polish pass**: replace `window.confirm` and the fixed-position button with something more integrated into OpenReel's own UI conventions (still without forking core files, e.g. via whatever plugin/extension point OpenReel's own architecture offers, if any).
2. **`NLE.OPENREEL.7` — Trim/duration round-trip**: a deliberate, scoped extension of MikAI's `editorial-timing-patch` V1 boundary (needs explicit product validation before starting, per `NLE.PLUGIN.SYNC`'s original reasoning for keeping V1 narrow).
3. **A product decision ticket** (like `NLE.VENDOR.DECISION.1`) on whether to invest further in sidecar polish now, or consider the bridge "done enough" and return attention elsewhere.

## 11. Confirmations

- Aucune migration, aucun schema DB, aucun fichier drizzle, aucun package npm ajouté à MikAI, aucune modification `package.json`/`package-lock.json`.
- Aucune modification ComfyUI/generation/job runner/polling.
- Aucune refonte de `/nle-prototype` (fichier non touché dans ce ticket).
- Aucune modification `SequencePreviewPlayer`.
- Aucun runtime DB/uploads/outputs/storage committé.
- Aucun code OpenReel copié dans le repo MikAI ; tous les changements sidecar vivent exclusivement dans `F:/AI/mikai-openreel-sidecar`.
