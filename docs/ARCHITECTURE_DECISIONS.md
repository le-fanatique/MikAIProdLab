# Architecture Decisions

Last updated: 2026-08-13

## Codex Migration Arbitration

Migrations are not avoided by default. Codex, as product and architecture
supervisor, decides whether a new durable capability requires a schema
change, then authorizes it explicitly in the Claude ticket.

Claude must not introduce a migration merely because it seems convenient, but
also must not replace a proper durable model with local state, derived data,
or an overloaded legacy field when the product requires persistence,
provenance, relationships, or durable statuses. A migration is preferred when
the data must survive reloads, be queried relationally, remain auditable, or
support future workflows.

Each authorized migration must be additive or deliberately justified,
generated through the repository's migration tooling, tested against a backup
of the development database, and documented with preservation and rollback
considerations. UI-only state and values deterministically derivable from
existing records do not require a column by default.

## Sequence Style Overrides Are Complete Replacements

`STYLE.1.D.CORE` is authorized to add one durable
`sequence_style_overrides` row per Sequence. This is a business fact that must
survive reloads and retain the exact Style snapshot, compiled text, source
Project Style version and optimistic revision.

The resolution contract is deliberately binary:

```text
no override -> resolve the current active Project Style dynamically
override -> use the complete Sequence-local snapshot
```

There is no field-by-field merge and no Shot-level Style override. Creating an
override copies the active immutable Project Style version. Later Project
publications do not mutate that copy. Reset deletes the override and restores
dynamic inheritance. Prompt/payload integration and generation provenance
remain owned by `STYLE.1.E`, not by this persistence ticket.

### Generation Style Source And Applicability

`STYLE.1.E` is split into a canonical generation-source contract followed by
surface integration. Asset generation outside a Sequence resolves the active
published Project Style. Shot, Storyboard and Sequence generation resolve the
Sequence Style through the existing inheritance/override resolver.

Generation compilation derives a consumer-specific sparse segment from the
stored immutable snapshot; it does not replace or mutate the full
`compiledText` retained by Project Style history. The exact segment and its
version or override identity extend the existing `GenerationSnapshot`
provenance contract.

The current `applicability` field contains nullable free text, including
natural-language values such as `Night interiors`. Such values are not
semantically interpreted and remain applicable by default. Automatic
filtering is limited to explicit, case-insensitive, comma/semicolon-separated
selectors prefixed with `consumer:` or `media:`, plus `all`. This prevents
legacy rules from disappearing while providing a deterministic contract for
future scoped rules.

When no effective Style exists or consumer filtering produces an empty Style,
the existing prompt must remain byte-identical and generation provenance omits
the optional Style source. Prompt-size reporting uses exact character and
UTF-8 byte counts; it must not claim token counts without a real tokenizer.

## Storyboard As Production Foundation

The Storyboard is a dedicated visual production workspace, not merely a
gallery embedded in Sequence Detail. It exists before Shot video generation:
it creates and reviews draft compositions for every declared Shot, including
Shots with no existing media. Approved storyboard images become visual
anchors for later Seedance sequence generation and eventual split/push back to
the existing Shots.

The future model must preserve, where needed, storyboard result status,
workflow/source provenance, selected references, approval, and the link to
the Shot. Codex must audit the current generation/output schema and explicitly
authorize a migration if those durable facts cannot be represented safely by
existing tables.

### Sequence-Level Storyboard Contact Sheets

`SEQGEN.STORYBOARD.3` is authorized to add a durable Sequence-level storyboard
model. The existing `storyboard_images` table is Shot-scoped, while
`sequence_results` represents playable editorial video; neither may be
repurposed for a single contact sheet containing the whole Sequence.

The implementation may therefore add a nullable Sequence target to generation
jobs and a dedicated versioned Sequence storyboard output table with workflow,
prompt, reference, and file provenance. Saving remains explicit through
`Save as Sequence Storyboard Draft`. The feature must not mutate Shots, split
outputs, push clips, or approve drafts automatically.

### Storyboard Panel Extraction

