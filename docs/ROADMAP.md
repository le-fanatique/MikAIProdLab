# MikAI ProdLab - Roadmap globale consolidee

Version consolidee le 2 aout 2026, apres livraison fonctionnelle et cloture
d'acceptance de `STYLE.1` (`STYLE.1.ACCEPTANCE.1` `ACCEPTED`), puis
reconciliation du backlog Sequence Video, OpenReel, Prompt Packages et
`STYLE.2`.

MikAI doit rester un outil de direction creative et de production pour film
d'animation, de la narration au montage et au film final, et non une simple
interface "prompt -> generation".

Pipeline cible:

```text
Pitch -> Story -> Outline -> Sequences -> Shots -> Assets
-> Direction artistique -> Prompts adaptes aux modeles
-> Generations -> Montage -> Film final
```

## Etat au 20 aout 2026 - le LLM Workspace et le nettoyage sont livres

**Ce document date d'avant le chantier LLM Workspace.** Tout ce qui suit cette
section decrit ce qui etait planifie ; lire d'abord ce bloc, puis le reste
comme archive des intentions. Le detail vit dans
`docs/PROJECT_STATE.md` et `docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3.

**Chantier 1 (LLM Workspace) - complet.** B12, E1, B15, B16, B13, B14 livres.
B20 a ferme ses trois manques de format ; **B20e**, la migration de l'analyse
Reference Board, est reportee apres le Chantier 2 par decision de l'auteur.
B17a livre (les references video portent un role, migration `0055`).

**Chantier 2 (nettoyage) - complet.** C0 a gele l'oracle des descripteurs,
C1/C2 sont devenus une **unification** (quinze actions serveur repliees en une,
treize panneaux sur quatorze migres), C3 a supprime six builders sans appelant,
C4 a range 31 composants par domaine.

**Tests : 968 -> 1361.** Quatre domaines qui n'avaient aucun filet en ont un.

### Ce qui reste, et pourquoi

Trois arbitrages produit appartiennent a l'auteur : **B18** (contraintes
negatives, qu'il a lui-meme classe non-MVP), **B19** (refonte camera, un
travail de conception sur ses champs), **B20e** (un chantier a concevoir avec
lui).

Un ticket est ouvert et attend son tour : **finetuning des regles de
composition du prompt storyboard** (voir plus bas).

Le reste a ete mesure et **volontairement non fait** - les raisons sont dans
`docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3.

## A faire plus tard - Finetuning des regles de composition du prompt storyboard

**Ouvert le 2026-08-20, sur decision de l'auteur.** Remplace l'audit de cout en
tokens, qui etait cite comme demande mais defini nulle part.

B14 a rendu le prompt storyboard beaucoup plus riche : six parties (sujet,
action, environnement, camera, eclairage, contraintes) la ou il ne portait que
le Shot Prompt tape a la main. L'auteur l'a essaye en beta et l'a juge
meilleur, et il est devenu le defaut le 2026-08-19.

**Ce qui reste a regler est le reglage fin de ces regles**, maintenant qu'elles
tournent sur de vraies generations :

- l'ordre des parties, et si `Lighting` est bien place apres `Camera` (il y est
  parce que le rig de sequence s'ajuste par rapport aux cameras axe master) ;
- ce que chaque partie emet exactement - la distribution rend nom, type,
  identite visuelle et description ; est-ce trop pour un plan a six personnages ;
- le budget de mots du guide (60-100, plafond 150) : `inspect`
  (`src/lib/llmWorkspace/conformation/`) le mesure deja et rapporte un constat
  sans jamais bloquer. Est-ce que ce constat se declenche en pratique, et le
  budget est-il le bon pour ce moteur ;
- le cout en tokens de la nouvelle composition contre l'ancienne, par plan -
  la seule mesure qui reponde vraiment a "est-ce que ca vaut ce que ca coute".

**Ne pas ouvrir ce ticket avant que l'auteur ait produit plusieurs sequences
avec la nouvelle composition.** Son interet est entierement dans les donnees
reelles ; le faire a froid reviendrait a regler des seuils contre une intuition.

## Maintenant - Generation sans Project Style (MVP)

`GEN.PROJECT_STYLE.APPEND.TOGGLE.1` - **clos a `05b647e`**.
Dans les quatre surfaces Asset/Shot de **Generate Content**, ajouter une case
`Append Project Style`, active par defaut. L'opt-out doit retirer seulement
l'injection automatique de Style du payload reel et de sa provenance, sans
modifier le consumer cote client ni reinjecter le Style lors d'un retry.

## Termine - Capture depuis Sequence Result (MVP)

`SEQRESULT.FRAME.CAPTURE.DESTINATIONS.1` - **clos a `8997c89`**.
Depuis les players de Sequence Result **et** de Shot Approved Output, permettre
de choisir explicitement la destination de la frame capturee : les Shots de la
Sequence courante, ou les Assets du Project. Dans le mode Assets, la case
`Sequence casting only` est active par defaut et ne montre que les Assets lies
a la Sequence ; elle peut etre decochee pour retrouver tous les Assets du
Project. Ce ticket reutilise la capture et la persistance Asset Reference
existantes, sans schema, route, generation ou changement de provenance.

## Priorite absolue - Consolidation DB, sidecar et deploiement (10 aout 2026)

