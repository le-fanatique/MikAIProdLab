# MikAI ProdLab — Roadmap

Réconciliée le 2026-08-21, contre `git log` et le code, après le chantier LLM
Workspace, le nettoyage du Chantier 2 et le début de la refonte caméra.

La version consolidée du 2 août 2026 — 696 lignes, dont quatre registres de
livraison qui se répétaient — est archivée dans
`docs/archive/ROADMAP_2026-08-02.md`. Elle garde le détail commit par commit de
`STYLE.1`, Seedance MVP, Camera Lab et SEQGEN. **Elle n'a plus autorité sur
aucune priorité.**

Ce document dit trois choses et rien d'autre : ce qui est en cours, ce qui
attend un arbitrage de l'auteur, et ce qui reste ouvert. L'état du produit vit
dans `docs/PROJECT_STATE.md`.

MikAI doit rester un outil de direction créative et de production pour film
d'animation, de la narration au montage et au film final, et non une simple
interface « prompt → génération ».

```text
Pitch -> Story -> Outline -> Sequences -> Shots -> Assets
-> Direction artistique -> Prompts adaptes aux modeles
-> Generations -> Montage -> Film final
```

---

## 1. En cours

**Chantier « Galerie de templates de génération »**, ouvert le 2026-08-22 à la
demande de l'auteur, après l'étude du catalogue `Comfy-Org/workflow_templates`.
Aucun workflow n'est importé de ce projet : seul le design du catalogue sert de
référence.

Le problème : choisir un workflow pour générer, c'est lire une liste plate,
dupliquée dans cinq pages, où tout apparaît partout — le seul filtre existant
est `kind === "image"`.

| Ticket | État | Ce qu'il fait |
| --- | --- | --- |
| `WF.CATALOG.1` | **clos** — `cf5e5a8`, migration `0061` appliquée | le module pur `workflowCatalog.ts` (six contextes, huit catégories, `isWorkflowOfferedIn`) et six colonnes additives sur `comfy_workflows` |
| `WF.CATALOG.2` | à venir | l'écriture : upload de vignette, validation stricte, formulaires du manager |
| `WF.GALLERY.1` | à venir | la vitrine : composant partagé, adoption par les cinq pages, filtrage par contexte |

Les deux chantiers précédents, `SEQGEN.STORYBOARD.SHOTRANGE.1` et
`SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1`, sont clos — voir la section 6.

Le reste demande une décision de l'auteur (section 2) ou attend ses données
réelles.

**Deux traces laissées par la conversion caméra**, mesurées après coup et
détaillées dans `docs/PROJECT_STATE.md` : six plans ont perdu leur angle de
caméra en même temps que `camera_pitch` — récupérables dans une sauvegarde
antérieure au 2026-08-21, sans rien restaurer — et deux `shot_size` contiennent
une phrase tronquée au lieu d'un code. Ni l'un ni l'autre ne bloque quoi que ce
soit ; ils attendent que tu décides.

---

## 2. Ce qui attend un arbitrage de l'auteur

Ces sujets ne sont pas bloqués techniquement. Ils demandent une décision
produit, et personne d'autre ne peut la prendre.

| Sujet | Ce qui manque |
| --- | --- |
| **B18** — contraintes négatives | l'auteur l'a lui-même classé hors MVP. Vrai manque, pas une urgence |
| **B20e** — migration de l'analyse Reference Board | ses bloqueurs se sont révélés être de l'orchestration, pas du format (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3). Un chantier à concevoir avec lui, pas un ticket à préparer |
| **Finetuning du prompt storyboard** | ouvert le 2026-08-20. Ordre des parties, ce que chaque partie émet, budget de mots du guide, coût en tokens par plan. **Ne pas ouvrir avant que plusieurs séquences aient été produites avec la nouvelle composition** — son intérêt est entièrement dans les données réelles |
| **Les composants restés à plat** | C4 en a rangé 31 par domaine et en a laissé 100 délibérément ; 89 attendent encore un domaine. Leur classement est un jugement produit |
| **Assistance LLM — un système agentique ?** | `LLMCHAT.CONTEXT.1` et `LLMCHAT.TOOLS.1` fusionnent. L'auteur, 2026-08-21 : donner un contexte au chat puis lui donner des outils, séparément, n'a plus de sens depuis que le workspace sait résoudre un contexte et proposer une mutation sous approbation. La question devient **s'il faut un système agentique, et si on doit développer quelque chose du tout**. Rien à préparer avant cette réponse |

