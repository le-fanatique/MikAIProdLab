# LLM Workspace — Product Vision

Status: reference document. Captures intent, not implementation.
Date: 2026-08-13.
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

## 5. Product Rules

These were decided during design and are binding until explicitly revisited.

### 5.1 Nothing is written before approval

The assistant produces a proposal held in memory. The database is untouched
until the user approves.

- `Cancel` — abandons the proposal. Nothing to undo.
- `Approve` — commits.
- `Redo` — produces a new proposal, replacing the previous one.

Applies to creation as well: in UC1 the Shot is created **on approval**, not
before.

### 5.2 No proposal history

> Il n y a pas besoin de stocker l historique de proposition de resultat de la
> requete au llm.

No proposal table, no status model, no `todo / wip / approved` vocabulary.
This is a deliberate simplification, not an omission. Known consequence: two
proposals cannot be compared side by side. If that need arises, the answer is
to hold several proposals in memory, not to add persistence.

### 5.3 The assistant proposes, the user decides

Every write passes through an explicit human approval. There is no autonomous
action, no silent overwrite, no background application of results. This is
consistent with the standing requirement recorded in `FB-20260811-004`:
show suggestions and their reasons before applying them, and never silently
replace existing user choices.

### 5.4 The effective prompt must be visible

The recurring complaint about the current assists is that they are opaque:

> faudrait faire une passe sur le llm assist de story, actuellement c est
> blackbox

Visibility of the resolved context and of the effective prompt is a product
requirement, in the workspace and in production — not a debugging convenience.

### 5.5 Templates are global by default, project-pinnable when needed

> Je pense qu il faut que cela soit sans projet par defaut, mais si on a
> besoin de forcer un workflow pr un projet en particulier il le faut. Car si
> notre projet est un clip musical plutot qu une sequence de long metrage, il
> y aura peut etre des ajustement de workflow a faire par exemple.

Different productions have different grammars. The system must not assume one.

### 5.6 Adding an assist must not require touching product screens

The product surfaces invoke a template by identifier and render a shared
proposal component. A new creative workflow is a new template plus a button.
This is the direct expression of the "evolvable for TDs" half of section 1.

---

## 6. What This Is Not

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

## 7. How We Will Know It Worked

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

## 8. Related Documents

- `docs/LLM_WORKSPACE_ARCHITECTURE.md` — technical contract, registries,
  template format, sequencing, out-of-scope list.
- `docs/USER_FEEDBACK.md` — `FB-20260716-036`, `FB-20260715-013`,
  `FB-20260716-035`, `FB-20260811-004`.
- `docs/ROADMAP.md` — `DIRECTOR.ASSIST.1`.
- `docs/ARCHITECTURE_DECISIONS.md` — durable decisions, once the architecture
  is approved.
