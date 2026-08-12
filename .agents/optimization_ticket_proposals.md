# Propositions de tickets — Phase A (optimisation avant LLM Workspace)

Statut : proposition pour arbitrage Codex. Ne remplace pas
`.agents/current_task.md`, que Codex reste seul à écrire.

Date : 2026-08-13.

Contexte : `docs/LLM_WORKSPACE_ARCHITECTURE.md` §9 (séquencement Phase A / B / C)
et `docs/LLM_WORKSPACE_PRODUCT_VISION.md`.

Rappel d'état : `GEN.PROJECT_STYLE.APPEND.TOGGLE.1` est clos — commité et
poussé (`05b647e`), verdict `APPROVED` / `safeToCommit: true`. Aucun ticket
actif.

Ordre proposé : **T0 → T1 → T2 → T3**. Chaque ticket augmente la sûreté du
suivant.

---

## T0 — `REPO.HYGIENE.WORKTREE.1`

### Goal

Assainir l'arbre de travail pour que les revues `git diff` des tickets
suivants soient lisibles. Aucun changement de code applicatif.

### Justification

L'arbre porte actuellement 12 fichiers modifiés (**2 437 insertions**) et 29
entrées non suivies. Le ticket T1 produit un diff mécanique d'environ 2 333
lignes déplacées. Réviser T1 par-dessus cette dérive est infaisable
proprement, alors que `AGENTS.md` impose des revues séparées de `git status`,
`git diff --cached --stat`, `git diff --cached`, `git diff --stat` et
`git diff`.

### Scope

- Commiter la dérive documentaire existante : `AGENTS.md`, `CLAUDE.md`,
  `.agents/templates/current_task.md`, `docs/ARCHITECTURE_DECISIONS.md`,
  `docs/DEVELOPMENT_WORKFLOW.md`, `docs/PROJECT_STATE.md`, `docs/ROADMAP.md`,
  `docs/USER_FEEDBACK.md`.
- Ajouter les documents non suivis de `docs/`, dont
  `docs/LLM_WORKSPACE_ARCHITECTURE.md` et
  `docs/LLM_WORKSPACE_PRODUCT_VISION.md`.
- Mettre à jour `.agents/claude_report.md`, dont le statut final est resté à
  `READY_FOR_CODEX_REVIEW` alors que le ticket est commité et poussé.
- Trancher et appliquer le sort de `.vscode/`, `.cline/`, `.clineignore`,
  `.claude/rules/`, `.claude/skills/` : versionnés ou ignorés.
- Trancher et appliquer le sort des trois PNG à la racine
  (`multiclip-play-1.png`, `repro-during-play-1.png`,
  `openreel-migration-browser-proof.png`) : `.gitignore`, ou déplacement dans
  `docs/audits/` s'ils documentent une investigation.

### Out of Scope

- Toute modification de `src/`.
- Les dérives applicatives préexistantes que le handoff demande de préserver :
  `src/components/ContextStrip.tsx`, les pages Sequence et Editorial non
  visées, `src/lib/comfy/patchWorkflowPayload.ts`. Elles restent non
  stagées, sauf décision explicite de Codex.

### Constraints

- Pas de `git add .` — chemins explicites uniquement.
- Aucun fichier runtime, upload, output, storage, `.next`, `dist` ou log.
- Décisions 1 et 2 (PNG, `.vscode`/`.cline`) à confirmer par l'utilisateur
  avant exécution.

### Expected Validation

- `git status` propre sur les chemins traités.
- `git diff --check`.
- Aucun fichier de `src/` dans le commit.

---

## T1 — `DB.SCHEMA.SPLIT.1`

### Goal

Découper `src/db/schema.ts` (2 333 lignes, 60 tables) en modules par domaine
sous `src/db/schema/`, avec un barrel `index.ts` qui ré-exporte exactement les
mêmes symboles. **Aucun changement de schéma.**

### Justification

`schema.ts` est importé par 137 fichiers. Tout ticket touchant la persistance
paie aujourd'hui 2 333 lignes de contexte. Le LLM Workspace ajoutera au moins
trois tables ; les poser dans ce fichier l'aggrave.