Avant tout nouveau chantier produit ou deploiement sur une autre machine, le
couple MikAI/OpenReel et ses donnees locales doivent devenir reproductibles et
verifiables. La cible reste volontairement simple : une instance MikAI, une
instance OpenReel sidecar, une SQLite sur disque local persistant et les
medias sur le meme volume persistant. Ce n'est pas encore une architecture
multi-instance ou multi-tenant.

1. `DB.HEALTH.REPAIR.1` - **termine le 2026-08-10**. Apres backup SQLite-aware,
   preuve sur copie et fenetre de maintenance explicite, les quatre index
   Project Style corrompus ont ete reconstruits et le graphe Research orphelin
   autorise par le user a ete retire. La DB live retourne maintenant
   `integrity_check = ok` et `foreign_key_check = 0`; le Projet 18 et les six
   autres projets valides sont restes inchanges. `DB.HEALTH.AUDIT.1` est
   absorbe comme phase obligatoire de ce ticket.
2. `OPS.DATA.BACKUP.RESTORE.1` - **clos, commite a `263d6f6`**. Backup et
   restauration de l'ensemble durable : SQLite (WAL compris) **et**
   `public/uploads`, `public/outputs`, `storage/uploads`, `storage/outputs`,
   avec verification de restauration sur copie et retention lisible.
3. `OPENREEL.SIDECAR.PROMOTION.1` - **clos**. Le sidecar upstream est
   promu a `476ad9f3d75c05cab5297b26af535dc9663f3fb4` sur `main`, tagge
   `mikai-sidecar-v1.0.0`; l'ancien `33f917a` reste disponible via le tag et
   la branche legacy. MikAI `748c12e` epingle exactement cette release dans
   `config/openreel-sidecar-release.json`.
4. `DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1` - **clos, commite a `92ac8a2`**.
   `install.bat`/`.sh`, `start.bat`/`.sh`, `update.bat`/`.sh` sont des
   wrappers minces autour d'un orchestrateur Node unique
   (`scripts/mikai-deploy.mjs`) qui consomme
   `config/openreel-sidecar-release.json` avec un schema strict ferme
   (jamais de repli sur `upstream/main` ou une branche). Preserve
   `.env.local`/DB/medias, sauvegarde (`npm run backup:create`) avant toute
   migration existante, cree/deplace le sidecar exactement au commit
   epingle (jamais un merge/rebase pour MikAI - fast-forward seulement).
   Preuves disposables reelles (clone git local, worktrees jetables,
   ports isoles, nettoyage complet) : matrice de validation du pin (33/33),
   ordre des commandes avec faux runner (26/26), install disposable de bout
   en bout (15/15), update disposable de bout en bout incluant refus
   sale/pin incompatible (19/19), demarrage isole + verification CORS
   scopee (8/8). Deux bugs reels trouves et corriges pendant les preuves :
   `shell:true` sur Windows corrompait `^{}` dans les arguments git, et
   `next build` doit s'executer apres la migration (pas avant) car il
   pre-rend des routes qui interrogent la DB. Le retake impose aussi le refus
   avant migration si un listener est actif, et le refus d'une origine sidecar
   erronee avant tout fast-forward MikAI.
5. `OPENREEL.SHOT.TARGET.DURATION.1` - **CLOS : approuve, commite et pousse**
   (`FB-20260810-003`). Apres un changement de vitesse explicite, envoyer la
   duree effective d'un clip MikAI vers la cible de production de son Shot.
   Le montage compact reste bloque pour les autres write-backs; aucun item
   editorial ni resultat existant n'est modifie. Sidecar: commite
   `d4a24bcab30e4b089c341d6fb4969e34960bd5ba`, tague `mikai-sidecar-v1.1.0`,
   `main` promu (fast-forward depuis `476ad9f`). MikAI: route existante
   inchangee (contrat deja suffisant, prouve par une base SQLite jetable) ;
   pin `config/openreel-sidecar-release.json` mis a jour et pousse
   (`72e1b9a3bbc6cdc6b51212c91395fb1be75bdbed`).
6. `DEVOPS.MIKAI.SERVICE.OPTIONAL.1` - **optionnel, apres le bootstrap**.
   Ajouter uniquement si utile des exemples de service persistant (systemd et
   equivalent Windows) pour redemarrage apres reboot/crash. Ce ticket ne bloque
   ni l'installation ni le lancement manuel par les scripts precedents.

Les mises a jour OpenReel suivent ensuite la meme discipline : branche depuis
un commit upstream precis, reapplication de la petite couche MikAI, tests du
bridge et smoke test navigateur, puis nouvelle paire de releases MikAI +
sidecar. Aucun update automatique ne suit `upstream/main` sans validation.

## Priorites autoritatives apres cloture de STYLE.1 - 2 aout 2026

L'epic `STYLE.1` (A a G) est `RESOLVED` : ses fonctions sont livrees, leurs
parcours visibles ont ete valides, et le gate transversal
`STYLE.1.ACCEPTANCE.1` est `ACCEPTED` (preuves techniques completes sur deux
retakes bornes, confirmation manuelle utilisateur recue le 2026-08-02). Le
prochain ordre de developpement recommande est temporairement precede par la
priorite utilisateur suivante:

