# Project Style V1 - MVP Product Specification

Last updated: 2026-07-23

Status: product contract validated with the user. Implementation is
complete and was accepted by the user on 2026-08-02
(`STYLE.1.ACCEPTANCE.1`, `ACCEPTED`). This document is kept as the
historical product/UX/architecture contract that governed the epic, not as
a live status page — see `docs/PROJECT_STATE.md` and `docs/ROADMAP.md` for
current state.

Primary feedback: `FB-20260723-001`.

Related feedback:

- `FB-20260715-010` - Seedance prompt-size limit;
- `FB-20260716-021` - future Asset and Shot reference videos;
- `FB-20260716-024` - Storyboard frames reused as Shot references;
- `FB-20260716-027` and `FB-20260716-031` - image preparation and ratios;
- `FB-20260716-035` - visible extra instructions for LLM assistance;
- `FB-20260716-036` - future Assist Director;
- `FB-20260716-039` - Asset Visual Identity in Generate Content;
- `FB-20260717-045` - Project ratio and FPS;
- `FB-20260717-048` and `FB-20260722-003` - specialized Workflow Tools.

Reference documents:

- `docs/PRODUCT_VISION.md`;
- `docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md`;
- `docs/PROJECT_STYLE_MVP_DECISIONS.md`;
- `docs/PROJECT_STYLE_ANALYSIS_QUESTIONS.md`;
- `docs/PROJECT_STYLE_SUPERVISOR_HANDOFF.md`;
- `docs/ROADMAP.md`;
- `docs/ARCHITECTURE_DECISIONS.md`.

## 1. Product Goal

Project Style is the durable artistic direction of a MikAI Project. It gives
Assets, Storyboards, Sequences, Shots and generations a shared visual world
before the user starts producing final media.

It is not a single free-text suffix added to prompts. It must help with both:

1. the design of what exists in the world;
2. the visual treatment used to represent that world.

The intended production flow is:

```text
Story Workspace
-> Extract and enhance Asset drafts
-> Project Style research and authoring
-> Look Development
-> publish an active Project Style
-> align Asset design when needed
-> generate Assets
-> Storyboard and Shot generation
```

The user must still be able to use Project Style simply. A few useful
sentences are a valid Style Bible. Detailed fields, rules, sources and
analysis remain optional tools rather than completion requirements.

## 2. Foundational Product Model

### 2.1 Two artistic pillars

#### World & Design Language

This pillar defines what belongs in the fictional world and how its content
should be designed:

- era and technology;
- genre and subgenre;
- tone and register;
- historical, cultural and artistic codes;
- shapes, materials and recurring motifs;
- character silhouettes and costume language;
- props, vehicles and technology;
- environments, architecture and set dressing;
- world-level negative constraints.

This is the layer that can turn a generic postal worker's bag into a copper
biomechanical turtle-shaped pack that stores letters and vents steam.

#### Visual Treatment

This pillar defines how the world is represented:

- overall visual identity;
- rendering medium and stylization;
- palette and color script;
- lighting and photographic direction;
- shadows, highlights and specular treatment;
- materials, textures, hatching and surface treatment;
- detail level and graphic treatment;
- character and environment rendering;
- camera, lenses and composition;
- motion and animation language;
- post-processing;
- visual negative constraints.

### 2.2 Research material is not an active rule

The workspace separates exploratory material from the authoritative Style
Bible:

```text
Creative Brief
Creative Influences
Reference Board
Research Sources
        ↓
analysis and candidate rules
        ↓ explicit user approval
Working Draft
        ↓ Look Development
Published Project Style
```

Uploading an image, saving an article or generating an LLM analysis never
changes the active Project Style by itself.

### 2.3 Sparse by design

Every Style field is optional. Empty templates are never meaningful content.

The user may publish a useful Project Style with only:

```text
World direction:
Cartoon steampunk science-fiction with playful mechanical technology.

Visual identity:
Painterly 3D animation with graphic shadows and warm copper accents.

Avoid:
Photorealism, sterile white technology and contemporary clothing.
```

