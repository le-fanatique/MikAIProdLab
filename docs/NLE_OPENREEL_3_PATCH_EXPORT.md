# NLE.OPENREEL.3 — MikAI Timing Patch Export

Status: real code added and tested in the sidecar repo, no MikAI application code modified. MikAI HEAD at time of writing: `9fdd011 — Add OpenReel export adapter report`. Sidecar repo: `F:/AI/mikai-openreel-sidecar`, pushed to `https://github.com/le-fanatique/mikai-openreel-sidecar.git`.

## 1. Goal

Add the inverse of `NLE.OPENREEL.2`'s import adapter: a pure function that reads an OpenReel `Project`'s live state (after the user has moved/trimmed clips) and produces a schema-valid `mikai-editorial-timing-patch-v1` object — the last piece needed before an actual network call to MikAI's `editorial-timing-patch` endpoint becomes possible (that call itself is `NLE.OPENREEL.5`, deliberately out of this ticket's scope).

## 2. Sidecar Files Added

All in `F:/AI/mikai-openreel-sidecar`, committed as `5a1d71a — Add MikAI timing patch export` (on top of `234ea73` from `NLE.OPENREEL.2`), pushed to `origin`.

- **`apps/web/src/integrations/mikai/openReelToMikaiPatch.ts`** — the new adapter. Exports `buildMikaiTimingPatchFromOpenReelProject(project, options?)`, returning `{ patch, warnings }`. Reads `mikaiProjectId`/`mikaiSequenceId`/`mikaiItemId`/`mikaiShotId` back off each clip's `metadata` (the same fields `NLE.OPENREEL.2`'s import adapter writes there), and `clip.startTime`/`clip.duration` for the timing values. No network call, no OpenReel core file touched — purely additive, reading `Project` as a plain object.
- **`apps/web/src/integrations/mikai/openReelToMikaiPatch.test.ts`** — 12 real tests, no live MikAI server or real media fetch required.
- **`MIKAI_SIDECAR.md`** (updated, not new) — added "Import flow" / "Patch export flow" sections with the concrete pipelines, a "Limits" section, and marked steps 1–3 of the roadmap done.

## 3. Patch Structure

```ts
{
  schemaVersion: "mikai-editorial-timing-patch-v1";
  sourceSchemaVersion: "mikai-editorial-export-v1";
  projectId: number;
  sequenceId: number;
  createdAt: string;
  items: Array<{
    id: number;
    shotId: number;
    startSeconds: number;
    durationSeconds: number;
  }>;
}
```

Exactly matches MikAI's own `MikAIEditorialTimingPatchV1` type in `src/lib/editorial/editorialTimingPatch.ts` — field-for-field, no extra fields on `items` (verified by a dedicated test asserting `Object.keys(patch.items[0])` is exactly `["durationSeconds", "id", "shotId", "startSeconds"]`, nothing more).

