# MikAI Workspace Architecture Audit

`UX.WORKSPACES.AUDIT.1` — read-only audit. No application code, schema,
migration, dependency, or runtime file was modified to produce this report.

Date: 2026-07-15.

## 0. Method and evidence

- Source read directly: every `page.tsx` under
  `src/app/projects/[projectId]/`, and the components they mount
  (`RightPanel`, `Sidebar`, `ContextStrip`, `SequenceTimelineEditor`,
  `EditorialWorkspace`, `EditorialTimeline`, `EditorialShotList`,
  `NlePrototypeWorkspace`, `SequencePreviewPlayer`,
  `VideoFrameReviewPlayer`, `SequencesGenerationPanel`,
  `ShotGenerationPanel`, `GeneratedOutputsPanel`,
  `InsertShotFromEditorialButton`, `PublishBasicSequenceResultButton`,
  `SequenceResultActionForm`).
- `rg`/`grep` exhaustive search of `/story`, `/outline`, `/editorial`,
  `/nle-prototype`, `storyboard`, and sequence-level video-generation
  terms (`generateSequenceVideo`, `sequence.*video`) across `src/`.
- Read `docs/ROADMAP.md`, `docs/PROJECT_STATE.md`,
  `docs/SEQUENCE_LEVEL_SEEDANCE_DRAFT.md`,
  `.claude/skills/ux-audit/SKILL.md`.
- SSR read-only evidence: dev server started, `curl` against
  `/projects/2/sequences/2`, `/projects/2/sequences/2/editorial`,
  `/projects/2/sequences/2/nle-prototype`, and
  `/projects/2/sequences/2/shots/3` — all HTTP 200, no error markers.
  Server stopped and port confirmed free before writing this report;
  `git status` confirms no `src/` file changed during the audit.
- No pilotable browser is available in this environment (standing
  limitation across every ticket in this session) — visual density,
  spacing, and actual scroll length were assessed from source and
  rendered HTML, not from screenshots.

## 1. Executive summary