There is no required completion percentage and no obligation to fill every
category.

## 3. Workspace Information Architecture

The existing disabled `Project Style` navigation item becomes the route to a
dedicated Project-level workspace.

The V1 workspace contains:

1. `Direction Brief`;
2. `Creative Influences`;
3. `Reference Board`;
4. `Style Bible`;
5. `Look Development`;
6. `Versions & Publish`.

This is a persistent, freely navigable workspace, not a blocking wizard.

### 3.1 Direction Brief

The brief is a low-friction free-text starting point. The user can describe:

- the intended universe;
- era and register;
- genre and subgenre;
- emotional tone;
- desired influences;
- initial visual intent;
- important negative constraints.

Structured details may be added later. The brief remains a source for
analysis, not an automatically published prompt.

### 3.2 Progressive disclosure

The default interface favors a small number of useful fields. Specialized
sections appear through actions such as `Add details`, `Add rule` and
`More options`.

Advanced metadata must not dominate normal authoring. UI labels, tooltips,
messages and errors remain in English.

## 4. Style Bible Authoring

### 4.1 Simple fields

Each pillar provides:

- a general direction field;
- optional specialized sections;
- optional negative constraints.

The general fields are enough for the MVP to work. The specialized sections
exist for users who need more control.

### 4.2 Optional atomic rules

A detailed user may split a section into atomic rules. The minimum valid rule
is only its non-empty instruction text.

Optional rule metadata may include:

- category, normally inferred from the section;
- strength: `Required`, `Preferred` or `Avoid`;
- applicable consumers or media types;
- provenance;
- notes and exceptions;
- proposed, approved or disabled state.

This metadata supports selection, provenance and future assistance. It is not
literal prompt text.

### 4.3 Manual and assisted editing

The user can:

- write every field manually;
- ask the LLM to analyze selected material;
- accept, edit or reject individual candidate rules;
- revise an existing section;
- disable a rule without deleting its history.

No LLM action writes directly into the active published version.

## 5. Creative Influences

Creative Influences are first-class research dossiers for people, studios,
works and artistic movements. They may feed either or both artistic pillars.

Supported subject types include:

- person;
- studio;
- film, series, game or other specific work;
- artistic movement or visual tradition.

An influence dossier may contain:

- subject name and disambiguated identity;
- role or discipline;
- relevant period and works;
- `What interests me`;
- target domains such as lighting, staging, rendering or character design;
- supporting references;
- research notes;
- `What to avoid`;
- source-grounded synthesis;
- candidate Style Bible rules.

### 5.1 "In the manner of" intent

The influence name remains visible as the user's creative intention and as
provenance. MikAI should not rely on the name alone as a generation
instruction.

The normal path is:

```text
named influence
-> selected works and sources
-> observable characteristics
-> user-approved Style Bible rules
-> compiled style instructions
```

For example, an influence may contribute only to lighting while another
contributes to staging and a third to rendering. Each influence can be marked
as `Primary`, `Supporting` or `Accent` for a selected domain.

For the MVP, the compiler uses the approved observable rules. It does not
automatically inject the person's or studio's name into every provider prompt.

## 6. Influence Auto-Feed And Web Research

Each influence exposes an explicit `Research influence` action.

The auto-feed must be source-grounded. The configured LLM cannot be assumed to
have browsed the Internet or to know current sources from memory.

### 6.1 Research flow

```text
Add influence
-> disambiguate the subject
-> discover relevant Web sources
-> show source candidates
-> user saves or dismisses each source
-> extract bounded research notes
-> synthesize across saved sources
-> propose Style Bible rules
```

### 6.2 Source feed

A source candidate displays:

- title, author or publisher and date when available;
- URL;
- source type;
- short relevance summary;
- reason it may be useful;
- relevant artistic domains;
- discovery and access date;
- confidence or uncertainty;
- `Open`, `Save source` and `Dismiss` actions.