**Validation behavior** (mirrors MikAI's own server-side `editorialTimingPatch.ts`, which rejects a whole patch on any single invalid item rather than silently dropping it):
- A clip with **no MikAI metadata** (or an incomplete set of the four required fields) is **not an error** — it's silently excluded from `items` and reported as a non-fatal entry in the returned `warnings` array (e.g. a clip added natively in OpenReel after import, not originating from MikAI).
- A clip **with** MikAI metadata whose `projectId`/`sequenceId` **disagrees** with other MikAI-tagged clips in the same `Project` — **hard error**, throws `MikaiPatchBuildError`. A single `Project` should never mix two different MikAI sequences; if it does, something upstream already broke.
- A clip with an **invalid `startTime`** (non-finite or negative) or **invalid `duration`** (non-finite or ≤ 0) — **hard error**, throws `MikaiPatchBuildError`.
- **Zero** MikAI-tagged clips found at all — **hard error** (no `projectId`/`sequenceId` to build a patch envelope from).

## 4. Tests

```text
apps/web> npx vitest run src/integrations/mikai/openReelToMikaiPatch.test.ts
✓ 12 tests passed (0 failed)
```

Covers every point the ticket asked for: valid patch from two MikAI clips; `projectId`/`sequenceId` preserved; `itemId`/`shotId` preserved; `startTime → startSeconds`; `duration → durationSeconds`; extra OpenReel-only fields never leak into `items`; clips without MikAI metadata excluded with a warning (not an error); inconsistent metadata across clips throws; invalid `startTime` throws; invalid `duration` throws; a `Project` with zero MikAI-tagged clips throws; and a **real round-trip test** — `buildProjectFromMikaiExport` (the checked-in fixture) → real `loadProject()` → real `moveClip()` on the actual, unmocked `project-store` → `buildMikaiTimingPatchFromOpenReelProject` on the resulting live state → asserts the moved item's `startSeconds` reflects the edit while an untouched item's fields stay exactly as imported.

**Full-suite regression check**: `npx vitest run` (entire `apps/web` package) — **19 test files, 173 tests passed** (up from 161 before this ticket, +12 matching the new suite), **7 skipped** (pre-existing, unrelated), **0 failures**.

**Typecheck**: `pnpm run typecheck` (`tsc --noEmit`) — **0 errors**.

**Dev server boot**: verified via `vite --port 5174` (a separate instance from the throwaway spike clone's server, which was already occupying port 5173 from a prior ticket) — booted in 525ms, `HTTP 200` confirmed via curl. Confirms this sidecar repo's own `pnpm install` output still boots correctly after adding the new files.

## 5. Limits

- **No network call to MikAI yet** — `buildMikaiTimingPatchFromOpenReelProject` returns a plain in-memory object; nothing in the sidecar repo `fetch()`es or `POST`s it to `editorial-timing-patch` yet. That's `NLE.OPENREEL.5`, per this ticket's explicit constraint ("Ne pas ajouter d'appel réseau vers MikAI dans ce ticket").
- **No UI** — no button/menu to trigger export exists yet (`NLE.OPENREEL.4`).
- **Trim/duration round-trip intentionally not attempted** — `durationSeconds` is included in the patch (required by MikAI's schema) but MikAI's own V1 importer only ever writes `startSeconds` server-side; sending a patch with a changed `durationSeconds` from a trim edit would currently be rejected by MikAI's own validator (a pre-existing, deliberate boundary from `NLE.PLUGIN.SYNC`, not something this ticket works around).
- **Type mirrors remain hand-maintained** — both `MikAIEditorialExportV1` and the patch type are local copies of MikAI's real contracts (no cross-repo dependency, per every prior ticket's constraint); must be kept in sync manually if MikAI's contracts change.

## 6. Next Ticket Prompt

```text
NLE.OPENREEL.4 — Add "Open in Advanced Editor" link from MikAI

Tu es dans le projet MikAI Production Lab. Ce ticket touche À LA FOIS
MikAI (un lien UI) et le repo sidecar (accepter l'export MikAI via
une route/paramètre d'URL).

Mode : Autonomie contrôlée, changement MikAI minimal.

Contexte :
Le sidecar (F:/AI/mikai-openreel-sidecar) sait maintenant importer un
export MikAI (NLE.OPENREEL.2) et générer un patch timing depuis son
état (NLE.OPENREEL.3), mais tout se déclenche manuellement (console/
test). Ce ticket ajoute un point d'entrée UI minimal des deux côtés.

Objectif côté MikAI (changement limité) :
Ajouter un lien "Open in Advanced Editor" quelque part de pertinent
(probablement /nle-prototype, qui reste le point de référence gelé,
ou la page editorial) pointant vers le sidecar local
(http://localhost:5173/?mikaiProjectId=X&mikaiSequenceId=Y ou
équivalent) — décider du format exact d'URL avec le sidecar.

Objectif côté sidecar :
Lire les query params au démarrage, appeler GET editorial-export sur
MikAI avec ces IDs, exécuter le pipeline d'import déjà existant
(mikaiToOpenReelProject.ts), et charger le résultat dans l'app au
démarrage.

Contraintes absolues : identiques à toute la série (pas de migration,
pas de schema, pas de package ajouté à MikAI, pas de vendoring, pas de
modification /editorial ou /nle-prototype au-delà d'un lien, aucun
fichier MikAI modifié hors ce lien + docs/).

Livrable : lien ajouté côté MikAI (diff minimal), code de lecture
d'URL + déclenchement d'import côté sidecar (commit+push sidecar),
rapport Markdown dans MikAI docs/.
```

## 7. Confirmations

- Aucun fichier MikAI (`src/`, schema, drizzle, package, ComfyUI/generation, `/editorial`, `/nle-prototype`) modifié.
- Aucun code OpenReel copié dans le repo MikAI.
- Tous les changements décrits ci-dessus vivent exclusivement dans `F:/AI/mikai-openreel-sidecar`, committés (`5a1d71a`) et poussés vers son propre `origin`.
