# Audit — écrans qui perdent une opération sans JavaScript

Ticket `UX.NOJS.AUDIT.1`, ouvert le 2026-09-19. Ce document ne modifie aucun
code : c'est un inventaire des contrôles qui déclenchent une écriture (ou un
appel coûteux) **uniquement** via un handler React (`onClick`, `onSubmit` sans
`action=`, `onChange`), sur un écran où aucun autre chemin n'atteint le même
résultat — les trois conditions de `.agents/supervised_task.md` §1, réunies.

**Méthode.** Mesure par lecture de code (grep ciblé, remontée du handler
jusqu'à l'action serveur qui écrit, recherche d'un `<form action={…}>`
équivalent ailleurs sur le même écran), pas par navigation. Aucune vérification
« JavaScript désactivé » n'a été faite dans un vrai navigateur par l'exécuteur,
faute de capacité navigateur dans sa session. **Le superviseur l'a faite le
2026-09-19** : voir la section « Vérification navigateur » en bas, qui dit
quelles entrées sont passées de *prouvées par le code* à *observées*, et les
deux affirmations qu'elle a démenties. Sauf mention contraire, la colonne
« Ce qui est perdu » cite l'action serveur réelle.

Le dépôt compte 92 fichiers avec `onClick` et 93 avec `action={` au moment de
cet audit (ordre de grandeur inchangé depuis le chiffre du ticket, 90/91).

---

## Bloquantes

### 1. `/settings` — onglet Appearance (personnalisation du thème)

**Écran** : `/settings` (onglet « Appearance », le seul visible par défaut
sans JavaScript — voir la note sur `SettingsTabs` plus bas).

**Contrôles** : « Save as custom » / « Update theme », « Delete » sur un thème
personnalisé, upload de logo, upload de texture (top bar / preview), « Apply »
sur l'import JSON collé, et les inputs `<input type="file">` de logo/texture.

**Ce qui est perdu** : la totalité de la personnalisation de thème.
`src/components/theme/ThemeModeToggle.tsx` porte tous les handlers
(`handleSave`/`onSave`, `handleLogoFileChange`, `handleTopBarTextureFileChange`,
`handlePasteJsonApply`, la suppression d'un thème custom dans
`CustomThemesList`) et ne contient **aucun** `<form action={…}>` — vérifié
(`grep -c "action={|<form"` → 0 sur tout le fichier). Les composants enfants
(`SaveThemeDialog`, `LogoSection`, `TextureUploadSection`,
`ThemeJsonImportSection`, `CustomThemesList`) sont tous des vues pilotées par
callback, pas des formulaires. Sans JavaScript, aucune de ces écritures ne
part.

**Gravité** : bloquante — c'est le seul onglet des Settings atteignable sans
JS (voir ci-dessous), et il est entièrement mort à l'écriture.

**Correction suggérée** : convertir au minimum « Save as custom » / « Update
theme » et « Delete » en `<form action={…}>` avec Server Actions dédiées —
c'est le geste le plus fréquent. Les uploads de fichier et le paste JSON
peuvent rester un refactor plus lourd (ils manipulent du contenu binaire/JSON
en mémoire avant écriture) ; à trancher par un ticket séparé une fois ce
premier geste couvert.

---

### 2. `/settings` — les six autres onglets (Language Model, LLM Chat, ComfyUI, Integrations)

**Écran** : `/settings`, onglets « Language Model », « LLM Chat », « ComfyUI »,
« Integrations », « Nomenclature ».

> **Correction du superviseur, 2026-09-19.** La version initiale de cette
> entrée exemptait « Generation Defaults » **et** « Nomenclature », au motif
> que les deux utilisaient déjà `<form action={…}>`. C'est faux pour
> Nomenclature, et mesuré : le HTML servi par `/settings` ne contient qu'**un
> seul** `$ACTION_ID`, celui de Generation Defaults.
> `NomenclatureSettingsForm.tsx:41` est un `<form onSubmit={handleSubmit}>`
> sans `action=`, dont le handler fait `e.preventDefault()` puis appelle
> `saveNomenclatureSettings`. Ses champs sont pilotés par `useState` et ne
> portent **aucun attribut `name`** : sans JavaScript, ce formulaire ne se
> contente pas d'échouer, il soumet un corps vide. Il rejoint donc la liste
> ci-dessous.

