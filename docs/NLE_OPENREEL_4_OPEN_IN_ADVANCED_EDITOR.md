# NLE.OPENREEL.4 — Open in Advanced Editor from MikAI

Status: real end-to-end wiring, tested via curl (CORS negotiation), the sidecar's real test suite, and a live fetch against the running MikAI server. No schema/package/runtime touched. MikAI HEAD at time of writing: `5eab18c — Add OpenReel patch export report`. Sidecar HEAD: `5a1d71a — Add MikAI timing patch export`.

## 1. Goal

Wire the first real user flow: click a link on a MikAI sequence page, land on the OpenReel sidecar, and have it load that sequence automatically — no more manual `fetch`/console commands. This is the point where the vanilla `tools/editor-poc/` POC becomes fully superseded for actual editing (it remains frozen as a reference/debug tool per `docs/NLE_VENDOR_DECISION_OPENREEL.md`).

## 2. MikAI-Side Changes

**Commit**: not yet made at the time of this report — staged for commit in this same ticket (see Section 9).

- **`src/app/projects/[projectId]/sequences/[sequenceId]/nle-prototype/page.tsx`** — added an "Open in Advanced Editor" link next to the existing "Export Editorial JSON" / "← Editorial" links in the `PageHeader`. Builds the sidecar URL from `NEXT_PUBLIC_MIKAI_OPENREEL_SIDECAR_URL` (fallback `http://localhost:5173`) and the export URL from `NEXT_PUBLIC_MIKAI_ORIGIN` (fallback `http://localhost:3000`) + the already-existing `editorialExportHref`. No new DB table, no new settings — both are plain env vars read at render time, additive-only (existing behavior unchanged if unset).
- **`src/app/api/projects/[projectId]/sequences/[sequenceId]/editorial-export/route.ts`** — **not in the originally expected diff, added because testing surfaced a real gap**: this route had no CORS headers at all. `NLE.VENDOR.BRIDGE.1` only added CORS to `/api/uploads/[...path]` (for media bytes); the sidecar's bootstrap hook needs to `fetch()` the *export JSON itself* cross-origin, which would have been silently blocked by the browser despite every other part of the pipeline working. Fixed by reusing the exact same `resolveEditorSidecarCorsHeaders` helper already used by the uploads route — same non-wildcard, scoped-origin allowlist (`http://localhost:5173`/`127.0.0.1:5173` by default, extensible via `MIKAI_EDITOR_CORS_ORIGINS`), plus an `OPTIONS` preflight handler matching the uploads route's pattern. No new CORS logic, no new allowlist — the existing route-level guard for "which origins can call this."

## 3. Sidecar-Side Changes

**Commit**: `3dfd0e3 — Load MikAI export from sidecar URL` (on top of `5a1d71a`), pushed to `origin`.

- **`apps/web/src/integrations/mikai/useMikaiExportBootstrap.ts`** (new) — exports:
  - `getMikaiExportUrlFromLocation(search: string): string | null` — pure URL-param parser, trivially testable.
  - `bootstrapMikaiProject(exportUrl, storeActions): Promise<{ clipCount, hydratedCount }>` — the actual pipeline: `fetch(exportUrl)` → `buildProjectFromMikaiExport` (existing adapter, `NLE.OPENREEL.2`) → `loadProject` → `hydrateMikaiMediaBlobs` (existing adapter) → `replacePlaceholderMedia` per resolved item. Kept separate from the React hook so it's testable without mounting a component.
  - `useMikaiExportBootstrap(): MikaiBootstrapStatus` — the hook. Reads `window.location.search` once on mount (guarded by a `useRef`, not state, so it never re-fires on re-render), calls `bootstrapMikaiProject` if `mikaiExportUrl` is present, and surfaces `"Loading MikAI sequence…"` / `"MikAI sequence loaded"` / `"Failed to load MikAI sequence"` via OpenReel's own existing `toast` notification store (`stores/notification-store.ts`) — no new UI component, no new toast system.
