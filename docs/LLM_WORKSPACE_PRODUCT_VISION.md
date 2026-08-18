# LLM Workspace — Product Vision

Status: reference document. Captures intent, not implementation.
Date: 2026-08-13. Revised 2026-08-18: §5 (prompt mechanics) added, and
sections 5-8 renumbered to 6-9 to make room for it.
Companion to `docs/LLM_WORKSPACE_ARCHITECTURE.md`, which holds the technical
contract. This document holds the **why**, so that later tickets can be
checked against the original intent rather than against a remembered version
of it.

Original observations are kept verbatim in French, following the convention
of `docs/USER_FEEDBACK.md`.

---

## 1. Who This Product Is Designed By, And Why It Matters

The author is a CG supervisor in animation film who has designed creation
workflows and cross-DCC data pipelines, working with Nuke, ComfyUI, Houdini,
ShotGrid/Shotgun, Kitsu, Katana, n8n and Mangrove/Kurtis.

> Donc les variable, les automatisation, template, upscalabilité. C est
> quelque dont je suis familier, et dont je me sert pour qu'apres, coté
> artists, ils aient le moins de friction technique possible, et que coté TD,
> on ai un system qui soit evolutif facilement au gré des nouveau workflow
> creatif ou de feedback user

This is the governing constraint of the whole feature. MikAI is not being
designed as an application that happens to call an LLM. It is being designed
as a **pipeline**, with the two audiences a pipeline always has:

- the **artist side**, which must encounter as little technical friction as
  possible — a button, a clear proposal, an approval;
- the **TD side**, which must be able to extend the system as new creative
  workflows and user feedback arrive, without rewriting what already exists.

Every design decision in this feature should be testable against those two
sentences. If a decision makes the artist path heavier, or makes the next
workflow harder to add, it is the wrong decision.

---

## 2. Core Intent

MikAI should offer **AI assistance on every pillar of the product**, not as a
single generic chat but as domain-specialised assistants:

| Pillar | Assistant |
| --- | --- |
| Story | story assistant |
| Storyboard | storyboard assistant |
| Project Style | art director assistant |
| Editorial | editorial assistant (likely) |

Each assistant needs three things the current LLM actions do not provide:

1. **Context** — the ability to see the surrounding production data, not just
   the field being edited.
2. **A role** — a system prompt, and where useful a specialisation document
   (for instance a distilled storyboard-language reference) so the answer
   carries professional craft rather than generic phrasing.
3. **The ability to act on fields** — a request should result in proposed
   values for real entity fields, not in prose the user has to transcribe.

This direction was already recorded as `FB-20260716-036` (*MikAI Assist
Director*, roadmap candidate `DIRECTOR.ASSIST.1`), and is reinforced by
`FB-20260715-013`, `FB-20260716-035` and `FB-20260811-004`.

---

## 3. How The Author Works, And What The Tool Must Support

### 3.1 Prototyping is the primary activity

The reference is the existing ComfyUI loop:

> Mon process pour le generate content, c est que je vais direct dans comfy,
> je fait mon workflow, en utilisant les nodes que je veux, et apres je
> declare les Inputs et les output que MikAI devra exposé coté user dans
> Mikai. Cela me permet de prototyper ce que je veux, sans code, avec de
> l'interface user nodal qui me permet de faire evoluer mon workflow de façon
> creative et intuitif.

The requirement extracted from this is **not "give me a node canvas"**. It is:

- prototype **without writing code**;
- **read and re-edit** a workflow easily, later, without reconstructing it
  mentally;
- iterate **creatively and intuitively**, meaning fast feedback rather than
  long edit-deploy cycles;
- declare which inputs and outputs the product surface exposes, separately
  from how the workflow works internally.

A node canvas is one way to satisfy this. It is not the only one, and for a
pipeline whose steps are fixed it is not the cheapest one. What must be
preserved is the **loop**, not the drawing.

### 3.2 Design by variable

