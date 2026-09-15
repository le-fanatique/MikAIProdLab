# `LLMW.CHAIN` — enchaîner des workflows LLM par blocs et connexions

**Statut : plan de chantier. Non approuvé, non planifié, non implémenté.**
Écrit le 2026-09-14 à la demande de l'auteur, pour un développement **après la
clôture de `DEVOPS.LINUX.PORT.1`** (P1 et la validation de P0.3). Rien ici
n'engage un ticket ; les décisions du §8 appartiennent à l'auteur.

Lectures obligatoires avant d'en tirer un ticket :
`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §4 et §5,
`docs/LLM_WORKSPACE_ARCHITECTURE.md` §2, §3.2, §7 et §8,
`docs/ARCHITECTURE_DECISIONS.md` § « No General Agentic Overlay — 2026-08-23 ».

---

## 1. La demande

L'auteur, 2026-09-14 :

> elle montre une mecanique de bloque et de connection , c est ce genre
> d interface que je voulais pour creer des template de workflow llm avec notre
> llm workbench.

La référence est la vidéo « Chain dependent tasks » de l'extension open source
Cline (tableau de tâches). Elle n'est pas versionnée dans le dépôt ; la
description ci-dessous a été faite à partir de 24 images extraites (deux par
seconde, 11,9 s, sans l'audio).

## 2. Ce que montre la vidéo — la mécanique, pas le dessin

**L'écran.** Un tableau à trois colonnes : **Backlog**, **In Progress**,
**Review**. Chaque tâche est une carte : un titre, une consigne en langage
naturel, un bouton ▶ par carte et un ▶ par colonne.

**La connexion.** L'utilisateur tire un lien depuis une carte et le lâche sur
une autre (curseur en croix). Une flèche courbe bleue apparaît entre les deux
cartes. Plusieurs cartes peuvent pointer vers la même carte, et une carte peut
dépendre de plusieurs autres. Le résultat est un **graphe orienté sans cycle**,
dessiné par-dessus un tableau, pas un canvas libre.

**Le déclenchement.** Une carte dont les prérequis ne sont pas terminés reste
dans Backlog. Quand le prérequis est clos (dans la vidéo, la carte en Review est
supprimée après validation), **ses dépendants passent seuls en In Progress**.
Les cartes sans lien entre elles tournent **en parallèle**, chacune isolée dans
son propre espace de travail (un worktree git par tâche).

**La porte humaine.** Une carte terminée ne s'applique pas toute seule. Elle
attend en Review, avec son résumé et deux actions explicites, `Commit` et
`Open PR`. Chaque nœud a sa propre validation.

**Les quatre propriétés à retenir :**

1. un nœud est une tâche existante et autonome — le lien ne la réécrit pas ;
2. un lien est une dépendance : « B attend A » ;
3. une règle de disponibilité : un nœud part quand tous ses prérequis sont
   clos, et les nœuds indépendants partent ensemble ;
4. une validation humaine par nœud, jamais automatique.

## 3. La traduction dans MikAI

### 3.1 Le test du workspace (`mikai-method` §10)

**Réponse : couvert en ajoutant des briques nommées.** Chaque nœud d'une chaîne
est un **descripteur qui existe déjà** — rien n'est réécrit. Ce qui manque est
ce qui relie les descripteurs : un format de chaîne, une règle de disponibilité,
un exécuteur de chaîne, et l'écran de blocs et de connexions. Ce sont des
briques de bibliothèque au sens de la règle du 2026-08-16
(`LLM_WORKSPACE_ARCHITECTURE.md` §11.3), pas une solution sur mesure.

**UC1 / UC2 / UC3 :** laissés intacts. Chacun reste une opération unique. Le
chantier ne les contraint pas ; il permet de les **composer** — par exemple
`shot.insertDirected` suivi de `narrativePrompt.compose` sur le plan créé.

### 3.2 Ce que ce chantier rouvre, et pourquoi c'est légitime

Trois textes du dépôt tiennent le canvas à nœuds à distance, et aucun ne
l'interdit :

- `LLM_WORKSPACE_ARCHITECTURE.md` §8 l'exclut **de la V1** — la V1 est livrée
  (Chantier 1 clos le 2026-08-19) ;
- §7 le garde comme **sortie prévue**, « posé sur le même format de template :
  le formulaire reste la vue simple, le canvas devient la vue avancée »,
  justifié « quand un vrai branchement apparaît » — et nomme le cas : un
  *fan-out* sur les Shots ;
- `ARCHITECTURE_DECISIONS.md`, 2026-08-23, refuse la surcouche agentique et dit
  que la réponse au branchement réel est **ce canvas**, pas un agent.

Le chantier est donc la sortie §7, ouverte par l'auteur. La décision de
l'ouvrir est à consigner dans `ARCHITECTURE_DECISIONS.md` au premier ticket.

Il répond aussi en partie à la question ouverte de `ROADMAP.md` §2,
« Assistance LLM — un système agentique ? » : une chaîne d'opérations
approuvées une à une est l'alternative **non agentique** à cette question.

### 3.3 Correspondance, propriété par propriété

| Vidéo Cline | MikAI | Existe déjà |
| --- | --- | --- |
| une carte | un nœud = un descripteur (`OperationDescriptor`) | oui, 24 fichiers sous `descriptors/` |
| la consigne de la carte | `intent.freeText` et `intent.parameters` du nœud | oui |
| Backlog (état) | nœud en attente : prérequis non approuvés | non |
| In Progress (état) | partie sèche du pipeline §2.1 (résolution, appel LLM, parse) | oui, `runOperation` |
| Review (état) + `Commit` | `ProposalPanel` : Approve / Redo / Cancel | oui |
| la flèche | lien de dépendance, avec ce qu'il transporte (§3.4) | non |
| départ auto des dépendants | règle de disponibilité (§3.5) | non |
| un worktree par tâche | l'ancre du nœud : chaque nœud lit sa propre entité | oui, `anchor` |
| parallélisme | limite de concurrence (§3.6) | non |

**Corrigé par le §4 — à lire avant d'aller plus loin.** Dans la vidéo, les
colonnes sont des **états** (Backlog, In Progress, Review). Dans ce que veut
l'auteur, les colonnes sont des **niveaux de profondeur** : racine, entités
parcourues, champs, opération, écriture. L'état d'un bloc ne se lit donc pas
par sa colonne : il s'affiche **sur le bloc** (pastille « waiting »,
« running », « review », « approved »). Ce que la vidéo apporte est
l'ergonomie — colonnes, blocs, liens tirés vers la droite — et la règle de
disponibilité, pas la signification de ses colonnes.

### 3.4 Ce qu'un lien transporte — deux natures

**Lien « bocal » (recommandé en premier).** A écrit une colonne à son Approve ;
B lit cette colonne par une variable qui existe déjà. Le lien ne transporte
aucune donnée : il dit seulement « B attend l'Approve de A ». C'est la mécanique
ingrédients / bocaux / recettes du §5.2 de la vision, rendue visible. Elle
existe déjà en implicite : `narrativePrompt.compose` remplit le bocal
`shots.narrative_prompt` (B12), que la composition storyboard consomme ensuite.

Deux propriétés gratuites : la chaîne **reprend d'elle-même** après fermeture
de la page, puisque l'état des bocaux est en base ; et rien ne contredit §6.1
(« rien n'est écrit avant approbation »).

**Lien « en mémoire » (à décider).** La proposition de A, pas encore approuvée,
alimente directement B. Plus rapide pour prototyper, mais il faut une nouvelle
source de variable (la sortie d'une étape), et un Redo de A doit invalider B en
cascade. Rien n'est écrit tant que l'auteur n'approuve pas, donc §6.1 tient ;
§6.2 (pas d'historique) tient aussi, puisque tout vit en mémoire.

### 3.5 La règle de disponibilité

Un nœud devient prêt quand **chacun** de ses prérequis est approuvé (lien
bocal) ou a une proposition courante (lien en mémoire). Les nœuds prêts et
indépendants peuvent partir ensemble. Un Cancel sur un nœud laisse ses
dépendants en attente ; il n'annule rien en amont.

**Ce que le départ automatique a le droit de faire :** la partie sèche
seulement — lire, appeler le modèle, parser. **Jamais un Approve.** §6.3 et §7 de la vision
(« pas d'actions autonomes, pas d'écritures en arrière-plan ») restent
entiers. Déclencher la partie sèche automatiquement coûte des tokens et de la
VRAM : c'est une décision de l'auteur (§8, décision 3).

### 3.6 Le parallélisme et la machine

Les appels LLM locaux passent par Ollama sur la même carte graphique que
ComfyUI ; `src/lib/vramManager.ts` arbitre déjà entre les deux. Une limite de
concurrence **par défaut à 1** est la valeur sûre : les nœuds indépendants sont
alors *prêts* ensemble mais partent l'un après l'autre. La limite se relève pour
un provider distant (OpenRouter).

### 3.7 Le fan-out — le vrai branchement

Le cas qui justifie le canvas selon §7 de l'architecture : un nœud qui crée N entités, puis un
nœud qui tourne **une fois par entité créée**. Exemple :
`shots.fromSequence` crée les plans, puis `narrativePrompt.compose` tourne sur
chacun, chaque exécution ayant sa propre Review.

**À vérifier en préparation, pas à supposer** (`mikai-method` §10b) : que les
actions d'insertion (`createGeneratedShots`, `createSelectedAssets`,
`createGeneratedSequences`) rendent les id créés, et pas seulement un compte.
Si elles ne les rendent pas, c'est une brique à construire.

## 4. La grammaire des colonnes — ce que l'auteur veut vraiment

**Précision de l'auteur, 2026-09-14, après la première version de ce plan.**
Ce qui l'intéresse dans la vidéo est d'abord **l'ergonomie** : des colonnes,
des blocs dans ces colonnes, et des liens tirés d'une colonne de gauche vers une
colonne de droite. Il veut s'en servir pour dire **quelles variables entrent
dans un autre bloc**. En ses mots :

> Genre avoir la premiere colonne avec un bloque projet, colonne d apres mettre
> un bloque sequence. Et connecter le bloc projet sur sequence, alors cela veux
> dire "in the project, for each sequence" et apres dans la collonne d apres
> mettre une variable de field ou d entity. Par exemple variable de field ca
> peut etre un bloc de pitch sequence, mais si je met un bloc de entity, c a
> sera un bloc shot par exemple. Dans le premier exemple ca fait "in the
> project, for each sequence, get pitch sequence field" , dans le deuxieme
> exemple cela donne "in the project,for each sequence, for each shot from each
> sequence..."

**Cette section est la plus importante du document.** Les §2 et §3 décrivent
l'enchaînement de tâches ; celle-ci décrit comment l'auteur veut **désigner le
contexte**. Les deux vivent sur le même tableau. Une session qui prépare un
ticket `LLMW.CHAIN` sans avoir lu cette section prépare le mauvais chantier.

### 4.1 La logique, formulée

Le tableau se lit **de gauche à droite**, et chaque colonne est **un niveau de
profondeur**. Il existe deux sortes de blocs et deux sortes de liens.

| Bloc | Ce qu'il est | Exemples |
| --- | --- | --- |
| **bloc entité** | un genre d'entité de MikAI | Project, Sequence, Shot, Asset |
| **bloc champ** | un champ d'une entité | le pitch, la description, l'action pitch d'un Shot |

| Lien | Se lit | Effet |
| --- | --- | --- |
| entité → entité | « **for each** Sequence **in** the Project » | un parcours : le bloc de droite est répété pour chaque entité liée |
| entité → champ | « **get** the field » | une projection : on garde ce champ, et seulement lui |

Les deux exemples de l'auteur, blocs et liens :

```text
Exemple 1
[Project] ──► [Sequence] ──► (pitch)
« In the project, for each sequence, get the sequence pitch. »

