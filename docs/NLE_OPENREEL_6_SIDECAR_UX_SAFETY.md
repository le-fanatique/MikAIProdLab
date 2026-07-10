# NLE.OPENREEL.6 — Sidecar UX Polish & Safety Pass

Status: sidecar-only ticket — audit found no MikAI-side change was necessary. MikAI HEAD unchanged at `7b89b5e — Allow sidecar timing patch apply`. Sidecar HEAD before this ticket: `c032f5a — Apply MikAI timing patches from sidecar`.

## 1. Goal

The `NLE.OPENREEL.1`–`.5` roadmap closed the MikAI ↔ OpenReel bridge end-to-end, but the only UI was a bare "Apply Timing Patch to MikAI" button with no visibility into what was loaded, what would be sent, or why something failed beyond a toast and a console log. This ticket polishes that experience — clearer target/summary display, an explicit `Validate Patch` step separate from `Apply`, a more informative confirmation, and readable error classification — without adding any new editorial power, touching the V1 patch contract, or building conflict handling.

## 2. Audit (Before Any Change)

Read directly, no MikAI change made based on this audit — everything needed already existed:

- **Where the button was mounted**: `App.tsx`, as a fixed-position overlay (`<MikaiApplyPatchButton />`) rendered right next to the pre-existing `<ToastContainer />` — not inside OpenReel's own toolbar/menu component tree. This is the correct, already-established pattern to keep following (confirmed, not changed).
- **How the current `Project` is read**: `useProjectStore((state) => state.project)` — the live Zustand store, same as every other MikAI integration file in this repo.
- **How MikAI query params are retained**: only `mikaiExportUrl` is actually read anywhere (`getMikaiExportUrlFromLocation`, `useMikaiExportBootstrap.ts`) — `mikaiProjectId`/`mikaiSequenceId` exist in the URL (added cosmetically in `NLE.OPENREEL.4`) but were never parsed by any code. Decision for this ticket: **don't add a second source of truth** — `buildMikaiTimingPatchFromOpenReelProject`'s own `patch.projectId`/`patch.sequenceId` (read from clip `metadata`, already proven correct across every prior real-execution test) is the only place project/sequence identity needs to come from. `mikaiExportUrl` alone remains sufficient to derive `mikaiBaseUrl` via the already-existing `deriveMikaiBaseUrl`.
- **How patch warnings were already exposed**: `buildMikaiTimingPatchFromOpenReelProject` (`NLE.OPENREEL.3`) **already returns `{ patch, warnings }`** — the old button destructured only `patch` and silently dropped `warnings`. No new warning-tracking mechanism was needed, only surfacing what already existed.
- **Best zone for a light panel**: same fixed-position overlay slot the button already occupied — replacing a `<button>` with a small `<div>` panel containing the same button(s) plus text rows is a same-shape swap, not a new UI surface.
- **MikAI-side audit**: read `editorial-timing-patch/route.ts` and `editorSidecarCors.ts` (both already modified in `NLE.OPENREEL.5`) — CORS and the endpoint contract are unchanged by this ticket's needs; `deriveMikaiBaseUrl` already handles origin derivation without any new MikAI endpoint or parameter. **Conclusion: no MikAI-side change required.**

## 3. Sidecar-Side Changes

**Commit**: `eb66b0e — Polish MikAI bridge patch UI` (on top of `c032f5a`), pushed to `origin`.