`ASSET.USAGE.1` et `ASSET.1.E` **sont supprimés** — deux lignes sans
spécification, présentes depuis la première roadmap, jamais reprises par un
ticket ni un rapport. L'auteur a confirmé le 2026-08-21 que leur substance est
déjà couverte, en plus large, par les deux sujets ci-dessous.

### Les deux sujets ouverts sur le prompting — l'auteur, 2026-08-21

Ils ne sont pas encore des tickets. Ils sont écrits ici pour ne plus être
redécouverts.

**A. Le rôle d'une référence doit se lire dans le prompt envoyé à ComfyUI.**
Quand l'auteur choisit des images de référence pour un workflow ComfyUI, le
prompt envoyé ne dit pas assez ce que chaque référence *est*. Le catalogue de
rôles existe (`src/lib/referenceImageRoles.ts`, et `video_role` depuis B17a) —
ce qui manque est son emploi automatique, en mots, dans le prompt.

Ce qui existe déjà et sert de base : côté LLM Workspace, la conformation livrée
par B13 transforme les rôles stockés en modes nommés du moteur, et
`src/lib/llmWorkspace/images/registry.ts` émet déjà `Image role: lighting` dans
les métadonnées qu'un prompt a le droit de dire. Le manque est sur le chemin
**génération ComfyUI**, pas sur le chemin LLM. À noter en passant : un
commentaire de `composition/storyboardShot.ts` affirme encore que « la vidéo ne
porte pas de colonne de rôle », ce que B17a a rendu faux.

**B. Une passe globale sur le système de prompting, avec le LLM Workspace comme
moteur.** Comment compose-t-on correctement un prompt par addition de champs
d'Asset et de Shot, pour obtenir un prompt sur mesure destiné à la génération de
storyboard ou de vidéo. C'est le sujet qui absorbe l'ancien
`PROMPT.PACKAGE.MVP.1` et l'ancien `PROMPT.2` (section 3), et il est le
prolongement direct de `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5 — ingrédients,
bocaux, recettes — dont B14 a livré la première application réelle sur le prompt
storyboard.

Le finetuning du prompt storyboard (ligne du tableau ci-dessus) est un
sous-ensemble de B : ne pas les traiter comme deux chantiers indépendants.

---

## 3. Ce que le LLM Workspace a périmé

Le chantier n'a pas seulement livré des fonctions : il a **remplacé la mécanique
de prompt** que plusieurs entrées de l'ancienne roadmap décrivaient. Elles sont
retirées ici plutôt que laissées à traîner.

- **`PROMPT.PACKAGE.MVP.1`** — « registry légère de packages de prompt par
  workflow et modèle ». C'est devenu les descripteurs et la mécanique
  ingrédients / bocaux / recettes de `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.
  Un « package » n'a plus d'objet : ce qui manquait n'était pas une bibliothèque
  de gabarits figés, mais la possibilité de composer un prompt sur mesure à
  partir de champs déjà stockés.
- **`PROMPT.2`** — « rework du compiler selon la tâche ». §5.8 déclare obsolètes
  les cinq presets du Prompt Compiler, ses cinq cases source, sa sélection
  d'images ordonnée à la main, son empreinte de fraîcheur et son passage de
  relais en `sessionStorage`. Ce qui survit est l'intention en dessous :
  choisir des ingrédients, les lier par une note de réalisation, laisser
  l'application formater pour le moteur. Cette intention est livrée.
- **`REFROLE.1`** — « rôles précis pour images et vidéos ». Livré en deux temps :
  `REFROLE.MVP.1` pour les images (`src/lib/referenceImageRoles.ts`) et B17a pour
  les vidéos (`video_role`, `src/db/schema/references.ts:90`, migration `0055`).
- **`AI.ASSET.DESCRIPTION.1`** — livré comme panneau du workspace
  (`src/components/llmWorkspace/AssetDescriptionEnhancePanel.tsx`), au même titre
  que `AI.ASSET.BIBLE.1`.

