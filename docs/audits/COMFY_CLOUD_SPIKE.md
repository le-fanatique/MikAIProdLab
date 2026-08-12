# Comfy Cloud — Spike de contrat (COMFY.CLOUD.SPIKE.1)

Date : 2026-07-21. Document non committé (livrable read-only, `safeToCommit`
attendu `false` même si `APPROVED`).

## Verdict

**GO WITH LIMITS** pour `COMFY.PROVIDER.1`.

Le contrat REST/auth/upload/tracking/output de Comfy Cloud est réel,
authentifiable avec la clé déjà configurée dans MikAI, et globalement
compatible en forme avec ce que MikAI sait déjà faire côté ComfyUI local.
Mais il **diffère sur des points structurels précis** (préfixe `/api`,
header obligatoire, endpoints de suivi différents, vocabulaire de statut
divergent entre deux endpoints Cloud eux-mêmes, stockage adressé par hash,
absence de suppression fonctionnelle des jobs) qui interdisent un simple
changement de `comfyui_base_url` : `COMFY.PROVIDER.1` doit créer un
véritable adaptateur de provider, pas réutiliser le client actuel tel quel.

Aucun workflow de la Workflow Library n'est copiable-collable sans risque :
les trois workflows SDXL (id 1/4/5) référencent un checkpoint absent du
catalogue Cloud (`juggernautXL_ragnarokBy.safetensors`), et neuf autres
workflows image/vidéo reposent sur des Partner Nodes payants
(`GeminiImage2Node`, `OpenAIGPTImageNodeV2`, `ByteDance*`) — confirmés
`api_node: true` par le vrai `object_info` Cloud, donc facturables à chaque
soumission via `extra_data.api_key_comfy_org`.

## Contexte et méthode

Contrat officiel lu intégralement : `docs.comfy.org/development/cloud/overview`,
`.../api-reference`, et surtout l'OpenAPI officiel téléchargé depuis
`raw.githubusercontent.com/Comfy-Org/docs/main/openapi-cloud.yaml` (3732
lignes, seule source de vérité utilisée pour les schémas exacts — les pages
de doc narrative se sont révélées incomplètes sur plusieurs points, voir
plus bas). Contrat local relu dans `src/lib/comfy/comfyServerClient.ts`,
`src/actions/generation.ts`, `src/app/api/jobs/[jobId]/route.ts`,
`src/lib/settings.ts`, `src/components/ComfyUISettingsForm.tsx`,
`src/actions/settings.ts`.

Un seul appel réel de soumission a été effectué (règle du ticket), plus des
appels de lecture (auth, `object_info`, `features`, `jobs`, `system_stats`)
et deux appels de validation volontairement voués à l'échec avant exécution
(sans clé ; classe de node inexistante) — aucun d'eux ne consomme de calcul
GPU. La clé API existante n'a jamais été affichée, journalisée, ni écrite
dans un fichier autre que la mémoire du process du harness.

## Matrice Local vs Cloud

