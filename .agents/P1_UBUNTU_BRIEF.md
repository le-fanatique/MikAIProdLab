# Brief de session — P1 de `DEVOPS.LINUX.PORT.1` (déroulé réel sur Ubuntu)

Ce document est le contrat de la session Claude ouverte dans le dossier
`MikAIProdLab`. Il est autoportant : il ne suppose aucun souvenir d'une
conversation antérieure.

## 0. Ce que tu es en train de faire

Le dépôt MikAI Production Lab est porté d'une machine Windows vers une machine
Ubuntu. Le ticket `DEVOPS.LINUX.PORT.1` a une phase P0 déjà implémentée,
commitée et poussée (commits `7e9218d`, `772576a`, `5deeaad`, le 2026-09-12).

**P1 est la seule chose qui reste, et P1 n'est pas du code.** C'est le déroulé
réel de la procédure d'installation sur la machine Ubuntu, avec trois risques
qu'aucune commande lancée depuis Windows ne peut trancher :

1. **La casse des imports.** NTFS est insensible à la casse, ext4 ne l'est pas.
   Un `import './Foo'` qui pointe vers `foo.ts` fonctionne sous Windows et
   casse sous Linux. Seule preuve possible : `npx tsc --noEmit` exécuté **sur
   Linux**.
2. **Les installations réseau.** `better-sqlite3` (`prebuild-install`) et
   `ffmpeg-ffprobe-static` (`hasInstallScript`) téléchargent chacun un binaire
   pendant `install.sh`. L'acquisition de pnpm par le sidecar est un troisième
   téléchargement. Un proxy ou un environnement hors ligne casse ici.
3. **L'accès au dépôt GitHub du sidecar** `le-fanatique/mikai-openreel-sidecar`
   depuis la machine Ubuntu — visibilité du dépôt et identifiants git.

S'y ajoute une validation d'interface différée le 2026-09-12 : **P0.3** (§7
ci-dessous).

## 1. Règles de session — à respecter avant toute commande

- **Protocole actif : Opus.** Le ticket vit dans `.agents/supervised_task.md`.
  Lis-le, ainsi que `CLAUDE.md` et `AGENTS.md`.
- **Aucun commit, aucun push, aucun `git add` sans un go explicite de
  l'auteur.** Jamais `git add .` ; toujours des chemins explicites.
- **Aucune migration appliquée automatiquement.** Si une migration est
  nécessaire, montre le SQL et attends.
- **Rapporte les sorties de commande verbatim, sans `grep`, sans `| head`,
  sans résumé.** Filtrer a déjà détruit la preuve deux fois sur ce dépôt. Si
  une sortie est vide, dis explicitement qu'elle est vide — ce n'est pas la
  même chose que ne pas la mentionner.
- **P1 n'autorise aucune modification de code par défaut.** Si `npx tsc
  --noEmit` révèle une vraie casse d'import, c'est un constat à rapporter,
  pas un correctif à improviser ; demande le go avant de toucher un fichier.

Documents de référence : `docs/DEVOPS_LINUX_PORT_1.md` (la procédure),
`docs/DEVOPS_LINUX_PORT_1_AUDIT.md` (l'analyse et le tableau des risques),
`README.md` (quick start Linux et dépannage courant).

## 2. Étape 0 — sur la machine Windows, avant de toucher à Ubuntu

```powershell
npm run config:export -- --with-secrets
ipconfig
```

- **Décision de l'auteur (2026-09-14) : l'export inclut les clés API.** Elle
  remplace le choix par défaut, qui les omet.
- Note le répertoire horodaté créé sous `data/config-exports/`. Il contient le
  manifeste des trois tables de configuration (`app_settings`,
  `comfy_workflows`, `llm_templates`) et les vignettes de workflow. Les
  workflows ComfyUI et les clés API vivent tous en base, pas dans
  `.env.local`.
- Vérifie la sortie console : la ligne `app_settings` doit indiquer
  `(0 secret key(s) omitted)`. Tout autre nombre veut dire que
  `--with-secrets` n'a pas été pris en compte.
- Note l'IP réseau local de la machine Windows. Elle servira à l'étape 6 pour
  les URL ComfyUI et Ollama, qui restent sur Windows.

**Sécurité — le répertoire d'export contient six clés API en clair**
(`comfyui_api_key`, `comfyui_cloud_api_key`, `llm_api_key`,
`llm_ollama_api_key`, `llm_openrouter_api_key`,
`llm_openai_compatible_api_key`) :

- transfère-le uniquement par `scp -r` direct entre les deux machines ou par
  clé USB — jamais par un dossier synchronisé (OneDrive, Dropbox, Google
  Drive), jamais par e-mail ou messagerie ;
- ne le colle jamais dans un rapport, un ticket ou une conversation, et ne
  l'affiche pas avec `cat` ;
- ne le commite jamais — vérifie `git status` avant tout commit ;
- supprime-le sur les deux machines dès que l'import de l'étape 5 est
  confirmé.

Le répertoire ne pèse que quelques dizaines de Ko.

## 3. Étape 1 — prérequis Ubuntu

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v
sudo apt-get update
sudo apt-get install -y git build-essential python3
corepack enable
corepack prepare pnpm --activate
```