`SEQGEN.STORYBOARD.EXTRACT.1` is the dedicated layer between a stored
Sequence contact sheet and Shot storyboard drafts. OpenCV is the MVP detector
for visible borders, lines, or gutters; it returns source coordinates and
confidence before any crop is persisted. The UI must allow manual correction
and Shot reassignment, with explicit confirmation before extraction.

Extraction provenance and region-to-Shot mapping are durable facts. If the
existing `storyboard_images` fields cannot represent the source Sequence
image, source rectangle, confidence, and extraction run, this ticket is
authorized to add dedicated extraction/region records plus a nullable link
from the resulting Shot storyboard draft. Extracted drafts remain `draft`,
never auto-approved, and never mutate approved videos or existing Shot
references. OpenCV may run in a controlled Python worker/script; it must not
block React rendering or write unvalidated files directly.

### Sequence Video Drafts Before Split

`SEQGEN.VIDEO.1` introduces a durable Sequence-level video draft between the
Storyboard workspace and split review. A generation job output is temporary
runtime material, while a `sequence_result` is an editorial/published result;
neither represents a raw generated video awaiting Shot-boundary review.

An additive `sequence_video_drafts` table is therefore authorized. It must
retain the Sequence, source Sequence Storyboard image, generation job,
workflow, permanent video path, status, exact queued prompt and reference
provenance. Multiple drafts are allowed. Saving is explicit and never mutates
Shots, Sequence Results, Film Results or editorial state. `SEQGEN.SPLIT.1`
consumes one explicitly chosen draft and `SEQGEN.PUSH.1` is the only layer
allowed to create Shot video candidates from accepted splits.

### Persistent Split Review Before Shot Push

`SEQGEN.SPLIT.1` stores detection runs and their ordered segments in dedicated
additive tables. This persistence is required because a reviewed mapping is a
production decision, must survive reloads, and is the sole input to
`SEQGEN.PUSH.1`; URL or client state is not an adequate source of truth.

Each run is versioned against one explicitly chosen Sequence Video Draft and
keeps source media facts, detector parameters, raw candidates, the expected
Shot-order snapshot and validation state. Segments keep exact boundaries,
confidence/provenance, skip state, target Shot and review thumbnails. Detection
may propose timing fallbacks, but only explicit user validation creates an
immutable split plan. Validation requires every current Shot exactly once and
refuses stale Shot structure. This layer never creates physical Shot clips or
mutates approved outputs; those responsibilities remain exclusive to
`SEQGEN.PUSH.1`.

### Durable Shot Video Candidates From Validated Splits

`SEQGEN.PUSH.1` uses an additive candidate table. A physical clip cut from
a validated Sequence Split Plan is not a ComfyUI generation job, not a
published Sequence Result, and not yet the Shot's single approved video.
Overloading any of those models would lose provenance or grant the clip a
status it does not have.

Each candidate therefore links to its existing Shot, validated Split Run and
immutable Split Segment, stores the exact source boundaries used and its
permanent clip path, and is unique per Split Segment. That uniqueness is the
idempotency gate: retrying a push cannot create duplicate candidate rows or
files. The Split Run remains the route back to the source Sequence Video Draft
and its provenance, so no second push-run model is needed for the MVP.

Candidate creation never mutates `shots.approvedVideoPath`, Sequence Results,
Film Results or Editorial. Approval is a separate explicit action. The
approved state is derived from the Shot's `approvedVideoPath` pointing at a
candidate path rather than duplicated as an independently mutable candidate
status. Replacing an approved Shot video must be confirmed and must outdate
dependent Sequence/Film Results through the established product rule.

## Seedance Workflow Profiles

Seedance workflow profiles remain a pure, runtime-readable compatibility layer.
Unknown workflows stay generic. The current library has no real First/Last
Frame workflow, so `GEN.SEEDANCE.3` deliberately ships no active profile for
that mode. First/Last roles and diagnostics are ready without inventing
capabilities from workflow names or database ids.

## Local Custom Theme State

The optional `Custom` visual mode stores palette, font, and logo preferences
in browser `localStorage`. The Default mode remains the unchanged baseline.
No theme preference is written to the project database or shared between
users. Custom logo uploads accept only validated local PNG/JPEG/WebP data URLs;
remote URLs and SVG content are rejected.