**Contrôles et ce qui est perdu**, tous onClick-only, `type="button"` ou
`<form onSubmit={…}>` sans `action=`, vérifiés fichier par fichier :

| Composant | Contrôle | Action serveur appelée en dur |
| --- | --- | --- |
| `OllamaSettingsForm.tsx` | Save Changes / Test Connection / Refresh Models / Clear saved API key | `saveLLMSettings`, `testLLMConnection`, `fetchLLMModels` |
| `ChatProviderSettingsForm.tsx` | Save (provider Chat LLM) | — (même famille, `handleSave` onClick) |
| `ChatSystemPromptManager.tsx` | Add/Save Prompt, Delete | `<form onSubmit={handleSave}>` sans `action=`, `handleDelete` onClick |
| `ComfyUISettingsForm.tsx` | Save Changes, Test Connection, Add preset, Save (edit preset), **Delete preset** | `handleSave`, `handleTestConnection`, `handleAddPreset`, `handleSaveEditPreset`, `handleDeletePreset` — tous onClick |
| `OpenReelSidecarSettingsForm.tsx` | Save | `handleSave` onClick |
| `MikAIPublicBaseUrlSettingsForm.tsx` | Save | `handleSave` onClick |
| `InvokeSettingsForm.tsx` | Save, Test | `handleSave`, `handleTest` onClick |
| `NomenclatureSettingsForm.tsx` | Save (gabarits de nommage séquence/shot) | `saveNomenclatureSettings` — `<form onSubmit>` sans `action=`, champs sans `name` *(ajouté par le superviseur)* |
| `ResearchProviderSettingsForm.tsx` | Save (provider de recherche) | `saveResearchProviderSettings` — `<form onSubmit>` sans `action=`, rendu par `src/app/settings/page.tsx:160`, **absent de la version initiale de ce tableau** *(ajouté par le superviseur)* |

**Ce qui est perdu** : toute la configuration applicative — provider LLM actif,
clé API, endpoint ComfyUI et ses presets locaux, sidecar OpenReel, URL publique
MikAI, endpoint InvokeAI, et la bibliothèque de prompts système du chat. Aucun
de ces écrans n'a de deuxième chemin : ce sont des formulaires de
configuration, leur unique fonction est ce bouton.

