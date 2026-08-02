# Project Style V1 — STYLE.1.ACCEPTANCE.1 Acceptance Report

Date: 2026-08-02 (rapport initial, retake round 1, retake round 2 et
cloture finale, le meme jour)
Executant: Claude Code / Sonnet
HEAD verifie: `72f9d89` (`feat(style): add Reference Board analysis UI`)
Statut: `ACCEPTED` — preuves techniques completes et confirmation manuelle
utilisateur recue le 2026-08-02 (`c est ok`). L'epic `STYLE.1` est clos sur
le plan produit/fonctionnel. La cloture documentaire finale (ce paquet)
reste soumise a un dernier verdict Codex avant staging/commit/push.

Ce rapport integre le retake round 1 (scenarios manquants completes avec
preuves reelles, `PROJECT_STATE.md` reconcilie, finding `server-only`
reclasse) et le retake round 2 (les 3 derniers refus cross-Project prouves
par Action/DB reelle sans navigateur, residu de worktree supprime, valeur
`consumer` du job Asset corrigee) demandes par Codex
(`.agents/codex_review.md`, verdicts `REVISE`). Aucune preuve nominale deja
acceptee n'a ete rejouee.

## 1. Perimetre et environnement

### Passage initial

- Copie jetable (git worktree detache sur `72f9d89`) :
  `F:\AI\tmp-style1-acceptance`, `node_modules` installes localement.
- Base SQLite jetable creee de zero (`drizzle-kit migrate` sur DB vierge),
  jamais `data/mikailab.db` du repo principal.
- Serveur `next build` + `next start` sur le port `3417`.
- Provider LLM mocke localement (`http://127.0.0.1:8917`), ComfyUI mocke
  localement (`http://127.0.0.1:8918`).
- Project fixture `__STYLE1_ACCEPTANCE__ Project` (id 1), Sequence (id 1),
  Shot `Sh_100` (id 1), Asset (id 1).

### Retake round 1 (nouvel environnement jetable independant)

- Nouveau worktree jetable : `F:\AI\tmp-style1-retake2`, `npm ci` isole
  execute dans ce worktree — **aucun symlink, aucun partage de
  `node_modules`** avec le repo principal a aucun moment de ce retake.
- Nouvelle base SQLite vierge jetable, serveur `next start` sur le port
  `3418` (different de `3417` et de `3000`).
- Nouveaux mocks locaux : LLM sur `http://127.0.0.1:8927`, ComfyUI sur
  `http://127.0.0.1:8928`. Aucun appel externe, aucun cout.
- Deux Projects fixtures : `__STYLE1_ACCEPTANCE__ Project A` (id 1, sujet
  principal des preuves) et `__STYLE1_ACCEPTANCE__ Project B` (id 2, utilise
  exclusivement pour les preuves de refus cross-Project du Gate 6).
- Port `3000` de l'utilisateur : jamais touche, PID stable a `49664` verifie
  avant/apres.

### Retake round 2 (Action/DB reelle, sans navigateur)

- Aucun worktree, aucun build, aucun serveur `next start` : les 3 refus
  cross-Project restants et la verification du job Asset ont ete prouves en
  appelant directement les vraies fonctions Server Action/CORE (`npx tsx`)
  contre une base SQLite jetable minimale (migree via `drizzle-kit migrate`,
  hors de tout repertoire suivi par Git), avec un shim local `server-only`
  charge via `NODE_PATH` (aucune modification de `node_modules` du repo
  principal, aucun `npm install`/`npm ci` execute) et un mock ComfyUI HTTP
  local (`127.0.0.1:8931`) pour le seul test de soumission Asset.
- Deux Projects fixtures dedies : `Round2 Project A` (id 1) et
  `Round2 Project B` (id 2, source des ressources etrangeres testees).
- Port `3000` : jamais touche, PID stable a `49664` verifie avant/apres ;
  hashes `package.json`/`package-lock.json` identiques a la baseline
  avant/apres.