| Aspect | Local (code MikAI actuel) | Comfy Cloud (contrat réel observé) | Rupture pour MikAI |
|---|---|---|---|
| Base URL | `comfyui_base_url`, ex. `http://127.0.0.1:8188` | `https://cloud.comfy.org` fixe | mineure — juste une valeur |
| Auth | Aucune (réseau local de confiance) | **`X-API-Key` obligatoire sur presque tous les endpoints** — vérifié : sans header, `401 {"code":"UNAUTHORIZED"}` sur `/api/object_info` | **majeure** — le client actuel n'envoie jamais de header d'auth |
| Préfixe endpoints | Aucun (`/prompt`, `/history/...`, `/upload/image`, `/view`, `/queue`, `/interrupt`, `/free`) | **Tout est sous `/api/...`** (`/api/prompt`, `/api/upload/image`, `/api/view`, `/api/queue`, `/api/interrupt`) ; **`/api/free` n'existe pas** dans l'OpenAPI Cloud | **majeure** — tous les chemins codés en dur dans `comfyServerClient.ts` sont faux pour Cloud |
| Soumission `/prompt` | `POST {base}/prompt` avec `{client_id, prompt, extra_data?}` → `{prompt_id, number?, node_errors?}` | `POST /api/prompt` avec `{prompt, number?, front?, extra_data?}` → `{prompt_id, number?, node_errors?}` (200) ; `number`/`front` **acceptés mais ignorés** (ordonnancement propre à Cloud) ; `400/402/429/500/503` documentés | forme quasi identique — `client_id` non repris dans le schema Cloud (ignoré sans erreur, vérifié : soumission acceptée sans lui) |
| Validation du prompt | Synchrone, avant mise en queue (le prompt invalide n'est jamais alloué) | **Deux étages distincts, vérifiés en réel** : (1) validation structurelle synchrone à `/api/prompt` (classe de node inexistante → `400` immédiat, jamais de `prompt_id`) ; (2) validation des **valeurs d'input** (ex. `ckpt_name`) faite **après allocation GPU**, sur le worker assigné — `/api/prompt` a répondu `200` avec `prompt_id` et `node_errors: {}` pour un checkpoint qui n'existe pas, puis le job est passé `queued_waiting → allocated → error` en ~7 s avec l'erreur structurée réelle | **majeure** — MikAI ne peut pas supposer qu'un `200` de `/prompt` signifie "graphe valide" sur Cloud comme il le suppose implicitlement en local |
| Suivi de job | `GET {base}/history/{promptId}` → dict clé=promptId, `outputs[nodeId].images/videos/gifs[]` | **Aucun équivalent direct.** Deux endpoints distincts et **non alignés entre eux** : `GET /api/job/{id}/status` (statuts observés en réel : `queued_waiting`, `allocated`, `error` — **absents de l'enum documenté** `pending/in_progress/completed/failed/cancelled`) et `GET /api/jobs/{id}` (statut **coarse**, conforme à l'enum documenté, **avec `outputs`/`execution_error`/`outputs_count`** — c'est le vrai équivalent de `/history`) | **majeure** — le polling actuel de `route.ts` doit être entièrement réécrit pour Cloud ; ne jamais se fier au vocabulaire de statut de `/api/job/{id}/status`, utiliser `/api/jobs/{id}` comme source de vérité terminale |
| `node_errors` | Retourné par `/prompt` uniquement | Retourné par `/prompt` (souvent vide même sur workflow invalide, voir ci-dessus) **et** dans `execution_error` (`node_id`, `node_type`, `exception_message`, `exception_type`, `traceback`, `current_inputs`, `current_outputs`) sur `/api/jobs/{id}` pour un job `failed` | MikAI doit lire `execution_error` de `/api/jobs/{id}`, pas seulement `node_errors` de la soumission |
| Upload image | `POST {base}/upload/image`, `FormData{image}` → `{name, subfolder, type}` ; nom conservé | `POST /api/upload/image` (vérifié réel, `200`) → **`name` est un hash de contenu**, ex. `a4dab317c3df...c297c.png`, jamais le nom original ; `subfolder` toujours vide en pratique | **majeure** — tout code qui utilise le `name` retourné comme identifiant "humain" est faux sur Cloud ; **déduplication automatique par hash** (uploader deux fois le même octet = même `name`, aucun doublon) |
| `/view` | `GET {base}/view?filename&subfolder&type` → octets directs | `GET /api/view?filename&subfolder&type&...` → **redirection 302 vers une URL GCS signée** ; `subfolder` **ignoré** (stockage adressé par hash) ; doc précise explicitement de **ne pas renvoyer le header d'auth après la redirection** | **majeure** — la route `generated-outputs` de MikAI (téléchargement direct, streaming, Range custom) doit être adaptée : suivre une redirection puis streamer depuis l'URL signée, sans propager `X-API-Key` |
| Queue / interrupt | `GET {base}/queue`, `POST {base}/interrupt` | `POST /api/queue {"delete":[promptId]}` pour annuler, `POST /api/interrupt`, concurrence limitée par palier d'abonnement (Standard=1, Creator=3, Pro=5) | l'annulation existe mais n'a pas eu besoin d'être exercée en urgence : le job de preuve a échoué seul en ~7 s, avant tout calcul réel |
| Suppression d'historique | N/A (pas de concept) | `POST /api/history {"delete":[jobId]}` → **`200` mais sans effet réel constaté** : le job supprimé reste visible en entier via `GET /api/jobs/{id}` (`200`, données complètes) et en tête de `GET /api/jobs` | **finding critique pour le coût** — pas de purge fiable des jobs Cloud ; MikAI ne doit jamais promettre à l'utilisateur qu'un "delete" côté Cloud supprime réellement l'historique du compte |
| Suppression d'asset uploadé | N/A | `DELETE /api/assets/{id}` existe en théorie, mais `GET /api/assets/hash/{hash}` a renvoyé `404` pour l'image de test uploadée en `type=input` — impossible de résoudre son `id` pour la supprimer | asset de test résiduel, voir section Coût/résidus |
| `extra_data.api_key_comfy_org` | Déjà envoyé conditionnellement par `queueComfyPrompt` si `comfyui_api_key` est renseigné (utilisé pour Partner Nodes en **local**) | Même champ, même sémantique documentée : requis pour les Partner Nodes (`GeminiImage2Node`, `OpenAIGPTImageNodeV2`, `ByteDance*`, tous confirmés `api_node: true` en réel) | MikAI a déjà le bon réflexe côté local ; à répliquer explicitement côté adaptateur Cloud, avec confirmation de coût avant chaque soumission Partner Node |
| WebSocket | Non utilisé par MikAI aujourd'hui | `wss://cloud.comfy.org/ws?clientId={uuid}&token={apiKey}` documenté, non testé (polling REST suffisant pour ce spike, cohérent avec le contrat REST déjà utilisé par MikAI) | optionnel pour `COMFY.PROVIDER.1` — REST seul suffit à reproduire le comportement actuel |
| `object_info` | `GET {base}/object_info` (implicite dans le mapper de workflow, non appelé côté client actuel documenté ici) | `GET /api/object_info` → **3573 classes de nodes**, chaque entrée porte un flag **`api_node: boolean`** — absent en local | Cloud expose un signal explicite et fiable pour distinguer nœud "compute inclus" vs "Partner Node payant" ; à exploiter dans l'adaptateur pour avertir l'utilisateur avant soumission |

## Résultat de compatibilité du candidat retenu

Sur les 19 workflows de la Workflow Library, un seul satisfait strictement
les 4 critères imposés par le ticket (déjà en API format, classes exposées
par Cloud, au moins un output image, aucune dépense Partner Node) :
**`sdxl txt2image` (id 4)**. Ses 9 classes de nodes (`SaveImage`,
`ConditioningZeroOut`, `VAEDecode`, `CLIPTextEncode`, `EmptySD3LatentImage`,
`KSampler`, `PrimitiveInt`, `PrimitiveStringMultiline`,
`CheckpointLoaderSimple`) sont **toutes** présentes dans le vrai
`object_info` Cloud, avec `api_node: false`.

Soumis une seule fois, sans aucune modification de structure (seuls les 4
inputs explicitement titrés `(Input)` ont été renseignés : largeur/hauteur
réduites à 512×512 pour limiter le coût, texte de prompt, seed) :

- `POST /api/upload/image` → `200`, nom retourné = hash de contenu
  (confirmation live du stockage adressé par hash) ;
- `POST /api/prompt` → `200`, `prompt_id` réel obtenu, `node_errors: {}` ;
- suivi réel : `pending → queued_waiting → allocated → error` en ~7 s ;
- `GET /api/jobs/{id}` → `status: "failed"`, `execution_error` structuré :
  `value_not_in_list`, `"ckpt_name: 'juggernautXL_ragnarokBy.safetensors'
  is not a valid value"`, `class_type: "CheckpointLoaderSimple"`.

Le seul point de rupture réel du candidat est le **nom exact du checkpoint**
(`juggernautXL_ragnarokBy.safetensors` inconnu de Cloud), pas la classe de
node elle-même — Cloud expose bien `CheckpointLoaderSimple` avec un
catalogue de **81 checkpoints**, dont un Juggernaut différent
(`Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors`, fichier distinct). Le
job a échoué **après allocation GPU** mais **avant toute étape de diffusion
réelle** (rejet immédiat par le worker) : coût quasi nul, mais ceci confirme
que Cloud **alloue une ressource avant de valider les valeurs d'input**, ce
qui a un coût potentiel non nul pour des erreurs similaires à plus grande
échelle si l'adaptateur ne pré-valide pas contre le vrai `object_info`.

**Aucun output n'a donc été produit** ; la branche `/api/view` (redirection
302 vers URL signée GCS, comportement documenté dans l'OpenAPI) **n'a pas
été vérifiée en direct** — seule sa spécification a été lue. C'est une
limite honnête de ce spike : le budget d'une seule soumission réelle a été
consommé par la découverte, plus utile, de l'incompatibilité de checkpoint.

## Tests négatifs

- **Sans `X-API-Key`** : `GET /api/object_info` → `401
  {"code":"UNAUTHORIZED","message":"authentication required"}`. Le header
  est bien *effectivement* exigé, pas seulement documenté.
- **Classe de node inexistante** (`ThisNodeClassDoesNotExistAnywhere`) :
  `POST /api/prompt` → `400 {"error":{"type":"VALIDATION_ERROR","message":
  "Invalid workflow: unsupported node type '...'"}}`, rejeté **avant** toute
  allocation — aucune deuxième génération réelle déclenchée. Ce mode
  d'échec (structurel, synchrone) diffère de celui du checkpoint invalide
  (valeur d'input, asynchrone après allocation) — les deux formes d'erreur
  doivent être gérées séparément par l'adaptateur.

## Coût, objets Cloud résiduels et limitations d'API

- Aucun coût de génération engagé (échec avant toute étape de diffusion).
- **Job résiduel** : un job `failed` reste visible en entier via
  `GET /api/jobs/{id}` et en tête de `GET /api/jobs` malgré un appel
  explicite `POST /api/history {"delete":[jobId]}` ayant répondu `200`. Id
  tronqué : `b747bc5e-…-de7141`. Aucune méthode API n'a permis sa
  suppression réelle pendant ce spike.
- **Asset résiduel** : l'image de test 8×8 px (72 octets, synthétique,
  aucune donnée personnelle) uploadée en `type=input` est stockée sous son
  nom de hash de contenu. `GET /api/assets/hash/{hash}` a renvoyé `404` —
  impossible de résoudre son `id` pour appeler `DELETE /api/assets/{id}`
  avec les endpoints documentés testés. Elle reste donc sur le compte Cloud
  de l'utilisateur.
- Aucun autre objet (aucune deuxième génération, aucun autre upload) n'a été
  créé. Aucun objet Cloud préexistant de l'utilisateur n'a été modifié ou
  supprimé.
- Limite de concurrence par palier d'abonnement documentée (Standard=1,
  Creator=3, Pro=5) — non testée (une seule soumission).

## Verdict spécifique SHARP / Gaussian Splat

**Disponible au niveau des classes, non prouvé en exécution** — aucun test
SHARP/Gaussian n'a été effectué (interdit par le scope de ce ticket).
Lecture seule de `object_info` Cloud (contrat déjà autorisé, mêmes appels
que pour le reste du spike) : `LoadSharpModel`, `SharpPredict`,
`PlyPreviewPreviewGaussianEnhance` et `PlyPreviewProcessGaussianPLYEnhance`
sont **tous présents**, `api_node` absent/`false` sur `LoadSharpModel`/
`SharpPredict` (donc pas un Partner Node payant à l'appel). L'input
`checkpoint_path` de `LoadSharpModel` est une chaîne libre optionnelle avec
la même note que le workflow local : *"Leave empty to auto-download from
Hugging Face"* — le même blocage de licence documenté dans
`docs/GAUSSIAN_CAMERA_MVP.md` (poids SHARP officiels réservés à la
recherche non commerciale) s'applique donc identiquement sur Cloud. Ne pas
inférer de disponibilité d'exécution réelle à partir de cette seule
présence de classe.

## Recommandation de scope pour `COMFY.PROVIDER.1`

1. **Modèle Settings** : étendre au-delà de `comfyui_base_url`/`comfyui_api_key`
   actuels — un sélecteur explicite `provider: "local" | "cloud"`, avec
   deux jeux de champs distincts (le Cloud n'a pas de "base URL"
   configurable, c'est une constante). Ne jamais réutiliser
   `comfyui_api_key` pour l'auth Cloud sans renommer/distinguer clairement
   des clés `api_key_comfy_org` (billing Partner Node) — ce sont deux
   usages différents de "clé API Comfy" qu'il ne faut pas confondre dans
   l'UI ni le stockage.
2. **Adaptateur explicite**, pas un simple changement de Base URL :
   - un client Cloud séparé (préfixe `/api`, header `X-API-Key` systématique,
     jamais propagé après une redirection `/view`) ;
   - `object_info` Cloud interrogé et mis en cache avant de proposer un
     workflow à l'utilisateur, pour avertir des classes absentes et des
     `api_node: true` (coût) avant soumission, pas après ;
   - polling basé sur `GET /api/jobs/{id}` (statut coarse + `outputs` +
     `execution_error`) comme unique source de vérité terminale ; ne pas
     utiliser `GET /api/job/{id}/status` pour détecter un état terminal (son
     vocabulaire n'est pas celui documenté) ;
   - téléchargement d'output : suivre la redirection 302 de `/api/view` et
     streamer depuis l'URL signée — jamais lire un chemin de fichier local ;
   - upload : traiter le `name` retourné comme opaque (hash), jamais comme
     nom lisible.
3. **Compatibilité des jobs existants** : `generation_jobs.promptId` reste
   valable tel quel (Cloud utilise aussi un UUID `prompt_id`/`job_id`
   identique en forme) ; en revanche tout code qui suppose `outputPath`
   dérivé d'un `filename`+`subfolder` locaux doit être revu pour le Cloud
   (subfolder ignoré, filename = hash).
4. **UX d'erreurs** : distinguer clairement (a) rejet structurel immédiat
   (`400` à la soumission), (b) rejet de valeur d'input après allocation
   (`execution_error` sur un job `failed`), et (c) coût Partner Node à
   confirmer avant soumission quand `object_info[class].api_node === true`.
   Avertir explicitement l'utilisateur qu'un "delete" de job Cloud n'est pas
   garanti effectif (finding confirmé ci-dessus).
5. **Tests requis pour `COMFY.PROVIDER.1`** : un test end-to-end avec un
   checkpoint réellement présent dans le catalogue Cloud (pris dans la
   liste des 81 noms observés) pour enfin exercer la branche `/view`
   (redirection signée, téléchargement, confinement) qui n'a pas pu être
   couverte ici ; test de soumission avec `extra_data.api_key_comfy_org`
   sur un Partner Node avec confirmation de coût explicite avant l'appel ;
   test de renouvellement/expiration de clé (`401`) ; test de dépassement
   de concurrence par palier d'abonnement.

## Limites de ce spike

- Une seule génération réelle autorisée et utilisée — la branche succès
  complète (`view` → téléchargement → octets) n'a pas été vérifiée en
  direct, seulement sa spécification OpenAPI.
- WebSocket non testé (le polling REST suffisant pour reproduire le
  comportement actuel de MikAI).
- SHARP/Gaussian non exécuté, uniquement vérifié au niveau des classes de
  nodes (interdiction explicite du ticket).
- Deux objets Cloud résiduents du compte utilisateur (job + asset), aucune
  méthode API testée n'a permis de les supprimer — voir section dédiée.