**Ce que ça ouvre.** La suite naturelle n'est plus « ajouter un package » mais
**écrire un descripteur pour un besoin précis**, ce qui ne demande ni code
produit ni écran : `docs/LLM_WORKSPACE_ARCHITECTURE.md` §6 — « ajouter un assist
veut dire créer un template et poser un bouton ». Les demandes sur mesure
passent désormais par là, et n'ont plus besoin d'entrer ici comme des tickets
d'architecture.

---

## 4. Ouvert, et toujours valide

Rien ici n'est daté ni contredit par le code. Aucun ordre n'est imposé : le
précédent datait du 2 août et a été écrit avant deux chantiers.

**Éditorial et film**

- `FILM.EXPORT.1` — export final contrôlé ;
- `FILM.AUDIO.1` — pistes audio, musique et mix de preview ;
- `EDITORIAL.BACKPROP.1` — appliquer volontairement certaines décisions de
  montage aux Shots narratifs.

**Project Style — suites bornées**

- `STYLE.2.LOOK.CORRECTIONS.CORE.1` puis `.UI.1` — propositions de correction du
  Working Draft depuis les Look Tests, sans mutation automatique ni modification
  des versions publiées.

`STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1` **est clos le 2026-08-22**
(`e418865`) — voir la section 6.

**Narration et assistance**

- `DIRECTOR.ASSIST.1` — analyse transversale de la narration, couverture,
  continuité, casting et cohérence du monde. Périmètre à préciser en discussion
  produit. Remplace `STORY.CONTINUITY.1` et `SHOT.COVERAGE.1`.

**Confort opérationnel**

- `DEVOPS.MIKAI.SERVICE.OPTIONAL.1` — exemples de service persistant (systemd et
  équivalent Windows) pour redémarrage après reboot ou crash. **N'a jamais eu
  d'autre spécification que ce paragraphe.** Il ne bloque ni l'installation ni
  le lancement manuel, que `install`/`start`/`update` couvrent déjà
  (`DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1`, `92ac8a2`).

**Déjà livré, jamais marqué : `GEN.VRAM.1` et `LLM.VRAM.1`.** Découvert le
2026-08-21 en préparant leur ticket. Le commit `c51ca06` *Add local VRAM auto
management* livre les deux sens en une fois : `src/lib/vramManager.ts` expose
`maybeUnloadOllamaBeforeComfy` (= `GEN.VRAM.1`) et `maybePurgeComfyBeforeOllama`
(= `LLM.VRAM.1`), tous deux commandés par un réglage
`local_vram_auto_management_enabled` exposé dans Settings
(`ComfyUISettingsForm.tsx`). Les primitives sont
`unloadOllamaModel` (`/api/generate`, `keep_alive: 0`) et `freeComfyVRAM`
(`POST /free`, tolérant au 404 des vieux builds). Sept points d'appel : les
quatre chemins de génération ComfyUI, les deux Look Tests, et `src/lib/llm/index.ts`
pour l'autre sens. Une garde refuse la purge ComfyUI si un job est `pending`,
`uploading`, `queued` ou `running`.

Le module n'avait **aucun test**. Le filet a été écrit dans la foulée :
`tests/lib/vramManager.test.ts`, 25 tests de caractérisation, prouvés par huit
mutations — la garde du réglage dans les deux sens, les quatre statuts qui
bloquent la purge et les trois qui ne la bloquent pas, le provider de chat
séparé, la précédence des réglages, le refus d'appeler l'endpoint sans modèle,
et le fait que ni l'un ni l'autre ne lève. Rien de `src/` n'a été modifié.

---

## 5. Sorti de la roadmap

Décisions de l'auteur, 2026-08-21.

- **`SEQGEN.VIDEO.CUT.CORE.1` et `SEQGEN.VIDEO.CUT.UI.1`** — retirer une plage
  frame-exacte d'un Sequence Video Draft et publier une nouvelle version sans
  écraser la source. Jamais implémenté : aucune action de coupe dans
  `src/actions/`, et `src/lib/sequenceVideoSplit/` ne fait que de la détection.
  Le besoin n'est pas nié, il **retourne à la boîte à idées** :
  `docs/USER_FEEDBACK.md`, `FB-20260821-001`.