> je me dit d'ailleur globalement, que d'un point de vu evolutif, est ce que
> c est pas mieux de designer les workflow par variable. [...] en construisant
> mon worfklow je pourrait dire que je veux la variable de visualidenty et la
> variable de la list des shots dans lequel le personnage et present, et que
> je veux recuperer dans les shots concernés, juste la variable Description et
> Action Pitch.

This is the central product idea of the feature. Context is not selected by
writing queries or by hard-coding field lists per feature. It is selected by
**picking named variables from a library**.

The consequences the author is explicitly buying:

- a new creative workflow is assembled from existing variables, with no code;
- a new variable is an addition to the library, never a modification of
  existing workflows;
- when the underlying data model changes, workflows keep working.

This is the same reasoning as an attribute convention in a DCC pipeline: the
convention outlives the tools, and shields artists from structural change.

### 3.3 A standalone place to build and test

> je voudrait avoir la possiblité de builder des templates template de
> workflow dans une page à part. c est mieux pour tester mes templates. un LLM
> workspace en soit

Authoring must not be scattered across the product screens where the
assistants are consumed. There is one workspace, where templates are built,
tested against a real entity, compared and refined — independent of the
production surfaces that later invoke them.

---

## 4. Founding Use Cases

These three cases were used to derive the mechanics. They are the acceptance
reference: a design that cannot express all three is not the right design.

### UC1 — Insert a directed Shot between two Shots

The user wants to insert a Shot and have it written for them, with full
awareness of what comes before and after.

- **Context expected:** the sequence context, continuity with the preceding
  Shots, continuity with the following Shots, the casting.
- **Director input:** free text, in plain language.

  > j aimerai bien un plan un peu à raz de terre montrant Le hero rentrer dans
  > le champ de la camera et en sorti

- **Craft requirement:** the assistant must be qualified to answer. Either a
  strong model steered by a role, or a stored reference — a storyboard bible —
  distilled into usable lessons the assistant leans on.
- **Expected answer:** the most relevant possible prompt, interpreting the
  request but using the professional vocabulary that will actually work when
  the result is used to generate an image faithful to the description.
- **Output format:** the answer must fill the Shot entity fields, because
  MikAI's prompt compiler cherry-picks fields to compose the prompt handed to
  the content-generation workflow. Fields concerned: Shot Code, Title,
  Description, Duration, Action Pitch, Camera Pitch, Continuity Notes,
  Production Details, Framing, Camera Movement, Continuity In, Continuity Out.
- **Control:** the user must be able to re-run with another seed.

### UC2 — Retake the current Shot

> j aime pas ce shot, le cadrage ne me va pas, et l action non plus, je
> voudrais montrer plus d'empatie avec le personnage, donc propose moi une
> autre action et un autre cadrage

- **Context expected:** the Shot's own fields, the context of all other Shots,
  the Sequence, and where useful the story.
- **Expected answer:** reviewable before approval, replacing the related
  fields accordingly.

### UC3 — Adjust a character design

Same interaction, on an Asset. If the user judges a female character too
masculine, the assistant proposes description adjustments to review, approve
or retake.

- **Context expected:** the Asset's visual identity, plus the Shots where the
  character appears — and from those Shots, only Description and Action Pitch.

UC3 is the case that proves the variable library must support relational
traversal and field projection, not just a flat list of the anchored entity's
own fields.

---

### Reachability — measured 2026-08-15, after B7a

Written because the user asked whether the work in flight was still being
designed with these three cases in mind. It was not, and this section exists so
the answer stops depending on anyone remembering.