## Frame-Aware Player Audio

`VideoFrameReviewPlayer` uses the existing video element as the single source
for video and audio. Native mute and volume controls are local UI state, and
frame stepping continues to pause and seek that same element. No server audio
pipeline or change to `SequencePreviewPlayer` is introduced.

## Product Vision Baseline

`docs/PRODUCT_VISION.md` is the product-level reference for the creative
direction, Basic/Advanced editorial split, artist-friendly prompt translation,
and the two-level result model. Architecture and ticket decisions should stay
consistent with it.

## MikAI Brain, OpenReel Sidecar

MikAI is the source of product truth: projects, narrative structure, shots,
sequence state, results, and film assembly.

OpenReel is an advanced editorial sidecar. It can edit and publish back to
MikAI, but it is not the source of truth for MikAI data.

## Shared Sequence Result Output

Basic Editorial and OpenReel Advanced both publish the same product concept:
a Sequence Result.

```text
Basic Editorial → Sequence Result sourceMode = basic
OpenReel Advanced → Sequence Result sourceMode = advanced
```

The viewer and Film Result pipeline should treat both as valid sequence
outputs.

## Film Results Assemble Active Sequence Results

A Film Result is assembled from the active Sequence Result of each included
sequence.

Changing or publishing a Sequence Result can make dependent Film Results
outdated.

The product has two deliberate output levels:

```text
one sequence -> one playable Sequence Result
active Sequence Results across a project -> one playable global Film Result
```

Neither level silently rewrites historical results. Publication and activation
remain explicit product actions.

## Editorial Duration vs Production Duration

Editorial duration is the timeline/story planning duration.

Production duration is the duration of generated or rendered media.

Tickets must keep this distinction explicit. OpenReel V1 timing patches are
start-only and do not turn duration drift into automatic production duration
changes.

## OpenReel Split Does Not Auto-Create Shots

OpenReel split is an editorial operation. It does not automatically create a
new MikAI Shot.

Shot creation must be an explicit MikAI action or a specifically scoped bridge
action.

## Snapshot Required For New OpenReel Routes

New OpenReel-to-MikAI write routes must use editorial snapshots or an equivalent
staleness guard.

Stale writes should fail clearly, normally with HTTP 409.

## `sequence_editorial_items` Is Independent

`sequence_editorial_items` is an editorial layer, not a duplicate of `shots`.

It can reference shots, carry ordering/timing/trim state, and support editorial
operations without making every timeline action a shot mutation.

## Bundled FFmpeg

MikAI uses bundled FFmpeg through `ffmpeg-ffprobe-static@6.1.1`.

Do not introduce a new FFmpeg dependency or system-FFmpeg requirement without a
ticket that explicitly authorizes the package/environment change.

## Active Uniqueness Is Applicative

Only one Sequence Result should be active per sequence, enforced by application
logic in transactions.

Only one Film Result should be active where the product model requires it,
also enforced by application logic unless a future ticket explicitly adds DB
constraints.

## Runtime Files Are Not Source

DB runtime files, uploads, render outputs, `storage`, `.next`, `dist`, and logs
are not source code. Do not commit them.

## Gaussian Camera MVP Uses A Gated PLY Artifact

The Gaussian Camera MVP begins with `CAMLAB.SPIKE.1`; no viewer or ComfyUI
runtime extension is authorized before a real PLY has passed that gate.

For the MVP, a PLY may remain a confined job/cache artifact rather than a new
business entity. MikAI must discover it from structured ComfyUI history and
download it through the configured `/view` endpoint. An absolute filesystem
path returned by a custom node is never an authorized read source.

Durable multi-splat sessions, saved camera poses, or project-level Gaussian
libraries would require a new data-model arbitration. A viewer dependency and
changes to ComfyUI output parsing, polling, or job runtime must each be
explicitly authorized by their later tickets.

## Camera Lab Is A Three-Stage Guided Workspace