`node -v` doit afficher une version 22.x. **Jamais Node 24** :
`better-sqlite3` n'a pas de binaire préconstruit pour cette version.

`build-essential` et `python3` sont le filet de secours : si aucun binaire
préconstruit ne correspond à l'architecture ou à la libc de cette machine,
`better-sqlite3` se rabat sur une compilation locale.

## 4. Étape 2 — clone et installation

```bash
git clone https://github.com/le-fanatique/MikAIProdLab.git ~/MikAIProdLab
cd ~/MikAIProdLab
./install.sh
```

Si `./install.sh` répond `Permission denied`, le bit exécutable manque dans ce
clone :

```bash
chmod +x install.sh start.sh update.sh doctor.sh setup-linux.sh start-dev.sh
./install.sh
```

`install.sh` est un mince appel à `scripts/mikai-deploy.mjs install`. Dans
l'ordre, il vérifie Git / Node 22 / npm ≥ 10, clone le sidecar OpenReel dans le
répertoire frère `../mikai-openreel-sidecar` au commit épinglé par
`config/openreel-sidecar-release.json`, crée `.env.local` depuis
`.env.local.example` s'il est absent (il n'écrase jamais un `.env.local`
existant), acquiert pnpm, lance `npm ci` pour MikAI et l'installation propre du
sidecar, puis construit les deux applications et exécute les migrations.

Surveille et rapporte, sans filtrer, ce qui se passe sur ces quatre points —
ce sont les risques 2 et 3 :

- le clone de `le-fanatique/mikai-openreel-sidecar` ;
- l'acquisition de pnpm par Corepack ou `npx` ;
- le `prebuild-install` de `better-sqlite3` ;
- le postinstall de `ffmpeg-ffprobe-static`.

## 5. Étape 3 — la preuve de la casse des imports

```bash
npx tsc --noEmit
```

C'est le cœur de P1. Sortie attendue : vide. Toute erreur du type
`Cannot find module './Foo'` alors que le fichier sur le disque s'appelle
`foo.ts` est une vraie casse d'import, invisible sous Windows.

Rapporte la sortie **verbatim et intégrale**. Si elle est vide, écris-le.

## 6. Étape 4 — tests et diagnostic

```bash
npm run test
./doctor.sh
```

`doctor.sh` avertit sur les navigateurs Playwright absents et sur
l'interpréteur Python / OpenCV. Ces deux avertissements sont attendus sur une
installation neuve et ne bloquent rien.

## 7. Étape 5 — configuration

```bash
npm run db:migrate
npm run config:import -- <répertoire-copié-depuis-Windows> --target .
```

`npm run db:migrate` doit avoir tourné au moins une fois avant l'import : la
table `comfy_workflows` doit exister.

`config:import` exige une sauvegarde de la base cible avant d'écrire. Sur une
installation neuve, sans base existante, cette étape est sautée
automatiquement. Les ID de workflow sont préservés tels quels et les six
réglages `default_workflow_*` restent valides sans réécriture. Une clé
`app_settings` déjà présente sur la cible est conservée, sauf si
`-- --overwrite-app-settings` est passé.

Cet import amène les clés API, puisque l'export a été fait avec
`--with-secrets`. Il n'amène **ni les projets ni leurs médias**, par
construction. C'est le périmètre que l'auteur a explicitement exclu.

Une fois l'import confirmé, supprime le répertoire copié sur Ubuntu, puis
rappelle à l'auteur de supprimer l'original sous `data/config-exports/` sur
Windows :