### Scope

- Créer `src/db/schema/` et répartir les 60 tables par domaine. Découpage
  proposé, à ajuster selon les grappes de clés étrangères réelles :

  | Module | Contenu indicatif |
  | --- | --- |
  | `core.ts` | `projects`, `sequences`, `shots`, `appSettings` |
  | `assets.ts` | `assets`, `shotAssets`, `sequenceAssets`, `assetReferenceImages`, `assetStyleAlignments` |
  | `prompts.ts` | `motionBeats`, `promptSegments` |
  | `generation.ts` | `comfyWorkflows`, `generationJobs` |
  | `references.ts` | `shotReferenceImages`, `shotReferenceVideos` |
  | `storyboard.ts` | `storyboardImages`, `sequenceStoryboardImages`, `shotStoryboardThumbnails`, `sequenceStoryboardExtractions`, `sequenceStoryboardExtractionRegions` |
  | `sequenceVideo.ts` | `sequenceVideoDrafts`, `sequenceVideoSplitRuns`, `sequenceVideoSplitSegments` |
  | `shotVideo.ts` | `shotVideoCandidates`, `shotVideos` |
  | `editorial.ts` | `sequenceEditorialItems`, `sequenceResults`, `filmResults` |
  | `projectStyle.ts` | drafts, sections, rules, versions, activePointers, referenceImages/Domains/Consumers, influences et dérivés, `sequenceStyleOverrides` |
  | `projectStyleResearch.ts` | les 11 tables `projectStyleResearch*` |
  | `projectStyleAnalysis.ts` | les 5 tables `projectStyleReferenceAnalysis*` |
  | `lookDevelopment.ts` | `lookTests`, `lookTestReferences`, `lookTestResults` |

- Déplacer chaque `export type X = typeof x.$inferSelect` / `$inferInsert`
  avec sa table. Ils sont actuellement dispersés au milieu du fichier
  (notamment lignes ~197-213) et ne doivent pas être regroupés ailleurs.
- Créer `src/db/schema/index.ts` ré-exportant tout, de sorte que
  `import { ... } from "@/db/schema"` reste valide pour les 137 importateurs.
- `src/db/index.ts` continue de faire `import * as schema from "./schema"`
  sans modification.

### Out of Scope

- Toute création, suppression ou modification de table, colonne, index,
  contrainte, `enum` ou valeur par défaut.
- Toute migration.
- Toute modification des 137 fichiers importateurs. Si un import doit changer,
  c'est que le barrel est incomplet.
- Toute réécriture de requête.

### Risque identifié

Les modules de schéma peuvent créer des **imports circulaires** entre domaines
(par exemple `assets.ts` référence `shots`, et `references.ts` référence les
deux). Drizzle déclare les clés étrangères en callback paresseux
(`references: () => shots.id`), ce qui absorbe la plupart des cas, mais la
répartition doit être vérifiée et non supposée. Si un cycle résiste, le
regroupement des tables concernées dans un même module est préférable à
l'ajout d'un module d'indirection.

### Incremental Debt Budget

- Contrats à réutiliser : le barrel doit reproduire la surface d'export
  actuelle à l'identique, sans en profiter pour renommer ou masquer un symbole.
- Chemins remplacés à supprimer : `src/db/schema.ts` disparaît dans le même
  diff.
- Nouveaux fichiers autorisés : les modules de `src/db/schema/` et son
  `index.ts`, aucun autre.
- Aucune nouvelle dépendance.

### Expected Validation

Par ordre de force de preuve :

1. **`npm run db:generate` doit produire une migration vide.** C'est la preuve
   mécanique qu'aucune colonne, index ou contrainte n'a bougé. Toute migration
   générée signale une régression et invalide le ticket.
2. `npx tsc --noEmit` — prouve que les 137 importateurs résolvent toujours.
3. `npm run build`.
4. Lint ciblé sur les fichiers TypeScript créés.
5. `git diff --check`.

Aucune validation manuelle navigateur n'est requise : le ticket ne modifie
aucun comportement observable.

---

