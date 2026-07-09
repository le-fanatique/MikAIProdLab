# NLE.VENDOR.SPIKE.2 — OpenReel Run and Project Load Spike

Status: real execution spike (install, dev server, and store-level test all actually run), no code vendored into MikAI, no MikAI application code modified. HEAD at time of writing: `ac39a40 — Add OpenReel sidecar feasibility spike`.

## 1. Goal

`docs/NLE_VENDOR_SPIKE_1_OPENREEL.md` reached **CONDITIONAL GO** on OpenReel as a sidecar editor candidate, based entirely on static source reading — the one unresolved item was "does the app actually boot," since `pnpm install` had been blocked by the harness's safety classifier in that ticket. This ticket has explicit authorization to run `pnpm install`/`pnpm dev` in the external clone and confirms (or invalidates) that GO with real execution: install, dev server boot, a real `loadProject`/`moveClip`/`trimClip` round-trip against the actual (unmocked) store code, and an empirical CORS check for the media-URL bridging plan.

## 2. OpenReel Clone State

- Path: `F:/AI/_vendor_spikes/openreel-video` (outside the MikAI repo, confirmed via `git status --short` from the MikAI repo showing no trace of it).
- Commit tested: `5711925` — `feat: enhance toolbar dropdown item styling for better accessibility and visibility` (shallow clone, `--depth 1`, so this is simply the tip of `main` at clone time from the prior ticket).
- Branch: `main`, tracking `origin/main`.
- `git status`: clean, no local modifications left over from this spike (the temporary test file used in Section 5 was created and deleted within `apps/web/src/stores/`, and confirmed absent afterward).

## 3. Install Result