```bash
rm -rf <répertoire-copié-depuis-Windows>
```

## 8. Étape 6 — démarrage et réglages d'interface

```bash
./start.sh
```

Puis, dans la page **Settings** de MikAI :

- vérifier que les clés API sont présentes (importées à l'étape 5) — ne
  ressaisir que celles qui manquent ;
- remplacer `localhost` par l'IP réseau local de la machine Windows, notée à
  l'étape 0, pour l'URL ComfyUI et l'URL Ollama.

ComfyUI et Ollama restent sur la machine Windows. Rien n'exige de les déplacer :
`src/lib/comfy/comfyServerClient.ts` ne parle à ComfyUI que par HTTP et ne lance
jamais de processus local.

## 9. Étape 7 — validation manuelle de P0.3

Différée le 2026-09-12, à faire maintenant que l'application tourne sur Ubuntu.

1. Ouvrir une page de séquence, puis déplier le bloc
   « Show OpenReel start command ».
2. Ouvrir la page Editorial de cette même séquence, puis déplier le même bloc
   « Show OpenReel start command ».
3. Les deux doivent afficher `cd ../mikai-openreel-sidecar`, puis
   `npx -y pnpm@11.7.0 dev`.

Le chemin est passé d'absolu à relatif en P0.3. Un chemin absolu affiché à l'un
des deux endroits est une régression.

## 10. Optionnel — OpenCV

Nécessaire uniquement pour l'extraction de plans du storyboard
(`src/lib/storyboardExtraction/opencvWorker.ts`). Sur Ubuntu 24.04,
`pip install` en mode système refuse avec
`error: externally-managed-environment` ; passer par un venv :

```bash
python3 -m venv ~/.venvs/mikai-opencv
source ~/.venvs/mikai-opencv/bin/activate
pip install opencv-python-headless numpy
```

Ensuite, soit garder ce venv actif au lancement de MikAI, soit pointer
`OPENCV_PYTHON_BIN` dans `.env.local` vers
`~/.venvs/mikai-opencv/bin/python`.

## 11. Ce que le clone n'apporte pas, et qui reste manuel

Aucun de ces points ne bloque, tous sont documentés :

- le venv Python et OpenCV (§10) ;
- le cache des navigateurs Playwright — sans lui,
  `npm run playwright:verify` échoue ;
- `.git/info/exclude` — git ne réplique jamais ce fichier ;
- `.vscode/` et `.cline/`.

## 12. Ce qui a été écarté — ne le rouvre pas

**Cloner le sidecar OpenReel à l'intérieur du dossier MikAI** — écarté par
l'auteur le 2026-09-12, après mesure : 1466 fichiers `.ts`/`.tsx` et 397
fichiers de test que `tsconfig.json`, `vitest.config.mts` et ESLint
avaleraient, pour un gain d'installation nul puisque `install.sh` clone déjà.

**ComfyUI sur GPU Ubuntu** — chantier distinct : pilotes NVIDIA, CUDA, modèles.
Le code ne l'exige pas.

**Copier `data/mikailab.db` (6 Mo) à la main** — possible, pas requis, et
dégradé : cette copie amène chaque ligne de projet, dont les références
pointent vers des fichiers image et vidéo absents de la machine cible. Les
projets apparaîtraient avec leurs médias cassés.

## 13. Livrable attendu de cette session

Un rapport contenant :

- la sortie **verbatim et non filtrée** de `./install.sh`, de
  `npx tsc --noEmit`, de `npm run test` et de `./doctor.sh` ;
- pour chacun des trois risques (casse des imports, installations réseau, accès
  au dépôt du sidecar) : tranché ou non, et par quelle sortie ;
- le résultat des deux blocs « Show OpenReel start command » de l'étape 7 ;
- la sortie de `config:import` — mais **jamais la valeur d'une clé API** :
  les compteurs et les noms de clés suffisent ;
- la confirmation que le répertoire d'export a été supprimé sur Ubuntu ;
- tout écart entre la procédure ci-dessus et ce que la machine a réellement
  fait — un écart est une information, pas un échec.

Si tout passe, propose à l'auteur la clôture de `DEVOPS.LINUX.PORT.1` dans les
trois fichiers de statut (`.agents/supervised_task.md`, `docs/ROADMAP.md`,
`docs/PROJECT_STATE.md`), et **attends son go avant tout commit**.