**Gravité** : bloquante — et **aggravée par un deuxième défaut sur le même
écran**, distinct de ces contrôles eux-mêmes donc non listé comme sa propre
entrée (ce n'est pas une écriture) : `SettingsTabs.tsx` gère la sélection
d'onglet par un `useState` local, sans URL ni ancre — `onClick={() =>
focusTab(t.id)}`, aucun `href`. Sans JavaScript, seul l'onglet initial
(`Appearance`, ou `Generation Defaults` si l'URL porte `?defaultsSaved=1`)
est visible ; les six autres restent dans le DOM avec l'attribut `hidden` et
ne sont **jamais atteignables**. Concrètement : même si chacun de ces boutons
devenait un `<form action={…}>`, l'utilisateur sans JS ne pourrait toujours pas
ouvrir l'onglet ComfyUI ou Integrations pour s'en servir.

**Correction suggérée** : pour la navigation par onglet, remplacer le
`useState` par l'état porté dans l'URL (`?tab=comfyui`) lu côté serveur — la
page est déjà un Server Component avec `searchParams`, et le mécanisme existe
déjà pour `generation-defaults` via `defaultsSaved`. Pour les boutons de
sauvegarde eux-mêmes, convertir chaque « Save » en `<form action={…}>` liée à
une Server Action — le geste le plus rentable est `OllamaSettingsForm`
(provider LLM actif, contrôle le plus consulté) et `ComfyUISettingsForm`
(Delete preset en particulier : une suppression n'a aucun filet). Un chantier
dédié, pas une correction ponctuelle : sept composants à reprendre.

---

### 3. Détail Asset — champs « Asset Bible »

**Écran** : `/projects/[projectId]/assets/[assetId]` (page de détail, via
`AssetInlineDetailsForm`).

**Contrôle** : « Save » sur le formulaire inline qui porte `visualIdentity`,
`usageRules`, `forbiddenVariations` (les trois champs « Asset Bible »),
en plus de `description`, `notes`, `lighting`, `promptCard`.

**Ce qui est perdu** : `handleSave` appelle `updateAssetDetailsInline`
directement (`src/components/AssetInlineDetailsForm.tsx:70-84`), aucun `<form
action={…}>`. Pour `description`/`notes`/`lighting`/`promptCard`, un autre
chemin existe : `/projects/[projectId]/assets/[assetId]/edit` a un vrai
`<form action={action}>` avec ces quatre champs (`name="description"`,
`"notes"`, `"lighting"`, `"promptCard"` — vérifié dans le fichier). Mais
`visualIdentity`, `usageRules`, `forbiddenVariations` **n'existent nulle part
ailleurs dans le formulaire d'édition** (grep `name="` sur la page edit ne les
liste pas) : ce sont les seuls champs de l'application qui portent l'Asset
Bible, et leur unique point d'écriture est ce bouton onClick.

**Gravité** : bloquante pour les trois champs Asset Bible ; le reste du
formulaire (description/notes/lighting/promptCard) est dégradé, pas bloquant
(voir l'entrée dégradée ci-dessous pour ce sous-cas).

**Correction suggérée** : ajouter `visualIdentity`, `usageRules`,
`forbiddenVariations` au formulaire de `/assets/[assetId]/edit` — la
Server Action `updateAssetDetailsInline` existe déjà, il s'agit d'étendre
l'action de la page edit (ou de créer un `<form action={…}>` propre à ces
trois champs sur la page de détail) plutôt que de refaire l'inline editor.

---

### 4. Sequence Detail et Editorial — Publier / Approuver

**Écrans** :
`/projects/[projectId]/sequences/[sequenceId]` (Sequence Detail) et
`/projects/[projectId]/sequences/[sequenceId]/editorial` (Editorial).

**Contrôles** : « Publish Basic Sequence Result » (les deux écrans) et
« Latest Approved (N eligible) » (Editorial uniquement).