- **`apps/web/src/integrations/mikai/useMikaiExportBootstrap.test.ts`** (new) — 7 tests: URL-param parsing (4 tests: absent, present/decoded, empty/whitespace, ignores unrelated params) and `bootstrapMikaiProject` (3 tests, with `fetch` mocked: full success path with mixed hydration results, non-OK export fetch throws without calling `loadProject`, malformed export body throws without calling `loadProject`).
- **`apps/web/src/App.tsx`** (modified, minimal diff — 16 lines) — added `useMikaiExportBootstrap()` call alongside the existing `useKieAIPoller()`, and one new branch in the existing initial-route effect: if `mikaiExportUrl` is present, `navigate("editor")` immediately (skipping the Welcome screen the app would otherwise show) instead of falling through to the pre-existing `route === "new"` / `showWelcome` logic, which is entirely unchanged.
- **`MIKAI_SIDECAR.md`** (updated) — documented the full bootstrap flow, the CORS extension needed on MikAI's side, updated "Limits" and the roadmap (steps 1–4 now marked done).

## 4. Exact URL Generated

Confirmed via `curl` against the live, rebuilt MikAI page (`/projects/4/sequences/30/nle-prototype`):

```text
http://localhost:5173/?mikaiExportUrl=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fprojects%2F4%2Fsequences%2F30%2Feditorial-export&mikaiProjectId=4&mikaiSequenceId=30
```

Query param used for the actual bootstrap trigger: **`mikaiExportUrl`** (absolute, URL-encoded). `mikaiProjectId`/`mikaiSequenceId` are included per the ticket's "optional but useful" suggestion, though the current bootstrap implementation derives everything it needs from the fetched export body itself and doesn't read those two params directly — they're present in the URL for a human to see at a glance, and available for a future ticket if the sidecar ever needs them before the fetch resolves.

## 5. Test Results (Sidecar)