Useful source types include official sites, interviews, biographies,
technical articles, studio material, making-of content, lectures and critical
analysis.

Primary sources and direct interviews should be identified separately from
secondary interpretation.

### 6.3 Persistent source record

Saving a source stores:

- canonical URL and metadata;
- access date;
- selected domains and user notes;
- a bounded extracted note or summary;
- its relationship to the influence;
- its relationship to later syntheses and accepted rules.

MikAI must not copy and store a complete copyrighted article by default. It
stores the link, metadata, bounded evidence, user notes and generated
synthesis needed for the dossier.

### 6.4 Cross-source synthesis

`Synthesize research` produces:

- traits supported by several sources;
- observations limited to a particular work or period;
- disagreements or incompatible interpretations;
- uncertain or weakly documented claims;
- candidate principles relevant to the current Project.

Important claims remain traceable to their saved sources. A synthesis is
versioned and does not overwrite the prior synthesis.

### 6.5 Technical gate

The current MikAI LLM layer sends ordinary chat requests to Ollama,
OpenRouter or an OpenAI-compatible endpoint. It has no search-tool contract,
Web retrieval pipeline or source-ingestion safety boundary.

Before auto-feed implementation, a dedicated technical spike must define:

- the search provider or tool contract;
- credentials and Settings surface if required;
- URL fetching and redirect policy;
- SSRF and local-network protections;
- supported content types;
- response-size, timeout and rate limits;
- HTML/text extraction and sanitization;
- source metadata normalization;
- citation and failure behavior;
- whether any new package is actually required.

No implementation ticket may pretend that a normal LLM call performed Web
research.

## 7. Reference Board

The Project Style Reference Board is Project-scoped and separate from current
Asset and Shot reference tables.

For each reference image, the user can provide:

- source and provenance;
- label;
- `What interests me`;
- `What to avoid`;
- one or more analysis domains;
- intended consumers: Asset, Storyboard, image, video or Shot;
- approval for Style analysis or generation use.

The same reference may inform several domains. AI analysis can inspect one
reference or a selected group and propose common visual rules.

Project Style references must not be silently attached to every compatible
workflow input. Approved references become explicit selectable options under
a `Project Style` source group. Actual mapping must respect the real input
capacity and roles of the selected workflow.

### MVP media boundary

The Reference Board MVP stores uploaded images and source links. Durable
uploaded reference-video management and video-to-video mapping remain in the
separate scope of `FB-20260716-021`.

Video Look Development output is still part of this MVP; it is not the same
capability as uploading a reusable reference video.

## 8. Draft, Publish And Versioning

### 8.1 Working Draft

Each Project can have one mutable Working Draft. Editing the published Style
creates or reopens a draft rather than silently changing the active version.

The draft can be used in Look Development but is not automatically injected
into normal production generations.

### 8.2 Published version

`Publish Style` creates an immutable active version:

- the previously active version becomes historical;
- new normal generations resolve the new active version;
- historical generations keep the exact version and content they used;
- research material can continue evolving independently.

The UI may label the effective states as `Draft`, `Active` and `Previous`.

### 8.3 No active style

A Project may have no active Style. Existing Asset, Storyboard and Shot
generation behavior remains valid and unchanged in that case.

## 9. Sequence Inheritance And Override

Every Sequence exposes a general `Project Style` panel.

### 9.1 Default inheritance

By default, the Sequence has no copied Style data. It dynamically inherits
the active Project Style.

The UI shows:

```text
Inherited from Project Style vN
```

If the Project publishes a new active version, an inheriting Sequence starts
using that version for future generation.

### 9.2 Sequence override

`Customize for Sequence` creates a local override initialized from the
currently active Project Style.

For the MVP:

- the override is a complete replacement for that Sequence;
- it applies to the Sequence Storyboard, Sequence video and every Shot in the
  Sequence;