Exemple 2
[Project] ──► [Sequence] ──► [Shot] ──► …
« In the project, for each sequence, for each shot of that sequence, … »
```

Règles qui découlent de la logique :

- **le bloc de la première colonne est la racine** : l'entité d'où tout part.
  C'est l'ancre du descripteur (`anchor`), ou le projet entier ;
- **un lien va toujours vers la droite.** Pas de lien vers la gauche, pas de
  lien dans la même colonne : c'est ce qui garantit l'absence de cycle, sans
  algorithme à expliquer à l'utilisateur ;
- **un bloc entité peut porter plusieurs liens** : plusieurs champs projetés
  (« get the description **and** the action pitch »), plusieurs entités
  parcourues, ou les deux ;
- **un bloc champ est une feuille** côté contexte : il ne mène à aucune entité.
  Il peut seulement alimenter un bloc d'opération (§4.4) ;
- **le tableau affiche en permanence la phrase** que les liens composent, en
  anglais (règle de langue de l'interface, `AGENTS.md`) : « In the project, for
  each sequence, for each shot, get Description and Action Pitch. » La phrase
  est la preuve de lecture : l'auteur vérifie ce qu'il a dessiné sans ouvrir de
  JSON. C'est l'exigence de visibilité de la vision §6.4.

### 4.2 Le sens d'un lien dépend de la relation, pas du dessin

« For each » n'est vrai que du parent vers l'enfant. Le tableau doit dire
exactement ce que la relation fait :

| Lien | Cardinalité | Phrase |
| --- | --- | --- |
| Project → Sequence | un vers plusieurs | « for each sequence in the project » |
| Sequence → Shot | un vers plusieurs | « for each shot of the sequence » |
| Shot → Sequence | plusieurs vers un | « the sequence of the shot » — pas de « for each » |
| Asset → Shot | plusieurs vers plusieurs, par le casting | « for each shot where the asset appears » |
| Shot → Asset | plusieurs vers plusieurs, par le casting | « for each asset cast in the shot » |

**UC3 s'écrit exactement ainsi**, ce qui valide la grammaire contre la vision
§4 : `[Asset] ──► (visual identity)` et `[Asset] ──► [Shot] ──► (description),
(action pitch)`. « In the asset, get the visual identity ; for each shot where
the asset appears, get Description and Action Pitch. » Aujourd'hui, ce chemin
est une variable écrite à la main, `ASSET.SHOT_APPEARANCES`.

### 4.3 Ce que ça change dans le workspace — et ce que ça ne casse pas

**Aujourd'hui, le registre de variables est fermé** (`src/lib/llmWorkspace/
variables/registry.ts`, `VariableId` dans `types.ts`). Chaque variable est un
chemin **déjà écrit à la main** : un parcours, une projection et une borne
figés dans un resolver. `SEQ.SHOTS` est « for each shot of the sequence (20 au
plus), get shotCode, orderIndex, title, description, actionPitch ».
`PROJECT.SHOTS` traverse toutes les séquences. Chaque combinaison nouvelle
demande un resolver nouveau, donc un ticket.

**La grammaire des colonnes compose ces chemins au lieu de les écrire.** C'est
la vision §3.2 (« design by variable ») poussée jusqu'au bout : l'auteur ne
choisit plus seulement dans une liste de variables, il **construit** la
variable. C'est le troisième critère de succès de la vision §8 : prototyper un
workflow sans demander de ticket.

Ce qui doit tenir, et que le premier ticket doit prouver :

- **aucun accès brut au schéma.** Les blocs viennent d'un **catalogue déclaré** :
  les genres d'entité, les relations autorisées entre eux (le tableau du §4.2),
  et pour chaque entité les champs exposés. Rien d'autre n'apparaît dans le
  tableau. Un champ renommé en base se corrige **en un seul endroit**, le
  catalogue — le quatrième critère de succès de la vision §8 tient ;
- **l'isolation par projet** est la propriété sous test, comme pour B7c-n2 : un
  parcours ne sort jamais du projet de sa racine. Une fuite entre projets est un
  défaut de confidentialité, pas un défaut d'affichage ;
- **chaque niveau a une borne et un ordre déclarés** : `SEQ.SHOTS` borne à 20 et
  trie par `orderIndex`. Une séquence de trente plans ne doit pas produire un
  prompt sans limite. La borne est affichée sur le lien et modifiable ;
- **le résultat est typé, jamais une chaîne formatée** — le contrat des
  resolvers (architecture §3.1) s'applique à l'identique ;
- **les variables fermées existantes ne disparaissent pas.** Elles deviennent
  des chemins prédéfinis. La preuve d'acceptation du moteur de chemins est
  l'**égalité** : le chemin dessiné qui correspond à `SEQ.SHOTS`,
  `PROJECT.SHOTS` ou `ASSET.SHOT_APPEARANCES` rend exactement la même donnée que
  le resolver écrit à la main, sur la base réelle (`mikai-method` §3). Même
  méthode que les migrations B7e à B7h ;
- **chaque bloc champ montre sa valeur résolue et son coût en tokens** sur une
  entité de test, comme la bibliothèque de variables le fait déjà (B6c2,
  `/settings/llm-workflows/variables`).

**Détail à ne pas prendre pour acquis.** L'exemple 1 de l'auteur parle du
« pitch » d'une séquence. La table `sequences` n'a pas de colonne `pitch` (elle
existe sur `projects`) ; ses champs narratifs sont `summary`, `description`,
`narrativePurpose`, `mood`. L'exemple garde tout son sens. Le nom réel viendra
du catalogue.

### 4.4 Comment la grammaire rejoint l'enchaînement des §2 et §3

Un seul tableau, lu de gauche à droite, en trois zones :

```text
col. 1       col. 2        col. 3        col. 4             col. 5                      col. 6
[Project] ─► [Sequence] ─► (summary) ─────────────────► [narrativePrompt.compose] ─► Shot.narrative_prompt
                        └► [Shot] ────► (description) ─►        ▲
                                    └─► (action pitch) ─────────┘
