# DEVOPS.LINUX.PORT.1 — audit préliminaire de portabilité Windows → Ubuntu

Mesuré le **2026-09-12**, depuis la machine Windows de l'auteur, sur `84bfec9`,
arbre de travail propre, 0 commit d'avance et 0 de retard sur `origin/main`.

Ce document est l'**analyse**, pas la procédure. La procédure d'installation
destinée à la personne qui installe vivra dans `docs/DEVOPS_LINUX_PORT_1.md`,
produit par l'étape P0.5 du ticket. Ici : ce qui a été mesuré, comment, et ce
qui reste indécidable depuis Windows.

## 0. Le besoin

L'auteur doit installer son travail sur une machine Ubuntu, en passant par
GitHub. Il a écarté explicitement la récupération des projets en cours. Cela
retire du périmètre les 43 Go de `data/backups`, les 968 Mo de
`public/uploads` et les 2,9 Go de `public/outputs`. **Cela n'en retire pas la
configuration** — voir §4, qui est le seul vrai obstacle trouvé.

## 1. Méthode

Rien ici n'est déduit du schéma ni de la mémoire. Chaque affirmation vient
d'une commande exécutée sur le dépôt :

- l'inventaire suivi vient de `git ls-files` (1090 fichiers) et de
  `git ls-files -s` pour les modes ;
- l'absence de CRLF vient d'un parcours des **blobs** (`git show HEAD:<path>`),
  pas des fichiers du disque : c'est ce qui sera livré au checkout Linux qui
  compte, et `core.autocrlf=true` rend les deux différents ;
- l'absence de collision de casse vient de
  `git ls-files | tr 'A-Z' 'a-z' | sort | uniq -d` ;
- les hypothèses de plateforme viennent d'un `grep` de `process.platform` et
  `os.platform()` sur `src`, `scripts`, `tests`, `tools` ;
- la couverture Linux du lockfile vient de la présence des entrées
  `@next/swc-linux-*` dans `package-lock.json` ;
- les tailles viennent de `du -sh`.

`mikai-method` §10b s'applique et a été suivi : on remonte depuis ce qui est
consommé — le blob, le mode dans l'index, la sortie de la commande — et non
depuis ce qu'un nom de fichier laisse croire.

## 2. Ce que GitHub porte déjà

`le-fanatique/MikAIProdLab`, 1090 fichiers suivis, `.git` = 76 Mo.

Le code, `docs/`, les migrations `drizzle/` avec leurs `meta/*_snapshot.json`,
les 200 fichiers de `tests/`, `package-lock.json`,
`config/openreel-sidecar-release.json` (le pin du sidecar OpenReel), les
`.claude/agents|rules|skills`, et les `.gitkeep` qui matérialisent les dossiers
runtime.

Et surtout : **les deux chaînes d'installation existent déjà.** `install.sh`,
`setup-linux.sh`, `start-dev.sh` et `doctor.sh` côté Linux ; leurs jumeaux
`.ps1` côté Windows. `install.sh` n'est qu'un mince appel à
`scripts/mikai-deploy.mjs`, commun aux deux systèmes précisément pour qu'ils ne
divergent pas. Le `README.md` a déjà une section « Quick Start — Linux /
Ubuntu ».

**Conclusion de départ : la faisabilité n'est pas en question.** Le sujet est
l'inventaire des trous, pas la construction d'une chaîne.

## 3. Ce que GitHub ne porte pas

| Absent | Conséquence sur la machine Ubuntu | Couvert par l'existant ? |
| --- | --- | --- |
| `node_modules` | — | oui, `npm ci` |
| `.env.local` | clés API perdues | partiel : `setup-linux.sh` copie `.env.local.example` ; les clés restent à ressaisir |
| `data/mikailab.db` (6 Mo) | **§4** | **non** |
| `public/uploads` (968 Mo), `public/outputs` (2,9 Go), `storage/` | médias absents | hors périmètre par décision de l'auteur |
| sidecar OpenReel | dépôt séparé | oui, `install.sh` le clone au commit épinglé |
| `.git/info/exclude` | règles locales (`audit_*.md`, `prompt_result.txt`, `.clinerules`) perdues | **non**, et par construction : git ne réplique jamais ce fichier |
| `.claude/skills/sd25-pe/` | ignoré volontairement — il se réécrit seul à chaque session | oui, `skills-lock.json` est suivi et dit contre quelle version on tourne |
| `.vscode/`, `.cline/` | configuration de l'exécuteur de secours | **non** |
| cache `ms-playwright` | `npm run playwright:verify` échoue : `playwright-core` est choisi **précisément** parce qu'il n'installe aucun navigateur | **non** |

