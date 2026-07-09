# NLE.OPENREEL.2 — MikAI Export Import Adapter

Status: real code ported and hardened in the sidecar repo, real test suite passing, no MikAI application code modified. HEAD (MikAI) at time of writing: `6d73fce — Add OpenReel sidecar setup report`. Sidecar repo: `F:/AI/mikai-openreel-sidecar`, pushed to `https://github.com/le-fanatique/mikai-openreel-sidecar.git`.

## 1. Goal

Port the `mikaiToOpenReelProject.ts` adapter prototyped and proven functional in the throwaway spike clone (`NLE.VENDOR.SPIKE.3`) into the real, ongoing sidecar repository established in `NLE.OPENREEL.1` — not a copy-paste, but a hardened version fit for actual use: shape validation with clear errors instead of silent garbage-in/garbage-out, bounded-concurrency media fetching instead of fully sequential, retry-on-transient-failure, and a real, checked-in test suite instead of a one-off Vitest file deleted after each spike run.

## 2. What Changed (sidecar repo only — nothing in MikAI)

All work happened in `F:/AI/mikai-openreel-sidecar`, committed as `234ea73 — Add MikAI export import adapter with tests` (on top of `2f54770` from `NLE.OPENREEL.1`), pushed to `origin` (`https://github.com/le-fanatique/mikai-openreel-sidecar.git`).

Three new files, all under `apps/web/src/integrations/mikai/` (additive only — no existing OpenReel file, including `project-store.ts` and anything in `packages/core`, was touched):