- Residu `F:\AI\tmp-style1-acceptance` (contenant un `.next` orphelin du
  passage initial, non supprime a l'epoque) supprime et confirme absent
  (`Test-Path` -> `False`).

## 2. Matrice normative A-G

| Exigence | Surface / action canonique | Preuve | Resultat |
|---|---|---|---|
| A — Working Draft, sections/rules, compilation sparse, publish, historique | `/projects/{id}/style` | Draft rempli, rule ajoutee, preview omet Visual Treatment vide, publish multi-version, `Edit Active Style` cree un nouveau Working Draft sans alterer la version active, History affiche les versions figees pendant edition | **PASS** |
| B — Reference Board et Creative Influences | `/projects/{id}/style` (Reference Board) | Upload PNG reel, checkboxes "Approved for Style analysis"/"Approved for generation use" visibles des la creation, tooltips avec exemples, image non croppee, popup hover confirmee. **Retake** : suppression nominale d'une reference non protegee reussie (DB + fichier disque supprimes) ; suppression d'une reference citee par un Run bloquee avec message exact `"This reference was used by a Style analysis run and cannot be deleted. Delete the analysis run first."`, confirme par lecture DB (`references count: 1` apres tentative) | **PASS** |
| C — Influence Research et Reference Analysis | `/projects/{id}/style` (Reference Analysis) | Confirmation explicite provider/model avant appel, analyse mockee -> Observation acceptee, Candidate Rule approuvee dans le Working Draft sans perte du Direction Brief non sauvegarde, historique des runs (echecs + succes) visible | **PASS pour Reference Analysis** ; **Influence Research non rejoue en navigateur** (necessite OpenRouter reel avec Server Tool `web_search`, interdit par le ticket) — sa garde d'ownership cross-Project est prouvee par un appel Action reel sans provider (Round 2, voir Gate 6) |
| D — Heritage et override Sequence | `/projects/{id}/sequences/{id}` | Etat `Inherited` initial, `Customize for Sequence` -> override, publication d'une nouvelle version Project -> bandeau "Project Style is currently vN. This Sequence keeps its saved override.", Shot resout le meme override (Payload Preview). **Retake** : `Reset to Project Style` execute reellement -> confirmation "This removes the complete Sequence override. Continue?" -> apres confirmation, etat revient a `Inherited` et `sequence_style_overrides` passe a 0 ligne en DB | **PASS** |
| E — Surfaces de generation (6 consumers) | `asset`, `shot-image`, `shot-video`, `shot-storyboard`, `sequence-storyboard`, `sequence-video` | Payload Preview byte-identique au texte compose (Shot Prompt/Description + bloc `PROJECT STYLE`), provenance discriminee via `styleProvenance.consumer` en base pour chaque job reellement soumis au mock ComfyUI : job Asset -> `"consumer":"asset"` **(valeur corrigee en Round 2 — verifiee par un appel reel de `runAssetGeneration` sur DB jetable minimale : `generation_jobs.payload_snapshot.styleProvenance` = `{"consumer":"asset","resolutionMode":"project-version",...}`; la mention anterieure `"shot-image"` etait une erreur de redaction, pas un defaut produit — le code hard-code litteralement `"asset"` dans `src/actions/generation.ts:311`, `prepareGenerationStyleSource("asset", ...)`, jamais derive dynamiquement)**. **Retake Round 1** : les 4 consumers restants ont ete soumis reellement (jobs ComfyUI mock queues -> `done`) avec verification directe de `generation_jobs.payload_snapshot.styleProvenance.consumer` egal a `"shot-video"`, `"shot-storyboard"`, `"sequence-storyboard"`, `"sequence-video"` respectivement, chacun avec le bloc `PROJECT STYLE` correct et la provenance (`inherited-project-version` ou override Sequence) exacte | **PASS pour les 6/6 consumers**, tous avec preuve Action/DB/payload reelle |
| F — Asset creative alignment | `/projects/{id}/assets/{id}` | Etat initial "Not reviewed against Project Style vN", 0 mutation avant Apply (verifie par lecture DB directe), preview editable, Apply -> "Aligned with Project Style vN", ligne `asset_style_alignments` creee. **Retake** : edition manuelle d'un champ propose puis modification concurrente du contenu Asset (simulateur de conflit) -> Apply refuse avec `"This Asset was changed elsewhere since this review started. Reload and try again."`, **l'edition manuelle reste visible dans le textbox** (non perdue) ; apres regeneration et Apply reussi, reload de page confirme l'etat `"Aligned with Project Style vN"` avec bouton `"Review Again"` (pas de re-proposition automatique) et **exactement 1 ligne** dans `asset_style_alignments` (pas de double Apply) | **PASS** |
| G — Look Development | `/projects/{id}/style/look-development` | Mode Image, "Neutral Benchmark" avec bouton random fonctionnel, Style source explicite, workflow mappe, generation reelle via mock ComfyUI, resultat sauvegarde, notes persistees, statut `look-target` applique. **Retake** : `Duplicate for rerun` -> edition du prompt (override "Positive Prompt") -> `Run` reussi avec un nouveau job ; test de fermeture pendant un job en cours (mock ComfyUI modifie pour retarder la reponse de 12s, `Job #7 — Running`) -> panneau ferme -> navigation vers une autre page et retour -> reouverture via `Open` -> **le meme `Job #7`** est retrouve et affiche `"Job: #7 — done"` (aucune duplication, aucune perte) ; suppression d'un resultat sauvegarde -> confirmation "Permanently delete this durable result? The Look Test itself is kept." -> ligne `look_test_results` supprimee (0 restante) **et** fichier media supprime du disque, `look_tests` (le Look Test lui-meme) conserve intact | **PASS** |

## 3. Schema et migrations (Gate 2)

- 32 tables Project Style cartographiees, toutes creees par les migrations
  `0040_sharp_raza.sql` a `0047_free_sugar_man.sql`, chacune referencee
  exactement une fois dans `drizzle/meta/_journal.json`.
- Chaine complete appliquee sur DB vierge jetable : succes,
  `PRAGMA foreign_key_check` **0 anomalie**, `npx drizzle-kit generate` sur
  le worktree : **"No schema changes, nothing to migrate"**.
- **Retake — preservation reellement prouvee (finding Codex #2)** : un
  troisieme environnement jetable dedie (`migtest/`) a ete construit :
  1. Journal Drizzle tronque a une copie locale ne contenant que les entrees
     `0000` a `0039` ; chaine appliquee sur une DB vierge -> 26 tables
     pre-existantes crees.
  2. Insertion de lignes representatives (`__STYLE1_ACCEPTANCE__ Pre0040
     Project`/`Sequence`) dans ces tables pre-existantes.
  3. Capture des comptages exacts des 26 tables + `PRAGMA
     foreign_key_check` (0 anomalie) -> `counts-before.json`.
  4. Bascule vers le journal Drizzle complet (`0000`-`0047`) sur la **meme**
     DB -> seules les migrations `0040`-`0047` restant a appliquer sont
     executees (idempotence du tracker de migrations Drizzle confirmee).
  5. Re-comparaison : **tous les comptages des 26 tables pre-existantes sont
     identiques avant/apres** (`ALL PRE-EXISTING COUNTS PRESERVED`),
     `PRAGMA foreign_key_check` toujours 0 anomalie, la ligne `projects`
     fixture est toujours presente avec son nom exact, et les 43 tables
     Style sont desormais creees.
- Cascades/restrictions verifiees par usage reel : override Sequence
  cree/lie/supprime a une version Project precise, alignment Asset lie a une
  version Project precise, Look Test lie a un workflow et une version
  Project, Reference protegee non supprimable tant qu'un Run la cite.

## 4. Provenance, version et ownership (Gate 6)

Lecture DB ciblee post-parcours. Pour chaque objet durable, l'identite
visible dans l'UI est reliee a la ligne exacte :

- `project_style_active_pointers` : pointeur actif correct par Project.
- `project_style_versions` : versions avec `published_at` correspondant
  exactement aux horodatages affiches dans l'UI (History).
- `sequence_style_overrides` : `source_project_style_version_id`/`revision`
  identiques a ce qu'affiche le panneau Sequence et le Payload Preview Shot ;
  ligne supprimee exactement lors d'un `Reset to Project Style`.
- `asset_style_alignments` : `project_style_version_id`/fingerprint corrects,
  **exactement 1 ligne** apres un cycle stale -> regenerate -> apply -> reload
  (pas de doublon).
- `look_tests`/`look_test_results` : `style_source_kind`/`style_version_id`
  correspondant au choix explicite dans le Bench ; `generation_jobs.
  payload_snapshot.styleProvenance` (consumer, resolutionMode,
  projectStyleVersionId, compiledSegment) identique caractere pour caractere
  a ce qui a ete affiche avant soumission, pour chacun des 6 consumers.

### Refus cross-Project (6 domaines — tous prouves par Action/DB reelle, retake Round 1 + Round 2)

**Round 1** — fault injection reelle (corruption DB ciblee d'un pointeur vers
une version appartenant a `__STYLE1_ACCEPTANCE__ Project B`) suivie d'une
verification UI/Action reelle pour les 3 domaines a resolution live directe :

| Domaine | Methode | Resultat observe |
|---|---|---|
| Sequence Style | `sequence_style_overrides.source_project_style_version_id` pointe vers la version de Project B | Panneau Sequence : `"Override references a source Style version belonging to a different Project."` — aucun contenu de Project B affiche |
| Generation resolution | Meme corruption, Payload Preview Shot ouvert | `"Override references a source Style version belonging to a different Project. Generation is disabled until this is resolved."` + `"Generation is disabled: Project Style could not be resolved."` — aucune injection `PROJECT STYLE`, bouton Generate desactive |
| Asset Alignment | `asset_style_alignments.project_style_version_id` pointe vers la version de Project B | `"The Style alignment review references a Style version belonging to a different Project."` |

**Round 2** — les 3 domaines restants, initialement verifies par lecture de
code seule (juge insuffisant par Codex), ont ete completes par de vraies
Actions appelees directement (sans navigateur) sur une base SQLite jetable
minimale contenant deux Projects (`Round2 Project A` id 1, `Round2 Project
B` id 2) et les ressources de B necessaires (version Style publiee,
Influence, Run de Reference Analysis + Observation) :

| Domaine | Action reelle appelee (Project A, ressource de Project B) | Resultat structure | Mutation | Appel provider |
|---|---|---|---|---|
| Look Development (creation) | `runLookTestGenerationCore({ projectId: 1, styleSource: { kind: "published-version", versionId: <version de B> }, workflowId: ... })` | `{ ok: false, error: "The selected Project Style version belongs to a different Project." }` | 0 ligne `look_tests`, 0 ligne `generation_jobs` avant/apres (identique) | Aucun (refus avant `queueComfyPrompt`) |
| Influence Research | `updateInfluenceAction({ projectId: 1, influenceId: <Influence de B>, ... })` | `{ ok: false, error: "Influence not found in this Project." }` | Ligne `project_style_influences` byte-identique avant/apres (`JSON.stringify` egal) | N/A (pas de provider sur ce chemin) |
| Reference Analysis | `updateReferenceAnalysisObservationAction({ projectId: 1, observationId: <Observation liee a un Run de B>, ... })` | `{ ok: false, error: "Observation not found." }` | Ligne `project_style_reference_analysis_observations` byte-identique avant/apres | N/A (mutation seule, pas d'appel provider sur ce chemin) |

Un refus "not found" plutot qu'un message explicite de cross-Project
(Influence Research, Reference Analysis) est le comportement le plus sur
possible : la ressource d'un autre Project n'est jamais distinguee d'une
ressource inexistante, donc jamais confirmee ni exposee.

Aucun lien corrompu n'a ete transforme silencieusement en `none`, en succes,
ou en provenance d'un autre Project sur les 6 domaines. Les 6 domaines
disposent desormais d'une preuve Action/DB reelle (3 en Round 1 par UI/fault
injection, 3 en Round 2 par appel direct des Server Actions sur DB jetable).

## 5. Audit du code mort (Gate 7)

Audit uniquement, aucune suppression effectuee. Perimetre :
`src/app/projects/[projectId]/style/**`, `src/components/projectStyle/**`,
`src/actions/projectStyle*.ts`, `sequenceStyle.ts`, `assetAlignment.ts`,
`lookDevelopment.ts`, `src/lib/projectStyle/**`, `src/lib/lookDevelopment/**`.

Findings (severite, fichier:ligne, ticket correctif minimal) :

1. **Mineur (reclasse — finding Codex #5)** — `src/lib/projectStyle/
   resolveSequenceStyle.ts` accede directement a `db` (`db.transaction(...)`,
   lignes 231/246/288) sans `import "server-only"` en tete de fichier. Ce
   module est le resolver canonique reutilise par `generationStyleResolver.
   ts`, `resolveAssetStyleContext.ts`, `assetAlignment.ts` et
   `sequenceStyle.ts` — **tous des appelants Server Actions ou des modules
   deja proteges par leur propre `server-only`**. `SequenceStylePanel.tsx`
   n'importe que des types depuis ce fichier (import type-only, elimine a la
   compilation), donc aucun chemin d'execution client atteignable n'a ete
   trouve. Reclasse de "majeur" a **mineur / durcissement defensif** :
   ticket correctif minimal (hors scope applicatif de cette acceptance) —
   ajouter `import "server-only";` par coherence avec le reste du module,
   sans urgence fonctionnelle.
2. **Mineur** — `isValidId`/`MAX_ID` redefinis a l'identique dans 3 fichiers
   (`src/lib/projectStyle/validation.ts:26`,
   `src/lib/projectStyle/validationB.ts:32`,
   `src/lib/projectStyle/referenceAnalysis/validation.ts:35`). Ticket
   correctif minimal : extraire vers un module partage unique.
3. **Mineur (dette de nettoyage bornee, aucune suppression proposee ici)** —
   3 exports sans caller trouve dans `src/` :
   `isAssetAlignmentEditableField` (`assetAlignment/contracts.ts:23`),
   `isAssetStyleSegmentsEmpty` (`assetAlignment/styleContext.ts:30`),
   `isStyleSnapshotEmpty` (`compileStyleSnapshot.ts:77`). A conserver comme
   dette bornee documentee ; ne pas supprimer sans ticket correctif approuve
   dedie, conformement a la consigne du Gate 7.
4. **Info** — `src/lib/projectStyle/uploadReferenceImage.ts` sans
   `import "server-only"` (ecriture fichier serveur, pas de secret manipule
   actuellement). Optionnel, coherence defensive uniquement.

Aucun ancien compilateur Style, ancien provider Research, fichier orphelin ou
TODO inexplique trouve dans le perimetre. `validation.ts`/`validationB.ts`
ne sont pas un doublon v1/v2 mais deux modules actifs distincts.

## 6. Verifications finales

- `npx tsc --noEmit` (worktree retake) : **0 erreur**.
- ESLint cible sur les modules Project Style audites : **14 erreurs, 1
  avertissement**, toutes `react-hooks/preserve-manual-memoization` dans
  `src/components/projectStyle/ProjectStyleWorkspace.tsx`. **Confirmees
  pre-existantes** : le meme `npx eslint` execute sur le repo principal non
  modifie (HEAD `72f9d89`) produit exactement les 14 memes erreurs. **Aucun
  nouveau diagnostic introduit par cette acceptance.**
- `npm run build` (worktree retake) : succes, toutes les routes Project
  Style generees.
- `npx drizzle-kit generate` (worktree retake) : aucune derive.
- `git diff --check` (repo principal) : propre (avertissements CRLF/LF
  pre-existants, non lies a ce ticket).
- Scan secrets/gros base64 sur les artefacts de preuve : aucun motif de cle
  API trouve, aucun fichier volumineux.
- **Retake — passe navigateur compacte + clavier/focus + console/hydration
  (finding Codex #4)** : viewport `768x1024` sur le workspace transversal
  `/projects/1/style` — mise en page coherente, tous les controles
  accessibles. Activation clavier reelle verifiee : focus programmatique sur
  le bouton `Publish Style` puis touche `Enter` -> dialogue de confirmation
  `"Publish v2? This becomes the new active Style immediately."` s'ouvre
  correctement (pas seulement un gestionnaire `onClick` souris). Sur
  l'ensemble de la session retake (77 messages console captures) : **100%
  sont le meme faux positif benin** (`net::ERR_BLOCKED_BY_CLIENT.Inspector`
  d'une extension navigateur Kaspersky non liee a l'application) — **zero**
  `pageerror`, erreur console applicative ou hydration error.

## 7. Limites honnetes et cout externe

- **Influence Research** (partie de C) n'a pas ete rejoue reellement en
  navigateur pour son parcours de recherche web : le provider est code en dur
  sur `https://openrouter.ai/api/v1/chat/completions`
  (`src/lib/projectStyle/research/provider.ts:25`) et necessite le Server
  Tool `web_search`, non redirigeable vers un mock local. Le ticket interdit
  tout appel OpenRouter reel/payant. Preuve durable citee :
  `STYLE.RESEARCH.SPIKE.1` (GO WITH LIMITS) et `STYLE.1.C.UI` deja approuves
  et documentes dans `docs/USER_FEEDBACK.md` (FB-20260723-001). Sa garde
  d'ownership cross-Project, elle, est desormais verifiee par un appel
  Action reel sans provider (Round 2, Gate 6) — aucun appel OpenRouter
  necessaire pour prouver ce refus.
- Cout externe confirme nul sur l'ensemble du parcours (passage initial,
  retake Round 1 et Round 2) : tout LLM et tout ComfyUI ont ete servis par
  des mocks locaux ou n'ont simplement jamais ete appeles (refus avant tout
  appel provider), jamais un endpoint reel.

Tous les autres scenarios initialement non rejoues (guards de suppression
Reference, `Reset to Project Style`, 4 consumers de generation restants,
Asset Alignment stale/edit/reconciliation, Look Development
duplicate/rerun/close-reopen/delete, passe navigateur compacte/clavier) ont
ete completes avec des preuves reelles dans ce retake — voir section 2.

## 8. Incident et remediation (passage initial, transparence obligatoire)

En debut de ticket (passage initial, environnement `tmp-style1-acceptance`),
une race condition entre deux commandes shell paralleles a laisse un
symlink Windows `node_modules` du worktree pointant vers le `node_modules`
du repo principal actif pendant que `npm ci` s'executait dans le worktree.
Cela a interrompu (`EPERM`) l'installation en cours de reecriture de
fichiers du **repo principal**, provoquant l'arret du serveur utilisateur
sur le port `3000` (ancien PID `45924`). Remediation immediate, avec
autorisation explicite de l'utilisateur :

1. Verification que `package.json`/`package-lock.json` du repo principal
   n'avaient subi aucune modification (hashes SHA256 identiques a la
   baseline avant/apres).