## 4. Le seul vrai obstacle — la configuration vit dans la base

Trois tables du schéma ne contiennent pas des projets :

- `app_settings` — provider LLM actif, base URLs, clés API, **URL ComfyUI**,
  `openreel_sidecar_url`, `mikai_public_base_url`, thème ;
- `comfy_workflows` — les workflows ComfyUI importés par l'auteur ;
- `llm_templates` — les templates du LLM Workspace.

Elles vivent dans `data/mikailab.db`, qui est `.gitignore`. **Un clone donne
donc une application qui démarre et qui ne sait rien faire** : aucun workflow,
aucun provider, aucune clé. C'est exactement ce que l'auteur désigne en
demandant que « la chose soit transparente ».

`scripts/data-backup.mjs` sait déjà transporter tout cela — mais en
tout-ou-rien : la base entière **plus** les quatre racines média de
`MEDIA_ROOT_LABELS`. C'est l'outil de sauvegarde d'une installation, pas celui
d'un portage sans les projets. Le décalage n'est pas un défaut du script : il
fait ce pour quoi il a été écrit.

**La brique manquante est donc nommée : `DEVOPS.CONFIG.EXPORT.1`**, un
export/import ne portant que ces trois tables. Ticket séparé, délibérément hors
de `DEVOPS.LINUX.PORT.1`.

Contournement disponible immédiatement : `data/mikailab.db` fait **6 Mo** (les
43 Go de `data/` sont `data/backups/`). Le copier à la main donne une
installation complète, au prix d'emporter aussi les projets — ce dont l'auteur
a dit ne pas avoir besoin, sans l'interdire.

## 5. Ce qui est déjà portable, et vérifié

Ces points sont mesurés. Ils figurent ici pour qu'aucun travail futur ne les
rouvre par précaution :

- **aucun blob texte en CRLF** parmi les 1090 fichiers suivis, malgré
  `core.autocrlf=true` sur la machine Windows et l'absence de `.gitattributes`.
  Les seuls `\r` trouvés sont dans trois binaires : `src/app/favicon.ico`,
  `public/theme/mikros/appearance-preview.png`,
  `public/theme/mikros/brush-accent.png` ;
- **aucune collision de casse** entre chemins suivis ;
- `process.platform` n'apparaît que dans `scripts/mikai-deploy.mjs`,
  `scripts/run-prod-lab.mjs` et `scripts/test-repeat.mjs` — **jamais dans
  `src/`**. L'application elle-même ne sait pas sur quel système elle tourne ;
- `src/` n'invoque ni `powershell` ni `cmd.exe` ;
- `package-lock.json` contient les cibles Linux (`@next/swc-linux-x64-gnu`,
  `-musl`, `arm64-gnu`, `arm64-musl`) ;
- **ComfyUI est atteint uniquement en HTTP** (`src/lib/comfy/comfyServerClient.ts`,
  défaut `http://127.0.0.1:8188`) : aucun lancement de processus local, nulle
  part. Il peut rester sur la machine Windows, atteint par son IP ;
- les tests n'ont aucune hypothèse Windows ; `maxWorkers: "75%"` se dérive de
  `os.availableParallelism` et s'adapte donc à la machine cible.

**Ligne de base de la suite, `84bfec9`, 2026-09-12 : 200 fichiers, 2044 tests,
tous verts, 14,65 s.**

## 6. Les risques, par ordre de rencontre

1. **Bit exécutable manquant.** `install.sh`, `start.sh` et `update.sh` sont
   suivis en mode `100644`, alors que `doctor.sh`, `setup-linux.sh` et
   `start-dev.sh` sont en `100755`. Sur Ubuntu, `./install.sh` donne
   `Permission denied` — c'est le tout premier geste d'une installation.
2. **Pas de `.gitattributes`.** L'absence actuelle de CRLF est un état de fait,
   pas une garantie. Un futur commit peut introduire un CRLF dans un `.sh`, ce
   qui donne `/usr/bin/env: 'bash\r': No such file or directory`.
3. **Casse des imports.** NTFS est insensible à la casse, ext4 ne l'est pas. Un
   `import "@/lib/Settings"` compile sur Windows et casse sur Linux. Aucune
   collision de *chemin* n'existe, mais la casse des *imports* n'est prouvable
   que par un `npx tsc --noEmit` **exécuté sur Linux**. Aucune commande lancée
   depuis Windows ne peut trancher ce point.
