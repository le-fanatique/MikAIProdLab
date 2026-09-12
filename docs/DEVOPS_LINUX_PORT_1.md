# DEVOPS.LINUX.PORT.1 — installer MikAI Production Lab sur Ubuntu

Ceci est la **procédure** pour la personne qui installe ce dépôt sur une
machine Ubuntu neuve, depuis GitHub. Elle suppose qu'on n'a aucun souvenir du
fil de conversation qui l'a produite.

`docs/DEVOPS_LINUX_PORT_1_AUDIT.md` est l'**analyse** derrière cette
procédure — la méthode, les mesures, le tableau des risques. Ce document ne
répète pas cette analyse ; il y renvoie. `README.md` porte déjà le quick
start Linux et le tableau de dépannage du quotidien — ce document ne les
répète pas non plus, seulement ce qu'ils omettent : les six risques
identifiés par l'audit que les scripts existants ne couvraient pas avant P0,
et ce qu'un clone n'apporte pas.

## 1. Prérequis — Ubuntu, dans l'ordre

```bash
# Node 22 LTS via nvm — jamais Node 24, better-sqlite3 n'a pas de binaire préconstruit pour cette version
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# git, et la chaîne de compilation vers laquelle better-sqlite3 se rabat si aucun binaire préconstruit ne correspond à l'architecture/la libc de cette machine
sudo apt-get update
sudo apt-get install -y git build-essential python3

# pnpm — requis par install.sh uniquement pour le sidecar OpenReel
corepack enable
corepack prepare pnpm --activate
```