2. `npm ci` propre dans le repo principal pour reparer `node_modules`
   (aucun changement de dependance, uniquement resynchronisation avec le
   lockfile existant).
3. Relance du serveur utilisateur (`npm run dev:host`), nouveau PID `49664`,
   confirme repondant (HTTP 307).
4. Suppression definitive et verifiee du symlink dans le worktree initial.

**Le retake round 1 a utilise un tout nouveau worktree (`tmp-style1-
retake2`) avec un `npm ci` isole des le depart, sans jamais creer de
symlink ni partager `node_modules` avec le repo principal, conformement a
la consigne explicite du retake.** Aucun fichier applicatif du repo
principal n'a ete modifie a aucun moment. Le port `3000` est reste stable
(PID `49664`) pour le reste du ticket, y compris pendant tout le retake
(verifie a plusieurs reprises, y compris apres teardown final).

## 9. Inventaire exact des fichiers modifies (repo principal, hors artefacts jetables)

- Nouveau : `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md` (ce fichier).
- Modifie : `docs/PROJECT_STATE.md` (HEAD reel, statut acceptance, et
  reconciliation retake : retrait des affirmations perimees sur
  `STYLE.1.D.UI` actif, sur `STYLE.1.C`-`G` presentes comme travail futur,
  et sur le commit `31441d3` presente comme HEAD actuel autoritaire).
