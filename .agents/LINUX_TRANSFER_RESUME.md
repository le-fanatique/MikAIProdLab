# Reprise — transfert de MikAI vers Ubuntu

**Écrit le 2026-09-14, juste avant un `/clear`.** Ce fichier dit où en est le
transfert, pour qu'une session sans mémoire de la conversation reprenne au bon
endroit. Il ne contient aucun secret.

À lire avec : `CLAUDE.md`, `AGENTS.md`, `.agents/supervised_task.md`.

---

## 1. Prompt de reprise

```text
Invoke the mikai-method skill.
Lis .agents/LINUX_TRANSFER_RESUME.md, puis .agents/supervised_task.md.
Le seul sujet actif est la fin de DEVOPS.LINUX.PORT.1 (P1 + validation P0.3).
LLMW.CHAIN est garé : n'y touche pas.
Aucun commit, aucun push, aucun git add sans mon go explicite.
```

## 2. Où on en est

| Élément | État |
| --- | --- |
| `DEVOPS.LINUX.PORT.1` **P0** | livré et poussé le 2026-09-12 (`7e9218d`, `772576a`, `5deeaad`) |
| `DEVOPS.CONFIG.EXPORT.1` | livré et poussé le 2026-09-13 (`e26f668`, `46a9111`) |
| `DEVOPS.CONFIG.LOOPBACK.1` | livré et poussé le 2026-09-13 (`431dc00`, `650d897`) |
| `DEVOPS.LINUX.PORT.1` **P1** | **à faire**, par l'auteur, sur la machine Ubuntu |
| Validation manuelle de **P0.3** | **à faire**, une fois l'application lancée sur Ubuntu |
| Export de configuration avec les clés | **à refaire** (§3) |
| Brief pour la session Claude sur Ubuntu | **prêt** : `.agents/P1_UBUNTU_BRIEF.md` |

Aucun code n'est en cours. Aucune migration n'attend.

## 3. L'export de configuration — à refaire avec les clés

**Décision de l'auteur, 2026-09-14 : l'export transporte les clés API.**

Un export existe déjà, mais il a été fait **avant** cette décision, donc
**sans les clés**. Mesuré sur son manifeste le 2026-09-14 :

- répertoire : `data/config-exports/mikai-config-2026-09-14T00-10-07-001Z/`,
  plus une archive `.zip` du même nom (14 Mo) ;
- `app_settings` : 30 lignes ; `comfy_workflows` : 26 ; vignettes : 8 ;
  `llm_templates` : 0 ;
- **quatre clés omises** : `comfyui_api_key`, `comfyui_cloud_api_key`,
  `llm_api_key`, `llm_openrouter_api_key`.

À faire sur Windows, dans `F:\AI\MikAIProdLab` :

```powershell
npm run config:export -- --with-secrets
```

Vérifier que la sortie console affiche `(0 secret key(s) omitted)`. Supprimer
ensuite l'ancien export et son `.zip`, pour ne transférer que le nouveau.

**Sécurité.** Le nouvel export contient les clés **en clair**. Transfert par
`scp -r` direct ou clé USB uniquement — jamais par un dossier synchronisé, un
e-mail ou une messagerie. Ne jamais afficher son contenu. Le supprimer sur les
deux machines une fois l'import confirmé. `data/` est hors git ; vérifier
`git status` avant tout commit malgré tout.

## 4. Les URL à corriger sur Ubuntu après l'import

Lues dans le manifeste du 2026-09-14 :

| Réglage | Valeur exportée | Sur Ubuntu |
| --- | --- | --- |
| `comfyui_base_url` | `http://127.0.0.1:8188` | **à changer** : IP de la machine Windows |
| `llm_ollama_base_url` | `http://localhost:11434` | **à changer** : IP de la machine Windows |
| `llm_base_url` | adresse Tailscale `100.x` | fonctionne seulement si la machine Ubuntu est sur le même tailnet |
| `llm_openrouter_base_url` | `https://openrouter.ai/api/v1` | inchangé |

`config:import` signale lui-même les deux adresses de boucle locale
(`DEVOPS.CONFIG.LOOPBACK.1`). Il ne les réécrit pas : la correction se fait dans
la page **Settings**. Noter l'IP Windows avec `ipconfig` avant de partir.

ComfyUI et Ollama restent sur Windows. Ubuntu les atteint en HTTP : le pare-feu
Windows doit accepter les connexions entrantes sur 8188 et 11434, et Ollama
doit écouter sur le réseau (`OLLAMA_HOST=0.0.0.0`), pas seulement sur
`localhost`. **Point non vérifié depuis ce dépôt** : à confirmer au premier
échec de connexion.

## 5. Le déroulé P1

Tout est dans **`.agents/P1_UBUNTU_BRIEF.md`**, écrit pour la session Claude
qui tournera sur Ubuntu, déjà mis à jour pour l'export avec clés. Procédure de
référence du dépôt : `docs/DEVOPS_LINUX_PORT_1.md`.

Ce brief n'est **pas commité** : il apparaît en non suivi dans `git status`,
et ne doit pas être stagé. Un clone GitHub sur Ubuntu ne l'aura pas : le copier à la main avec
l'export.

Résumé de l'ordre :

1. Windows : `npm run config:export -- --with-secrets`, `ipconfig`.
2. Ubuntu : Node 22 par nvm (jamais 24), `git`, `build-essential`, `python3`,
   `corepack enable`.
3. `git clone`, puis `./install.sh`.
4. **`npx tsc --noEmit`** — la seule preuve de la casse des imports.
5. `npm run test`, `./doctor.sh`.
6. `npm run db:migrate`, puis `npm run config:import -- <export> --target .`.
7. `./start.sh`, Settings : vérifier les clés, corriger les URL du §4.
8. Validation P0.3 (§6).

**Règle absolue : les sorties se rapportent verbatim, sans `grep`, sans
`| head`.** Filtrer a déjà détruit la preuve deux fois sur ce dépôt.

## 6. Validation manuelle de P0.3

1. Ouvrir une page de séquence et déplier « Show OpenReel start command ».
2. Ouvrir la page Editorial de la même séquence et déplier le même bloc.
3. Les deux doivent afficher `cd ../mikai-openreel-sidecar`, puis
   `npx -y pnpm@11.7.0 dev`. Un chemin absolu à l'un des deux endroits est une
   régression.

## 7. Ce qui clôt le chantier

Quand P1 et P0.3 sont validés par l'auteur :

- clore `DEVOPS.LINUX.PORT.1` dans les trois fichiers de statut —
  `.agents/supervised_task.md`, `docs/ROADMAP.md`, `docs/PROJECT_STATE.md`
  (`mikai-method` §9) ;
- si `npx tsc --noEmit` révèle une casse d'import, c'est un **ticket de
  correction**, pas une retouche improvisée : le rapporter et attendre le go ;
- supprimer les exports de configuration sur les deux machines.

## 8. Ce qui est en suspens hors du transfert

**Non commités, en attente d'un go de l'auteur :**

- `docs/LLM_WORKSPACE_CHAIN_BOARD_PLAN.md` (nouveau) ;
- `docs/ROADMAP.md` (entrée `LLMW.CHAIN` ajoutée en §4).

Ils concernent `LLMW.CHAIN`, **garé** jusqu'à la clôture de
`DEVOPS.LINUX.PORT.1`. Les commiter ou non ne change rien au transfert. Si le
go vient, stager ces deux chemins explicitement, jamais `git add .`.

**Fichiers locaux, non suivis et à ne pas stager :** ce fichier et
`.agents/P1_UBUNTU_BRIEF.md`. À supprimer une fois le chantier clos.