**OpenCV pour l'extraction de plans du storyboard**
(`src/lib/storyboardExtraction/opencvWorker.ts`, optionnel — seule
l'extraction de plans du storyboard en a besoin). Sur Ubuntu 24.04,
`pip install` refuse en mode système
(`error: externally-managed-environment`) ; utiliser un venv :

```bash
python3 -m venv ~/.venvs/mikai-opencv
source ~/.venvs/mikai-opencv/bin/activate
pip install opencv-python-headless numpy
```

Ensuite, soit garder ce venv actif au lancement de MikAI, soit pointer
`OPENCV_PYTHON_BIN` dans `.env.local` vers
`~/.venvs/mikai-opencv/bin/python`. `doctor.sh` (§2 ci-dessous) rapporte si
l'interpréteur qu'il résout peut importer les deux paquets.

## 2. Séquence d'installation

```bash
git clone https://github.com/le-fanatique/MikAIProdLab.git ~/MikAIProdLab
cd ~/MikAIProdLab

# Nécessaire seulement si le correctif du bit exécutable de P0.1 (ce ticket)
# n'est pas encore dans le clone — un clone frais après ce commit l'a déjà.
chmod +x install.sh start.sh update.sh doctor.sh setup-linux.sh start-dev.sh

./install.sh
```

`install.sh` est un mince appel à `scripts/mikai-deploy.mjs install`
(`README.md` § "One-command install" documente son contrat exact). Dans
l'ordre, il :

1. vérifie que Git, Node 22 et npm ≥10 sont présents ;
2. clone le sidecar OpenReel à côté de ce dépôt (répertoire frère
   `../mikai-openreel-sidecar`, ou `MIKAI_OPENREEL_DIR` si défini) au commit
   exact épinglé dans `config/openreel-sidecar-release.json` — c'est un
   **clone réseau** d'un second dépôt GitHub, séparé
   (`le-fanatique/mikai-openreel-sidecar`) ; son accessibilité depuis cette
   machine est le risque 10 de l'audit, non prouvable depuis Windows ;
3. crée `.env.local` à partir de `.env.local.example` s'il est absent —
   n'écrase jamais un `.env.local` existant ;
4. résout la version de pnpm déclarée par le sidecar lui-même et l'acquiert
   via Corepack/`npx` — un **téléchargement réseau** si cette version de pnpm
   n'est pas déjà en cache ;
5. exécute `npm ci` pour MikAI et l'installation propre du sidecar pour
   lui-même — les deux sont des **installations réseau depuis les
   lockfiles**. `better-sqlite3` (`prebuild-install`) et
   `ffmpeg-ffprobe-static` (`hasInstallScript`) téléchargent chacun un
   binaire pour la plateforme durant cette étape ; derrière un proxy ou hors
   ligne, c'est ici que l'installation casse (risque 5 de l'audit) ;
6. construit les deux applications et lance les migrations de la base de
   données de MikAI.

`./start.sh` démarre les deux ensuite (`npm run prod:all` en coulisses).

## 3. Ce que le clone ne contient pas

Détail complet et méthode de mesure : `docs/DEVOPS_LINUX_PORT_1_AUDIT.md` §3.
Résumé ici :

| Absent du clone | Conséquence | Couvert par `install.sh` ? |
| --- | --- | --- |
| `node_modules` | — | oui, `npm ci` |
| `.env.local` | clés API perdues | partiel — créé à partir de `.env.local.example`, clés encore vides |
| `data/mikailab.db` (6 Mo) | voir §4 ci-dessous | **non** |
| `public/uploads`, `public/outputs`, `storage/` | médias absents | hors périmètre — l'auteur n'a explicitement pas besoin des projets en cours sur la nouvelle machine |
| sidecar OpenReel | dépôt séparé | oui, cloné au commit épinglé |
| `.git/info/exclude` | règles git locales perdues | **non**, et jamais — git ne réplique jamais ce fichier |
| `.vscode/`, `.cline/` | configuration secondaire d'éditeur/agent | **non** |
| cache navigateurs Playwright (`ms-playwright`) | `npm run playwright:verify` échoue | **non** — `doctor.sh`/`doctor.ps1` avertissent désormais dessus (P0.2) |

## 4. La configuration à ressaisir

**Les clés de `.env.local`** — copiées depuis `.env.local.example` par
`install.sh`, mais chaque secret (clés API des providers LLM, etc.) doit être
retapé à la main ; git ne les transporte jamais.

**Les réglages qui vivent en base, pas dans git** — trois tables
(`app_settings`, `comfy_workflows`, `llm_templates`) portent le provider LLM
actif, l'URL ComfyUI, l'URL du sidecar OpenReel, les workflows ComfyUI
importés et les templates du LLM Workspace. La base d'un clone frais est
vide de tout cela : l'application démarre, mais ne connaît aucun workflow,
aucun provider, aucun template. Ce manque est réel et **n'est pas** corrigé
par ce ticket — il est nommé et volontairement renvoyé à un ticket séparé,
`DEVOPS.CONFIG.EXPORT.1` (export/import portant exactement sur ces trois
tables). Voir l'audit, §4, pour la raison pour laquelle
`scripts/data-backup.mjs` n'est pas le bon outil pour cela à lui seul : il
déplace la base entière plus les quatre racines média, pas un sous-ensemble
config-only.

**Contournement disponible dès aujourd'hui, avec son coût exact** :
`data/mikailab.db` fait **6 Mo**. Le copier à la main (par exemple via `scp`
depuis la machine Windows, puis en le plaçant à `data/mikailab.db` sur
Ubuntu avant de démarrer l'application) donne une installation entièrement
configurée en une seule étape — y compris les workflows, les providers et
les templates nécessaires pour faire tourner l'application. Cette copie
amène aussi chaque ligne de projet qui y fait référence, ce qui est
exactement ce que « je n'ai pas besoin de récupérer les projets en cours »
exclut ; ce n'est pas interdit, seulement pas requis.

**Ce que cette copie n'amène pas : les médias.** `data/mikailab.db` ne
contient que la base de données — pas `public/uploads` ni
`public/outputs`, qui restent hors périmètre par décision de l'auteur (§3).
Les lignes de projet copiées référencent donc des fichiers image et vidéo
qui n'existent pas sur la machine cible : les projets apparaîtront avec
leurs images et leurs vidéos cassées, pas avec des projets vides. C'est la
moitié de l'avertissement qui surprend si elle n'est pas dite, donc elle est
dite ici : copier la base sans copier les médias donne des projets à
l'apparence cassée, pas des projets propres amputés de leur historique
récent.

Rien dans `install.sh` n'effectue cette copie — c'est un geste manuel, fait
ou non, à la discrétion de la personne qui installe.

## 5. ComfyUI et Ollama restés sur la machine Windows

Rien ici n'exige de déplacer l'un ou l'autre service.
`src/lib/comfy/comfyServerClient.ts` ne parle jamais à ComfyUI que par HTTP —
aucun processus local n'est jamais lancé — donc ComfyUI (et Ollama) peuvent
continuer de tourner sur la machine Windows et être atteints par leur IP
depuis Ubuntu.

La règle d'adressage exacte — quel nom de boucle locale ne fonctionne **pas**
entre machines/sous WSL, et quoi taper à la place — est déjà documentée une
fois, dans le bloc de commentaire « WSL (Windows Subsystem for Linux) » de
`.env.local.example` lui-même, et ne doit pas être dupliquée ici. Pour une
machine Ubuntu classique sur le même réseau local (pas WSL), le même
principe s'applique avec une simple IP réseau local à la place de la
recherche d'hôte WSL : trouver l'IP réseau local de la machine Windows
(`ipconfig` sous Windows), puis la saisir dans la page **Settings** de
MikAI — URL ComfyUI et URL Ollama — exactement comme ce bloc de commentaire
le décrit pour le cas WSL. `docs/DEVOPS_RUN_1_ONE_COMMAND_LAUNCHER.md` §7
couvre le cas équivalent pour un serveur distant/Tailscale atteint dans
l'autre sens (navigateur → serveur), si cette topologie s'applique à la
place.

## 6. Ce qui n'est pas prouvé depuis Windows — en attente de P1

`docs/DEVOPS_LINUX_PORT_1_AUDIT.md` §7 nomme trois risques qu'aucune commande
lancée depuis Windows ne peut trancher. Ils sont réénoncés ici parce que
c'est exactement ce que la personne qui exécute cette procédure sur la
machine Ubuntu réelle doit vérifier et rapporter, selon
`.agents/supervised_task.md` §10 :

1. **La casse des imports** (NTFS est insensible à la casse, ext4 ne l'est
   pas) — prouvable uniquement par `npx tsc --noEmit` exécuté **sur Linux** ;
2. **Le succès des installations réseau** — `better-sqlite3`,
   `ffmpeg-ffprobe-static`, l'acquisition de pnpm par le sidecar,
   téléchargent tous des binaires pendant `install.sh` ; un proxy ou un
   environnement hors ligne peut faire échouer n'importe lequel des trois ;
3. **L'accessibilité du dépôt GitHub du sidecar lui-même**
   (`le-fanatique/mikai-openreel-sidecar`) depuis la machine Ubuntu —
   visibilité et identifiants git.

À rapporter, verbatim et sans filtrage :

```bash
git clone https://github.com/le-fanatique/MikAIProdLab.git ~/MikAIProdLab
cd ~/MikAIProdLab
./install.sh
npx tsc --noEmit
npm run test
./doctor.sh
```
