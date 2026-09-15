# Aller-retour d'image MikAI ⇄ InvokeAI — cahier des charges

**Statut : en attente.** Spécification seulement. Aucun ticket n'est préparé,
aucun code n'est écrit. Le développement aura lieu dans un ticket futur, sur
un go explicite de l'auteur.

Rédigé le 2026-09-15, à partir de la demande de l'auteur, d'une lecture de
l'installation InvokeAI locale (`F:\AI\Invoke`, version **6.14.0**) et du dépôt
GitHub `invoke-ai/InvokeAI` (branche `main`). Décisions de l'auteur intégrées
le même jour (§7).

---

## 1. Le besoin, tel que l'auteur l'a formulé

1. Dans MikAI, sélectionner une image générée.
2. Cliquer un bouton du type **« Push to Invoke »**.
3. L'image s'ouvre dans un **nouveau document Invoke**, directement dans son
   interface.
4. L'auteur retouche l'image dans Invoke, puis la sauvegarde dans la galerie
   Invoke.
5. Dans Invoke, un **clic droit → « Push to MikAiProdLab »** renvoie l'image
   dans MikAI.
6. L'image revient **dans la même entité** — le shot ou l'asset d'où elle est
   partie.

## 2. Test contre le LLM Workspace

**Hors périmètre.** Aucune opération n'est assistée par LLM : c'est un
transfert de fichier entre deux applications et une retouche manuelle. Aucun
descripteur ni aucune brique du workspace ne s'applique. UC1, UC2 et UC3 :
aucun n'est rapproché, contraint ni touché.

## 3. Ce qu'InvokeAI 6.14.0 permet réellement

Constats vérifiés dans le code installé
(`F:\AI\Invoke\.venv\Lib\site-packages\invokeai`) et sur GitHub, pas supposés.

### 3.1 Lancement et accès

- `invoke.bat` lance `invokeai-web.exe` avec `INVOKEAI_ROOT` = le dossier.
  L'interface est une application web ; port par défaut **9090**.
- `invokeai.yaml` ne contient aucun réglage utilisateur : hôte et port sont
  ceux par défaut, mode mono-utilisateur. En mode mono-utilisateur, l'API
  n'exige pas d'authentification (`CurrentUserOrDefault`).
- Tout ce qui suit passe par HTTP. Aucun accès au disque ou à la base
  d'Invoke n'est nécessaire, donc MikAI et Invoke peuvent tourner sur deux
  machines différentes.

### 3.2 API utilisables

| Besoin | API Invoke | Fichier |
|---|---|---|
| Envoyer une image | `POST /api/v1/images/upload` — `image_category`, `is_intermediate`, `board_id` optionnel, `metadata` JSON libre | `app/api/routers/images.py` |
| Créer un board | `POST /api/v1/boards/` | `app/api/routers/boards.py` |
| Lister les images d'un board | `GET /api/v1/images/?board_id=…` | `images.py` |
| Récupérer un fichier | `GET /api/v1/images/i/{image_name}/full` | `images.py` |
| Lire les métadonnées | `GET /api/v1/images/i/{image_name}/metadata` | `images.py` |
| Créer / modifier un workflow | `POST /api/v1/workflows/`, `PATCH /api/v1/workflows/i/{workflow_id}` | `app/api/routers/workflows.py` |

Les images Invoke sont immuables et nommées par un identifiant unique.

### 3.3 Ce qui existe nativement dans l'interface

- Menu contextuel d'une image de la galerie : **« New Canvas from Image »**
  (`controlLayers.newCanvasFromImage`) et **« Change Board »**.
- Le canvas sauvegarde dans le board choisi comme « auto-add board ».
- **Clic droit sur un calque du canvas → « Run Workflow »**
  (`CanvasEntityMenuItemsRunWorkflow`, arrivé en 6.13.0). Le menu liste les
  workflows qui ont un champ image dans leur Form Builder **et** un nœud
  `canvas_output`. Le calque est passé au champ image ; la sortie du nœud
  `canvas_output` arrive dans la zone de staging du canvas, où l'auteur peut
  la rejeter.
- Le nœud natif **Save Image** (`SaveImageInvocation`, `app/invocations/image.py`)
  a un champ **board** : il copie une image dans le board choisi.

### 3.4 Ce qui n'existe pas