`CAMLAB.POLISH.1` orchestre trois etapes sur la page Camera Lab : generation
du PLY, cadrage/capture dans le viewer Gaussian, puis generation d'image a
partir du snapshot et de l'image source. Ces etapes reutilisent le pipeline de
generation canonique, les providers Local/Cloud, le preflight Partner Node et
les `generation_jobs`; elles ne creent pas un second runtime ComfyUI.

Les deux workflows par defaut sont des reglages `app_settings`, comme les
autres Generation Defaults : aucune migration n'est necessaire. Le snapshot
du viewer reste un brouillon local tant que l'utilisateur ne choisit pas
explicitement `Add to Shot references`. Pour Gaussian-to-image, il peut etre
transmis comme entree temporaire, validee et nettoyee honnetement, sans creer
silencieusement une reference Shot durable.

Le mapping est structurel et explicite. Le workflow PLY doit exposer exactement
une image `(Input)`. Le workflow Gaussian-to-image doit exposer exactement les
deux images nommees `Load Image Gaussian (Input)` et `Load Image (Input)` : la
premiere recoit le snapshot Gaussian actif et la seconde l'image source issue
de la provenance du job PLY, quel que soit leur ordre dans le JSON. Un label
manquant, duplique ou ambigu bloque avant creation du job. Les autres nodes
`(Input)` compatibles du workflow Gaussian-to-image sont exposes comme
overrides text/scalar et appliques par le patcher canonique existant.

Le snapshot de la colonne Gaussian-to-image peut etre remplace explicitement
par un PNG uploade, mais les deux restent des brouillons transitoires. Le choix
actif est inscrit dans la provenance (`captured-snapshot` ou
`uploaded-override`) et ne cree jamais une reference Shot implicitement.

Les PLY restent des caches de `generation_jobs`, pas une bibliotheque metier.
Le nettoyage Camera Lab est donc limite aux PLY admissibles du Shot courant :
les fichiers sont mis en quarantaine, les lignes de jobs sont conservees et
leur `outputPath` nullable est efface atomiquement. Une suppression globale de
jobs ou un nettoyage best-effort sans compensation n'est pas autorise.

Tous les nodes non-image marques `(Input)` dans le workflow PLY sont editables
via les overrides text/scalar du pipeline canonique. L'unique image `(Input)`
reste geree uniquement par le picker visuel; Camera Lab ne construit jamais un
second patcher de payload.

### One Canonical Comfy.org API Key

After user validation of Comfy Cloud, MikAI uses one canonical Comfy.org API
key for both Cloud authentication (`X-API-Key`) and Partner Node billing
metadata (`extra_data.api_key_comfy_org`). Settings exposes one secret field;
the legacy Cloud-specific setting may only be read as a compatibility fallback
and must never be rendered. No schema migration is required.

### Named Presets Durable Server-Side, Active Choice Stays Local (UX.PRODUCTIVITY.POLISH.1)

Les presets nommes que l'utilisateur cree explicitement (presets de connexion
ComfyUI locale, presets Custom Appearance) sont desormais la source durable
dans `app_settings`, chacun sous une cle JSON versionnee et bornee
(`comfyui_local_endpoint_presets_v1`, `mikros_custom_theme_presets_v1`), avec
une revision entiere pour la concurrence optimiste (lecture-verification-
ecriture dans une seule transaction synchrone). Aucune migration de schema
n'a ete necessaire : `app_settings` reste une simple table cle/valeur.

Le choix actif reste strictement local au navigateur :

- pour ComfyUI, selectionner un preset ne remplit que le brouillon `Base URL`;
  seul `Save Changes` change le runtime actif (`comfyui_base_url`) ;
- pour Custom Appearance, le theme actuellement applique reste dans
  `localStorage` (cle `mikai.themeMode`), qui sert aussi de cache anti-flash;
  redemarrer le serveur ne change jamais le theme actif d'un navigateur.

Un preset ne contient jamais de secret : le contrat ComfyUI local exclut
explicitement toute cle API du JSON serialise. Les themes Custom Appearance
legacy qui n'existaient qu'en `localStorage` sont importes une seule fois,
de maniere idempotente, vers le serveur - un id ou un nom deja present
cote serveur n'est jamais ecrase.