- **`OPENREEL.ROUNDTRIP.1`** — prouver un vrai aller-retour MikAI ↔ OpenReel,
  avec snapshots anti-stale, timings et refus des mutations partielles.
  **Retourne à la boîte à idées** : `FB-20260821-002`. Les briques existent et
  sont utilisées ; ce qui manquait était la preuve de bout en bout, pas une
  fonction.
- **`TRANS.1.C.D`** — traduction des Prompt Segments. **Supprimé**, pas
  reporté. Shot Edit a déjà ses boutons de traduction
  (`ShotNarrativeContextEditor.tsx`), et l'auteur ne veut pas de la seconde
  moitié.

Les arbitrages de retrait plus anciens — `GEN.3`, `G.4`, `EDITORIAL.VERSION.1`,
`CASTING.CONTINUITY.1`, `WORLD.1`, `LLMCHAT.HISTORY.1`, `LLM.COMPAT.1`,
`SEQGEN.KEYFRAMES.1`, `STYLE.1.G.CORRECTIONS.1` — sont conservés dans l'archive
avec leur raison.

---

## 6. Clos — où le retrouver

**`SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1` — clos le 2026-08-22**, un commit :
`868869f`. Aucune migration.

Suite directe du ticket suivant, livrée le même jour. Extract from Storyboard
appariait la vignette *i* au Shot *i* en partant du premier de la séquence, ce
qui décalait tout dès qu'un storyboard ne couvrait qu'une plage — et faussait
la **détection** elle-même, `expectedShotCount` cherchant six cases dans une
image qui en avait trois.

La plage se résout en cascade : choix explicite sur la page Extract, sinon
héritée du job de génération, sinon séquence entière. Ce dernier cas est celui
d'un storyboard uploadé à la main, et l'auteur a exigé qu'il reste sans la
moindre friction — contrainte posée avant l'écriture du ticket, et couverte par
son propre test.

Aucune migration : la plage voyage dans `GenerationSnapshot` (contrat JSON
additif) et se persiste dans le `paramsJson` de l'extraction.

Ce que ça a appris est dans `docs/PROJECT_STATE.md`, et c'est le plus utile du
ticket : **deux défauts, aucun visible dans le diff** — un crash de clé
étrangère qui a demandé de rejouer un scénario que personne n'avait écrit, et
un texte faux qui a demandé de charger la page.

**`SEQGEN.STORYBOARD.SHOTRANGE.1` — clos le 2026-08-22**, un commit :
`0e9e121`. Aucune migration.

Ouvert et livré le même jour, à la demande de l'auteur. Le prompt Sequence
Storyboard prenait systématiquement tous les Shots de la séquence ; deux params
d'URL optionnels, `shotFrom`/`shotTo`, le cadrent sur une plage inclusive,
posés par deux `<select>` dans une carte « Storyboard Shot Range ». Sans eux,
le texte produit est inchangé octet pour octet.

Trois arbitrages de l'auteur ont cadré le ticket avant son écriture : **le
casting n'est pas restreint** par la plage — sinon une référence sélectionnée
hors plage disparaîtrait en silence et les `@ImageN` seraient renumérotés — le
choix vit dans l'URL et non en base, et les bornes se désignent par des Shots,
jamais par des positions.

Ce que ça a appris est dans `docs/PROJECT_STATE.md` : `Number("")` vaut `0`,
donc l'option vide d'un `<select>` se lit comme l'id `0` si on ne la garde pas ;
et une consigne de réutilisation écrite dans un ticket sans être vérifiée
(« afficher au même endroit que les warnings du prompt » — cet endroit n'existe
pas) coûte un aller-retour à l'exécutant.

**`STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1` — clos le 2026-08-22**, un commit :
`e418865`. Aucune migration.

Ouvert depuis le 2026-08-02, et **sa description dans cette roadmap était
fausse** : elle disait qu'il fallait appliquer à Reference Analysis le motif
`pending sync` de Look Development. Le motif y était déjà — six sites et un
`Retry sync` en lecture seule, livrés avec `STYLE.1.B.ANALYSIS.UI`. Ce qui
manquait était la preuve.