- **`apps/web/src/integrations/mikai/MikaiApplyPatchButton.tsx`** — **deleted**, replaced by:
- **`apps/web/src/integrations/mikai/MikaiBridgePanel.tsx`** (new) — the panel. Two pure, independently-tested helper functions plus the component:
  - `computeMikaiPatchSummary(project)` — wraps `buildMikaiTimingPatchFromOpenReelProject` in a try/catch, returning `{ ok: true, patch, warnings }` or `{ ok: false, message }` (the specific reason, e.g. "no clip in this Project carries valid MikAI metadata..."). **Recomputed on every render** (cheap, pure, synchronous), so the panel's summary is always live — it updates the instant a clip is moved, not just at click time.
  - `describeMikaiError(err, mikaiBaseUrl)` — classifies a caught error into a short, human-readable string. The one specific enrichment: a `"Failed to fetch"`/`"NetworkError"`-style message (the browser's own generic wording for both "server is down" and "CORS rejected this request" — indistinguishable from the raw message alone) gets a concrete hint naming both likely causes and the actual `mikaiBaseUrl` being contacted.
  - The component itself: shows `Project: <id>`, `Sequence: <id>`, `MikAI clips: <n>`, `Ignored non-MikAI clips: <n>`, `Warnings: <n>` (expandable `<details>` list of the actual warning messages), the resolved MikAI base URL, a status line for the last validate/apply outcome, and two buttons: `Validate Patch` (calls `mode: "validate"` only — no apply) and `Apply Timing Patch to MikAI` (enriched `window.confirm` naming project/sequence/item-count, then `validateThenApplyMikaiTimingPatch`). Both buttons are disabled while a request is in flight or when `computeMikaiPatchSummary` reports no valid MikAI clips. Renders `null` entirely — same as the old button — when the sidecar wasn't opened via a MikAI export URL.
- **`apps/web/src/integrations/mikai/MikaiBridgePanel.test.tsx`** (new) — 14 tests: 6 on the pure helpers (`computeMikaiPatchSummary` ok/error cases, `describeMikaiError`'s 4 classification branches), 8 on the rendered component via React Testing Library + mocked `fetch` (already a dependency, already used by `InspectorPanel.tabs.test.tsx` — no new package): hidden with no `mikaiExportUrl`, summary numbers correct with mixed MikAI/native clips, disabled state + message with zero MikAI clips, `Validate Patch` calls only `validate`, `Apply` confirmation gate (declining skips the network call entirely — verified `fetch` was never invoked), full validate→apply sequence on success, apply never called after a failed validate, and a network-failure message showing the CORS/reachability hint.
- **`apps/web/src/App.tsx`** (2-line diff) — swapped the import and render call from `MikaiApplyPatchButton` to `MikaiBridgePanel`; nothing else touched.
- **`MIKAI_SIDECAR.md`** (updated) — rewrote the "Apply timing patch flow" section to describe the panel (not the old bare button), added an explicit "Security posture, V1" paragraph (validate-before-apply, enriched confirm, MikAI's own server-side re-validation against live DB state, explicit trim/duration-still-not-round-tripped statement), updated "Limits," and marked roadmap step 6 done with a closing note distinguishing "visibility polish" (this ticket) from genuinely new scope (duration/trim round-trip, deeper conflict handling — neither attempted here).

## 4. Test Results (Sidecar)

- New file alone: `npx vitest run src/integrations/mikai/MikaiBridgePanel.test.tsx` → **14/14 passed**, first run, no fixes needed.
- Full suite regression check: `npx vitest run` (entire `apps/web`) → **22 test files, 204 tests passed** (up from 190 before this ticket), **7 skipped** (pre-existing, unrelated), **0 failures**. Confirms nothing else broke, including the pre-existing bootstrap/adapter/patch-builder test suites this ticket's component depends on.
- Typecheck: `pnpm run typecheck` (`tsc --noEmit`) → **0 errors**.
- No stale references to the deleted `MikaiApplyPatchButton.tsx` anywhere (`grep -rl "MikaiApplyPatchButton"` across `src/` — zero matches after the swap).

## 5. Dev Server / Real-Data Verification

- Dev server boot: verified on a fresh port (`vite --port 5177`, ports 5173–5176 already occupied by prior tickets' still-running instances) — ready in 510ms, `HTTP 200`.
- **Real-data check beyond mocked tests**: a temporary Vitest test (created and deleted within this ticket) fetched the actual live sequence-30 export from the running MikAI server, built a real `Project`, and ran `computeMikaiPatchSummary` on it — result: `{"projectId":4,"sequenceId":30,"clipCount":6,"warningCount":0}`, exactly matching the known real data for that sequence (same numbers confirmed in every prior ticket's real-execution tests).

## 6. Manual Test / Limitation

No browser automation tool is available in this environment — the same disclosed limitation across every ticket in this series. The literal "open MikAI, click Open in Advanced Editor, watch the panel render, move a clip, click Validate then Apply, read the success message" sequence was not visually performed by this agent. In its place, this ticket relied on the strongest available substitutes, consistent with the standard held throughout the series:

1. 14 component-level tests using React Testing Library, exercising the actual rendered DOM output (via `screen.getByTestId`) and actual click handlers (via `fireEvent.click`) against the real component code — not a simulation of the component, the component itself, rendered.
2. A real-data check confirming the summary logic (the panel's core "what will I send" display) produces correct numbers against live MikAI data, not just a synthetic fixture.
3. `NLE.OPENREEL.5`'s prior real round-trip test (move → validate → apply → DB verification → revert) remains valid evidence that the underlying `validateThenApplyMikaiTimingPatch` call this panel now wraps with better UI still works correctly — this ticket didn't change that function's logic, only how/when the UI calls it and displays the result.

## 7. UX Behavior (Final)

- **No MikAI project loaded** (sidecar opened normally, no `mikaiExportUrl`): panel entirely absent — zero visual footprint, zero behavior change from pre-`NLE.OPENREEL.4` OpenReel.
- **MikAI project loaded, has MikAI-tagged clips**: panel shows `Project: <id>`, `Sequence: <id>`, live clip/ignored/warning counts (updating as the user edits), source MikAI base URL, and two enabled buttons.
- **MikAI project loaded, zero MikAI-tagged clips** (e.g. every clip was deleted/replaced by native OpenReel ones): panel shows "No MikAI clips detected: <reason>", both buttons disabled.
- **Validate Patch clicked**: `Patch is valid` (green) or `Validation failed: <server message>` (red) — apply is never called.
- **Apply clicked**: enriched confirm dialog → on confirm, validate runs first; on failure, `Validation failed: ...` shown and apply never fires; on success, apply runs and shows `Timing patch applied` (green) or `Apply failed: ...` (red).
- **Any network/CORS/JSON error**: a specific, readable message (not just a console log) — for the ambiguous "Failed to fetch" case, an explicit hint naming both possible causes and the actual URL being contacted.

## 8. Limitations

- Literal browser click-through not visually observed (Section 6) — same standing limitation across this entire series.
- No conflict-detection beyond what MikAI's own server already does (`planEditorialTimingPatch`'s duration/overlap checks against current DB state) — explicitly out of this ticket's scope per its own constraints.
- Trim/duration round-trip explicitly not attempted — unchanged `NLE.PLUGIN.SYNC`/`editorialTimingPatch.ts` V1 boundary, restated (not modified) in `MIKAI_SIDECAR.md`.
- The panel is a fixed-position `<div>` with inline styles, not integrated into OpenReel's design system/component library — deliberate, matches this ticket's "UI légère, pas de grosse refonte" constraint; a future ticket could integrate it more natively if OpenReel exposes a plugin/extension surface for that.

## 9. Next Ticket Recommended

No further bridge-plumbing or UX-polish ticket is strictly required — the bridge is functionally complete (`.1`–`.5`) and now has legible, safety-conscious UI around it (`.6`). Candidates for a future ticket, none assumed or started here:

1. **A product decision** on whether trim/duration round-trip is worth deliberately widening MikAI's `editorial-timing-patch` V1 boundary for — this needs explicit validation before any code, per `NLE.PLUGIN.SYNC`'s original reasoning for keeping V1 narrow.
2. **Deeper conflict handling** if real usage reveals the current "MikAI's validator rejects stale patches" behavior is too coarse (e.g. a "refresh from MikAI" action in the panel before re-attempting apply).
3. **Native OpenReel UI integration** if/when a plugin or extension point becomes available in the upstream project, to move off the fixed-position-overlay pattern.

## 10. Confirmations

- Aucune migration, aucun schema DB, aucun fichier drizzle, aucun package npm ajouté à MikAI ou au sidecar, aucune modification `package.json`/lockfile de part et d'autre.
- Aucune modification ComfyUI/generation/job runner/polling.
- Aucune refonte de `/nle-prototype` — fichier non touché.
- Aucune modification `SequencePreviewPlayer`.
- Aucun runtime DB/uploads/outputs/storage committé.
- **Aucun fichier `src/` de MikAI modifié** — l'audit initial a confirmé qu'aucun changement MikAI n'était nécessaire ; le diff MikAI de ce ticket se limite entièrement à ce rapport.
- Aucun code OpenReel copié dans le repo MikAI ; tous les changements sidecar vivent exclusivement dans `F:/AI/mikai-openreel-sidecar`.
- KieAI non retiré, toujours dormant.
- Tests existants tous préservés et passants (204/204 non-skip, 0 échec).