- Modifie : `docs/USER_FEEDBACK.md` (note datee ajoutee a `FB-20260723-001`,
  aucun historique supprime).
- Modifie : `.agents/claude_report.md`.
- `docs/ROADMAP.md` : aucune modification necessaire — `STYLE.1.ACCEPTANCE.1`
  y est deja documente comme gate courant.
- Aucun fichier sous `src/`, `drizzle/`, `scripts/`, `package*.json` — dans
  le passage initial ni dans le retake.

## 10. Checklist manuelle finale (a executer par l'utilisateur)

1. Open the app on `http://localhost:3000`, navigate to any real Project,
   then open its `Project Style` tab from the left sidebar — confirm the
   workspace loads with your existing content (nothing was changed there by
   this acceptance run).
2. Publish a small test change to a Working Draft and confirm a new version
   appears under `Versions & Publish -> History`.
3. Open a Sequence, click `Customize for Sequence`, edit one field, save —
   confirm the Sequence panel shows `Customized` with a revision number.
   Then click `Reset to Project Style` and confirm it returns to
   `Inherited`.
4. Open `Look Development` from `Project Style`, pick `Neutral Benchmark`,
   click the random button, run a test, then try `Duplicate for rerun` and
   `Delete Result` on a saved result.
5. On an Asset, click `Align with Project Style` and confirm the preview
   shows Baseline vs Proposed fields before anything is applied.
6. Confirm your own ComfyUI/LLM Settings (Base URL, API keys) are unchanged
   from before this session — this acceptance ran entirely in isolated
   environments on different ports and must not have touched them.

## 11. Sign-off final

- Confirmation manuelle utilisateur : recue le 2026-08-02 (`c est ok`).
- Verdicts Codex : `REVISE` (round 1, 4 findings bloquants + 1 non-bloquant,
  tous traites) -> `REVISE` (round 2, 3 findings bornes, tous traites) ->
  acceptation finale des preuves techniques, cloture documentaire demandee.
- Residus temporaires confirmes supprimes : `F:\AI\tmp-style1-acceptance`
  (retake round 2) et `F:\AI\tmp-style1-retake2` (cloture finale), tous deux
  verifies `Test-Path` `False` apres suppression.
- `STYLE.1.ACCEPTANCE.1` : `ACCEPTED`. L'epic `STYLE.1` (A a G) est
  formellement clos — voir `docs/PROJECT_STATE.md` et `docs/ROADMAP.md`
  pour l'etat final et le prochain ticket.