- New file alone: `npx vitest run src/integrations/mikai/useMikaiExportBootstrap.test.ts` → **7/7 passed**.
- Full suite regression check: `npx vitest run` (entire `apps/web`) → **20 test files, 180 tests passed** (up from 173 before this ticket), **7 skipped** (pre-existing), **0 failures**.
- Typecheck: `pnpm run typecheck` (`tsc --noEmit`) → **0 errors**.
- Dev server boot: verified on a fresh port (`vite --port 5175`, since ports 5173/5174 were already occupied by prior tickets' still-running instances) — ready in 538ms, `HTTP 200`.

## 6. Real End-to-End Verification (Beyond Mocked Tests)

Two additional checks, deliberately going past what the ticket strictly required, since a CORS-shaped gap was found mid-ticket and warranted stronger proof than mocks alone:

1. **CORS negotiation on the newly-updated export route**, reproduced exactly as a browser would perform it (same method used throughout `NLE.VENDOR.SPIKE.4`/`BRIDGE.1`): preflight `OPTIONS` with `Origin: http://localhost:5173` → `204` with `access-control-allow-origin: http://localhost:5173` and matching headers; actual `GET` with the same `Origin` → `200` with the same CORS headers plus the real export JSON.
2. **A real, temporary (created and deleted within this ticket) Vitest test** ran `bootstrapMikaiProject` with an **unmocked `fetch`**, hitting the actual running MikAI dev server for sequence 30: result `{"clipCount":6,"hydratedCount":4}`, hydrated media ids `["mikai-shot-36","mikai-shot-37","mikai-shot-39","mikai-shot-38"]` — matching exactly the known real data for that sequence (4 approved shots with real video files, 2 missing shots correctly left as placeholders).

**What remains unobserved**: the same limitation disclosed in every prior OpenReel ticket — no browser automation tool is available in this environment, so the literal "click the link, watch the tab open, watch the toast appear, watch clips render" sequence was not visually performed by this agent. The two checks above are the strongest available substitute (real CORS protocol reproduction + real live-server fetch through the actual adapter code), consistent with the standard this whole ticket series has held to.

## 7. Manual Test Checklist (Ticket's Étape 8) — Status

| Check | Result |
|---|---|
| MikAI running at `localhost:3000` | ✅ confirmed, `/nle-prototype` returns 200 |
| Sidecar running at `localhost:5173` (or an available port) | ✅ confirmed booting cleanly |
| "Open in Advanced Editor" link present, correct URL | ✅ confirmed via curl on the rendered page |
| Export fetch succeeds (real network, real data) | ✅ confirmed via the temporary live test (Section 6) |
| Clips appear with correct data | ✅ confirmed programmatically (6 clips, correct metadata) — not visually rendered (Section 6) |
| Approved media loads | ✅ 4/4 approved shots hydrated with real, correctly-sized blobs |
| Missing shots stay placeholders | ✅ confirmed (2 shots with no `mediaUrl`, never fetched, `isPlaceholder: true`) |
| No CORS error | ✅ confirmed via exact protocol reproduction (Section 6.1) — not a literal browser DevTools observation |
| No crash | ✅ confirmed — all error paths (bad fetch, malformed export) throw cleanly and are caught by the hook's `.catch()`, never an unhandled exception |

## 8. Limits

- **Literal browser click-through not observed** (Section 6) — same standing limitation as the entire spike series; the underlying mechanics are proven via the strongest available substitutes.
- **No "Export to MikAI" UI yet** — this ticket is import-only; `NLE.OPENREEL.5` adds the send-patch-back flow and its own UI trigger.
- **`mikaiProjectId`/`mikaiSequenceId` query params are currently unused by the bootstrap** — present in the URL for readability/future use, not read by `bootstrapMikaiProject` today (it derives everything from the export body).
- **CORS allowlist is still the dev-only default** (`localhost:5173`/`127.0.0.1:5173`) — fine for local development, would need the `MIKAI_EDITOR_CORS_ORIGINS`/sidecar-URL env vars actually configured for any non-default port or a deployed sidecar.

## 9. Next Ticket Prompt

```text
NLE.OPENREEL.5 — Round-trip apply workflow

Tu es dans le projet MikAI Production Lab, mais ce ticket travaille
principalement sur le repo sidecar :

F:/AI/mikai-openreel-sidecar

Mode : Autonomie contrôlée, changement MikAI minimal si nécessaire.

Contexte :
Le sidecar sait maintenant importer un export MikAI automatiquement
via un lien (NLE.OPENREEL.4) et générer un patch timing depuis son
état édité (NLE.OPENREEL.3). Il ne reste qu'à connecter les deux :
envoyer réellement ce patch à MikAI.

Objectif :
1. Côté sidecar : ajouter un appel réseau (fetch) vers
   POST /api/projects/{projectId}/sequences/{sequenceId}/
   editorial-timing-patch avec { mode: "validate" }, puis si valide
   { mode: "apply" } — MikAI accepte déjà ce contrat
   (editorialTimingPatch.ts, aucune modification MikAI nécessaire a
   priori).
2. Ajouter un déclencheur UI minimal ("Export to MikAI" ou
   équivalent) qui appelle buildMikaiTimingPatchFromOpenReelProject
   sur l'état courant puis envoie le patch.
3. Gérer le retour validate (erreurs affichées via le système de
   toast déjà en place) avant d'autoriser l'apply.
4. Vérifier CORS pour cette route POST (probablement déjà couvert par
   editorSidecarCors.ts, mais à confirmer — cette route n'a
   peut-être pas encore de CORS scoped, à vérifier avant de coder le
   fetch).

Contraintes absolues : identiques à toute la série (pas de migration,
pas de schema, pas de package ajouté à MikAI, pas de vendoring, aucune
modification /editorial ou /nle-prototype au-delà d'un lien retour
éventuel, aucun fichier MikAI modifié hors CORS potentiel + docs/).

Livrable : commit+push sidecar, éventuel petit changement MikAI (CORS
sur editorial-timing-patch si manquant), rapport Markdown dans MikAI
docs/, test manuel ou reproduction curl du round-trip complet.
```

## 10. Confirmations

- Aucune migration, aucun schema DB, aucun fichier drizzle, aucun package npm ajouté à MikAI, aucune modification `package.json`/`package-lock.json`.
- Aucune modification ComfyUI/generation/job runner/polling.
- Aucune refonte de `/nle-prototype` — un seul lien ajouté à sa `PageHeader`.
- Aucune modification `SequencePreviewPlayer`.
- Aucun runtime DB/uploads/outputs/storage committé.
- Aucun code OpenReel copié dans le repo MikAI ; tous les changements sidecar vivent exclusivement dans `F:/AI/mikai-openreel-sidecar`.