Elle était bloquée depuis le 2026-08-01 : la décision était écrite en ligne dans
des callbacks qui appellent aussi des Server Actions, donc la tester voulait dire
intercepter une Server Action — 15/42 preuves en jsdom, parce que `tsx` résout
les imports `@/` avant les hooks ESM, et la méthode interdit d'installer un
harnais DOM. La décision est donc sortie en deux fonctions pures
(`src/lib/projectStyle/referenceAnalysis/syncPhase.ts`), sans état et sans React,
sur la forme qu'avait déjà `restoreLookTestSnapshotSelections.ts`.

`retrySync(need, { readAnalysis, readDraft })` ne reçoit que des lecteurs : elle
**ne peut pas** rejouer une mutation. La spec demandait de le confirmer ; c'est
désormais vrai par construction. Prouvé aussi en vrai navigateur, panne de
relecture injectée après un commit réel. Le détail est dans
`docs/PROJECT_STATE.md`.


**B19 — refonte du vocabulaire caméra. Clos le 2026-08-22**, huit tickets :
`5a89ef2`, `17986f9`, `65261e2`, `8bc467b`, `ec711f6`, `2ba4ac8`, `b5a8ce2`,
`c54ee95`, `2b79abc`, `4370260`, `d6c6b91`. Migrations `0056`, `0057`, `0059`
et `0060` appliquées par l'auteur.

Le vocabulaire est déclaré une fois, six axes remplacent trois champs mal
découpés, les formulaires montrent ce que chaque valeur veut dire, les deux
instructions LLM lisent la déclaration au lieu de la recopier, et les dix
séquences sont converties. `camera_pitch` est supprimée. Le détail, les trois
revirements sourcés et les sept pertes silencieuses attrapées sont dans
`docs/PROJECT_STATE.md`.


**`GEN.MULTIOUT.1` — un job ComfyUI rend plusieurs fichiers. Clos le
2026-08-22**, quatre commits : `6cef0e4`, `7a35ac6`, `cb6f032`, `97fb4b9`.
Migration `0058` appliquée.

Un `Grid2Batch` rendait quatre images et MikAI en gardait une, parce que la
lecture s'arrêtait au premier fichier et que `output_path` est une colonne
unique. `generation_job_outputs` porte désormais une ligne par fichier dans
l'ordre du batch, la galerie du Content Generator les présente toutes cochées
avec `Unselect all`, et `Attach as Reference` stocke la sélection. `output_path`
n'a pas bougé, donc ses vingt lecteurs sont intacts. Le rattrapage des jobs
antérieurs a été écarté par l'auteur.

Le registre complet de ce qui a été livré, ticket par ticket et commit par
commit, est dans `docs/archive/ROADMAP_2026-08-02.md` : l'epic `STYLE.1` (A à G,
vingt tickets plus son gate d'acceptance), la séquence Seedance MVP, l'axe
Gaussian Camera, la chaîne SEQGEN storyboard / vidéo / split / push, et le bloc
de consolidation DB / sidecar / déploiement du 10 août.

Deux tickets UX y étaient encore marqués en attente, et le sujet est clos :

- `UX.SETTINGS.CHAT.1` — poussé le 2026-08-03 (`c0cf81e`) ;
- `UX.VISUAL.CONSISTENCY.1` — poussé (`8fb1f75`). Le document l'attendait sur un
  « nouveau verdict Codex avant commit/push » ; **la supervision Codex est
  dormante** (`AGENTS.md`, section *Status*), et ce gate n'existe plus.

Le LLM Workspace, ses phases A et B, les Chantiers 1 et 2 et leur détail sont
documentés dans `docs/PROJECT_STATE.md`,
`docs/LLM_WORKSPACE_ARCHITECTURE.md` et
`docs/archive/LLM_WORKSPACE_PHASE_B_LOG.md`.

---

## Règles permanentes de l'outillage

- jamais `git add .` ; staging explicite uniquement ;
- aucun commit sans approbation fraîche — un go explicite de l'utilisateur sous
  le protocole Opus (`.agents/SUPERVISION_PROTOCOL.md`) ;
- parcours de test manuel fourni pour chaque fonction visible ;
- après approbation, commit et push sont demandés ensemble, sauf demande
  explicite de commit local.