- later Project Style publications do not mutate it;
- `Reset to Project Style` removes the override and restores inheritance;
- there is no additional Shot-level Style override.

The Sequence override is intentionally simpler than the Project research
workspace. Creative Influences and the main Reference Board remain
Project-scoped.

### 9.3 Resolution contract

Shot compilation never reads the Project Style directly:

```text
if the Sequence has a saved override:
    use the Sequence override
else:
    use the active Project Style
```

There is no semantic clash detector and no style-conflict warning in the MVP.
Existing operational errors and generation-safety validation remain
unchanged.

## 10. Sparse Prompt Compilation Contract

The exact compiled style must be deterministic and inspectable.

Rules:

- trim every candidate value;
- omit every empty field;
- omit every empty rule;
- omit a section heading when the section has no compiled content;
- never serialize empty form templates;
- never inject `Source`, `Status`, internal IDs or blank metadata;
- use applicability metadata for selection, not as literal prose;
- exclude disabled and unapproved candidate rules;
- exclude content not applicable to the current consumer or media type;
- preserve stable section and rule order;
- show the exact compiled result before generation;
- record the exact compiled result at queue time.

If only Visual Identity is populated, a valid output is:

```text
PROJECT STYLE
Painterly 3D animation with graphic shadows and warm copper accents.
```

It must not contain empty headings or scaffolding.

The compiled style is a dedicated identifiable source or segment, distinct
from:

- the user's Asset or Shot prompt;
- Story and Sequence context;
- Asset Bible content;
- prompt segments;
- provider or workflow system instructions;
- image-reference mapping.

Prompt-size accounting must include the resolved Style segment. Seedance
compaction must continue to respect `FB-20260715-010`; the inspectable full
context and the compact transport payload may remain separate.

## 11. Generation Resolution Matrix

| Consumer | Effective Style |
|---|---|
| Asset generation outside a Sequence | Active Project Style |
| Asset Bible alignment outside a Sequence | Active Project Style |
| Project Look Development | Explicitly selected Working Draft or published version |
| Shot image or video generation | Resolved Sequence Style |
| Shot Storyboard generation | Resolved Sequence Style |
| Sequence Storyboard contact sheet | Resolved Sequence Style |
| Sequence video generation | Resolved Sequence Style |

When no effective Style exists or its compiled result is empty, current
generation behavior remains unchanged.

## 12. Asset Creative Alignment

Project Style acts at two different moments:

1. generation styling through automatic compiled injection;
2. upstream creative alignment of Asset descriptions and Asset Bibles.

### 12.1 Existing assistance

When an active Project Style exists:

- `Enhance Selected Assets` may use its World & Design Language;
- `Enhance Asset Bible` receives relevant Style context;
- `Generate Content` Fill can include the Asset's Visual Identity and exposes
  the Project Style as a distinct source.

### 12.2 Explicit alignment

`Align with Project Style` analyzes:

- Project Story context;
- the Asset's Description and Notes;
- its current Asset Bible;
- the active World & Design Language;
- relevant Visual Treatment rules.

It produces an editable preview. The user may apply or discard the proposed
changes. Canonical story facts and existing Asset data are never silently
rewritten.

An Asset may display informational state such as:

- `Not reviewed against Project Style`;
- `Aligned with Project Style vN`;
- `Project Style changed since last review`.

These states do not block generation.

## 13. Look Development Bench

Look Development validates a draft Style before publication without creating
or mutating a production Asset or Shot.

### 13.1 Test source

The user chooses:

- `From Story` - an editable test situation proposed from Project context;
- `Neutral Benchmark` - an editable generic subject designed to expose style;
- `Custom` - user-written subject and action.

Any LLM-proposed subject is displayed and editable before generation.

### 13.2 Test modes

The MVP supports:

- `Image Look Test`;
- `Video Look Test`.

Only real compatible workflows are offered. MikAI must not invent a capability
from a workflow name.

### 13.3 Test compilation

