# NLE.OPENREEL.1 — MikAI OpenReel Sidecar Setup

Status: sidecar repository base established locally, no remote created (tooling gap, disclosed below), no code vendored into MikAI. HEAD at time of writing: `cce062f — Add OpenReel sidecar decision`.

## 1. Goal

First implementation step of the roadmap set out in `docs/NLE_VENDOR_DECISION_OPENREEL.md`: establish the real, MikAI-controlled base repository for the OpenReel sidecar — pinned to the exact upstream commit tested across four spike tickets — without yet adding any MikAI-specific integration code, and without vendoring any of it into the MikAI repo.

## 2. Final Browser CORS Check

Per this ticket's own gating instruction ("si le test échoue: s'arrêter, ne pas créer le repo sidecar"), and since this agent still has no browser automation tool available in this environment, the user was asked directly before proceeding. **The user confirmed they personally opened `http://localhost:5173` and ran the DevTools CORS fetch test themselves, and it succeeded** — closing the one remaining gap identified across `NLE.VENDOR.SPIKE.1` through `.4` (all of which reproduced the CORS negotiation via `curl` but could not perform the literal browser-console check). This is a user-reported result, not independently re-verified by this agent in this ticket — recorded here as the basis for proceeding, per the user's explicit confirmation gathered via `AskUserQuestion` before any repository action was taken.

With this, every item from `docs/NLE_VENDOR_DECISION_OPENREEL.md` Section 4 ("Remaining Manual Check") is now closed. The `CONDITIONAL GO` from that document is upgraded to an unconditional **GO** as of this ticket.

## 3. Sidecar Repository Decision

Confirmed with the user via `AskUserQuestion` before any external action:
- Repo name: `mikai-openreel-sidecar`
- Local path: `F:/AI/mikai-openreel-sidecar`
- Visibility: **private**
- Strategy: an **independent private repository** (not a public GitHub fork of `Augani/openreel-video`) — full commit history cloned, `origin` remote renamed to `upstream` so any future rebase/pull from OpenReel's actual source is a deliberate, explicit action rather than something a plain `git pull` would do accidentally.

## 4. Local Path