MikAI already contains almost every capability the three target
workspaces need. The gap is not missing features — it is that **Sequence
Detail is currently one monolithic page carrying all three workspaces'
responsibilities at once**: narrative/production (shots table, casting,
sequence prompt, LLM assist), montage (Editorial Actions, Sequence
Result player, Timeline, `Insert Shot Here` buttons embedded in the shots
table), and the OpenReel hand-off. `/editorial` has already been
intentionally narrowed to "advanced trim & fallback controls" in a past
ticket (`EDITORIAL.UX.1`, self-documented in the page's own comment) —
that precedent is exactly the right shape for this ticket's approach:
narrow pages to one workspace's concern and link explicitly between
them, without deleting anything.

Two genuinely new things do **not** exist yet and must be built, not
reorganized: a **Storyboard grid** (thumbnail-per-shot overview) and any
**sequence-level Seedance video generation** (`SEQGEN.1`'s prerequisite
UI). One route is orphaned: `/nle-prototype` is reachable by direct URL
but is no longer linked from any page — it still renders (HTTP 200) but
is dead navigation weight.

Recommended target: keep all existing routes (no deletion), regroup
Sequence Detail's sections under explicit workspace headers reachable
from one Sequence-level entry point, and treat Storyboard/SEQGEN as new
capability to add to the Production/Storyboard Workspace rather than a
migration of existing code.

## 2. Inventaire des routes, composants et actions

### Story Workspace (niveau Project → Story/Outline)

| Route | Rôle actuel |
|---|---|
| `/projects/[id]/story` | Entrée principale : Story Foundation, Story Generation, Outline (inline `OutlineEditorForm` + `OutlineGenerationPanel` + lien secondaire), Production Structure (liste Sequences + génération de shots par séquence), Assets (extraction/enhance), Casting Coverage. |
| `/projects/[id]/outline` | Vue secondaire : Story Context (résumé + lien retour), Project Outline Editor, Generate Outline Draft, Sequence Builder, Sequence Structure (édition par séquence via `SequenceContextEditor` + suppression). Seule capacité non dupliquée dans Story. |
| `/projects/[id]` (Project Detail) | Overview, Sequences, Assets, Production (carte Story Workspace + lien secondaire Outline Builder), Film Result. |

Composants clés : `StoryFoundationEditor`, `StoryGenerationPanel`,
`OutlineEditorForm`, `OutlineGenerationPanel`, `SequencesGenerationPanel`,
`SequenceContextEditor` (édition, `/outline` uniquement),
`SequenceShotsLLMAssistPanel`, `AssetsLLMExtractPanel`,
`BatchAssetDescriptionEnhancePanel`, `CastingSuggestionsPanel` (aperçu
couverture, pas l'outil complet — voir Production).

État après `UX.3.STORY.OUTLINE.1` (déjà livré, committé `e0da181`) :
Story Workspace est déjà la carte primaire partout, Outline Builder est
déjà un lien secondaire explicite avec breadcrumb `Story Workspace >
Outline Builder`. **Cette partie du travail de hiérarchisation est
terminée** — ce présent audit ne la rouvre pas.

### Production / Storyboard Workspace (niveau Sequence/Shot/Génération)

| Route | Rôle actuel |
|---|---|
| `/projects/[id]/sequences/[sid]` (Sequence Detail) | **Page unique et dense** : Editorial Actions (Publish Basic, Open in Advanced Editor, Export Editorial JSON), Sequence Result (player + Previous Results repliés), Context (mood/purpose/location, éditable), Shots (table avec `Insert Shot Here` — action éditoriale — après chaque ligne), Timeline (`SequenceTimelineEditor`, durées uniquement, lien vers Editorial pour trim avancé), Production (Casting Suggestions repliable, Assets assignés, Sequence Prompt, LLM Assist génération de shots). |
| `/projects/[id]/sequences/[sid]/shots/[shotId]` (Shot Detail) | Approved Output, Narrative Context, Continuity/Camera repliés, Casting, Prompt Workspace (Composer/Compiler/Shot Prompt/Timeline/Segment Timeline Preview), References repliées, Generation (Generation Jobs replié). |
| `/projects/[id]/sequences/[sid]/shots/[shotId]/workflows` puis `/workflows/[wfId]/generate` | Sélection de workflow ComfyUI puis génération par Shot — seul point d'entrée de génération vidéo/image existant aujourd'hui, **au niveau Shot uniquement**. |
| `/projects/[id]/sequences/new`, `/shots/new`, `/edit` | CRUD standard, hors périmètre workspace. |

Composants clés : `SequenceTimelineEditor` (durées, simple),
`InsertShotFromEditorialButton` (action éditoriale insérée dans la table
Shots narrative), `CastingSuggestionsPanel`, `SequenceAssetsPanel`,
`SequencePromptForm`, `WorkflowSelectorPanel` /
`WorkflowRuntimeMappingPanel` / `WorkflowGenerateActions` /
`GenerationJobStatusPanel` / `GeneratedOutputsPanel` (génération et
sortie **par Shot**, jamais par Sequence).

**Ce qui n'existe pas** (recherche `rg` exhaustive, zéro résultat
applicatif) :
- Grille storyboard (vignette par Shot, image ou vidéo approuvée) — le
  mot "storyboard" n'apparaît que comme rôle de référence
  (`src/lib/referenceImageRoles.ts`) et dans un prompt système, jamais
  comme vue de grille.
- Toute génération vidéo Seedance **au niveau Sequence**
  (`SequencesGenerationPanel` ne génère que du texte LLM — titres/
  résumés de séquences depuis l'Outline — pas de vidéo).
- Détection/validation de splits, mapping segment→shot, ou push de clip
  vers un shot existant. `attachOutputAsShotReference` (dans
  `GeneratedOutputsPanel`) est le seul pattern "sortie de génération →
  rattachée à un shot" déjà en place, et c'est le bon gabarit à réutiliser
  pour `SEQGEN.PUSH.1` plutôt que d'inventer un nouveau mécanisme.

### Editorial Workspace

| Route | Rôle actuel |
|---|---|
| `/projects/[id]/sequences/[sid]/editorial` | **Déjà volontairement réduit** (commentaire `EDITORIAL.UX.1` dans le code source) : bannière explicite "Most editorial actions have moved to the Sequence page. This page provides advanced trim-in/out and fallback controls." Contenu : `EditorialWorkspace` (Timeline gap-aware + `SequencePreviewPlayer` partageant la sélection), puis Shot Order & Fallback Controls (`EditorialShotList`). |
| `/projects/[id]/sequences/[sid]/nle-prototype` | **Route orpheline.** Toujours fonctionnelle (HTTP 200 confirmé), mais plus aucun lien entrant dans `src/` (recherche exhaustive : seule occurrence restante est une référence en commentaire dans Sequence Detail, pas un lien actif). Documentée comme "secondary/debug" dans `docs/PROJECT_STATE.md`. Utilise `NlePrototypeWorkspace` + `NlePrototypeTimeline`, un troisième système timeline/preview parallèle à celui d'Editorial. |
| OpenReel Bridge (Advanced Editor) | Accessible directement depuis Sequence Detail (`Open in Advanced Editor`, `Export Editorial JSON`) — ne passe plus par `/nle-prototype` (même commentaire `EDITORIAL.UX.1` confirme que ce lien direct a remplacé le détour par cette page). |

Players en présence :
- `SequencePreviewPlayer` — lecture *item-driven* (liste ordonnée de
  shots/gaps), utilisé uniquement dans `EditorialWorkspace` et
  `NlePrototypeWorkspace`. Pas de capture de frame, pas d'export
  référence.
- `VideoFrameReviewPlayer` — lecteur frame-aware avec capture de frame
  vers Shot/Asset (`captureVideoFrame`), audio (`PLAYER.AUDIO.1`),
  utilisé pour Sequence Result (Sequence Detail), Film Result et Shot
  Detail (Approved Output). C'est le lecteur "produit fini/output
  approuvé", pas un outil de montage multi-items.

Ces deux lecteurs répondent à des besoins différents (playlist multi-item
avec sélection partagée vs. revue frame-précise d'un seul fichier vidéo
avec capture) — ce n'est pas un doublon accidentel, mais leur coexistence
n'est documentée nulle part. Voir section 4.

## 3. Matrice capacité → surface actuelle → workspace cible

| Capacité | Surface(s) actuelle(s) | Workspace cible | Statut |
|---|---|---|---|
| Pitch, Story Foundation | `/story` | Story | OK, déjà en place |
| Outline (édition inline + builder) | `/story` + `/outline` | Story | OK, hiérarchisé (`UX.3.STORY.OUTLINE.1`) |
| Sequence Structure (création/suppression, contexte narratif) | `/story` (lecture + génération), `/outline` (édition + suppression) | Story | OK, split assumé (voir doublons) |
| Assets (extraction, enhance) | `/story`, `/assets` | Story | OK |
| Casting (suggestions, coverage) | `/story` (aperçu coverage), Sequence Detail (`CastingSuggestionsPanel` complet) | Story (aperçu) + Production (outil) | Split existant, cohérent |
| Overview Sequences/Shots | Sequence Detail (table) | Production/Storyboard | Présent mais tabulaire, pas grille |
| Grille storyboard (vignette) | **Aucune** | Production/Storyboard | À construire |
| Ouverture Shot Detail depuis une cellule | Table Sequence Detail (lien titre) | Production/Storyboard | Présent (table), à porter en grille |
| Timeline de Sequence (durées) | Sequence Detail (`SequenceTimelineEditor`) | Production/Storyboard | OK |
| Timeline avancée (trim, gaps) | `/editorial` (`EditorialTimeline`) | Editorial | OK, déjà séparé |
| Verrouillage des durées | `SequenceTimelineEditor` (Apply) | Production/Storyboard | OK |
| Génération Seedance niveau Sequence | **Aucune** | Production/Storyboard | À construire (`SEQGEN.1`) |
| Détection/validation des splits | **Aucune** | Production/Storyboard | À construire (`SEQGEN.SPLIT.1`) |
| Push clips vers Shots | **Aucune** dédiée ; pattern voisin `attachOutputAsShotReference` | Production/Storyboard | À construire (`SEQGEN.PUSH.1`), réutiliser le pattern |
| Génération/outputs existants (par Shot) | Shot Detail → Workflows → Generate | Production/Storyboard (accès) + Shot Detail (détail) | OK |
| Sélecteur de Sequence en haut (Editorial) | **Absent** — Editorial n'a pas de sélecteur, seulement un lien retour vers la Sequence | Editorial | Écart réel, voir section 6 |
| Player actuel Editorial | `SequencePreviewPlayer` (item-driven, pas de capture frame) | Editorial | Écart potentiel vs `VideoFrameReviewPlayer` — voir section 4 |
| Timeline + Shot Order/Fallback | `/editorial` | Editorial | OK, déjà isolé |
| Liste de Shots + navigation vers un Shot dans le player | `EditorialShotList`, `EditorialWorkspace` (sélection partagée) | Editorial | OK |
| Editorial Actions (Publish, Advanced Editor, Export JSON) | Sequence Detail | Editorial (conceptuellement) mais hébergé sur Sequence Detail | Écart de placement, voir section 5 |
| Passage vers OpenReel Advanced | Sequence Detail (lien direct) | Editorial | Présent mais pas sur une page "Editorial" | Écart de placement |
| `/nle-prototype` | Route orpheline | Aucun (à documenter, pas à supprimer dans ce ticket) | Dette identifiée |

## 4. Doublons et risques de fusion

### 4.1 Deux timelines de séquence (risque faible — déjà séparées par intention)

`SequenceTimelineEditor` (durées, Sequence Detail) et `EditorialTimeline`
(trim + gaps, `/editorial` via `EditorialWorkspace`) sont deux
composants distincts avec des responsabilités différentes et des actions
serveur différentes (`updateSequenceShotDurations` vs
`updateEditorialItemTrim`/`updateShotTrim`/`resetAllEditorialItemTrims`).
Ce n'est pas un doublon accidentel — c'est une séparation volontaire
(durée simple pour la production, trim avancé pour le montage) déjà
documentée. **Recommandation : conserver la séparation**, mais la rendre
explicite par le nommage des workspaces plutôt que par leur position sur
une même longue page.

### 4.2 Trois systèmes de preview/timeline en réalité (risque réel)

En comptant `NlePrototypeWorkspace`/`NlePrototypeTimeline`, il existe
un **troisième** système parallèle à `EditorialWorkspace`/
`EditorialTimeline`, plus proche architecturalement du second que du
premier (les deux utilisent `SequencePreviewPlayer` et
`buildEditorialDocument`/`deriveEmptySpaces`). `/nle-prototype` n'étant
plus lié nulle part, il ne cause pas de confusion utilisateur actuelle
(personne ne peut y arriver en cliquant), mais il constitue une dette de
maintenance : deux implémentations de la même idée à garder synchronisées
si l'une évolue. **Recommandation : ticket dédié `EDITORIAL.PROTOTYPE.RETIRE.1`
pour trancher (fusion utile ou suppression), hors périmètre de ce
ticket-ci** (aucune suppression de route n'est autorisée ici).

### 4.3 `Insert Shot Here` dans la table narrative de Sequence Detail (risque de confusion réel)

`InsertShotFromEditorialButton` apparaît entre chaque ligne de la table
"Shots" sur Sequence Detail, qui est par ailleurs une vue narrative/
production (titre, action pitch, caméra, durée — pas de trim, pas de
statut éditorial). Le bouton crée un vrai Shot narratif (pas un item
éditorial) via `insertShotInSequenceFromEditorialContext`, donc il n'est
pas fonctionnellement "mal placé" — mais visuellement, une action
étiquetée "Editorial" s'intercale dans une liste de production. C'est
exactement le type de recouvrement que ce ticket doit signaler.
**Recommandation : documenter clairement, dans la Production/Storyboard
Workspace cible, que "Insert Shot Here" reste une action de production
(création de shot), pas de montage — renommer si besoin dans un futur
ticket d'implémentation (`Add Shot Here` ou équivalent), sans toucher à
l'action serveur.**

### 4.4 Deux players avec des rôles différents mais non documentés (risque moyen)

Voir section 2 — `SequencePreviewPlayer` (montage multi-item) et
`VideoFrameReviewPlayer` (revue frame-précise d'un output unique avec
capture). Le ticket demande explicitement d'évaluer "la faisabilité du
passage à `VideoFrameReviewPlayer`" pour Editorial. **Constat : ce
n'est pas un remplacement direct** — `VideoFrameReviewPlayer` n'a pas de
notion de playlist/items ordonnés ni de sélection partagée avec une
timeline à items multiples (gaps compris), qui sont le cœur de
`SequencePreviewPlayer`/`EditorialTimeline`. Faire porter à
`VideoFrameReviewPlayer` la capture de frame *à l'intérieur* du montage
(ex: extraire un frame depuis n'importe quel point de la timeline
éditoriale, pas seulement du résultat publié) est une extension
plausible et désirable, mais c'est un ticket de fusion de capacités
(ajouter la capture frame à la lecture item-driven, ou l'inverse), pas
un simple remplacement de composant. **Recommandation : le traiter comme
ticket dédié `EDITORIAL.PLAYER.UNIFY.1`, après ce lot Story/Production/
Editorial, avec une maquette explicite des deux modes à fusionner.**

### 4.5 Story ↔ Outline (déjà résolu)

Documenté pour mémoire seulement : `UX.3.STORY.OUTLINE.1` a déjà réglé la
hiérarchie Story (primaire) / Outline Builder (secondaire, édition fine
par séquence). Rien à refaire ici.

## 5. Proposition de navigation et de granularité

Principe directeur : **ne fusionner aucune route**, clarifier la
hiérarchie par la navigation et le regroupement visuel — même stratégie
que celle validée sur `UX.3.STORY.OUTLINE.1`.

1. **Story Workspace** : inchangé (déjà conforme à la cible).
2. **Production/Storyboard Workspace** : Sequence Detail (`/sequences/
   [sid]`) devient l'entrée du workspace. Réorganiser ses sections sous
   deux groupes visuellement distincts au lieu d'un flux plat unique :
   - **Montage** (Editorial Actions, Sequence Result, Timeline durées) —
     reste sur cette page mais regroupé et clairement étiqueté, avec un
     lien explicite "Open Editorial Workspace →" vers `/editorial` pour
     le travail de montage avancé (déjà existant, à rendre plus visible).
   - **Production** (Context, Shots, Casting, Assets, Sequence Prompt,
     LLM Assist) — section existante, à laquelle s'ajoute la future
     grille Storyboard (nouvelle sous-section, avant ou à la place de la
     table Shots actuelle — décision produit, voir questions ouvertes).
3. **Editorial Workspace** : `/editorial` reste l'entrée dédiée. Ajouts
   proposés (pas dans ce ticket) : un sélecteur de Sequence en haut de
   page (actuellement absent — l'utilisateur doit revenir à Sequence
   Detail pour changer de séquence), et une mise en avant plus nette du
   passage OpenReel Advanced (aujourd'hui uniquement sur Sequence
   Detail, pas sur Editorial lui-même).
4. **Navigation transverse** : `Sidebar`/`ContextStrip`/`RightPanel`
   n'exposent aujourd'hui qu'un seul lien "Story" au niveau Project, et
   aucun onglet dédié au niveau Sequence (`ContextStrip` retourne `null`
   en contexte Sequence sans Shot). Ce point est cohérent avec
   l'objectif "ne pas mélanger" — **aucun changement requis ici**, sauf
   si un futur ticket décide d'ajouter un onglet "Editorial" visible
   depuis Sequence Detail en plus du lien texte existant.

## 6. Wireframe textuel des trois workspaces

### Story Workspace (`/projects/[id]/story`) — inchangé, pour référence

```
[Breadcrumb: Projects / {project} / Story Workspace]
[PageHeader: Story Workspace ................ Edit Project]

┌ Story Foundation ───────────────────────────────────────┐
│ Pitch / Story / Description (StoryFoundationEditor)     │
└───────────────────────────────────────────────────────────┘
Story Generation (StoryGenerationPanel)

── Outline ──────────────────────────────────────────────
┌───────────────────────────────────────────────────────────┐
│ Outline text (OutlineEditorForm)                          │
│ Generate Outline Draft (OutlineGenerationPanel)            │
│ Open Outline Builder →                                     │
└───────────────────────────────────────────────────────────┘

── Production Structure ── (N sequences · M shots)
Generate Sequences (SequencesGenerationPanel)
[Sequence card ×N: title, summary, mood/purpose/location,
 shot count, cast badge, shot list, ▸ Generate Shots]

── Assets ──
[type counts] .......................... Open Assets →
▸ Extract Asset Drafts
▸ Batch Enhance Asset Descriptions

── Casting Coverage ── (si shots existent)
X/Y shots cast .......................... [badge]
```

### Production / Storyboard Workspace (`/projects/[id]/sequences/[sid]`) — cible

```
[Breadcrumb: Projects / {project} / {sequence}]
[PageHeader: {sequence} .............. Edit · Delete]

── Montage ──────────────────────────── Open Editorial Workspace →
┌ Editorial Actions ───────────────────────────────────────┐
│ Publish Basic Result · Open in Advanced Editor · Export   │
└───────────────────────────────────────────────────────────┘
┌ Sequence Result ─────────────────────────────────────────┐
│ [VideoFrameReviewPlayer or fallback video]                │
│ Source · Status · Duration · Published                    │
└───────────────────────────────────────────────────────────┘
▸ Previous Results (N)

── Production ───────────────────────────────────────────
┌ Context (mood/purpose/location) — si renseigné ──────────┐
└───────────────────────────────────────────────────────────┘

┌ Storyboard ─────────────────────────────────────── (NEW) ┐
│ [grid: thumbnail per shot, code, title, duration,         │
│  approved/generating/empty status] → click opens Shot     │
│  Detail. Existing "Shots" table remains available as a    │
│  list-view toggle, not replaced.                          │
└───────────────────────────────────────────────────────────┘

┌ Generate Sequence Video ─────────────────────────── (NEW, SEQGEN.1) ┐
│ Compile shot prompts → sequence package → optional         │
│ storyboard keyframes → Generate (Seedance)                 │
└───────────────────────────────────────────────────────────┘
[after generation, SEQGEN.SPLIT.1] Review Splits panel:
  expected N shots · detected M segments · confidence
  [thumbnail | duration | mapped shot ▾ | merge/split/reject]
  Confirm Push → (SEQGEN.PUSH.1) attaches candidate clips to
  shots via the existing "generated output → attach" pattern.

Timeline (durations, lock) — SequenceTimelineEditor, unchanged
▸ Casting Suggestions
Assets (SequenceAssetsPanel)
Sequence Prompt
LLM Assist (shot generation from sequence prompt)

← Back to {project}          ↑ Story Workspace
```

### Editorial Workspace (`/projects/[id]/sequences/[sid]/editorial`) — cible

```
[Breadcrumb: Projects / {project} / {sequence} / Editorial]
[PageHeader: Sequence Editorial ............. ← Sequence]

Sequence selector ▾ (NEW — jump to another sequence's
editorial view without returning to Sequence Detail first)

"Most editorial actions live on the Sequence page. This page
provides advanced trim-in/out, gaps, and fallback controls."
                                    Open in Advanced Editor → (NEW,
                                    surfaced here too, not only on
                                    Sequence Detail)

┌ Timeline + Preview (EditorialWorkspace) ──────────────────┐
│ [EditorialTimeline: trim handles, gaps, order]             │
│ [SequencePreviewPlayer: shared-selection playback]         │
│ Insert Shot Here / Insert New Shot                         │
└───────────────────────────────────────────────────────────┘

── Shot Order & Fallback Controls ──
[EditorialShotList: order, trim summary, fallback status]
```

## 7. Séquence d'implémentation proposée (tickets)

Aucun de ces tickets n'est lancé par cet audit — proposition pour
arbitrage Codex.

### `UX.3.PRODUCTION.WORKSPACE.1` — Regrouper Sequence Detail en Montage/Production

Objectif : réorganiser visuellement les sections existantes de Sequence
Detail sous deux groupes explicites ("Montage" / "Production"), ajouter
un lien "Open Editorial Workspace →" visible en tête de la zone Montage.
Aucune section déplacée vers une autre route, aucune action serveur
changée.

Fichiers probables :
- `src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx`

### `EDITORIAL.NAV.1` — Sélecteur de Sequence et accès OpenReel sur Editorial

Objectif : ajouter un sélecteur de séquence en tête de `/editorial`
(navigation directe entre séquences du même projet sans repasser par
Sequence Detail), et surfacer "Open in Advanced Editor" sur cette page.

Fichiers probables :
- `src/app/projects/[projectId]/sequences/[sequenceId]/editorial/page.tsx`
- eventuellement un petit composant client de sélection (nouveau fichier)

### `SEQGEN.STORYBOARD.1` — Grille Storyboard (prérequis visuel pour SEQGEN.*)

Objectif : ajouter une vue grille (vignette par shot : image de référence
ou dernière frame vidéo approuvée, code, titre, durée, statut) sur
Sequence Detail, en complément (pas en remplacement) de la table Shots
existante. Nécessaire avant `SEQGEN.SPLIT.1` pour visualiser le mapping
segment↔shot avec des vignettes.

Fichiers probables :
- `src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx`
- nouveau composant `src/components/SequenceStoryboardGrid.tsx`

Risque : nécessite de décider une source de vignette par shot
(actuellement `approvedVideoPath` existe, pas de champ thumbnail dédié)
— voir section 8, changement de données potentiel.

### `SEQGEN.1` — Sequence Prompt Package for Seedance

Déjà spécifié dans `docs/SEQUENCE_LEVEL_SEEDANCE_DRAFT.md`. Prérequis
confirmés par cet audit : aucune génération vidéo au niveau Sequence
n'existe aujourd'hui ; le seul point d'entrée de génération est
Shot → Workflows → Generate. Ce ticket doit décider où vit l'action
"Generate Sequence Video" (proposition : nouvelle sous-section sur
Sequence Detail, dans le groupe Production, sous Storyboard).

Fichiers probables : nouveaux fichiers d'action/composant, pas de
modification du runtime ComfyUI/job runner existant (compilation de
prompt uniquement à ce stade, per le draft).

### `SEQGEN.SPLIT.1` puis `SEQGEN.PUSH.1`

Suivent la spécification du draft. `SEQGEN.PUSH.1` doit réutiliser le
pattern déjà en place `attachOutputAsShotReference` /
`GeneratedOutputsPanel` (sortie de génération → rattachement à un Shot)
plutôt que d'inventer un nouveau mécanisme de candidature vidéo.

### `EDITORIAL.PROTOTYPE.RETIRE.1` (hors priorité immédiate)

Trancher le sort de `/nle-prototype` (fusionner ses idées utiles dans
`EditorialWorkspace`, ou le retirer explicitement) — nécessite une
décision produit, aucune suppression de route n'étant autorisée dans le
présent audit.

### `EDITORIAL.PLAYER.UNIFY.1` (hors priorité immédiate)

Étudier la fusion des capacités de `SequencePreviewPlayer` (playlist
multi-item, sélection partagée) et `VideoFrameReviewPlayer` (frame-aware,
capture) — pas un simple remplacement, voir section 4.4.

## 8. Migrations ou changements de données éventuels

Aucun changement de schéma n'est requis par les tickets de
réorganisation (`UX.3.PRODUCTION.WORKSPACE.1`, `EDITORIAL.NAV.1`) — ce
sont des changements de présentation uniquement.

Changements potentiels identifiés pour la suite, à faire refuser ou
approuver explicitement par Codex avant tout ticket qui les impliquerait :

- **Storyboard thumbnails** (`SEQGEN.STORYBOARD.1`) : pas de nouveau
  champ strictement nécessaire au MVP — la grille peut réutiliser
  `shots.approvedVideoPath` (vignette = dernière frame extraite à la
  volée, comme le fait déjà `VideoFrameReviewPlayer`'s capture) ou une
  image de référence existante (`shotReferenceImages`) sans nouvelle
  colonne. Si le produit veut une vignette dédiée et mise en cache,
  cela impliquerait une nouvelle colonne (`shots.thumbnailPath` ou
  équivalent) — **à valider explicitement, pas assumé par cet audit.**
- **`SEQGEN.1`/`SEQGEN.SPLIT.1`/`SEQGEN.PUSH.1`** : le draft
  (`docs/SEQUENCE_LEVEL_SEEDANCE_DRAFT.md`) anticipe déjà le besoin de
  provenance ("store provenance that the candidate came from a
  sequence-level generation") — cela impliquera probablement une
  nouvelle table ou des colonnes sur `generationJobs`/sortie générée
  pour tracer segment source → shot cible. **Non schématisé ici,à
  spécifier dans `SEQGEN.1` lui-même.**

## 9. Validations et workflows utilisateur attendus (pour les futurs tickets)

Pour `UX.3.PRODUCTION.WORKSPACE.1` : ouvrir une Sequence, vérifier que
Montage et Production sont visuellement distincts, que tous les liens et
actions existants sont toujours accessibles, que rien n'a changé de
route.

Pour `EDITORIAL.NAV.1` : depuis `/editorial`, changer de séquence sans
repasser par Sequence Detail ; ouvrir Advanced Editor directement depuis
cette page.

Pour `SEQGEN.STORYBOARD.1` : ouvrir une Sequence avec des shots ayant et
n'ayant pas de vidéo approuvée, vérifier que la grille distingue les
états, et que cliquer une cellule ouvre le bon Shot Detail.

Pour `SEQGEN.*` : suivre le parcours déjà décrit dans le draft (section
"Target Workflow", 10 étapes) — non répété ici.

## 10. Capacités explicitement préservées

Confirmé par lecture de code, aucune capacité actuelle ne doit être
perdue par les tickets proposés :

- Publish Basic Sequence Result, Open in Advanced Editor, Export
  Editorial JSON — restent sur Sequence Detail (et deviennent aussi
  visibles sur Editorial pour `EDITORIAL.NAV.1`, addition, pas
  déplacement).
- Sequence Result viewer + Previous Results (Set Active/Archive).
- Table Shots existante (narrative), `Insert Shot Here`/`Insert New
  Shot`.
- `SequenceTimelineEditor` (durées + verrouillage).
- `EditorialWorkspace`/`EditorialTimeline`/`EditorialShotList` sur
  `/editorial`, inchangés.
- Casting Suggestions, Sequence Assets, Sequence Prompt, LLM Assist.
- Shot Detail et son flux de génération par Workflow, inchangés.
- `/nle-prototype` reste accessible par URL directe (non supprimée par
  cet audit).
- OpenReel core, `SequencePreviewPlayer`, `VideoFrameReviewPlayer` — non
  modifiés, non re-scopés au-delà de ce qui est explicitement proposé
  comme tickets futurs distincts.

## 11. Le skill `ux-audit` suffit-il ?

`.claude/skills/ux-audit/SKILL.md` est bien calibré pour un audit
écran-par-écran d'ergonomie générale (progressive disclosure, empty
states, hiérarchie de boutons) — c'est le skill déjà utilisé pour
`UX.AUDIT.1` et il a produit un travail solide sur ce registre.

Il n'est **pas** calibré pour ce ticket-ci, qui demande une analyse
d'**architecture inter-routes** : cartographie de recouvrement entre
plusieurs pages qui exposent la même capacité sous des formes
différentes, séparation de concerns narration/production/montage, et
mise en correspondance avec des tickets futurs non encore implémentés
(`SEQGEN.*`). Le skill actuel ne mentionne ni comparaison de composants
dupliqués, ni matrice capacité→surface→cible, ni détection de routes
orphelines.

**Recommandation** : ajouter une extension méthodologique dédiée,
par exemple `.claude/skills/workspace-architecture-audit/SKILL.md`,
qui formaliserait les étapes suivies ici : (1) lister les workspaces
cibles et leurs capacités attendues depuis un brief produit ; (2)
cartographier chaque capacité vers sa ou ses surfaces actuelles ; (3)
identifier les doublons par comparaison directe de composants (pas
seulement de routes) ; (4) `rg` exhaustif pour détecter les routes
orphelines (aucun lien entrant) ; (5) produire une matrice capacité→
surface→cible et un wireframe textuel par workspace ; (6) découper en
tickets avec fichiers probables et changements de données explicitement
signalés même s'ils seront refusés. Cette extension resterait
complémentaire à `ux-audit` (ergonomie d'écran), pas un remplacement.

## 12. Questions de décision produit (pour Codex)

1. La grille Storyboard doit-elle **remplacer** la table Shots actuelle
   sur Sequence Detail, ou coexister comme bascule liste/grille ?
2. `SEQGEN.1` doit-il vivre sur Sequence Detail (proposition de cet
   audit) ou mériter sa propre route dédiée (`/sequences/[sid]/
   generate`) compte tenu de la complexité attendue (compilation de
   prompt, storyboard optionnel, génération, puis review de split) ?
3. `/nle-prototype` : fusion de ses apports dans `EditorialWorkspace` ou
   suppression pure — à trancher dans un ticket dédié, hors périmètre
   ici.
4. Faut-il un nouveau champ de vignette dédié par shot, ou la stratégie
   "dernière frame extraite à la volée" suffit-elle pour le MVP
   Storyboard ?
5. `EDITORIAL.PLAYER.UNIFY.1` (fusion `SequencePreviewPlayer`/
   `VideoFrameReviewPlayer`) — prioriser avant ou après le bloc
   `SEQGEN.*` ?