- `UX.SETTINGS.CHAT.1` - remplace les ancres Settings par de vrais onglets,
  reserve le panneau droit au LLM Chat et borne ce Chat a la hauteur du
  viewport avec scroll interne. Regroupe `FB-20260715-001`,
  `FB-20260715-003` et `FB-20260715-004`. Implemente par Claude Code / Sonnet
  et pousse a `c0cf81e` (2026-08-03), `TO VALIDATE` en attente de confirmation
  manuelle utilisateur.
- `UX.VISUAL.CONSISTENCY.1` - ticket Claude Code / Sonnet regroupant huit
  retakes bornes: identite LLM Chat en Text Primary, typographie Custom
  Appearance bornee (taille/poids/style pour Display et Body/UI), contraste
  New Project, champs Edit alignes sur API Key, boutons LLM Apply unifies et
  label Camera Lab. Couvre `FB-20260715-002`, `FB-20260715-005`,
  `FB-20260715-006`, `FB-20260715-007`, `FB-20260716-032`,
  `FB-20260716-034`, `FB-20260716-037` et `FB-20260723-002`. Implemente par
  Claude Code / Sonnet (2026-08-03), preuves pures et navigateur en
  environnement isole (port 3100, DB jetable) completes, `TO VALIDATE` en
  attente de confirmation manuelle utilisateur et d'un nouveau verdict Codex
  avant commit/push.

Apres cette priorite UX, l'ordre recommande reste:

1. `SEQGEN.VIDEO.CUT.CORE.1` - contrat frame-exact, FFmpeg, nouvelle version
   durable, provenance parent/cut et source immuable;
2. `SEQGEN.VIDEO.CUT.UI.1` - player In/Out en frames, preview du troncon retire,
   controle du resultat puis publication explicite;
3. `OPENREEL.ROUNDTRIP.1` - vraie validation MikAI -> OpenReel -> MikAI avec
   snapshots anti-stale, timings et refus des mutations partielles;
4. `PROMPT.PACKAGE.MVP.1` - registry legere de packages par workflow et modele,
   avec references compatibles et provenance du prompt compile;
5. `STYLE.2.LOOK.CORRECTIONS.CORE.1` - propositions de correction du Working
   Draft depuis les Look Tests, sans mutation automatique ni modification des
   versions publiees;
6. `STYLE.2.LOOK.CORRECTIONS.UI.1` - comparaison, edition et application
   explicite des propositions de correction;
7. `STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1` - injection post-commit/read
   failure, etat `pending sync` et preuve que Retry ne rejoue aucune mutation;
8. `FILM.EXPORT.1` - export final controle;
9. `FILM.AUDIO.1` - pistes audio, musique et mix de preview;
10. `EDITORIAL.BACKPROP.1` - application volontaire de decisions editoriales
    aux Shots narratifs;
11. `DIRECTOR.ASSIST.1` - assistance narrative, couverture, continuite et
    coherence du monde;
12. `LLMCHAT.CONTEXT.1` - contexte optionnel Project/Sequence/Shot;
13. `LLMCHAT.TOOLS.1` - actions MikAI controlees depuis le chat.

`STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1` est une dette de resilience bornee,
pas un blocage fonctionnel. Les deux tickets `SEQGEN.VIDEO.CUT.*` forment le
prochain chantier produit recommande immediat.

## Registre complet STYLE.1 - livraison fonctionnelle complete

Prerequis externe a l'epic:

- `STYLE.RESEARCH.SPIKE.1` - choix OpenRouter Web Search et politique sans
  re-fetch arbitraire.

Tickets livres:

1. `STYLE.1.A` - fondation durable, Working Draft, versions immuables,
   compilation sparse et workspace (`6c89bfb`);
2. `STYLE.1.B.CORE` - persistance Reference Board et Creative Influences
   (`bd36159`);
3. `STYLE.1.B.UI` - surfaces Reference Board et Creative Influences
   (`7851c31`);
4. `STYLE.1.C.ARCHITECTURE.1` - architecture read-only du Research;
5. `STYLE.1.C.CORE` - Research source, synthese, claims et Candidate Rules
   (`744fce3`);
6. `STYLE.1.C.UI` - workflow Discover/Sources/Synthesis/approval (`d120e03`);
7. `STYLE.1.C.SEARCH.FIX1` - citations OpenRouter et provider Research herite
   ou decorelle (`9a0d96b`);
8. `STYLE.1.D.CORE` - heritage Project Style et override Sequence canonique
   (`5842b52`);
9. `STYLE.1.D.UI` - panneau Sequence Style (`0365978`);
10. `STYLE.1.E.CORE.1` - source Style canonique pour les generations
   (`dda1674`);
11. `STYLE.1.E.SURFACES.1` - injection Asset et Shot image/video/storyboard
    (`6288d39`);
12. `STYLE.1.E.SURFACES.2` - injection Sequence Storyboard et Sequence Video
    (`5e92d71`);
13. `STYLE.1.F.CORE` - contrat d'alignement des Assets (`1fe873e`);
14. `STYLE.1.F.UI` - preview/edit/apply de l'alignement Asset (`e748266`);
15. `STYLE.1.G.CORE.1` - donnees, generation et lifecycle Look Development
    (`d4c768c`);
16. `STYLE.1.G.UI.1` - Look Development generation bench (`d1c383c`);
17. `STYLE.1.G.UI.2` - review, comparaison, notes, target et rerun
    (`a1bf1c3`);