`F:/AI/mikai-openreel-sidecar` — confirmed distinct from the throwaway spike clone at `F:/AI/_vendor_spikes/openreel-video` (per this ticket's explicit instruction not to mix the two). The spike clone remains untouched, still available for future ad-hoc experiments; this new repo is the real, ongoing base going forward.

## 5. Upstream OpenReel Base

- Upstream project: `Augani/openreel-video` (MIT licensed).
- Upstream commit pinned: **`5711925`** — `feat: enhance toolbar dropdown item styling for better accessibility and visibility`.
- **Notable finding**: this is the exact same commit that was the tip of upstream `main` when first cloned in `NLE.VENDOR.A`, and it is **still the tip of upstream `main` today** — no drift has occurred across the entire spike series. The pin therefore currently costs nothing (there is nothing newer being deliberately excluded), but the pinning discipline (documented in the new repo's `MIKAI_SIDECAR.md`, reasoned from `ProjectSerializer.migrateProject()`'s no-op behavior) is now in place for when upstream does move.
- Full commit history was cloned (not a shallow `--depth 1` clone this time, unlike every spike clone before it) — this repo is meant to be the real ongoing base, and a full history makes any future rebase/cherry-pick against upstream possible without re-cloning.

## 6. Repository / Remote Status

- **Local git repo**: initialized (via full `git clone`), confirmed clean (`git status --short` empty after the commit below).
- **`upstream` remote**: `https://github.com/Augani/openreel-video.git` (renamed from the clone's default `origin`).
- **`origin` remote (the sidecar's own future home)**: **not created.** The `gh` CLI is not installed in this environment (`gh: command not found`), and this agent has no other tool to create or authenticate against a GitHub repository. Creating the actual private `mikai-openreel-sidecar` repository on GitHub and adding it as `origin` needs to be done manually — either by the user running `gh repo create mikai-openreel-sidecar --private --source=F:/AI/mikai-openreel-sidecar --remote=origin --push` (if `gh` is installed and authenticated on the user's machine) or by creating the empty private repo via the GitHub web UI and then running:
  ```bash
  cd F:/AI/mikai-openreel-sidecar
  git remote add origin <the-new-repo-url>
  git push -u origin main
  ```
- **Local commit added**: `2f54770 — Add MikAI sidecar setup notes (pinned to upstream 5711925)`, directly on top of the pinned `5711925`, on the `main` branch.

## 7. Files Added to Sidecar

Exactly one file, in the new sidecar repo (`F:/AI/mikai-openreel-sidecar`, **not** MikAI):

- **`MIKAI_SIDECAR.md`** — documents: the upstream base/commit and why it's pinned rather than tracked; the sidecar's objective and architecture diagram (MikAI data layer ↔ sidecar editing surface); the three MikAI HTTP contracts this sidecar will consume/produce (`editorial-export`, `/api/uploads` with its CORS scope, `editorial-timing-patch` and its V1 startSeconds-only boundary); local dev URLs; explicit non-modification rules for this first pass (no MikAI code yet, don't touch OpenReel's own core logic, leave KieAI dormant not deleted); and the same short roadmap from `docs/NLE_VENDOR_DECISION_OPENREEL.md`.

No adapter code, no integration code, and no other files were added in this ticket — per its own explicit "ne pas encore intégrer l'adapter... sauf si l'utilisateur l'autorise explicitement," which was not requested.

## 8. Risks

- **No GitHub remote yet** — the sidecar repo is fully prepared locally but has no remote home. This is a tooling gap (`gh` unavailable), not a decision gap; the exact commands to close it are documented in Section 6 and in the new repo's own git remote configuration (`upstream` already set, `origin` deliberately left for the user or a future `gh`-equipped ticket).
- **CORS check is user-reported, not independently re-verified** (Section 2) — consistent with how this exact limitation was handled throughout the spike series (this agent reproduces the CORS protocol via `curl` where it can, but the literal browser step has always required either strong indirect evidence or direct user confirmation; this ticket received the latter).
- All risks already catalogued in `docs/NLE_VENDOR_DECISION_OPENREEL.md` Section 9 (upstream drift, `migrateProject()` no-op, KieAI bundle footprint, `ActionValidator` internals not fully read, scope-creep pressure) remain unchanged and apply to this new repo going forward — `MIKAI_SIDECAR.md` restates the most actionable ones (pinning discipline, KieAI dormancy) directly in the sidecar repo itself so they travel with the code, not just this MikAI-side report.

## 9. Next Ticket Prompt

```text
NLE.OPENREEL.2 — Add MikAI export import adapter

Tu es dans le projet MikAI Production Lab, mais ce ticket travaille
principalement sur le repo sidecar :

F:/AI/mikai-openreel-sidecar

Mode : Autonomie contrôlée, aucune modification MikAI hors docs/.

Contexte :
Le repo sidecar est maintenant établi, pinné sur le commit OpenReel
5711925, avec MIKAI_SIDECAR.md documentant les contrats MikAI et les
règles de non-modification. L'adapter mikaiToOpenReelProject.ts a
déjà été prototypé et prouvé fonctionnel dans le clone de spike
jetable (F:/AI/_vendor_spikes/openreel-video/apps/web/src/integrations/
mikai/mikaiToOpenReelProject.ts, NLE.VENDOR.SPIKE.3) — ce ticket
consiste à porter proprement cet adapter (pas juste le copier tel
quel) dans le repo sidecar réel, avec une structure de fichiers
propre et testée.

Objectif :
1. Créer apps/web/src/integrations/mikai/ dans le repo sidecar.
2. Porter mikaiToOpenReelProject.ts (type MikAIEditorialExportV1,
   buildProjectFromMikaiExport, hydrateMikaiMediaBlobs) depuis le
   prototype de spike, en nettoyant/durcissant le code pour un usage
   réel plutôt qu'un spike (gestion d'erreur, concurrence de fetch
   limitée, pas de raccourcis).
3. Ajouter un test réel (Vitest, dans le style de
   project-store.test.ts déjà présent) qui charge un export MikAI
   réel (fixture JSON, pas de secret) et vérifie loadProject().
4. Ne pas encore ajouter d'UI (bouton, menu) — ce sera
   NLE.OPENREEL.4.
5. Ne pas encore implémenter l'export de patch — ce sera
   NLE.OPENREEL.3.

Contraintes absolues : identiques à toute la série NLE.VENDOR/
NLE.OPENREEL (pas de migration, pas de schema, pas de package ajouté
à MikAI, pas de vendoring dans le repo MikAI, aucune modification
/editorial ou /nle-prototype, aucun fichier MikAI modifié hors
docs/). Ne pas modifier le core OpenReel (packages/core,
project-store.ts existant) — uniquement des fichiers additifs dans
apps/web/src/integrations/mikai/.

Livrable : commit dans le repo sidecar (pas de push tant que le
remote origin n'existe pas, sauf si l'utilisateur l'a entre-temps
créé), rapport Markdown dans MikAI docs/ résumant ce qui a été
porté, résultat des tests, et confirmation qu'aucun fichier MikAI
n'a été modifié hors docs/.
```