## Prompt Builder Location Carries No Contract

A prompt builder's directory is not part of any contract. `src/lib/prompts/` is
a convention, not a boundary: `src/lib/llm/translationPrompt.ts` lives outside
it and stays there. Moving it would be import churn with no behavioural or
architectural gain.

The reason is a constraint established by LLM Workspace Phase A: **neither the
prompt registry nor the operation registry can be built by directory
discovery.** Prompt building already escapes `src/lib/prompts/`, and the
Approve-side writes live entirely outside `src/actions/llm/` — six assist
panels reach five write actions in `@/actions/assets`, `/shots`, `/sequences`.
Every operation must therefore declare itself explicitly in the Phase B
registry.

Once registration is explicit, location is inert. A future ticket may relocate
a builder for readability, but no ticket may make a builder's directory
load-bearing — that would reintroduce the discovery assumption Phase A
disproved.

See `docs/LLM_WORKSPACE_ARCHITECTURE.md` §9 and the "Scope limitation" section
of `docs/LLM_OPERATIONS_INVENTORY.md`.

## LLM Workspace — Four Arbitrations Taken 2026-08-17

Recorded here rather than left in conversation, because three of the four
change what a later ticket is allowed to do, and one is a schema
authorization. Asked and answered in one pass, before a session reset.

### 1. Schema authorized — Asset Bible freshness, and asset sourcing metadata

Two durable needs are **authorized**, each in its own ticket, and neither is
implemented yet.

**Asset Bible freshness.** `LLMW.COMMIT.ADVISORY.1` (`9266d64`) ships an
advisory that fires on every approved Description or Notes write, whether or
not a Bible exists — an invitation as often as a warning. The precise version
is the device `asset_style_alignments` already uses for Project Style
(`src/db/schema/assets.ts:140-183`): a deterministic fingerprint of the fields
the Bible is written from, captured when the Bible is generated, compared
against live content to derive "stale" or "current". Same model, same
discipline: informational only, never the source of truth for content.

**Asset sourcing metadata.** `createSelectedAssets` drops `sourceLevel`,
`sourceExcerpt` and `duplicateWarning` — the model produces them, the write
discards them (reported by `LLMW.ACTION.INSERT.1`, B7c-w, deferred by the user
on 2026-08-16 for want of a surface to show them). The authorization covers the
columns; **a ticket must not add them without also adding the surface that
displays them**, or it would recreate the same silent loss one layer down.

Both follow the migration rules at the top of this document: additive,
generated through the repository's tooling, tested against a backup.

### 2. The asset-type filter becomes a real filter

`assets.fromProject` asks the model for the ticked types, and the model
sometimes answers with another — its output schema lists all six, and a bench
run asking for three returned a `vehicle` (`9fdda6a`). The prompt builder said
the same before migration, byte for byte, so this is pre-existing behaviour and
not a regression.

**Decided: filter for real, in a post-response form.** A candidate whose type
was not requested is dropped. This is possible only since B7c-n3 gave the
pipeline a post-response stage, which is why the question is answerable now and
was not before.

**This is a deliberate change in observable behaviour**, and the first in the
chantier: every migration so far was held to indiscernibility. The ticket that
implements it must say so in its own terms rather than present it as a fix, and
must not be mixed with a migration.

### 3. The bench learns boolean and multi-choice controls

`parseIntentInputFromSearchParams` reads numbers and strings only, so
`assets.fromProject` and `casting.fromSequence` run in the bench with their
declared defaults and cannot be varied there — `includeSequenceLevel` is stuck
at `false`. **Decided: a small ticket adds the two controls and the matching
URL reading.** The bench is where the author is meant to prototype; a parameter
that cannot be varied there defeats the surface's purpose.

### 4. The two untracked `.agents/` files stay untracked

`b6b_user_feedback.md` and `user_feedback_pending.md` are pre-existing drift.
**Decided: leave them, never stage them, and do not `.gitignore` them** —
ignoring would make them invisible and therefore forgettable. Every ticket's
baseline names them as excluded, and that stays the convention.