18. `STYLE.1.POLISH.1` - ergonomie Reference Board et Look Development
    (`82b04d0`);
19. `STYLE.1.B.ANALYSIS.CORE` - analyse multimodale, provenance,
    Observations et Candidate Rules (`4ccff59`);
20. `STYLE.1.B.ANALYSIS.UI` - selection, confirmation, review et approbation
    vers le Working Draft (`72f9d89`).

Gate de cloture, termine:

21. `STYLE.1.ACCEPTANCE.1` - `ACCEPTED` le 2026-08-02 : validation
    utilisateur transversale de A a G, controle des parcours Project,
    Sequence, Asset et generation, verification de la provenance, des
    versions, des overrides et des refus cross-Project, reconciliation de
    `docs/PROJECT_STATE.md`, `docs/ROADMAP.md` et `docs/USER_FEEDBACK.md`,
    audit final du code mort, des migrations et de leur applicabilite.
    N'a ajoute aucun comportement produit. Detail complet dans
    `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md`. **L'epic `STYLE.1` est
    formellement clos.**

`STYLE.1.G.CORRECTIONS.1` n'appartient plus au MVP: il a ete remplace par les
deux tickets `STYLE.2.LOOK.CORRECTIONS.*` ci-dessus.

## Etat actuel

Tickets recemment termines:

- `OPENREEL.INSERT.1` - insertion de shots MikAI dans OpenReel.
- `FILM.RESULT.2` - polish de l'espace Film Result.
- `OPENREEL.TIMING.1` - push explicite de la duree cible de production.
- `OPENREEL.BRIDGE.1` - panneau MikAI Bridge collapsable.
- `FILM.RESULT.3` - polish MVP du Film Result.
- `BASIC.EDITORIAL.2` a `.5` - montage MVP et polish des trims.
- `STORAGE.CLEANUP.1` - audit et nettoyage controle du storage.
- `CREATIVE.1.A` et `PROMPTUX.1` - audit et polish du systeme de prompts.
- `UX.POLISH.2` a `.4` - edition, players et panneau droit.
- `THEME.MIKROS.1` a `.5` - mode Custom, palette, polices et logo.
- `REFROLE.MVP.1` - catalogue partage et harmonisation des roles de references.
- `AI.ASSET.BIBLE.1` - Enhance Asset Bible depuis Description + Notes, avec
  apercu editable et application explicite.
- `THEME.CUSTOM.IMPORT.1` - import JSON, collage JSON, edition des themes et
  textures decoratives optionnelles.
- `PLAYER.AUDIO.1` - audio dans `VideoFrameReviewPlayer`.

Developpement courant:

- L'epic `STYLE.1` est `RESOLVED` : ses fonctions sont livrees (dernier
  gate applicatif pousse a `72f9d89`) et `STYLE.1.ACCEPTANCE.1` est
  `ACCEPTED` (2026-08-02). Les evolutions correctives du Style et le
  hardening pending-sync appartiennent desormais a `STYLE.2`.
- Le prochain chantier recommande est `SEQGEN.VIDEO.CUT.CORE.1`, suivi de
  `SEQGEN.VIDEO.CUT.UI.1`.
- `CAMLAB.POLISH.2` est termine et valide (`41d7004`) : mapping nominal des
  deux images Gaussian-to-image et inputs textuels/scalaires additionnels.

- `CAMLAB.POLISH.1`, `CAMLAB.VIEWER.CONTROLS.1` et `CAMLAB.POLISH.2` sont
  termines, pousses et valides par l'utilisateur : Camera Lab est un workspace
  guide a trois colonnes avec generation PLY, viewer/capture, controles de
  profondeur/zoom et Gaussian-to-image a mapping nominal strict.
- `SEQGEN.1` est termine : package Seedance read-only, deterministe et
  inspectable pour les Shots ordonnes d'une Sequence.
- `SEQGEN.STORYBOARD.2` et `SEQGEN.STORYBOARD.2-FIX` sont termines : workspace
  Storyboard dedie, generation d'images storyboard par Shot, casting unique,
  selection de references, drafts persistants et CTA de generation explicite.
- `SEQGEN.STORYBOARD.3`, ses retakes Dynamic Input et
  `SEQGEN.STORYBOARD.EXTRACT.1` a `FIX6` sont termines.
- `SEQGEN.VIDEO.1` est termine et pousse (`89c28d1`) : les Sequence Video
  Drafts durables sont disponibles depuis Storyboard.
- `SEQGEN.SPLIT.1`, `SEQGEN.SPLIT.WORKSPACE.1` et le correctif EOF sont
  termines : detection FFmpeg, review/correction unifiee et validation
  persistante du mapping segments -> Shots.
- `SEQGEN.PUSH.1` est termine et pousse (`31441d3`) : un Split Plan valide
  produit des clips physiques durables comme candidats video sur les Shots,
  avec review et approbation explicites, sans remplacement automatique.
- `SEQGEN.PUSH.2`, `SEQGEN.PUSH.2-FIX1`, `SEQGEN.SPLIT.MINFRAMES.1` et
  `SHOT.VIDEO.LIBRARY.1` sont termines : durees optionnelles, first frames,
  thumbnails Storyboard, segments courts frame-native et bibliotheque video
  Shot reutilisable sont disponibles.