- **Pre-install inspection** (per this ticket's security instructions): read root `package.json` and `pnpm-workspace.yaml` before installing. Root `package.json` declares `workspaces: ["apps/*", "packages/*"]`, `packageManager: "pnpm@9.0.0"`, and only ordinary scripts (`dev`, `build`, `build:wasm`, `test`, `lint`, `typecheck`, `clean`, plus two `gh issue/pr list` helpers) — **no `postinstall`/`preinstall`/`prepare` script** at the root. Also checked `apps/web/package.json` and `packages/core/package.json` directly and grepped all workspace `package.json` files for `postinstall`/`preinstall`/`prepare`: **zero matches anywhere in the workspace**. `build:wasm` (AssemblyScript → WASM) is a manual, separate script, not wired to install.
- **Command**: `npx --yes pnpm@9 install` (pnpm was not globally available in this environment and `corepack enable` failed with an `EPERM` on `C:\Program Files\nodejs\yarn` — no admin rights; `npx pnpm@9` resolves and runs fine without needing global install or admin rights).
- **Result**: **success.** `Scope: all 6 workspace projects`, 594 packages resolved/added, completed in **45.9s** (`Done in 45.9s using pnpm v9.15.9`).
- **Postinstall scripts that did run** (from third-party dependencies, not from OpenReel's own packages): `protobufjs` (postinstall, done), `esbuild@0.21.5`/`esbuild@0.17.19` (native binary install, done), `workerd` (Cloudflare Workers runtime binary install, done — pulled in transitively, likely via `wrangler`), `sharp@0.33.5` (native image library build, done), `core-js` (postinstall — prints a donation message, no code execution of concern). All standard, expected postinstalls for this stack (native binaries for esbuild/sharp, a workers runtime for the `wrangler` deploy tooling) — none are OpenReel-authored scripts, and none failed.
- **No Windows path-length problems this time** — the earlier `Filename too long` failure (from `NLE.VENDOR.A`) was in `git clone` itself (an `.xcuserstate` file inside the bundled Xcode project), already fixed via `git config --global core.longpaths true` before this ticket started; `pnpm install` itself never touched that path and had no issues.
- **No secrets, no cloud credentials, no `.env` file created or required for install.**

## 4. Dev Server Result

- **Command**: `npx --yes pnpm@9 dev` (root script forwards to `pnpm --filter @openreel/web dev`, which runs plain `vite`).
- **Result**: **booted successfully.** `VITE v5.4.21 ready in 752ms`, serving `http://localhost:5173/`. A `curl -o /dev/null -w "HTTP %{http_code}"` against that URL while the server was running returned **`HTTP 200`**.
- **No cloud dependency required to boot** — no `.env` file was created, no API keys configured, nothing beyond `pnpm dev`. Confirms the "GO if it starts without cloud keys" criterion from Section 5 of the ticket.
- **Warnings (non-blocking, cosmetic)**: `[baseline-browser-mapping] The data in this module is over two months old` and a `Browserslist: browsers data (caniuse-lite) is 8 months old` notice — both are routine "your dependency-freshness data is stale" warnings common to any Vite/browserslist project, not errors, not specific to OpenReel's own code.
- **Shutdown**: the server was intentionally terminated by this spike's own `timeout` wrapper (exit code 143 = SIGTERM, expected/self-inflicted) after confirming the HTTP 200 response — not a crash.
- **No browser UI was manually driven** (no browser automation tool is available in this environment, a limitation disclosed in every prior ticket in this project). Section 5 compensates for this by exercising the real, unmocked application store code directly via the project's own test runner, which is a stronger and more precise signal for "does the data layer actually work" than a manual click-through would have been, though it does not confirm the visual rendering layer.

## 5. Project Load Test

**Method**: OpenReel already ships `apps/web/src/stores/project-store.test.ts`, which imports the real `useProjectStore` (not mocked) and only mocks genuinely browser/IndexedDB/media-codec-only concerns (`auto-save`, `media-bridge`, `effects-bridge`, `transition-bridge`) — the exact same pattern used by OpenReel's own test suite for `loadProject`. This spike wrote one temporary test file, `apps/web/src/stores/mikai-spike.test.ts`, reusing that exact mocking pattern, then **deleted it immediately after running** (confirmed absent in Section 2). It was never committed to the OpenReel clone and is not present anywhere in the MikAI repo.

**Project built**: 1 track, 2 clips, each clip carrying `metadata: { mikaiProjectId: 4, mikaiSequenceId: 30, mikaiItemId: <1|2>, mikaiShotId: <36|37> }`, `startTime`/`duration`/`inPoint`/`outPoint` set from realistic MikAI-shaped values, and each clip's `mediaId` pointing at a `MediaItem` with `originalUrl` set to a `mikai`-shaped uploads URL and `isPlaceholder: true` (no local blob, matching how a real MikAI-sourced import would initially look before media is fetched).

**Result — real execution, not mocked**:
```
useProjectStore.getState().loadProject(mikaiProject);
```
`useProjectStore.getState().project` afterward: `id` = `"mikai-4-30"` ✅, 1 track ✅, 2 clips ✅, `clip-item-1.metadata` = `{"mikaiProjectId":4,"mikaiSequenceId":30,"mikaiItemId":1,"mikaiShotId":36}` — **exact match, nothing dropped or renamed by the store.**

**Answer to the ticket's explicit validation questions**:
- OpenReel accepts the `Project` — **confirmed**, no error, no rejection, no silent coercion.
- Clips appear in the store's live state (`project.timeline.tracks[0].clips`) — **confirmed**, both clips present with correct fields.
- MikAI metadata is not lost — **confirmed**, round-trips through `loadProject` byte-for-byte.

## 6. Move / Trim Test

Continuing in the same real (unmocked) test:

- **`moveClip("clip-item-2", 8.5)`** → `{ success: true, actionId: "d355626c-..." }`. Re-reading the store: `clip-item-2.startTime === 8.5` ✅, `metadata` still `{ mikaiItemId: 2, mikaiShotId: 37, ... }` unchanged ✅.
- **`trimClip("clip-item-1", 0.5, 4)`** → `{ success: true, actionId: "9ed67659-..." }`. Re-reading the store: `clip-item-1.inPoint === 0.5` ✅, `.outPoint === 4` ✅, `.duration` recalculated to `4` (consistent with `outPoint - inPoint`) ✅, `metadata` still `{ mikaiItemId: 1, mikaiShotId: 36, ... }` unchanged ✅.
- **`useProjectStore.getState().canUndo()`** → `true` after both operations — the action-history/undo system tracked both calls without erroring or losing state, satisfying "undo/redo ne casse pas le cas simple."
- Both action calls returned a structured `ActionResult` (`{ success, actionId }`) rather than throwing — consistent with the `Promise<ActionResult>` contract inferred (not confirmed) from static reading in the prior spike, now empirically confirmed.

## 7. MikAI Patch Generation Feasibility

Still within the same real test, after the move+trim above, the store's final state was read back and mapped directly into a `mikai-editorial-timing-patch-v1`-shaped object with **zero OpenReel modification**, using nothing beyond `Array.flatMap`/`.filter`/`.map` over `project.timeline.tracks[].clips[]`:

```json
{
  "schemaVersion": "mikai-editorial-timing-patch-v1",
  "sourceSchemaVersion": "mikai-editorial-export-v1",
  "projectId": 4,
  "sequenceId": 30,
  "createdAt": "2026-07-09T17:55:15.283Z",
  "items": [
    { "id": 1, "shotId": 36, "startSeconds": 0, "durationSeconds": 4 },
    { "id": 2, "shotId": 37, "startSeconds": 8.5, "durationSeconds": 2.7 }
  ]
}
```

This is **exactly** the shape `src/lib/editorial/editorialTimingPatch.ts`'s `validateEditorialTimingPatchShape` expects, field-for-field. Note item 1's `durationSeconds` came out as `4` (post-trim: `outPoint - inPoint`) rather than the original `5` — a faithful reflection of the trim, and a reminder that MikAI's `NLE.PLUGIN.SYNC` V1 import would currently **reject** this specific item (its own boundary: `durationSeconds` in the patch must match the *current* DB effective duration within an epsilon, and trim changes aren't accepted in V1) — not a spike failure, just confirmation that trim-driven duration changes are already known, deliberately out-of-scope for the existing patch importer, consistent with `NLE.PLUGIN.SYNC`'s own documented V1 boundary.

**Nothing essential is missing** — `id`, `shotId`, `startSeconds`, `durationSeconds` are all directly and losslessly recoverable from `Clip.metadata` + `Clip.startTime`/`duration` with no fork of OpenReel required.

## 8. Media URL Feasibility

- **`MediaImportService` accepts `File`/`Blob` only** — reconfirmed (unchanged from the prior spike; static reading, not re-verified by execution in this ticket, but nothing in this ticket's real testing contradicted it).
- **New empirical finding — CORS blocker**: MikAI's own `src/app/api/uploads/[...path]/route.ts` (read directly, not modified) sets `Content-Type`, `Content-Length`, `Accept-Ranges`, `Cache-Control` headers but **no `Access-Control-Allow-Origin` header anywhere**. Confirmed empirically:
  ```
  curl -sI "http://localhost:3000/api/uploads/shot-videos/shot-36/....mp4"
  → HTTP/1.1 200 OK
  → accept-ranges: bytes
  → cache-control: public, max-age=86400
  → content-length: 3356065
  → content-type: video/mp4
  → (no Access-Control-Allow-Origin)
  ```
  The request itself succeeds at the network level (curl doesn't enforce CORS — no browser is involved). But a **browser-side** `fetch()` call from OpenReel's origin (`http://localhost:5173`) to MikAI's origin (`http://localhost:3000`) to read the response body as a `Blob` **would be blocked by the browser's same-origin policy**, since the response carries no CORS opt-in header. `<video src="...">` playback across origins generally works without CORS, but `fetch()`-and-read-as-Blob (which `MediaImportService` requires) does not.
- **Is `fetch(mediaUrl) → Blob → File → MediaImportService` realistic?** Architecturally yes (per Section 8 of the prior spike, `addPlaceholderMedia`/`replacePlaceholderMedia` are a good fit) — but **not today, cross-origin, without a MikAI-side change**. Three realistic unblocking options, none implemented in this ticket:
  1. Add a scoped `Access-Control-Allow-Origin` header to MikAI's `/api/uploads/[...path]` route (smallest, most direct fix — a `src/` change, explicitly out of scope for this ticket, candidate for the next one).
  2. Run the OpenReel sidecar behind a local reverse proxy under the same origin as MikAI during development (avoids touching MikAI code, adds local infra complexity).
  3. Fetch media server-side instead of browser-side — not applicable to OpenReel's current architecture, which is a pure client-side Vite SPA with no backend of its own for this purpose.
- **Does `approvedVideoPath` need transforming to an absolute URL?** Yes — MikAI's own `refImageUrl()` helper already does this (relative `uploads/...` → `/api/uploads/...`), and the export contract already resolves this into `mediaUrl` (see `editorialExport.ts`). The adapter just needs to prefix MikAI's origin (`http://localhost:3000`) onto the already-relative `mediaUrl` before fetching cross-origin — a one-line adapter concern, not a blocker in itself; the CORS header is the actual blocker.

## 9. Risks / Blockers

- **CORS on MikAI's uploads route (Section 8)** — the one concrete, newly-discovered blocker in this spike. Small, well-understood, squarely a MikAI-side fix (adding one response header, scoped to a specific sidecar origin) — not an OpenReel architecture problem, not a fork requirement.
- **Store-level test, not a rendered-UI test** (Section 4) — this spike proves the data layer (`loadProject`/`moveClip`/`trimClip`/action history) works correctly under real execution, but did not visually confirm the React timeline UI renders a MikAI-sourced project correctly, since no browser automation tool is available in this environment. This is a materially smaller gap than "does it boot at all" (resolved), but still an open item before a human signs off on the UX itself.
- **`ActionValidator` internals** — still not read in full (unchanged from the prior spike); the two operations tested here (`moveClip`, `trimClip`) both succeeded cleanly, which is positive evidence but doesn't rule out edge-case rejections (e.g. overlapping clips, out-of-bounds trims) the validator might enforce differently from MikAI's own non-pass-through rules.
- All risks already flagged in `docs/NLE_VENDOR_SPIKE_1_OPENREEL.md` Section 9 (upstream drift, `migrateProject` no-op, KieAI bundle footprint, license compliance, scope-creep pressure) remain unchanged and are not repeated in full here.

## 10. Decision

```text
CONDITIONAL GO — exact blocker to resolve first:

Add CORS support (Access-Control-Allow-Origin, scoped to the sidecar's
local dev origin) to MikAI's /api/uploads/[...path] route so a
browser-side fetch() from the OpenReel sidecar can read media bytes
as a Blob for MediaImportService. This is the ONLY remaining blocker
identified across both spike tickets.

Everything else this ticket set out to confirm came back positive
via REAL execution (not just source reading): pnpm install succeeds
cleanly in ~46s with zero project-authored install hooks; pnpm dev
boots in under a second with zero cloud credentials; loadProject()
accepts a hand-built MikAI-shaped Project and preserves custom
metadata exactly; moveClip()/trimClip() both succeed, update the
correct fields, and preserve metadata; the undo system stays
consistent; and a fully valid mikai-editorial-timing-patch-v1 object
was mechanically reconstructed from the post-edit store state with
zero OpenReel modification required.

Once the CORS header is added (a small, MikAI-side, non-schema,
non-package change), this becomes a straight GO for building the
actual adapter (NLE.VENDOR.SPIKE.1's Section 8 fork-surface plan).
```

## 11. Next Ticket Prompt

```text
NLE.VENDOR.BRIDGE.1 — Enable CORS on MikAI uploads route for local sidecar fetch

Tu es dans le projet MikAI Production Lab.

Mode : Autonomie contrôlée, changement MikAI minimal et ciblé.

Contexte :
docs/NLE_VENDOR_SPIKE_2_OPENREEL_RUN.md a confirmé par exécution réelle
que OpenReel peut servir de sidecar editor pour MikAI (install, boot,
loadProject, moveClip, trimClip, génération de patch — tout fonctionne).
Le seul blocage restant : src/app/api/uploads/[...path]/route.ts ne
positionne aucun header Access-Control-Allow-Origin, ce qui empêche un
fetch() cross-origin depuis un sidecar local (ex: OpenReel sur
localhost:5173) de lire les bytes vidéo en Blob.

Objectif :
Ajouter un header CORS scoping strict (Access-Control-Allow-Origin
limité à une origine de dev locale explicite, ex: via une variable
d'environnement ou une liste blanche de localhost:PORT), uniquement
sur cette route de lecture de fichiers statiques, sans l'ouvrir à
n'importe quelle origine (*).

Contraintes absolues : pas de migration, pas de schema, pas de
package ajouté, pas de modification ComfyUI/generation, pas de
modification /editorial ou /nle-prototype, pas de CORS ouvert
globalement (scope strict à cette route et à une origine explicite).

Livrable : modification de src/app/api/uploads/[...path]/route.ts
uniquement (ajout des headers CORS appropriés + gestion OPTIONS si
nécessaire), test réel via curl -I avec un header Origin simulé pour
confirmer la présence du header en retour, build MikAI, aucune
régression sur /editorial ou /nle-prototype qui consomment aussi
cette route.

Rapport attendu : diff exact, résultat du test CORS, confirmation
build, confirmation aucune régression, git status final.
```