```text
test subject and action
+ selected draft or published Style
+ selected Project Style references
+ actual workflow requirements
= exact compiled test prompt
```

The test content and Style segment remain separately visible.

### 13.4 Durable comparison

A saved test keeps:

- Style version or Working Draft revision;
- subject and action;
- exact compiled prompt;
- selected references and their order;
- workflow, provider and settings;
- seed when the workflow exposes one;
- generation job and durable result;
- user review notes;
- candidate, rejected or Look Target state.

The user can duplicate a test while preserving its subject and generation
settings, then compare results after changing only the Style.

### 13.5 Feedback into the Style

From a result, the user can:

- keep or reject it;
- write review notes;
- rerun the benchmark;
- mark an image or video as a `Look Target`.

A Look Target remains linked to the Style revision, prompt, workflow and
references that produced it. It does not publish the Style automatically.

Generating proposed Style corrections from result feedback, then accepting,
editing or rejecting each proposal, is explicitly deferred to
`STYLE.2.LOOK.CORRECTIONS.1` (formerly considered as
`STYLE.1.G.CORRECTIONS.1`). It is not required to complete the accepted MVP.

### 13.6 Runtime boundary

Look Development must reuse the canonical ComfyUI generation pipeline,
provider handling, preflight, job runner, polling and output publication
rules. It must not create a second runtime.

The current `generation_jobs` target contract supports Shot, Asset or
Sequence, but not a Project Style version. A dedicated Look Development
ticket must explicitly authorize the additive target/provenance changes and
durable result model it needs.

## 14. Data And Architecture Decisions

Project Style is durable business data. It must not be stored in
`localStorage`, `app_settings`, Project description fields or one overloaded
prompt textarea.

Additive migrations are authorized in the future implementation tickets once
their exact tables and preservation tests are specified.

The durable model must be able to represent:

- Working Draft and immutable published Project Style versions;
- sparse Style sections and optional rules;
- Project reference images and their analysis directives;
- Creative Influence dossiers;
- saved Web research sources;
- versioned source-grounded syntheses;
- candidate rules and their provenance;
- Sequence inheritance or local override;
- Look Development tests and durable results;
- exact Style provenance in generation snapshots.

The exact relational split must be audited in the foundation ticket. JSON may
be used for immutable snapshots, but live entities that need ownership,
status, relationships, querying or provenance must not be hidden in an
unqueryable settings blob.

Generation provenance should extend the existing canonical
`payloadSnapshot`/output snapshot patterns rather than creating an unrelated
provenance system.

## 15. Existing Foundations To Reuse

The repository already provides:

- a disabled `Project Style` navigation placeholder;
- optional Asset Bible fields;
- user-previewed and explicitly applied Asset Bible enhancement;
- shared Asset and Shot reference-image roles;
- deterministic prompt context and Shot prompt helpers;
- inspectable Prompt Compiler sources and draft handoff;
- Sequence Storyboard and video generation with durable prompt/reference
  snapshots;
- canonical Local/Cloud ComfyUI generation and job provenance.

The repository does not currently provide:

- Project Style tables or versions;
- Project-level style reference storage;
- Sequence Style inheritance or override;
- Project-style prompt compilation;
- Web search/retrieval tools for LLM actions;
- a Project Style generation-job target;
- durable Look Development tests or outputs.

## 16. MVP Non-Goals

The MVP does not include:

- Shot-level Style overrides;
- semantic Style-versus-Shot clash detection;
- clash warnings;
- reusable `Style Variations` such as Night, Dream or Flashback;
- autonomous recurring Web crawling;
- automatic application of discovered research;
- full-page article archiving;
- a complete multi-agent Assist Director;
- Project-format editing for ratio, resolution or FPS;
- durable uploaded reference-video management;
- silent rewriting of Assets, Sequences or Shots;
- a new Workflow Tool registry;
- changes to OpenReel or `SequencePreviewPlayer`.

Project Format remains a separate Project Settings capability under
`FB-20260717-045`. It may later be consumed by Style and Look Development but
is not owned by the Style Bible.