- `DEV.LAUNCHER.CLEANSTART.1` est termine et pousse (`8a2ebd9`) : les anciens
  serveurs MikAI/OpenReel reconnus sont arretes proprement avant dev/prod.
- `SEQGEN.KEYFRAMES.1` est retire : l'extraction manuelle de frames est deja
  couverte par `Capture Frame` dans le player Shot.
- `SEQGEN.SPLIT.CLEANUP.1` et ses retakes FIX2/FIX3/FIX4 sont termines et
  pousses (`57f24f6`). `CAMLAB.SPIKE.1`, `CAMLAB.PLY.1` puis
  `CAMLAB.VIEWER.1` puis `CAMLAB.SHOTREF.1` sont termines et pousses
  (`c9d2982`) : le PLY Gaussian est
  recupere de facon confinee, valide, stocke comme artefact de job et servi
  avec Range; Camera Lab offre maintenant un viewer PlayCanvas et une capture
  PNG locale a la resolution exacte de la reference explicitement choisie,
  puis sa confirmation atomique comme reference Shot au role `camera`.
  `SEQGEN.STORYBOARD.1` et `STORY.WORKSPACE.MERGE.1` sont termines.
  `EDITORIAL.SHORTCUT.1` est termine : raccourci Editorial persistant dans la
  navigation Project, Sequence et Shot.
  `EDITORIAL.NAV.1` est termine : navigation entre sequences dans Editorial
  et acces plus clair vers OpenReel.
  `UX.3.PRODUCTION.WORKSPACE.1` et `UX.WORKSPACES.AUDIT.1` sont termines.
  `UX.3.PROMPT.WORKSPACE.1` reste mis en attente pour arbitrage produit.
  `UX.2.LLMCHAT.DISCLOSURE.1` est termine : chat replie par defaut
  dans la colonne ouverte, et bouton flottant conserve avec la couleur Top bar.
  `UX.2.RIGHTPANEL.DISCLOSURE.1`, `UX.2.SETTINGS.NAV.1` et les quick wins
  `UX.1` sont termines.

Dernier ticket produit termine:

- `THEME.TOPBAR.MASK.1` - couleur TopBar dediee et texture rendue par masque
  alpha, avec le Canvas comme fond des zones transparentes.

## Sequence Seedance MVP (handoff de reference)

Cette sequence est la priorite acceptee pour le MVP Seedance et complete la
roadmap creative generale. `SEED.MVP.0` correspond a l'audit/handoff initial.

1. `SEED.MVP.0` - termine
2. `ASSET.BIBLE.1` - termine
3. `ASSET.BIBLE.2` - termine
4. `GEN.SEEDANCE.1` - termine
5. `PROMPT.COMPILER.1` - termine
6. `PROMPT.COMPILER.1-FIX` - termine
7. `PROMPT.COMPILER.2` - termine
8. `PROMPT.COMPILER.3` - termine
9. `GEN.SEEDANCE.2` - termine
10. `GEN.SEEDANCE.3` - termine ; aucun workflow First/Last Frame reel n'etait
    disponible, donc aucun profil actif n'a ete invente

Regle de priorite : ne pas intercaler `REFROLE.1`, `PROMPT.PACKAGE.MVP.1` ou `PROMPT.2`
entre ces tickets Seedance sans nouvel arbitrage produit explicite.

## Axe Editorial et OpenReel

Fondations deja disponibles:

- Editorial Workspace par sequence;
- preview de sequence;
- trims et selection par item editorial;
- gaps temporels et black hold;
- `sequence_editorial_items` separe des shots;
- trims par occurrence;
- resize non-ripple;
- `EditorialDocument` comme couche d'adaptation;
- bridge OpenReel import, timing start-only, snapshot anti-stale, insertion,
  publish Advanced et push de duree de production.

Separation architecturale:

```text
shots -> narration, production, prompts, casting, generation
sequence_editorial_items -> montage, occurrences, trims, timing, gaps
```

Backlog apres le bloc immediat:

- `OPENREEL.ROUNDTRIP.1` - verifier un vrai aller-retour MikAI <-> OpenReel;
- `FILM.EXPORT.1` - export final controle;
- `FILM.AUDIO.1` - piste audio, musique et mix de preview;
- `EDITORIAL.BACKPROP.1` - appliquer volontairement certaines decisions de
  montage aux shots narratifs.

## Axe Creative Direction et Prompts

Cet axe vient apres le bloc Film Result/OpenReel.

1. `CREATIVE.1.A` - audit du Creative Prompt System sur Story, Outline,
   Sequence, Shot, Casting, Assets, Style Bible, References, Prompt Packages,
   workflow selectionne et prompt compile.
2. `PROMPTUX.1` - edition claire du prompt, distinction prompt utilisateur /
   prompt compile, sources visibles, Fill/Replace/Append/LLM Assist et panneau
   Generate conserve ouvert.