<──────────────── contexte (§4) ──────────────────────>  <── opération (§3) ──>      <── écriture ──>
```

Lecture : « In the project, for each sequence, get Summary ; for each shot of
that sequence, get Description and Action Pitch ; compose the narrative prompt
of each shot. » Une Review par plan.

- **à gauche**, les blocs entité et champ désignent le contexte ;
- **au milieu**, un bloc d'opération est un descripteur : rôle, intent, appel
  au modèle ;
- **à droite**, la cible d'écriture, par l'`ActionId` déclaré du descripteur.
  Rien n'est écrit sans Approve ;
- **un « for each » en amont d'une opération la répète** : une exécution et une
  Review par entité parcourue. C'est le fan-out du §3.7, dessiné au lieu d'être
  configuré ;
- **une écriture peut redevenir un bloc champ** dans une colonne plus à droite :
  c'est le bocal de la vision §5.2, qui redevient ingrédient.

## 5. Chaînes d'acceptation

Construites **uniquement avec des descripteurs existants**. Un design qui ne
sait pas exprimer les trois est le mauvais design — même règle que les cas
fondateurs de la vision §4.

- **CH1 — linéaire, sur un Asset.** `assetDescription.generate` →
  `assetBible.generate` → `asset.promptCard`. Chaque étape lit le bocal de la
  précédente. La fraîcheur de la Bible (B10-f, S1) est déjà déclarée.
- **CH2 — du récit aux plans.** `story.generate` → `outline.generate` →
  `sequences.fromOutline` → `casting.fromSequence`. Une ancre projet, puis des
  entités créées en cours de chaîne.
- **CH3 — fan-out.** `shots.fromSequence` → `narrativePrompt.compose` sur chaque
  plan créé. Le seul des trois qui exige la brique §3.7.

Et pour la grammaire des colonnes (§4), trois chemins dessinés dont la donnée
doit être **égale** à celle d'une variable fermée existante, sur la base
réelle :

- **P1 —** `[Sequence] ─► [Shot] ─► (champs)` = `SEQ.SHOTS` ;
- **P2 —** `[Project] ─► [Sequence] ─► [Shot] ─► (champs)` = `PROJECT.SHOTS` ;
- **P3 —** `[Asset] ─► [Shot] ─► (description, action pitch)` =
  `ASSET.SHOT_APPEARANCES`, c'est-à-dire UC3.

Les projections exactes, les bornes et l'ordre de chacune se lisent dans leur
resolver (`src/lib/llmWorkspace/variables/registry.ts`), pas dans ce
document : les recopier ici créerait une deuxième source qui dériverait.

## 6. Ce que le chantier ne fait pas

- **Pas d'agent.** Aucun nœud ne choisit le suivant ; le graphe est dessiné par
  l'auteur.
- **Pas d'écriture générique.** Chaque écriture passe par l'`ActionId` déclaré
  du descripteur du nœud (§3.2 de l'architecture).
- **Pas d'historique d'exécution**, pas de table de runs, pas de statuts
  persistés (§6.2 de la vision, §8 de l'architecture). L'état d'une chaîne se
  recalcule depuis la base et la mémoire de la page.
- **Pas de conditions ni de boucles.** Graphe sans cycle, sans branche
  conditionnelle. Une boucle de critique croisée est un chantier ultérieur.
- **Pas l'orchestration de B20e.** Transaction en deux phases, clé
  d'idempotence, poignée de confirmation : ce sont des besoins d'une seule
  action (`ARCHITECTURE.md` §11.3, « B20e re-measured »). Ne pas fusionner.
- **Pas n8n.** L'exécuteur reste `inProcess`.
- **Ne remplace pas l'éditeur de template (E1).** Le formulaire édite un nœud ;
  le tableau relie des nœuds.

## 7. Découpage proposé

Chaque ligne est un ticket candidat. L'ordre suit la méthode : cœur pur et
filet avant tout écran.

| # | Ticket | Livre | Migration / dépendance |
| --- | --- | --- | --- |
| 0 | `LLMW.CHAIN.SCOPE.1` | Les décisions du §8 tranchées avec l'auteur ; la vérification §3.7 faite sur le code ; la décision consignée dans `ARCHITECTURE_DECISIONS.md` | aucune |
| 1a | `LLMW.CHAIN.PATH.1` | **Le moteur de chemins du §4, sans écran.** Le catalogue déclaré (entités, relations et leur cardinalité, champs exposés, borne et ordre par défaut) ; un chemin = racine + parcours + projections ; son résolveur typé ; la phrase anglaise générée depuis le chemin. Preuves : égalité avec P1, P2, P3 sur la base réelle ; isolation par projet prouvée par mutation | aucune attendue |
| 1b | `LLMW.CHAIN.PATH.2` | Un descripteur peut lire un chemin **à la place** d'une variable fermée. Le validateur de template l'accepte, le bench l'affiche avec sa valeur résolue et son coût | aucune attendue |
| 1 | `LLMW.CHAIN.CORE.1` | Le format de chaîne (nœuds = id de descripteur + ancre + intent, liens) et son validateur pur : descripteurs existants, absence de cycle, compatibilité d'ancre, lien bocal cohérent (la variable lue par B correspond à la colonne écrite par A). Règle de disponibilité et ordre topologique en modules purs. Tests vitest et mutations | selon décision 1 |
| 2 | `LLMW.CHAIN.RUN.1` | Exécution d'une chaîne **linéaire** dans l'établi, liens bocal uniquement, un Approve par nœud. CH1 passe de bout en bout | aucune attendue |
| 3 | `LLMW.CHAIN.BOARD.1` | L'écran du §4 : colonnes de profondeur, blocs entité / champ / opération / écriture, lien tiré vers la droite seulement, phrase anglaise en direct, valeur et coût par bloc champ, état affiché sur le bloc, ▶ par bloc et par tableau. Validation navigateur Playwright | selon décision 4 |
| 4 | `LLMW.CHAIN.FANOUT.1` | Un nœud par entité créée en amont. CH3 passe | selon §3.7 |
| 5 | `LLMW.CHAIN.MEMORY.1` | Liens en mémoire et invalidation en cascade au Redo — seulement si la décision 2 le retient | aucune attendue |
| 6 | `LLMW.CHAIN.SURFACE.1` | Un bouton de surface produit qui lance une chaîne par identifiant, comme §6.6 le fait pour un template | aucune attendue |

**Contraintes du dépôt qui s'appliquent au ticket 3.** Pas de harnais DOM
(`mikai-method` §5) : la logique du graphe vit dans les modules purs du
ticket 1, le composant ne porte que l'affichage et les gestes, et le rendu se
vérifie dans un vrai navigateur. Aucune bibliothèque de graphe n'est installée
(`package.json` ne contient ni `@xyflow/react` ni équivalent) : en ajouter une
exige une autorisation explicite.

## 8. Décisions qui appartiennent à l'auteur

1. **Où vit une chaîne.** Un nouveau genre de document dans `llm_templates`
   (aucune migration, mais le validateur de template apprend un deuxième
   genre) ou une table dédiée (migration). Recommandation : la première
   option, tant que rien ne demande une requête sur les liens.
2. **Liens en mémoire, ou bocaux seulement.** Recommandation : bocaux d'abord
   (tickets 1 à 4), liens en mémoire ensuite si le prototypage le réclame.
3. **Départ automatique de la partie sèche** quand les prérequis sont
   approuvés, ou ▶ manuel par nœud. Recommandation : automatique, avec limite
   de concurrence à 1 ; l'Approve reste toujours manuel.
4. **Tableau à colonnes ou canvas libre.** **Tranché par l'auteur le
   2026-09-14 : les colonnes**, avec la grammaire du §4. Reste à décider si
   l'écran se dessine sans bibliothèque (cartes et flèches SVG, aucune
   dépendance nouvelle) ou avec une bibliothèque de graphe (autorisation de
   dépendance). Recommandation : sans bibliothèque — des colonnes fixes et des
   liens toujours vers la droite ne demandent ni placement automatique ni
   zoom.
5. **Portée** : chaînes globales, épinglables à un projet, comme les templates
   (§6.5 de la vision) — à confirmer.
6. **Le catalogue du §4.3 : quels champs sont exposés.** Tous les champs
   texte des quatre entités, ou une liste choisie. Recommandation : une liste
   choisie, qui démarre avec les champs que les variables fermées projettent
   déjà — ils sont tous prouvés en usage.
7. **Le devenir des variables fermées.** Elles restent comme chemins
   prédéfinis (recommandé : zéro régression sur les descripteurs existants),
   ou elles sont réécrites en chemins une fois l'égalité prouvée — ce qui
   supprime des resolvers mais touche chaque descripteur qui les lit.
8. **Filtres sur un « for each ».** « For each shot where the asset appears »
   est une relation ; « for each shot where duration > 5 s » est un filtre.
   Recommandation : relations seulement en premier, filtres hors périmètre
   jusqu'à un besoin réel.