**The common blocker is `intent.freeText`.** All three cases are a request the
user phrases in plain language — that is what the quotes above *are*. The field
has existed in the descriptor format since B1a, but none of the eight
descriptors declares it, so no control was ever built: B6b and B6c1 both
deferred it, each time correctly on its own terms ("a control for it would have
been untestable dead code"), and the cumulative effect was to defer the one
primitive every founding use case needs. Nothing in the queue as of 2026-08-15
delivers it.

| Case | What already exists | What is missing |
| --- | --- | --- |
| UC2 — retake the current Shot | Object-mode `ProposalPanel`, the bench (run + approve), the Shot and Sequence variables | `intent.freeText` and its control; a descriptor |
| UC3 — adjust a character design | **The hard part is built**: `ASSET.SHOT_APPEARANCES` already performs the relational traversal and projects exactly `description` and `actionPitch`, which is what §4 says this case exists to prove | `intent.freeText` and its control; a descriptor |
| UC1 — insert a directed Shot | The descriptor format names an `insertionPoint` anchor kind and the storage validator accepts it | `intent.freeText`; **`insertionPoint` is nominal — `runner.ts` handles it nowhere**; a twelve-field output; the re-run-with-another-seed control |

**The drift this section was written to stop.** The template editor scoping
(`docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md`) was written on 2026-08-15
making `intent.mode` and `intent.parameters` editable and **not**
`intent.freeText` — in the very document describing the tool meant to make the
user an author. The cause was structural: this file was named in no reading
contract, so nothing ever put these three cases back in front of whoever was
scoping. `AGENTS.md` and `CLAUDE.md` were corrected the same day, and every LLM
Workspace ticket now has to state its impact on UC1/UC2/UC3.

## 5. The Prompt Mechanics — Ingredients, Jars, Recipes

**Written 2026-08-18, from the author's own account of how he works.** It exists
because a session was about to migrate the Prompt Compiler faithfully — five
presets, five source checkboxes, a hand-ordered image selection and a staleness
fingerprint — before anyone asked whether that design was still wanted. It was
not: the author had never used the presets. This section states the intended
mechanics so that no later ticket has to infer them from the code that happens
to exist.

Like §4, this is an acceptance reference. A prompt-related design that
contradicts it is the wrong design.

### 5.1 The fields are ingredients

> jusque la on a fait en sorte que toute les entity, ai des field avec des
> informations. Cela pour moi, c est les ingredients, et la finalité c est de
> prendres ces ingredients et les mettres formaté aux besoins pour feeder les
> generateurs de contenu. Qu ils soit llm, ou workflow image/video comfyui

This is the product's whole purpose stated in one sentence. Entity fields are
not an end; they are stock. The end is to select from that stock, format it for
a given engine, and feed it — an LLM, a ComfyUI image workflow, a video
workflow. Everything below follows from that.

### 5.2 Three states of the matter

- **Raw ingredients** — the entity fields. Casting, action, camera, framing,
  mood, location, project style, duration, reference images and their roles.
- **Jars** (*bocaux*) — an ingredient already transformed and set aside so the
  next recipe goes faster. The Shot Prompt is one: made once, then **consumed
  as an ingredient** by the recipe above it.
- **Recipes** — a named selection of ingredients for a recurring case, saved so
  it need not be re-picked by hand every time.

> J ai un plat cuisiné à base de legume à faire, je sort deja la recette qui me
> donne toute la liste des legumes dont j ai besoin. C est un bon debut, mais si
> j ai pas envi de preparer les legume du marché, c est peut etre malin d'avoir
> déjà fait au préalable des bocaux qui permette d'aller plus vite dans la
> preparation avant de passer à la cuisine du plat

Two consequences. A recipe's output can itself become an ingredient — the
pipeline is layered, not flat. And **cherry-picking is a first-class need**, not
a power-user affordance:

> j ai besoin de pouvoir cherry pick quand je suis en train de composer le
> prompt pour un text prompt de workflow comfyui

with saved lists so the same case is never re-picked click by click:

> pour eviter de cliquer toujour sur les meme ingredient à chaque fois qu on a
> le meme cas de figure, il est plutot intelligent de vouloir avoir des liste de
> course sauvegardé pour pouvoir les sortir en cas de besoin

### 5.3 Assembly and cooking are two stages, and only one of them stores

The Composer/Compiler confusion in the current code is not a naming accident;
the two are stages of one chain, and the author named the split himself:

> on a besoin d une etape d'assembly des ingredients, mais apres soit on les
> additionne et on feed comme ca. Soit en effet, c est une autre action, on a
> peut etre envi d'utiliser c est ingredient, pour creer un nouveau contenu, non
> visuel, mais text généré

- **Stage 1 — assembly.** Gather the requested ingredients. Mechanical, no
  model, and the same request always yields the same result.
- **Stage 2 — cooking.** Hand those ingredients to a model, with the binder, and
  get **new content** back.

From which the answer to the author's own central question —

> la vrai question, c est où va l output, et comment il est storé

— falls out as a rule:

**A deterministic assembly is never stored.** It is recomputed on demand, is
identical every time, and cannot go stale. This is why a consumer does not need
a frozen artefact but a *request*:

> est ce qu on est vraiment obligé de devoir locker un resultat sur ce prompt
> compiler […] ce n est pas simplement une requete du genre j ai besoin de
> casting+camera+action+mood pour tout les plans de ce prompt storyboard, ou pr
> le workflow comfy, j ai besoin de casting+action+camera+timeline prompt
> +project style

**Generated content is always stored.** It is not reproducible — re-running
yields something else — so it needs a field to land in. And precisely because it
is frozen, it is the only thing that can go stale when its ingredients move
underneath it. Staleness machinery therefore belongs to jars and to nothing
else.

The author's name for that jar, on the Shot:

> peut etre que ca serait quelque chose du genre "narrative prompt composer" […]
> faire la grosse marmite qui melange les ingredients toujour de la meme
> maniere, mais qui prose quelque chose de plus "narrativement sexy" en sorti

Decided 2026-08-18: a generated narrative prompt is a **jar of its own**,
cherry-pickable like any other ingredient — not a value merged into the field
the user also types in by hand. Today the Prompt Compiler's output is poured
into `shots.shot_prompt` through Replace/Append, and after that nobody can tell
which half a human wrote.

### 5.4 The user brings ingredients and binder; the app owns the format

> Moi en tant qu artist je n aime pas ecrire du prompt, et encore moins en
> anglais, et encore moins contraint par une structure precise de text.

> Moi en tant que user je travail comme d'hab, c est à dire focalisé sur les
> ingredient, et sur du "liant", c est à dire les director's note pour demander
> à l'IA de lier certain ingredient entre eux. Et par contre le formatage final
> doit etre au main de la technique de l'app , pas du user.

This is §1's "as little technical friction as possible" made concrete for
prompts. The user's two jobs are **choosing ingredients** and **writing the
binder** — the director's note in plain language, which is `intent.freeText`
(delivered by B9a and already surfaced on all three founding use cases).
Engine-shaped formatting — word budgets, ordering, camera vocabulary, tag
syntax, negative clauses — is a **technical stage on the way out**, applied by
the app. It is never a rule the user is asked to obey, and never text the user
is asked to write.

### 5.5 The conformation reference, and why it is a norm and not a target

The prompt structure work originates in engine constraints, Seedance's in
particular, via the *Seedance 2.0 Complete Prompting Guide*
(`https://github.com/issastash/AI_Complete_Prompting_Guides`).

> l idee n etait pas de bloquer l app autour de seedance, mais tablé sur le fait
> que cette logique de prompt et workflow de prompt etait plutot commune entre
> les model, et utiliser ce guide comme regle de comformisation de prompt

So the guide is the **default conformation rule**, not a supported product. The
formatting stage must be replaceable per engine, and no ingredient, variable or
entity field may be named after Seedance.

What the guide asks for, in its own terms: a six-part formula (*Subject,
Action, Environment, Camera, Style, Constraints*) inside a 60–100 word budget;
**one** primary camera instruction from a closed vocabulary, phrased
rhythmically rather than technically; at least one lighting description, which
it calls the single highest-leverage element; explicit negative clauses on any
character work; timecodes past five seconds; and an `@ImageN` / `@VideoN` /
`@AudioN` tag system where each reference is used through a **named mode** —
`as first frame`, `as last frame`, `as character reference`, `as style
reference`, `as background environment`.

### 5.6 Coverage measured against that guide, 2026-08-18

Measured against the fields, variables and role catalogue that exist today.

**Already covered by ingredients.** Subject (casting, asset visual identity),
Action (`actionPitch`), Camera (`cameraPitch`, `framing`, `cameraMovement`),
Environment (sequence `locationHint`, `mood`), Style (Project Style), Duration
(`durationSeconds`), timecodes (Prompt Segments).

**Covered as data, missing as rendering — the largest single item.** The
reference-image role catalogue (`src/lib/referenceImageRoles.ts`) already
carries `first_frame`, `last_frame`, `character`, `environment`, `style` — an
almost exact match for the guide's five named image modes. The information the
Prompt Compiler asks the user to restate by ticking and ordering images **is
already stored on each image**, together with an explicit order. Nothing renders
it into the engine's syntax. This is not a gap in the stock; it is the missing
formatting stage of §5.4.

**Genuinely missing ingredients.**

1. **Lighting.** No lighting field exists on any entity — only a `lighting`
   image role. The guide calls lighting the highest-leverage single element.
   **Accepted 2026-08-18, and designed by the author** — see §5.9.
2. **Negative constraints.** Nothing holds "avoid jitter / bent limbs / temporal
   flicker / identity drift". The nearest thing is an Asset's
   `forbiddenVariations`, which is per-asset and not per-shot or per-project.
   **Acknowledged by the author as a real gap in his own work, and explicitly
   not MVP** — scheduled after Chantier 2.
3. **The camera.** `cameraMovement` is free text; the guide requires one primary
   instruction from a closed vocabulary of eight terms plus speed keywords. The
   author's framing, 2026-08-18, is not "adopt the guide's vocabulary" but
   *on a des choses de notre côté pour donner des informations de caméra pour les
   shots, peut-être on devrait designer quelque chose pour améliorer ce qu'on a
   déjà* — a design job on the existing fields, not a replacement. Scheduled
   after Chantier 2, so it is not done inside a component layout C4–C6 is about
   to dismantle. **The conformation stage (§5.4) must therefore not hard-code
   today's camera shape.**

**Video and audio — corrected 2026-08-18.** An earlier draft of this section
said both had no entity at all. That is wrong for video: `shot_reference_videos`
exists and is delivered (upload, ordering, label, notes, probed duration and
dimensions, file quarantine on cascade), deliberately separate from Shot
Outputs. Two things are true about it. It has **never been exercised by the
author**, so everything about it is still to be tuned. And it carries **no role
column**, unlike the image tables — which is exactly what the guide's video
modes are keyed on: camera replication, motion imitation, effect replication,
rhythm matching. `motion`, `rhythm` and `camera` exist in the role catalogue but
are offered on images only.

Audio has no entity of any kind, so `@AudioN` is genuinely unreachable, as are
video-to-video and the extension/chaining syntax with its continuity locks.

**Decided 2026-08-18:** the whole media-reference family — tuning video, giving
it roles, and adding audio — is scheduled **after Chantier 2**, once the LLM
workspace is finished and the codebase cleanup has run. The author's call.

**Missing output discipline.** Nothing counts words against the 60–100 / 150
budget, enforces the one-primary-camera rule, or caps tags at the engine's
limits (9 images, 12 files total). These are validations belonging to the
formatting stage, not ingredients.

### 5.7 The storyboard prompt, opened 2026-08-18

The author flagged it as opaque and asked that it come under the workspace:

> c est un peu blackbox actuellement […] je vais regarder le prompt qui va etre
> feeder au workflow comfyui, et là j ai plusieur elements par shots […] il
> devrait lui aussi etre soumis à llm workspace, avec des regle à etablir
> ensemble

Read on that date, the composition rule is this and nothing more. Per Shot,
`formatSequenceGenerationPackageText` emits a header line — index, shot code,
title, duration — followed by `compileShotPrompt(...)`, which is **only the Shot
Prompt text**, plus a `Timeline:` block for video shots that have Prompt
Segments. `buildSequenceStoryboardPrompt` wraps the whole package and prepends
an `@ImageN` mapping of the casting references selected in Storyboard Assets.

**So the storyboard prompt contains no ingredient other than the Shot Prompt.**
No casting, no camera, no framing, no mood, no continuity, no project style —
those reach the model only insofar as the author typed them into each Shot
Prompt by hand. This is the exact case §5.3 describes: the recipe consumes one
jar and has no access to the pantry. It also confirms why the jar matters, and
why filling it well is worth more than any single generation surface.

One defect noted in passing, not repaired here: `sequenceVideoGeneration.ts`
formats its package with warnings included, so diagnostic lines such as
`Shot Prompt is empty.` are sent to the model. The storyboard and image paths
both pass `includeWarnings: false`.

### 5.8 What this section makes obsolete

Recorded so no future ticket pays to preserve them:

- the Prompt Compiler's five presets — never used by the author, and the reason
  this section was written;
- its five source checkboxes;
- its hand-ordered image selection — the stored roles and order already carry
  that information (§5.6);
- its fingerprint and staleness warning **in their current form**: they guard a
  client-assembled context, where §5.3 puts staleness on jars only;
- the `sessionStorage` handoff to the Generation Panel.

None of these is to be reproduced by a migration. What survives is the intent
underneath them: pick ingredients, bind them with a director's note, let the app
format the result for the engine.

---

### 5.9 Lighting, designed by the author 2026-08-18

Accepted the day §5.6 measured it missing, and designed in the same breath. It
is written here rather than in a ticket because the interesting part is a
product shape, not an implementation.

**A field at three levels, and one of them is the point.**

- **Environment Asset** — and this is the level that earns the feature. A
  Sequence set in an environment can read **that environment's** lighting
  directly instead of inventing one of its own. The author's own words:

  > à l'environment c est encore plus interessant, car on pourrait comme ca par
  > exemple dans la sequence X, utiliser direct le field lighting de
  > l'environment, plutot que de le generer at sequence level

  This is §5.2's jar, one layer up: lighting described once on the environment
  becomes an ingredient every Sequence and Shot using it can consume.
- **Sequence** — its own lighting, when the environment's is not the answer.
- **Shot** — the same, at the finest grain.

**Three ways to fill it, in increasing order of assistance.**

1. **By hand.** Always available, always the fallback.
2. **From an image, by a vision model.** Feed an uploaded image, or a reference
   image of a cast Asset, and ask the model to describe that image's lighting.

   **Corrected 2026-08-18, on the author's own recollection: this capability is
   already built, and it is production-grade.** Project Style's Reference Board
   analysis (`src/lib/projectStyle/referenceAnalysis/`, ~2 500 lines with its
   action) already does the whole thing: it re-reads and re-validates the real
   bytes of a stored image at call time — magic-byte sniff, decode gate,
   confined path, size bounds — builds **one** multimodal `ChatMessage` that
   the existing router already translates per provider (OpenAI-compatible reads
   the `image_url` data-URL parts, Ollama reads the same message's top-level
   `images`), calls through a wrapper that never leaks a provider body or key
   even into server logs, and validates a JSON answer of per-image
   observations. Its own prompt already asks for lighting by name, among
   composition, colour, texture, framing, material and silhouette.

   So the brick is not "teach the product to look at an image". What is
   genuinely missing is narrower and more interesting: **the descriptor format
   cannot declare an image input**, so this capability lives entirely outside
   the workspace, hand-written, anchored on the Reference Board and producing
   style-rule candidates rather than a field value. Making it reachable from
   another anchor, another image source and another question is the work — and
   it is library growth in the sense of §11.3's governing rule, not invention.
3. **By director's note, at Shot and Sequence level.** Not a regeneration — an
   *adjustment of what is already there*:

   > ok tu utilise le field lighting actuel, mais j'aimerai que tu l'ajust pour
   > prendre en compte le fait qu au debut le personnage est dans l'ombre au
   > debut, alors qu a la fin il est eclairé par les ecran

   Mechanically this is `intent.freeText` (delivered by B9a) over an operation
   that reads the current lighting value as one of its variables — the same
   shape as UC2's directed retake, applied to one field. No new primitive.

**Why this is not merely another field.** It is the first ingredient the
*workspace* can derive from an image, and the first whose natural source is
another entity's field rather than the user's keyboard. Both are worth more than
the lighting text itself.

**One question this raises, left open for the author.**
`src/actions/projectStyleReferenceAnalysis.ts` is 1 259 lines of hand-written
action performing exactly the kind of operation the workspace exists to
express — anchored, context-driven, producing reviewable proposals. It is
currently outside the registry entirely. Under §11.3's governing rule that is a
brick to build; under §6's "what this is not" it may be a deliberate exception
like chat, image generation and field translation. Not decided here.

---

## 6. Product Rules

These were decided during design and are binding until explicitly revisited.

### 6.1 Nothing is written before approval

The assistant produces a proposal held in memory. The database is untouched
until the user approves.

- `Cancel` — abandons the proposal. Nothing to undo.
- `Approve` — commits.
- `Redo` — produces a new proposal, replacing the previous one.

Applies to creation as well: in UC1 the Shot is created **on approval**, not
before.

### 6.2 No proposal history

> Il n y a pas besoin de stocker l historique de proposition de resultat de la
> requete au llm.

No proposal table, no status model, no `todo / wip / approved` vocabulary.
This is a deliberate simplification, not an omission. Known consequence: two
proposals cannot be compared side by side. If that need arises, the answer is
to hold several proposals in memory, not to add persistence.

### 6.3 The assistant proposes, the user decides

Every write passes through an explicit human approval. There is no autonomous
action, no silent overwrite, no background application of results. This is
consistent with the standing requirement recorded in `FB-20260811-004`:
show suggestions and their reasons before applying them, and never silently
replace existing user choices.

### 6.4 The effective prompt must be visible

The recurring complaint about the current assists is that they are opaque:

> faudrait faire une passe sur le llm assist de story, actuellement c est
> blackbox

Visibility of the resolved context and of the effective prompt is a product
requirement, in the workspace and in production — not a debugging convenience.

### 6.5 Templates are global by default, project-pinnable when needed

> Je pense qu il faut que cela soit sans projet par defaut, mais si on a
> besoin de forcer un workflow pr un projet en particulier il le faut. Car si
> notre projet est un clip musical plutot qu une sequence de long metrage, il
> y aura peut etre des ajustement de workflow a faire par exemple.

Different productions have different grammars. The system must not assume one.

### 6.6 Adding an assist must not require touching product screens

The product surfaces invoke a template by identifier and render a shared
proposal component. A new creative workflow is a new template plus a button.
This is the direct expression of the "evolvable for TDs" half of section 1.

---

## 7. What This Is Not

- Not a chat. `SidebarLLMChat` already exists and serves a different purpose.
  The assistants are field-oriented operations with a review step.
- Not an autonomous agent system. No self-triggered actions, no background
  writes.
- Not a replacement for the user's judgement. The assistant carries craft
  vocabulary and context; direction stays with the user.
- Not a new model or provider strategy. `src/lib/llm/` already supports
  Ollama, vLLM and OpenRouter.
- Not a second source of truth. MikAI owns the database, the validation rules
  and the ownership checks, whatever runs the workflow.

---

## 8. How We Will Know It Worked

The feature succeeds if, six months from now:

1. Adding a new assistant to a new pillar requires creating a template, not
   writing an action, a prompt builder and a panel.
2. A user can open any assist and see exactly what context was sent.
3. The author can prototype a new creative workflow end to end without asking
   for a development ticket.
4. Changing a database field breaks one resolver, not every workflow.
5. The three founding use cases run as three templates with no bespoke code.

If a proposed ticket moves away from any of these, it should be challenged
against this document.

---

## 9. Related Documents

- `docs/LLM_WORKSPACE_ARCHITECTURE.md` — technical contract, registries,
  template format, sequencing, out-of-scope list.
- `docs/USER_FEEDBACK.md` — `FB-20260716-036`, `FB-20260715-013`,
  `FB-20260716-035`, `FB-20260811-004`.
- `docs/ROADMAP.md` — `DIRECTOR.ASSIST.1`.
- `docs/ARCHITECTURE_DECISIONS.md` — durable decisions, once the architecture
  is approved.