- **Aucune API pour ouvrir une image comme nouveau document canvas.**
  `POST /api/v1/recall/{queue_id}` pousse l'événement socket
  `recall_parameters_updated`, que le front applique à : prompts, modèle,
  dimensions, seed, steps, CFG, LoRA, `control_layers`, `ip_adapters`,
  `reference_images`. Une image envoyée ainsi devient une référence ou un
  calque de contrôle, **pas un calque éditable**. Même constat sur `main`.
- **Pas de deep links.** La PR
  [#7277](https://github.com/invoke-ai/InvokeAI/pull/7277) proposait des URL
  du type `http://localhost:9090/#!sendToCanvas&imageName=…`, qui auraient
  réglé l'étape 3. Elle a été **fermée sans merge** le 2025-08-13. Le bundle
  6.14.0 ne lit pas `location.hash`, et le composant `InvokeAIUI` de `main` ne
  prend plus de props (`studioInitAction` a disparu).
- **Aucun point d'extension du menu contextuel de la galerie.** Les custom
  nodes ajoutent des nœuds de calcul, pas d'entrées de menu.
- **Aucun événement « image ajoutée à un board ».** La liste des événements
  (`app/services/events/events_common.py`) n'en contient pas. MikAI doit
  interroger.

## 4. Écart entre le besoin et le possible

| Étape | Faisable sans modifier Invoke ? | Détail |
|---|---|---|
| 1–2. Push depuis MikAI | **Oui** | Upload HTTP. |
| 3. Ouverture directe en nouveau document | **Non** | Un clic natif reste nécessaire : « New Canvas from Image ». |
| 4. Retouche | **Oui** | Invoke tel quel. |
| 5. Clic droit de renvoi | **Oui, depuis le canvas** | Clic droit sur le calque → « Run Workflow » → « Send to MikAI » (§5.2). Pas depuis la galerie. |
| 6. Retour dans la même entité | **Oui** | Porté par le board de l'entité. |

### 4.1 Options écartées pour l'étape 3

- **Recall `reference_images` / `control_layers`** : l'image arrive comme
  référence, pas comme calque retouchable.
- **Deep link `#!sendToCanvas`** : n'existe pas (§3.4). À surveiller : si
  Invoke le réintroduit, l'étape 3 devient un simple lien.
- **Écrire l'état client persisté** (`/api/v1/client_state/…/set_by_key`) pour
  injecter un canvas : format interne non documenté, change entre versions,
  et écrase le canvas en cours de l'auteur.
- **Patcher le bundle front** : écrasé à chaque mise à jour d'Invoke.

### 4.2 Options écartées pour l'étape 5

- **Script navigateur (Tampermonkey) injectant « Push to MikAiProdLab » dans
  le menu de la galerie** : dépend de la structure DOM d'un bundle compilé et
  minifié ; casse à chaque mise à jour.
- **Node pack qui injecte ce script dans la page servie par Invoke** : un node
  pack est du Python chargé dans le serveur Invoke après la création de l'app
  (`run_app.py`), il pourrait donc réécrire `index.html`. Même fragilité DOM,
  et en plus un détournement du mécanisme de nodes.
- **Custom node qui envoie l'image en HTTP vers MikAI** : exigerait une API
  entrante dans MikAI et que MikAI soit joignable depuis Invoke. Le nœud natif
  Save Image vers le board de l'entité fait le même travail sans rien de tout
  cela (§5.2).
- **Fork d'Invoke** : maintenance d'une application tierce complète.

## 5. Fonctionnement retenu

Principe : **le board Invoke est l'adresse de retour.** Chaque entité
propriétaire d'images poussée vers Invoke — shot, asset, storyboard de
séquence, style de projet — possède son board. Toute nouvelle image qui arrive
dans ce board revient à cette entité (§6, Destination).

### 5.1 Aller — « Push to Invoke »

1. Sur n'importe quelle image de MikAI, l'auteur clique
   **« Push to Invoke »** (§7.3).
2. MikAI retrouve le board de l'entité propriétaire ; s'il n'existe pas, il le
   crée dans Invoke avec un nom lisible (§6, Nom des boards) et enregistre le
   lien.
3. MikAI envoie l'image dans ce board, avec en métadonnées la provenance :
   projet, type et identifiant d'entité, image source.
4. MikAI enregistre l'`image_name` Invoke de l'image poussée, pour ne jamais
   la réimporter telle quelle.
5. MikAI met à jour le workflow « Send to MikAI » (§5.2) : le board par défaut
   devient celui de l'entité poussée.
6. MikAI ouvre Invoke dans un nouvel onglet et affiche une consigne courte :
   *« Sent to Invoke board "…". Right-click it → New Canvas from Image. When
   done, right-click the layer → Run Workflow → Send to MikAI. »*

### 5.2 Retour — clic droit dans le canvas

MikAI installe dans Invoke un workflow **« Send to MikAI »**, via l'API
workflows, au premier test de connexion. Aucun code n'est ajouté à Invoke ;
le workflow n'utilise que des nœuds natifs :

```text
[Image field — Form Builder] ──► [Save Image, board = board de l'entité] ──► [Canvas Output]
```

- Le champ board est exposé dans le formulaire, prérempli par MikAI avec le
  board de la dernière entité poussée (§5.1, étape 5). L'auteur le change s'il
  renvoie vers une autre entité.
- Geste de l'auteur : clic droit sur le calque retouché → **Run Workflow** →
  **Send to MikAI** → Run.
- Save Image copie l'image dans le board de l'entité ; c'est ce qui déclenche
  le retour. Canvas Output renvoie l'image dans la zone de staging, où
  l'auteur la rejette : le canvas n'est pas modifié.
- Voie alternative, sans workflow : sauvegarder dans la galerie avec le board
  de l'entité comme auto-add board, ou « Change Board » après coup. Le retour
  fonctionne de la même façon.

À valider au ticket, sur Invoke réel :
- le workflow passe bien le filtre du menu (champ image dans le Form Builder,
  nœud `canvas_output`) ;
- le calque passé au champ image est le calque visible complet, pas une
  version réduite ;
- une exécution coûte seulement une entrée de file, sans chargement de modèle.

### 5.3 Import automatique dans MikAI

**Déclencheur : le retour de l'auteur sur MikAI.** Aucun timer, aucune
interrogation en continu.

1. Quand un onglet MikAI se charge ou **reprend le focus** (événements
   `visibilitychange` / `focus` du navigateur, avec un anti-rebond de quelques
   secondes), il appelle une seule action serveur de synchronisation. C'est le
   moment naturel : l'auteur vient de renvoyer l'image depuis l'onglet Invoke
   et revient sur MikAI.
2. L'action serveur interroge tous les boards liés, en parallèle, avec une
   requête de **comptage seul** : `GET /api/v1/images/?board_id=…&limit=0&is_intermediate=false`
   ne renvoie que le total. Si le total est égal au dernier total connu du
   board, rien d'autre n'est fait.
3. Seulement si le total a changé : MikAI liste les images de ce board, retire
   l'image poussée et les images déjà importées, et importe le reste **sans
   confirmation** dans l'entité propriétaire du board (§6, Destination) —
   fichier complet téléchargé, provenance enregistrée (image source MikAI,
   `image_name` Invoke, date). Puis il mémorise le nouveau total.
4. Si quelque chose a été importé, la page est rafraîchie et MikAI l'indique :
   *« Imported 1 image from Invoke into Shot 012 »*, avec un lien vers
   l'entité. Une erreur est affichée, jamais avalée.
5. Défaire un import = supprimer l'image, par le chemin de suppression
   existant.

Coût : pendant que l'auteur travaille dans Invoke, zéro requête. À chaque
retour sur MikAI, une requête de comptage par board lié, sans transfert
d'image tant que rien n'a changé.

Une image renvoyée pendant que MikAI est fermé est importée à la prochaine
ouverture.

Voies écartées : interrogation à intervalle fixe (requêtes inutiles pendant
tout le travail dans Invoke) ; travail de fond dans le serveur MikAI (nouveau
mécanisme de runtime, sans gain pour un usage où l'auteur revient de toute
façon sur MikAI) ; ouverture forcée d'un onglet par un custom node Invoke
(`webbrowser.open`, ne marche que sur la même machine et ajoute du code dans
Invoke).

## 6. Contraintes pour le ticket futur

- **Destination** : la table d'images de l'entité propriétaire du board, par
  ses mécanismes existants.
  - Shot et asset : image de référence (`shot_reference_images`,
    `asset_reference_images` ; voir `attachOutputAsShotReference` /
    `attachOutputAsAssetReference` dans `src/actions/generation.ts`). Une
    sortie de job poussée depuis un shot revient donc comme référence de ce
    shot. Rôle (`image_role`) : `reference` par défaut, à confirmer au ticket.
  - Autres propriétaires (storyboard de séquence, style de projet, …) : nouvelle
    ligne dans leur propre table. Le ticket dresse la liste exhaustive des
    tables d'images et de leur chemin d'ajout existant.
  - Avant de conclure qu'un mécanisme manque : `docs/WHERE_THE_RULES_LIVE.md`.
- **Nom des boards** : lisible et unique par propriétaire —
  `MikAI · Shot 012 · …`, `MikAI · Asset · …`, `MikAI · Sequence storyboard · …`,
  `MikAI · Project style · …`.
- **Workflow « Send to MikAI »** : son board par défaut suit le dernier push,
  quel que soit le type d'entité.
- **URL d'Invoke** : réglage d'installation, au même titre que l'URL ComfyUI
  (`getConfiguredComfyBaseUrl`, `src/lib/comfy/comfyServerClient.ts`). Il suit
  l'export de configuration (DEVOPS.CONFIG.EXPORT.1) et le contrôle des URL
  qui ne désignent plus la même machine (DEVOPS.CONFIG.LOOPBACK.1).
- **Invoke injoignable** : erreur explicite, en anglais, sans bloquer la page.
  Aucune tentative de lancer Invoke depuis MikAI.
- **Board ou workflow supprimé côté Invoke** (404) : le lien est marqué
  rompu ; le push suivant recrée ce qui manque.
- **Idempotence** : une image Invoke n'est importée qu'une fois par entité ;
  deux interrogations concurrentes ne créent pas de doublon (contrainte
  d'unicité, comme `generation_job_outputs_job_index_unique`).
- **Schéma** : le lien entité ⇄ board, l'identifiant du workflow installé et
  la liste des images importées demandent des tables, donc une migration. Le
  ticket doit l'autoriser explicitement ; la migration est générée, montrée,
  et appliquée par l'auteur.
- **Hors périmètre** : runtime ComfyUI, job runner, polling des jobs de
  génération. L'interrogation du board Invoke est un mécanisme distinct.
- **Mode multi-utilisateur d'Invoke** (authentification) : non géré en
  première version ; erreur explicite s'il est détecté.
- **Version** : constats faits sur Invoke 6.14.0. Le ticket revérifie les
  endpoints et le filtre du menu « Run Workflow » sur la version installée à
  ce moment-là.

## 7. Décisions

Prises par l'auteur le 2026-09-15 :

1. **Destination** : comme image de référence du shot ou de l'asset.
2. **Import** : automatique, sans confirmation. L'auteur a délégué le
   mécanisme : « au plus simple et performant ». Retenu : synchronisation au
   chargement et au retour du focus sur un onglet MikAI, avec comptage seul
   par board (§5.3).
3. **Images éligibles** : toutes.
4. **Board** : un par entité propriétaire — shot, asset, et aussi les
   propriétaires qui ne sont ni shot ni asset (point suivant).
5. **Clic droit** : chercher un autre moyen sur GitHub. Résultat : pas de
   clic droit dans la galerie, mais un clic droit sur le calque du canvas via
   « Run Workflow » (§5.2). Pas de script navigateur.
6. **Images sans shot ni asset** (storyboard de séquence
   `sequence_storyboard_images`, références de style de projet
   `project_style_reference_images`, et toute autre table d'images) : elles
   ont **leur propre board**, et l'image revient **dans leur propre table**,
   à côté de l'image source.

## 8. Découpage indicatif

Indicatif seulement ; aucun ticket n'est préparé.

1. Réglage URL Invoke, test de connexion, installation du workflow
   « Send to MikAI », push d'une image de shot ou d'asset vers le board de son
   entité.
2. Synchronisation au focus (comptage par board) et import automatique comme
   image de référence du shot ou de l'asset.
3. Extension aux autres propriétaires d'images (storyboard de séquence, style
   de projet, …), chacun avec son board et son retour dans sa table.

Chaque ticket visible par l'utilisateur livre sa checklist de validation
manuelle.

## Sources

- [PR #7277 — Deeplinks for StudioInitAction (fermée sans merge)](https://github.com/invoke-ai/InvokeAI/pull/7277)
- [Notes de version InvokeAI 6.13.0 — Canvas Workflow Integration](https://newreleases.io/project/github/invoke-ai/InvokeAI/release/v6.13.0)
- [`recall_parameters.py` sur `main`](https://github.com/invoke-ai/InvokeAI/blob/main/invokeai/app/api/routers/recall_parameters.py)
- [`InvokeAIUI.tsx` sur `main`](https://github.com/invoke-ai/InvokeAI/blob/main/invokeai/frontend/web/src/app/components/InvokeAIUI.tsx)