## T2 — `PROMPTS.INVENTORY.CLEANUP.1`

### Goal

Supprimer un orphelin confirmé et produire la table d'inventaire des
opérations LLM qui servira d'entrée de conception au registre du LLM
Workspace.

### Scope

- Supprimer `src/lib/prompts/sequences-from-story.ts`. Son unique export,
  `buildSequencesFromStoryPrompt`, n'a **aucun appelant** dans `src/`
  (vérification par recherche du nom de fichier et du nom d'export).
- Produire dans `docs/` une table d'inventaire reliant, pour chacune des 15
  actions de `src/actions/llm/` :
  - le ou les constructeurs de prompt utilisés dans `src/lib/prompts/` ;
  - le composant d'assist qui la consomme ;
  - l'entité ancre et les champs écrits ;
  - la cardinalité (une entité / plusieurs) ;
  - le format de sortie JSON attendu.

### Out of Scope

- Toute modification de comportement d'une action LLM existante.
- Toute suppression d'un autre fichier de `src/lib/prompts/` sans preuve
  d'orphelinat par la même méthode.
- Toute création d'abstraction : ce ticket documente, il ne refactorise pas.

### Expected Validation

- `npx tsc --noEmit` et `npm run build` — prouvent que la suppression ne casse
  aucun import.
- Recherche confirmant zéro occurrence résiduelle de
  `buildSequencesFromStoryPrompt` et de `sequences-from-story`.

---

## T3 — `PROMPTS.SNAPSHOT.TESTS.1`

### Goal

Établir un filet de non-régression sur les constructeurs de prompt de
`src/lib/prompts/` (3 620 lignes), avant toute migration vers le registre
déclaratif du LLM Workspace.

### Justification

Ces fonctions sont pures et déterministes : à entrée donnée, elles produisent
exactement les mêmes chaînes `system` et `user`. C'est le terrain le plus
favorable possible pour une première suite de tests, et **le seul moyen de
prouver** que la Phase B ne change pas le comportement observable de 8 903
lignes migrées. Sans ce filet, la migration serait validée par `tsc` et des
clics manuels.

Le dépôt ne contient aujourd'hui aucun test.

### Scope

- Introduire un lanceur de tests — **autorisation de dépendance explicite
  requise**, `vitest` étant le candidat naturel pour ce projet.
- Écrire des tests snapshot couvrant les constructeurs réellement utilisés,
  chacun avec au moins un cas nominal et un cas où les champs optionnels sont
  absents ou vides — c'est là que vivent les branches `if (x?.trim())`.
- Ajouter le script npm correspondant.

### Out of Scope

- Tout test appelant réellement un LLM. Les tests portent sur la construction
  du prompt, jamais sur l'inférence.
- Tout test nécessitant la base de données, le système de fichiers ou le
  réseau.
- Toute modification d'un constructeur de prompt. Si un test révèle un
  comportement douteux, il est consigné, pas corrigé dans ce ticket.
- Toute mise en place de CI.

### Incremental Debt Budget

- Nouvelle dépendance autorisée : le lanceur de tests uniquement, en
  `devDependencies`.
- Nouveaux fichiers autorisés : fichiers de test et configuration du lanceur.

### Expected Validation

- La suite passe en local.
- `npx tsc --noEmit` et `npm run build` restent verts.
- Aucun fichier de `src/lib/prompts/` modifié dans le diff.

---

## Points à trancher par l'utilisateur avant T0

1. **Trois PNG à la racine** — `.gitignore`, ou déplacement dans
   `docs/audits/` s'ils documentent l'investigation OpenReel ?
2. **`.vscode/`, `.cline/`, `.clineignore`** — configuration d'équipe à
   versionner, ou configuration locale à ignorer ?

## Points à trancher par Codex

1. T3 autorise-t-il la dépendance `vitest` ? Sans autorisation, la Phase B
   part sans filet.
2. Le découpage de modules proposé en T1 convient-il, ou faut-il l'aligner sur
   une autre frontière de domaine ?
3. T2 produit un document d'inventaire : dans `docs/` ou dans `.agents/` ?