3. `STYLE.1` - epic Project Style V1 defini dans
   `docs/PROJECT_STYLE_MVP_SPEC.md`: World & Design Language, Visual
   Treatment, Creative Influences avec recherche sourcee, Reference Board,
   Style sparse et versionne, override Sequence, alignement Assets, injection
   dans les prompts et Look Development image/video.
   Le decoupage d'execution et l'allocation des modeles sont fixes dans
   `docs/PROJECT_STYLE_EXECUTION_PLAN.md`. Tous les tickets fonctionnels
   `STYLE.1`, y compris `STYLE.1.B.ANALYSIS.CORE` et
   `STYLE.1.B.ANALYSIS.UI`, sont termines et le flux visible a ete valide par
   l'utilisateur. La cloture transversale `STYLE.1.ACCEPTANCE.1` est
   `ACCEPTED` (2026-08-02) : l'epic est formellement clos.
   Les propositions de correction du Style depuis les resultats Look
   Development sont reportees a `STYLE.2.LOOK.CORRECTIONS.CORE.1` puis
   `STYLE.2.LOOK.CORRECTIONS.UI.1`.
   Le hardening navigateur de la reprise apres commit connu mais relecture
   echouee est reporte a `STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1`. Ce ticket
   devra injecter la panne post-commit, prouver `pending sync` et confirmer que
   `Retry sync` ne rejoue jamais la mutation.
4. `REFROLE.1` - roles precis pour images et videos: First Frame, Last Frame,
   Character, Environment, Style, Camera, Motion, Rhythm, Continuity Anchor,
   Keyframe et Storyboard Frame.
5. `PROMPT.PACKAGE.MVP.1` - bibliotheque de packages par workflow et modele:
   Seedance, GPT Image, animation, camera et continuite.
6. `PROMPT.2` - rework du compiler selon la tache: image, character design,
   environment, keyframe, image-to-video, first/last frame, reference-to-video,
   extension, negative prompt et timed segments.

## Axe Generation et Workflows ComfyUI

Deja largement disponible: Workflow Library, workflows image/keyframe/video,
detection des noeuds Input, prompts dynamiques, Generate Content, workflow par
defaut, selection/upload d'images, generation/regeneration, approbation,
approved video au niveau Shot, lecteur frame-aware, extraction de frame,
Dynamic Batch et panneaux Asset/Shot.

Backlog:

- `SEQGEN.STORYBOARD.3` / `SEQGEN.STORYBOARD.2` / `SEQGEN.1` /
  `SEQGEN.SPLIT.1` / `SEQGEN.PUSH.1` -
  workflow Seedance au niveau Sequence: preparer et approuver les images
  storyboard, produire une planche Sequence, compiler les prompts des shots,
  produire une video sequence
  bout-a-bout, detecter les
  splits attendus, reviewer le mapping, puis pousser les clips comme candidats
  video vers les shots existants. Voir
  `docs/SEQUENCE_LEVEL_SEEDANCE_DRAFT.md`.
- `SEQGEN.STORYBOARD.EXTRACT.1` - detecter une planche Sequence, previsualiser
  et corriger ses regions, puis creer des drafts storyboard Shot avec
  provenance durable et thumbnails associes.
- `SEQGEN.STORYBOARD.EXTRACT.1-FIX5` - presets de crop de contenu pour
  retirer headers/captions des planches, avec application globale previsualisee
  et reglages persistants dans `paramsJson`.
- `SEQGEN.STORYBOARD.EXTRACT.1-FIX6` - diagnostics avances Otsu/Canny/Grid,
  parametres bruts documentes, upload/suppression controlee des Sequence
  Storyboard Drafts, et cropboxes avec ratios/verrouillage/multiplicateur.
- `SEQGEN.VIDEO.1` - depuis le workspace Storyboard, choisir explicitement une
  planche Sequence, executer un workflow video Seedance avec le package et les
  references compatibles, puis sauvegarder une video brute versionnee au
  niveau Sequence. Cette video est la source durable de `SEQGEN.SPLIT.1` et ne
  modifie encore aucun Shot ni Sequence Result.
- `WFBUILD.1.B` - stabilisation finale du Dynamic Batch si necessaire;
- `GEN.VRAM.1` - option de purge Ollama avant ComfyUI;
- `LLM.VRAM.1` - option de purge ComfyUI avant Ollama;
- `ASSET.1.E` - dernier polish de generation d'Assets et references.

## Axe Gaussian Camera / SHARP

Priorite acceptee le 20 juillet 2026 : depuis un Shot, choisir une image,
produire un Gaussian Splat `.ply` avec ComfyUI, cadrer la scene dans un viewer
MikAI, puis enregistrer un snapshot confirme comme reference `camera`.

Ordre obligatoire :

1. `CAMLAB.SPIKE.1` - termine : contrat ComfyUI reel, recuperation confinee
   du PLY et comparaison viewer avec un vrai fichier;
2. `CAMLAB.PLY.1` - termine : artefacts PLY securises dans le bridge,
   polling, cache de jobs et route HTTP Range (`679b5c2`);
3. `CAMLAB.VIEWER.1` - termine : viewer PlayCanvas, camera et capture hors
   ecran exacte (`81592f2`);
4. `CAMLAB.SHOTREF.1` - termine : confirmation puis ajout atomique du snapshot dans
   `shot_reference_images` avec le role `camera` (`c9d2982`).
5. `CAMLAB.POLISH.1` - termine et pousse (`973169d`) : workspace guide image
   -> PLY -> viewer/snapshot -> Gaussian-to-image ;
6. `CAMLAB.VIEWER.CONTROLS.1` - termine et pousse (`13c3cc9`) : correction de
   profondeur Z non destructive, Reset camera adapte aux bounds transformes,
   molette normalisee et sensibilite Fine/Normal/Fast avec `Alt + Wheel` ;