- **`mikaiToOpenReelProject.ts`** — the adapter itself. Same field-for-field mapping proven in the spike (`export.project.id`/`sequence.id` → every clip's `metadata`, `item.id` → `metadata.mikaiItemId`, `shotId` → `metadata.mikaiShotId`, `startSeconds`/`durationSeconds` → `clip.startTime`/`duration`, `trimIn/OutSeconds` → `clip.inPoint`/`outPoint`, `mediaUrl` → `MediaItem.originalUrl`), with three real hardening changes over the spike version:
  1. **`assertValidMikaiExport()`** — a new structural validator (exported, with a dedicated `MikaiExportShapeError` class) that throws a specific, field-named error on the first structural problem found in an arbitrary input, rather than letting a malformed export silently produce a half-built or crashing `Project`. `buildProjectFromMikaiExport` now calls this before doing anything else.
  2. **`hydrateMikaiMediaBlobs()`** now uses **bounded concurrency** (default 3 simultaneous fetches, configurable) instead of the spike's fully sequential loop — a worker-pool pattern (`nextIndex`/`worker()`/`Promise.all`) rather than an unbounded `Promise.all` over every item at once, so a sequence with dozens of shots doesn't open dozens of simultaneous connections.
  3. **Single retry on network-level failure** (not on HTTP error statuses, which are treated as final) — a transient `fetch()` throw (e.g. a dropped connection) gets one automatic retry before being reported as a failure; an actual `404`/`500` response is reported immediately, since retrying won't fix a real server-side error.
- **`mikaiToOpenReelProject.test.ts`** — 15 real tests (not a spike script, checked in permanently): shape validation (5 tests: accepts well-formed input, rejects wrong `schemaVersion`, rejects missing `project`, rejects a numeric field missing on an item, rejects a non-object input); the pure builder (5 tests: track/clip/metadata mapping, relative→absolute `mediaUrl` resolution, placeholder handling for a shot with no media, `MediaItem` deduplication when the same shot appears in two clips, shape-error propagation on malformed input); media hydration (3 tests, with `global.fetch` mocked — deliberately *not* dependent on a live MikAI server, so this suite runs standalone/in CI: successful fetch + correct placeholder-skip, retry-then-succeed on a network error, HTTP-error-status reported without a retry); and `loadProject` against the **real, unmocked `project-store`** (2 tests: the adapter's `Project` loads correctly and preserves metadata; `moveClip` on a loaded MikAI clip preserves metadata and updates position) — same bridge-mocking pattern as OpenReel's own `project-store.test.ts` and the prior spike tests (only `auto-save`/`media-bridge`/`effects-bridge`/`transition-bridge` mocked; the store, action executor, and validator are real).
- **`__fixtures__/mikai-sequence-sample-export.json`** — a small, sanitized `mikai-editorial-export-v1` fixture (3 items: 2 approved shots with sample media paths, 1 missing shot with no media) modeled on the real sequence 30 export but with media paths replaced by `.../sample.mp4` placeholders — no secrets, no real filesystem paths, matching the same sanitization approach already used for `tools/editor-poc/sample-editorial-export.json` in the MikAI repo.

## 3. Test Results

```text
apps/web> npx vitest run src/integrations/mikai/mikaiToOpenReelProject.test.ts
✓ 15 tests passed (0 failed)
```

Three assertions in my first draft of the test file were wrong (not the adapter — the test's own expectations), caught immediately by the first run and fixed before considering this done:
- Expected `isPlaceholder: true` for a media item that *does* have a `mediaUrl` — backwards; `isPlaceholder` correctly reflects "no media source resolvable at all," which is `false` when a URL is present, even before any blob is fetched.
- Expected 2 unique media items from a 3-item fixture — miscounted; the fixture has 3 distinct shots (36, 37, 40), so `hydrateMikaiMediaBlobs` correctly processes 3.
- Expected every result in an HTTP-404 test to report `"HTTP 404"` — wrong; one of the 3 fixture items (shot 40) has no `mediaUrl` at all and is correctly never fetched, reporting `"no originalUrl"` instead, not a 404.

**Typecheck**: `pnpm run typecheck` (`tsc --noEmit`) on `apps/web` — **0 errors**.

**Full suite regression check**: `npx vitest run` (entire `apps/web` package, not just the new file) — **18 test files passed, 161 tests passed, 7 skipped** (pre-existing skips, unrelated to this change), **0 failures**. Confirms the new adapter files don't break anything else in OpenReel's own existing test suite.

## 4. Scope Discipline

Per this ticket's own instructions: **no UI was added** (menu item, button — that's `NLE.OPENREEL.4`) and **no patch-export code was added** (that's `NLE.OPENREEL.3`). This ticket is import-only: MikAI export JSON → OpenReel `Project` → loadable via the real `loadProject()`. No file under `packages/core` or any pre-existing file in `apps/web/src` (including `project-store.ts`'s existing methods) was modified — confirmed via `git status`/`git diff` in the sidecar repo before committing, only the three new files under `apps/web/src/integrations/mikai/` appear in the commit.

## 5. Risks

- **Adapter's local type mirror can drift from MikAI's real contract** — unchanged, already flagged in `NLE_VENDOR_SPIKE_3_OPENREEL_ADAPTER.md` Section 9; `MikAIEditorialExportV1` is duplicated by hand in the sidecar repo since it has no dependency on MikAI's source. The new `assertValidMikaiExport()` at least ensures a *drifted* export gets a clear error instead of a silently broken `Project`, but doesn't prevent the drift itself.
- **Retry logic is deliberately simple** — one retry, no exponential backoff, no jitter. Adequate for a handful of shots on localhost; would need hardening before this adapter is used against a slower or less reliable MikAI deployment.
- **Fixture is hand-written, not auto-generated from a live export** — kept in sync manually with the real `mikai-editorial-export-v1` shape; a future contract-drift test (comparing the fixture's shape against a live fetch) was suggested in the prior spike report but not implemented here (out of this ticket's scope).
- All risks already catalogued in `docs/NLE_VENDOR_DECISION_OPENREEL.md` Section 9 and `NLE_OPENREEL_1_SIDECAR_SETUP.md` Section 8 (upstream drift, `migrateProject()` no-op, KieAI bundle footprint, `ActionValidator` internals not fully read, scope-creep pressure) remain unchanged.

## 6. Next Ticket Prompt

```text
NLE.OPENREEL.3 — Add MikAI timing patch export

Tu es dans le projet MikAI Production Lab, mais ce ticket travaille
principalement sur le repo sidecar :

F:/AI/mikai-openreel-sidecar

Mode : Autonomie contrôlée, aucune modification MikAI hors docs/.

Contexte :
apps/web/src/integrations/mikai/mikaiToOpenReelProject.ts (commité,
poussé, testé — 15 tests passants) importe maintenant un export MikAI
réel vers un Project OpenReel chargeable. Ce ticket ajoute le sens
inverse : lire l'état du project-store après édition et produire un
objet mikai-editorial-timing-patch-v1 valide.

Objectif :
1. Créer apps/web/src/integrations/mikai/openReelToMikaiPatch.ts —
   fonction pure buildMikaiPatchFromProject(project): patch qui lit
   project.timeline.tracks[].clips[], filtre sur les clips ayant
   metadata.mikaiItemId, et produit { schemaVersion:
   "mikai-editorial-timing-patch-v1", sourceSchemaVersion:
   "mikai-editorial-export-v1", projectId, sequenceId, createdAt,
   items: [{id, shotId, startSeconds, durationSeconds}] }.
2. projectId/sequenceId doivent être lus depuis metadata.
   mikaiProjectId/mikaiSequenceId du premier clip trouvé (cohérent
   avec la décision de NLE.OPENREEL.2 de stocker ces valeurs sur
   chaque clip) — documenter le comportement si aucun clip ne porte
   ces metadata (Project non issu de MikAI).
3. Ajouter des tests réels (Vitest) : patch généré après un
   loadProject() + moveClip()/trimClip() réels (réutiliser le
   fixture existant __fixtures__/mikai-sequence-sample-export.json),
   vérifier que le patch produit est exactement conforme au schéma
   MikAI (comparer avec la logique de validation côté MikAI si
   possible sans dépendance croisée).
4. Ne pas encore envoyer le patch à MikAI via fetch/POST — ce sera
   NLE.OPENREEL.5.
5. Ne pas encore ajouter d'UI — ce sera NLE.OPENREEL.4.

Contraintes absolues : identiques à toute la série (pas de
migration, pas de schema, pas de package ajouté à MikAI, pas de
vendoring dans le repo MikAI, aucune modification /editorial ou
/nle-prototype, aucun fichier MikAI modifié hors docs/, aucune
modification du core OpenReel existant).

Livrable : commit + push dans le repo sidecar, rapport Markdown dans
MikAI docs/ résumant la fonction ajoutée, résultat des tests,
confirmation qu'aucun fichier MikAI n'a été modifié hors docs/.
```

## 7. Confirmations

- Aucun fichier MikAI (`src/`, schema, drizzle, package, ComfyUI/generation, `/editorial`, `/nle-prototype`) modifié.
- Aucun code OpenReel copié dans le repo MikAI.
- Tous les changements décrits ci-dessus vivent exclusivement dans `F:/AI/mikai-openreel-sidecar`, committés et poussés vers son propre `origin`.