**Ce qui est perdu** :
`src/components/editorial/PublishBasicSequenceResultButton.tsx` appelle
`publishBasicSequenceResult` dans `handlePublish`, un `onClick` sur un
`<button type="button">`, aucun `<form>` autour. Même chose pour
`src/components/editorial/LatestApprovedButton.tsx` avec
`approveLatestGenerationForSequence`. Les deux composent la confirmation
native (`window.confirm`) et un verrou anti-double-clic en mémoire — un soin
d'ingénierie réel, mais qui ne change rien à l'absence de `<form action>`.
> **Correction du superviseur, 2026-09-19 — la conclusion tient, la preuve
> non.** La version initiale écrivait : « `grep -c "action={"` renvoie 0 sur
> toute la page Editorial ». Ce `grep` porte sur le **fichier** `page.tsx`, pas
> sur l'arbre rendu. Mesuré dans le navigateur, l'écran Editorial sert bien
> **quatre** formulaires avec `action`, venus de composants enfants
> (`projectId`, `sequenceId`, `itemId`, `direction`, `returnTo`, `orderedIds`).
> Conclure d'un `grep` sur un fichier de page qu'un écran n'a aucun `<form
> action>` est exactement l'erreur que `mikai-method` §10b interdit.
>
> Le classement « bloquante » survit, et cette fois il est **observé** : dans un
> navigateur sans JavaScript, le bouton « Publish Basic Sequence Result » est un
> `type="button"` qui n'a **aucun `<form>` ancêtre**, sur les deux écrans. Les
> quatre formulaires de l'Editorial servent le réordonnancement, pas la
> publication. Détail en section « Vérification navigateur ».

Sur Sequence Detail, plusieurs `action={…}` existent (delete, set-active,
archive) mais aucun pour la publication elle-même — ce n'est pas la même
opération.

**Gravité** : bloquante. Publier un résultat de séquence et approuver en masse
la dernière génération sont les actions de production les plus coûteuses à
refaire manuellement (l'auteur doit reprendre chaque shot un par un) — au même
titre que les deux écrans déjà corrigés (`INVOKE.PUSH.2`, `INVOKE.SYNC.1`) qui
ont motivé ce ticket.

**Correction suggérée** : `<form action={…}>` avec la Server Action existante
(`publishBasicSequenceResult`, `approveLatestGenerationForSequence`) comme
`action`, la confirmation native peut rester côté client (comme
`ConfirmSubmitButton` le fait déjà ailleurs dans le dépôt — modèle direct à
réutiliser). Le double verrou anti-double-clic devient inutile une fois la
soumission gérée par le cycle de vie natif du formulaire (`useFormStatus`,
comme `FormStatusSubmitButton`).

---

## Dégradées

### 5. Sequence Detail — Insérer un shot depuis la vue éditoriale

**Écran** : `/projects/[projectId]/sequences/[sequenceId]`.

**Contrôles** : « Insert Shot Here » (`InsertShotFromEditorialButton`) et
« Insert Directed Shot » (`InsertShotDirectedButton`).

**Ce qui est perdu** : les deux ouvrent un panneau d'état local et écrivent
via un `onClick` direct (`handleCreate` appelle
`insertShotInSequenceFromEditorialContext` ;
`InsertShotDirectedButton`/`ProposalPanel` appelle un modèle LLM pour proposer
un brouillon, l'étape « Propose » elle-même onClick). Un détour existe :
la même page contient deux vrais liens `href=".../shots/new"` — vérifié —
vers `/projects/[projectId]/sequences/[sequenceId]/shots/new`, qui porte un
`<form action={createAction}>` complet. Créer un shot reste possible sans JS,
seulement pas positionné entre deux shots existants ni pré-rempli par
l'assistant.

**Gravité** : dégradée — un détour réel existe sur le même écran, la
positionnation en moins.

**Correction suggérée** : ne rien faire dans l'immédiat. `InsertShotDirectedButton`
suit déjà le bon patron pour son écriture finale (« Insert Shot » est un
`<form action={ACTION_BINDINGS.createShotAtPosition}>`, voir
`ProposalPanel.tsx`) ; seule l'étape « Propose » (appel LLM) est onClick, ce
qui est cohérent avec le reste du LLM Workspace. `InsertShotFromEditorialButton`
pourrait suivre le même modèle (rendre « Create Shot » comme un vrai
`<form action={…}>`) si l'auteur juge le détour insuffisant — pas fait ici
faute de mandat du ticket.

---

### 6. Détail Asset — description / notes / lighting / prompt card (formulaire inline)

**Écran** : `/projects/[projectId]/assets/[assetId]`.

Sous-cas de l'entrée bloquante n°3 : pour ces quatre champs précisément (pas
les trois champs Asset Bible), `/projects/[projectId]/assets/[assetId]/edit`
porte le même formulaire avec un vrai `<form action={…}>` — un détour complet
existe, seulement sur une autre route.

**Gravité** : dégradée.

**Correction suggérée** : ne rien faire — la page `/edit` couvre déjà ce
sous-cas. Cette ligne existe pour ne pas laisser croire que tout
`AssetInlineDetailsForm` est bloquant : seule l'Asset Bible l'est (entrée 3).

---

### 7. Détail Séquence / Shot — éditeurs de contexte inline

**Écrans** : `/projects/[projectId]/sequences/[sequenceId]` (résumé, contexte
narratif via `SequenceContextEditor`) et les pages de détail shot qui rendent
`ShotNarrativeContextEditor`.

**Ce qui est perdu** : les deux appellent leur Server Action
(`updateSequenceContext`, `updateShotNarrativeContext`) depuis un `handleSave`
onClick, sans `<form action={…}>`.

**Détour vérifié pour la séquence** : `/projects/[projectId]/sequences/[sequenceId]/edit`
porte `summary`, `description`, `narrative_purpose`, `mood`, `location_hint`,
`lighting` dans un `<form action={…}>` réel — les cinq champs de
`SequenceContextEditor` y sont tous présents.

**Détour probable pour le shot, non vérifié champ par champ** : la page
`/projects/.../shots/[shotId]/edit` porte `description`, `action_pitch`,
`continuity_notes`, `camera_subject` dans un `<form action={…}>` — les noms de
champs de `ShotNarrativeContextEditor` (`description`, `actionPitch`,
`cameraSubject` — lu dans le composant) correspondent par le nom, mais je n'ai
pas confirmé qu'aucun champ de l'éditeur inline n'est absent de la page edit,
contrairement à la vérification faite pour l'Asset Bible (entrée 3). **Inféré,
pas mesuré** : à confirmer avant de classer ce sous-cas définitivement.

**Gravité** : dégradée (séquence, confirmé) / dégradée présumée (shot, à
vérifier).

**Correction suggérée** : ne rien faire pour la séquence. Pour le shot,
vérifier l'exhaustivité des champs avant de conclure, sinon même traitement
que l'entrée 3 (champ manquant sur la page edit → devient bloquant pour ce
champ précis).

---

### 8. Liste des Assets — application en masse du Prompt Card généré par LLM

**Écran** : `/projects/[projectId]/assets` (`AssetPromptCardBatchPanel`).

**Contrôles** : « Apply » (par asset) et « Apply All ».

**Ce qui est perdu** : `handleApply`/`runApplyAll` appellent
`ACTION_BINDINGS.updateAssetPromptCardInline` directement en JavaScript
(`src/components/llmWorkspace/AssetPromptCardBatchPanel.tsx:200-270`), sans
passer par un `<form action={…}>` — à la différence du patron « propose puis
`<form action=ACTION_BINDINGS...>` » suivi par `InsertShotDirectedButton` /
`ProposalPanel` ailleurs dans le LLM Workspace. Un détour existe : le champ
`promptCard` est éditable à la main sur `/assets/[assetId]/edit` (vérifié à
l'entrée 6) — coller le texte généré n'est pas automatisé sans JS, mais rien
n'empêche l'auteur de le faire.

**Gravité** : dégradée — l'opération de masse elle-même est perdue, mais champ
par champ le contenu reste modifiable.

**Correction suggérée** : ne rien faire dans l'immédiat — c'est un outil de
productivité, pas la seule voie d'écriture. Si l'auteur veut le corriger,
suivre le patron déjà validé par `InsertShotDirectedButton` (le commit final
en `<form action={…}>`, seul le calcul LLM reste onClick) serait cohérent avec
le reste du LLM Workspace plutôt qu'une solution ad hoc.

---

## Ce qui n'a pas été regardé

Ce périmètre a été borné à ce qu'une session pouvait couvrir honnêtement par
lecture de code. N'ont **pas** été audités, faute de temps, et sans
supposition sur leur état :

- **Le banc Project Style au complet** : `ProjectStyleWorkspace.tsx`,
  `InfluenceResearchWorkspace.tsx`, `InfluenceSection.tsx`,
  `AssetAlignmentPanel.tsx`/`AssetAlignmentBatchPanel.tsx`,
  `SequenceStylePanel.tsx`, `StyleAdjustAssistPanel.tsx`, tout
  `lookDevelopment/` (6 fichiers) et tout `referenceAnalysis/` (4 fichiers).
  Plusieurs onSubmit/handlers y sont visibles mais aucun n'a été tracé jusqu'à
  son action serveur ni confronté à un détour éventuel ;
- **Camera Lab** (`CameraLabPolishWorkspace.tsx`, `GaussianViewerPanel.tsx`) ;
- **Editorial hors Publish/Approve** : le drag-and-drop de la timeline
  (`EditorialShotList.tsx`, `EditorialShotSegment.tsx`, `EditorialItemSegment.tsx`,
  `TimelineHeader.tsx`, `UnsavedTrimEditRow.tsx`, `NlePrototypeTimeline.tsx`) —
  une opération de réordonnancement par glisser-déposer n'a par nature aucun
  équivalent non-JS, ce qui en ferait un cas particulier à traiter séparément
  plutôt qu'un oubli ;
- **Sequence Video Split** (`SplitWorkspaceClient.tsx`, 12 occurrences de
  `action={` — mélange probable de formulaires sûrs et de contrôles onClick,
  non trié) et **Shot Video Library** (`ShotVideoLibraryPanel.tsx`,
  `sequenceVideoPush/ShotVideoCandidatesPanel.tsx`) ;
- **Storyboard extraction**, au-delà des deux boutons « preview only »
  vérifiés (entrées exclues, §1) — le flux d'extraction complet
  (`storyboard/extract/page.tsx` et ses composants) n'a pas été relu en
  entier ;
- **`SidebarLLMChat.tsx`, `PromptComposerPanel.tsx`,
  `SequenceShotsLLMAssistPanel.tsx`, `AssetLightingFromImagePanel.tsx`,
  `BatchAssetDescriptionEnhancePanel.tsx`, `CastingSuggestionsPanel.tsx`** —
  autres panneaux LLM Workspace de forme similaire à l'entrée 8, non vérifiés
  un par un ;
- **`OutlineEditorForm.tsx`, `StoryFoundationEditor.tsx`,
  `WorkflowScalarInputsForm.tsx`, `WorkflowTextOverrideForm.tsx`,
  `PromptSegmentsTimelineEditor.tsx`, `SegmentInlinePromptEdit.tsx`,
  `DynamicBatchImageList.tsx`, `ImageSourcePicker.tsx`** ;
- `src/lib/llmWorkspace/sequenceLightingFill.ts` et `shotLightingFill.ts`
  (fichiers non-composants contenant `onClick` d'après le grep initial — pas
  ouverts, probablement des littéraux dans un texte/commentaire à vérifier).

**La vérification décisive — JavaScript désactivé, dans un vrai navigateur,
contre le serveur de dev — n'a pas été faite cette session : je n'ai pas de
capacité navigateur ici.** Toutes les entrées ci-dessus sont des déductions de
lecture de code (handler → action serveur → absence de `<form action>` sur
l'écran), pas des observations. En particulier :

- rien ne confirme que `SettingsTabs` se comporte bien comme décrit sans JS
  (l'attribut `hidden` masque effectivement le contenu par défaut du
  navigateur, mais un test réel est la seule preuve qui compte pour ce
  ticket, cf. `mikai-method` §5/§6) ;
- rien ne confirme que les Server Actions appelées en dur par les entrées
  « bloquantes » échouent silencieusement plutôt que de lever une erreur
  visible sur le pré-rendu serveur.

Le superviseur a repris cette partie, comme convenu au ticket §3 et §5, et
comme pour les trois tickets précédents (`INVOKE.PUSH.2`, `INVOKE.SYNC.1`,
`INVOKE.STYLE.1`). Résultats ci-dessous.

---

## Vérification navigateur — JavaScript désactivé

Faite par le superviseur le 2026-09-19. Chromium via Playwright, contexte créé
avec `javaScriptEnabled: false` — pas une simulation, le moteur n'exécute
aucun script. Contre le serveur **de production** sur `localhost:3000`, qui est
le mode réellement servi à distance. Données réelles : projet 18, asset 44,
séquence 54.

Un contrôle n'est compté utilisable que s'il est **visible** (`getClientRects()`
non vide) **et** descendant d'un `<form>` portant un attribut `action`. Les deux
ensemble : un formulaire correct dans un onglet masqué ne sert à rien.

### `/settings` est pire que décrit

| Mesure | Valeur observée |
| --- | --- |
| Onglets (`role="tab"`) | 8, tous `<button>`, **tous `href = null`** |
| Panneaux (`role="tabpanel"`) | 8, dont **1 seul visible** : `settings-tab-appearance` |
| Formulaires servis | 3 |
| Formulaires avec `action` | 1 (Generation Defaults) |
| Formulaires **visibles ET avec `action`** | **0** |

L'entrée 2 disait « même convertis, les boutons resteraient inatteignables ».
C'est vrai, et la réciproque l'est aussi : **le seul formulaire de la page qui
possède déjà une Server Action est lui-même invisible sans JavaScript**, parce
que son onglet est masqué. Sur `/settings`, sans JavaScript, il n'existe
aujourd'hui **aucun** chemin d'écriture utilisable.

Une exception, et une seule : `/settings?defaultsSaved=1` rend l'onglet
Generation Defaults initial, et son formulaire devient alors visible et
soumettable (six champs `*WorkflowId`). **Aucun lien de l'application ne produit
cette URL** — elle n'apparaît qu'en retour de sauvegarde. Il faut la taper.

### Les contrôles bloquants, observés bouton par bouton

Boutons visibles sans JavaScript, et leur rattachement réel à un formulaire :

| Écran | Libellé | `type` | Dans un `<form action>` ? |
| --- | --- | --- | --- |
| Sequence Detail | Publish Basic Sequence Result | `button` | **non — aucun `<form>` ancêtre** |
| Editorial | Publish Basic Sequence Result | `button` | **non — aucun `<form>` ancêtre** |
| Asset Detail | Save Details *(porte l'Asset Bible)* | `button` | **non — aucun `<form>` ancêtre** |
| Sequence Detail | Insert Shot Here / Insert Directed Shot / Insert New Shot | `button` | non |
| Editorial | Insert Shot Before / Insert Shot After | `button` | non |
| Sequence Detail | Delete / Apply / Save Sequence Prompt | `submit` | oui |
| Editorial | **Save Order** | `submit` | **oui** |
| Asset Detail | Delete / Approve / Unapprove | `submit` | oui |

Les entrées 3, 4 et 5 passent donc de « prouvées par le code » à **observées**.

### Ce que la mesure a démenti

**Le réordonnancement de la timeline a un chemin sans JavaScript.** La section
« Ce qui n'a pas été regardé » avançait qu'« une opération de réordonnancement
par glisser-déposer n'a par nature aucun équivalent non-JS ». L'Editorial sert
un bouton **« Save Order »** de type `submit`, dans un `<form action>` portant
`orderedIds`, plus des formulaires `direction` par élément. Le glisser-déposer
est le confort ; l'ordre reste modifiable sans lui. C'était une supposition, pas
une mesure, et elle était fausse.

**L'Asset Detail n'est pas un écran mort** : 23 formulaires, tous avec `action`
et visibles. Ce qui rend l'entrée 3 plus nette, pas moins : la page sait
parfaitement écrire sans JavaScript pour tout le reste, et l'Asset Bible est le
seul contenu qui n'en profite pas.

### Ce qui n'a pas pu être observé

- **« Latest Approved (N eligible) »** n'était pas rendu sur la séquence 54 —
  aucune génération éligible. L'entrée 4 le concernant reste **prouvée par le
  code seulement** (`LatestApprovedButton.tsx:82-83`, `type="button"`, zéro
  `<form>` dans le fichier) ;
- **le comportement à la soumission** — ce que fait le serveur si un de ces
  formulaires partait quand même — n'a pas été testé. Aucune écriture n'a été
  déclenchée pendant cette vérification ;
- tout le périmètre listé ci-dessus comme non regardé le reste : la
  vérification navigateur a porté sur les écrans déjà inventoriés, elle n'a pas
  élargi l'audit.