7. `CAMLAB.POLISH.2` - termine, pousse et valide (`41d7004`) : mapping strict
   des deux images Gaussian-to-image et exposition des autres nodes `(Input)`.

Un historique reel expose deja `ply_file`/`filename` depuis
`GeomPackPreviewGaussian`, et `/view` sert ce PLY avec support Range. Cette
preuve doit etre reproduite et documentee avant de figer le contrat runtime.
La livraison produit avec les poids SHARP officiels reste soumise a la
clarification de leur licence; cela ne bloque pas le spike technique local.

## Axe Story, Outline, Sequences, Shots et Assets

Deja disponible: Story Workspace, Pitch/Story/Notes, Outline Builder,
generation/application d'outline, Sequence Builder, generation de shots,
extraction d'assets, casting suggestions, Shot Detail narratif, continuite,
contexte camera, Prompt Composer et enrichment d'assets.

Backlog:

- `DIRECTOR.ASSIST.1` - MikAI Director Assist : analyse et accompagnement
  transversal de la narration, de la couverture, de la continuite, du casting
  et de la coherence du monde. Le perimetre sera precise dans une discussion
  produit dediee avant implementation;
- `ASSET.USAGE.1` - utilisation narrative et visuelle d'un asset.

### AI Assist pour les Assets

- `AI.ASSET.DESCRIPTION.1` - `Enhance Description`: ameliorer la description
  d'un asset avec l'assistance LLM, avec apercu et application explicite par
  l'utilisateur;
- `AI.ASSET.BIBLE.1` - `Enhance Asset Bible`: remplir ou ameliorer les champs
  textuels `Visual Identity`, `Usage Rules` et `Forbidden Variations` de la
  section Asset Bible a partir des informations presentes dans `Description`
  et `Notes`, avec apercu, edition et application explicite. Aucun champ ne
  doit etre ecrase silencieusement et aucune migration n'est necessaire.

### Theme Custom

- `THEME.CUSTOM.IMPORT.1` - importer une palette JSON contenant les huit
  tokens couleur, la previsualiser et l'ajuster avant `Save as custom`, sans
  persistance automatique.
- `THEME.TOPBAR.MASK.1` - texture TopBar alpha-maskee par une couleur dediee,
  sans teinte RGB imposee par l'image.

## Axe LLM Chat et assistance locale

Deja disponible: LLM Chat dans le panneau droit, choix Ollama, Markdown,
System Prompts, hauteur du chat et largeur du panneau redimensionnables.

Backlog:

- `LLMCHAT.CONTEXT.1` - contexte optionnel Project / Sequence / Shot;
- `LLMCHAT.TOOLS.1` - actions MikAI controlees depuis le chat;
- `TRANS.1.C.D` - traduction Shot Edit et Prompt Segments;

## Axe Outillage Codex / Claude

Deja disponible:

- `DEV.AGENTS.1` - structure `.agents/` et echange de tickets/rapports;
- `DEV.AGENTS.2` - review et gate Codex avec verdicts
  `APPROVED`, `REVISE`, `NEEDS_USER`.

Regles permanentes:

- jamais `git add .`;
- staging explicite;
- aucun commit sans `APPROVED` et `safeToCommit: true`;
- parcours utilisateur fourni pour chaque feature visuelle;
- pas d'extended thinking inutile pour les simples taches de commit/push.
- apres approbation, commit et push sont toujours demandes ensemble dans le
  meme prompt Claude, sauf demande utilisateur explicite de commit local.

## Vue condensee

## Reevaluation apres Seedance MVP

Le bloc Seedance a deja livre les presets, le Prompt Compiler, le handoff, les
profils generiques, les roles First/Last minimaux et les diagnostics. Les
prochaines taches doivent donc eviter de refaire ces fondations.

Ordre recommande a valider avant le prochain ticket:

1. `SEQGEN.STORYBOARD.3` - generation et sauvegarde d'une planche storyboard
   au niveau Sequence;
2. `SEQGEN.STORYBOARD.EXTRACT.1` - extraction OpenCV des vignettes de la
   planche Sequence et assignation confirmee aux Shots;
3. `SEQGEN.VIDEO.1` - generation et stockage durable d'une video Sequence
   brute depuis une planche Storyboard explicite;
4. `SEQGEN.SPLIT.1` - termine : detection et review des splits Sequence;
5. `SEQGEN.PUSH.1` - termine : decoupe et push explicite des clips candidats
   vers les Shots existants;
6. `SEQGEN.PUSH.2` - push optionnel des durees, extraction automatique de la
   first frame et thumbnail Storyboard explicite, modifiable depuis le Shot;
7. `SEQGEN.SPLIT.CLEANUP.1` - termine : supprimer en bloc les anciennes runs inutilisees
   sans casser la provenance des candidats deja pousses, et proposer une
   `Manual Detection` initialisant un plan d'un seul segment pour decoupe
   manuelle frame-exacte dans le player;
8. `CAMLAB.SPIKE.1` - gate technique PLY et comparaison des viewers sur le
   workflow ComfyUI reel;
9. `CAMLAB.PLY.1`, `CAMLAB.VIEWER.1`, `CAMLAB.SHOTREF.1` - MVP Gaussian Camera
   gate par gate;