4. **Python / OpenCV.** `src/lib/storyboardExtraction/opencvWorker.ts` appelle
   `python3` (surchargeable par `OPENCV_PYTHON_BIN`) et exige
   `opencv-python-headless` + `numpy`. Sur Ubuntu 24.04, `pip install` échoue
   sur `error: externally-managed-environment` : il faut un venv ou
   `--break-system-packages`.
5. **Installs réseau.** `better-sqlite3` (via `prebuild-install`) et
   `ffmpeg-ffprobe-static` (`hasInstallScript: true`) téléchargent des binaires
   pendant `npm ci`. Derrière un proxy ou hors ligne, l'installation casse —
   et `ffmpeg` n'est pas optionnel pour le montage.
6. **`pnpm` requis** par `install.sh` pour le sidecar (`checkPnpmAvailable`,
   `scripts/mikai-deploy.mjs`).
7. **Le `doctor` ne couvre aucun des points 4 à 6.** `doctor.sh` et `doctor.ps1`
   ne contiennent **zéro** occurrence de `pnpm`, `python`, `ffmpeg`,
   `playwright` ou `sidecar`. Ce manque n'est pas une découverte :
   `docs/DEVOPS_RUN_1_ONE_COMMAND_LAUNCHER.md` §10 le nommait déjà comme
   l'étape suivante possible, non demandée à l'époque. Elle l'est maintenant.
8. **Chemin Windows en dur dans l'UI, et dupliqué.**
   `cd F:/AI/mikai-openreel-sidecar` apparaît à l'identique dans
   `src/app/projects/[projectId]/sequences/[sequenceId]/editorial/page.tsx:285`
   et `src/app/projects/[projectId]/sequences/[sequenceId]/page.tsx:459`. C'est
   une instruction affichée à l'auteur, fausse sur Linux, et écrite deux fois —
   le défaut récurrent de ce dépôt, celui que `docs/WHERE_THE_RULES_LIVE.md`
   existe pour éviter.
9. **`storage/uploads` n'a pas de `.gitkeep`** alors que
   `scripts/data-backup.mjs:52` le compte parmi ses quatre racines média. Seuls
   `storage/` et `storage/outputs/` en ont un.
10. **Accessibilité du dépôt sidecar** `le-fanatique/mikai-openreel-sidecar`
    depuis la machine Ubuntu — visibilité et identifiants git. Non vérifiable
    depuis ici.
11. **GPU.** Faire tourner ComfyUI *sur* la machine Ubuntu est un chantier
    distinct : pilotes NVIDIA, CUDA, modèles. L'option courte, et celle que le
    code rend possible sans une ligne de changement (§5), est de le laisser sur
    la machine Windows et de saisir son URL dans Settings.

## 7. Ce qui ne se décide pas depuis Windows

**Les risques 3, 5 et 10 sont indécidables depuis la machine actuelle.** Aucune
correction faite ici ne doit prétendre les avoir traités. Ils exigent le
déroulé réel :

```bash
git clone https://github.com/le-fanatique/MikAIProdLab.git ~/MikAIProdLab
cd ~/MikAIProdLab
./install.sh
npx tsc --noEmit      # la preuve attendue sur le risque 3
npm run test          # à comparer à 200 fichiers / 2044 tests
./doctor.sh
```

La sortie se rapporte **verbatim, sans filtrage `grep`** : filtrer la sortie
d'une suite a déjà détruit la preuve deux fois sur ce dépôt, le 2026-08-28.

## 8. Test LLM Workspace

`CLAUDE.md` § Start Here point 1 et `mikai-method` §10 imposent de tester tout
besoin contre le LLM Workspace avant de concevoir.

**Réponse : hors périmètre.** Ce chantier ne contient aucune opération assistée
par LLM — il ne propose, ne rédige, n'analyse et n'ajuste aucun champ. Il porte
sur l'installation, l'outillage shell et le transport de configuration. Aucun
descripteur, aucune variable, aucune action du workspace n'est concerné, et
aucune brique n'a à être ajoutée au format.

UC1 / UC2 / UC3 : aucun n'est rapproché, aucun n'est contraint, aucun n'est
touché.

## 9. Suite

- `DEVOPS.LINUX.PORT.1` — P0 traite les risques 1, 2, 4 à 9 depuis Windows ;
  P1 est le déroulé sur Ubuntu, à la charge de l'auteur. Cadrage :
  `.agents/supervised_task.md`.
- `DEVOPS.CONFIG.EXPORT.1` — l'export/import config-only de §4. Pas encore
  ouvert.