## 17. Product Acceptance Criteria

### Authoring

1. A user can create a useful draft with only one or a few non-empty fields.
2. Every specialized section is optional.
3. Empty fields and templates never appear in the compiled Style.
4. Manual editing works without LLM configuration.
5. Every assisted change is previewed and explicitly applied.

### Influences and research

1. A user can create a person, studio, work or movement dossier.
2. The user can explain which domains matter for that influence.
3. Research candidates expose their URLs and relevance before saving.
4. Saved syntheses cite their source records.
5. Candidate rules do not enter the Style Bible without approval.
6. A failed or unavailable research provider does not corrupt existing data.

### Publish and inheritance

1. Normal generations use only a published Style, never an unpublished draft.
2. An inheriting Sequence resolves the current active Project Style.
3. A Sequence override replaces the Project Style for all its Shots and
   Sequence generation surfaces.
4. Resetting the override restores inheritance.
5. No Shot-level override or clash warning is shown.

### Generation and provenance

1. Assets resolve the active Project Style.
2. Storyboard, Sequence and Shot generations resolve the Sequence Style.
3. The exact non-empty Style segment is visible before queueing.
4. Existing behavior is unchanged when no Style exists.
5. The exact Style version or Sequence override revision is retained in
   generation provenance.

### Asset alignment

1. Asset alignment proposes design-aware changes rather than only appending a
   visual suffix.
2. Existing Asset fields remain unchanged until explicit application.
3. The user can edit the proposal before applying it.

### Look Development

1. A user can run real image and video workflows against an explicit Style
   revision.
2. Tests do not create or mutate production Assets or Shots.
3. Saved results retain prompt, Style, references, workflow and settings.
4. The user can duplicate and compare tests.
5. Marking a Look Target does not publish the Style automatically.

## 18. Proposed Delivery Stack

`STYLE.1` is an epic. It must not be implemented as one monolithic ticket.

### `STYLE.RESEARCH.SPIKE.1` - Web research contract

Read-only or isolated spike to select and prove the search/retrieval,
sanitization, citation and credential contract. No fabricated browsing and no
production data model.

### `STYLE.1.A` - Durable Style foundation and navigation

Additive schema for Working Draft and published versions, ownership, sparse
manual fields, exact empty-field compiler contract, route and navigation.

### `STYLE.1.B` - Project references and Creative Influences

Project reference-image storage, influence dossiers, manual notes, domains
and source provenance without automatic Web research yet.

### `STYLE.1.C` - Influence auto-feed and synthesis

Implement the proven research contract, source candidate review, durable saved
sources, versioned multi-source synthesis and candidate rules.

### `STYLE.1.D` - Sequence Style inheritance and override

Add the Sequence `Project Style` panel, dynamic inheritance, complete local
replacement and `Reset to Project Style`.

### `STYLE.1.E` - Prompt and generation integration

Integrate the exact sparse Style segment into Asset, Storyboard, Sequence and
Shot prompt sources and provenance without changing unrelated runtime
behavior.

### `STYLE.1.F` - Asset creative alignment

Make Asset enhancement Style-aware and add explicit preview/apply alignment
for existing Assets.

### `STYLE.1.G` - Look Development Bench

Add image/video tests, canonical generation reuse, durable Style-targeted jobs
and outputs, comparisons, review notes and Look Targets.

Each implementation ticket must independently specify its migration,
generation-runtime and package authorization. The active Camera Lab ticket
must be completed and reviewed separately; this specification does not alter
its scope or priority.

## 19. Required User Validation For Visible Tickets

Every visible implementation ticket under this epic must include a short
hands-on checklist covering:

- navigation to the new surface;
- the user action to perform;
- the expected persisted result;
- Default and Custom themes;
- desktop and narrow layouts;
- keyboard and focus behavior;
- exact compiled prompt preview when relevant;
- reload persistence;
- confirmation that no source data changed silently.