10. `SEQGEN.VIDEO.CUT.CORE.1` puis `SEQGEN.VIDEO.CUT.UI.1` - retirer une plage
   frame-exacte d'un Sequence Video Draft et produire une nouvelle version
   durable apres preview utilisateur;
11. `PROMPT.PACKAGE.MVP.1` - registry legere de packages par workflow;
12. `OPENREEL.ROUNDTRIP.1` - valider le vrai aller-retour MikAI/OpenReel.

Decisions de backlog:

- `PROMPT.2` est a fusionner plus tard dans un ticket cible par usage;
- `WFBUILD.1.B` est largement couvert par `GEN.SEEDANCE.1`;
- `GEN.VRAM.1` et `LLM.VRAM.1` restent du confort operationnel;
- `GEN.3`, `G.4`, `EDITORIAL.VERSION.1`, `CASTING.CONTINUITY.1` et `WORLD.1`
  sont retires de la roadmap actuelle;
- `STORY.CONTINUITY.1` et `SHOT.COVERAGE.1` sont remplaces par
  `DIRECTOR.ASSIST.1`;
- `LLMCHAT.HISTORY.1` et `LLM.COMPAT.1` sont retires de la roadmap actuelle;
- `SEQGEN.*`, `FILM.EXPORT.1` et `FILM.AUDIO.1` restent des objectifs de
  moyen terme.

### Maintenant

0. **LLM Workspace Phase A - TERMINEE (2026-08-13).** A1 a A4 livres, commites
   et pousses (`0074f2e`, `6a730b6`, `f31416a`, `ba41bb3`, `cfc8745`). Detail
   dans `docs/PROJECT_STATE.md` et `docs/LLM_WORKSPACE_ARCHITECTURE.md` §9.
   Le depot dispose desormais de `npm test` - 22 constructeurs de prompt,
   99 tests, 86 instantanes. La Phase B n'est pas autorisee pour autant :
   le nommage de la section Settings (`FB-20260715-013`) reste une decision
   utilisateur, cf. §10.
0bis. `UX.PRODUCTIVITY.POLISH.1` - **commite et pousse** (`9b3d437`). L'entree
   precedente le donnait encore en attente de review et de commit ; corrige
   ici sur preuve directe de l'historique git. Le reste de cette section
   n'a pas ete reconcilie - la roadmap date de la periode 2026-08-02 et une
   reconciliation complete depasse ce que cette mise a jour a verifie.
1. `SEQGEN.VIDEO.CUT.CORE.1` - decoupe/concat frame-exacte, version durable et
   provenance, sans ecraser la source;
2. `SEQGEN.VIDEO.CUT.UI.1` - editeur In/Out en frames, preview et publication
   utilisateur;
3. `OPENREEL.ROUNDTRIP.1`;
4. `PROMPT.PACKAGE.MVP.1`.

Termine et pousse:

- `STYLE.1.ACCEPTANCE.1` - `ACCEPTED` le 2026-08-02, epic `STYLE.1` (A a G)
  formellement clos. Detail dans
  `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md`.
- `STYLE.1.A` - fondation durable, versions, compilation sparse, navigation
  et premier workspace Project Style (`6c89bfb`).
- `STYLE.1.B.CORE`, `STYLE.1.B.UI`, `STYLE.1.C.CORE` et `STYLE.1.C.UI` -
  Reference Board, Creative Influences et workflow Research source/approval
  (`bd36159`, `7851c31`, `744fce3`, `d120e03`).
- `STYLE.1.D.CORE` - override Sequence complet et resolver canonique
  Sequence/Shot (`5842b52`).
- `CAMLAB.SPIKE.1` - gate technique read-only, GO PLY et viewer PlayCanvas.
- `CAMLAB.PLY.1` - contrat d'artefact PLY securise, cache atomique, polling
  concurrent et HTTP Range (`679b5c2`).
- `CAMLAB.VIEWER.1` - viewer PlayCanvas Shot-scoped, controles camera et
  capture PNG locale hors ecran a la resolution source exacte (`81592f2`).
- `CAMLAB.SHOTREF.1` - confirmation explicite et sauvegarde atomique d'une
  capture Gaussian Camera comme reference Shot `camera` (`c9d2982`).
- `CAMLAB.POLISH.1`, `CAMLAB.VIEWER.CONTROLS.1` et `CAMLAB.POLISH.2` -
  workspace guide, controles ergonomiques du viewer et mapping Gaussian-to-
  image strict (`973169d`, `13c3cc9`, `41d7004`).
- `SEQGEN.SPLIT.CLEANUP.1` - Manual Detection, Clear unused past runs et
  retakes de navigation native vers le player (`57f24f6`).

### Ensuite - Creative / Prompts (apres le bloc Seedance)

5. `REFROLE.1`
6. `PROMPT.PACKAGE.MVP.1`
7. `PROMPT.2`

### Ensuite - Generation

1. `GEN.VRAM.1`
2. `LLM.VRAM.1`
3. `ASSET.1.E`

### Plus tard

16. Editorial round-trip et versions;
17. Film export et audio;
18. Continuite narrative et visuelle;
19. LLM Chat contextuel;
20. Traduction et compatibilite petits modeles;
21. Sequence-level Seedance draft, split controle et push vers shots;
22. Evolutions de l'outillage Claude Code <-> Codex.
