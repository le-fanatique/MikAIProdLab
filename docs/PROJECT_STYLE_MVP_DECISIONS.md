# Project Style V1 - Accepted MVP Decisions

Last updated: 2026-07-23

Status: accepted product decisions. Implementation is complete and was
accepted by the user on 2026-08-02 (`STYLE.1.ACCEPTANCE.1`, `ACCEPTED`).
This document is kept as the historical decision register that governed
the epic, not as a live status page — see `docs/PROJECT_STATE.md` and
`docs/ROADMAP.md` for current state.

## Document Authority

This is the concise normative decision register for Project Style V1.

Use the documents in this order:

1. `docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md` for the original intent;
2. this document for accepted MVP and deferred-scope decisions;
3. `docs/PROJECT_STYLE_MVP_SPEC.md` for the detailed product, UX,
   architecture and acceptance contract;
4. `docs/PROJECT_STYLE_SUPERVISOR_HANDOFF.md` for execution guidance.

If a later implementation proposal conflicts with this register or the
detailed specification, stop and return to the user through the supervisor.

## 1. Core MVP Promise

Project Style gives one Project a durable and reusable artistic direction
before Assets, Storyboards and Shots are generated.

It acts at two levels:

```text
Project Style as creative design context
-> improves what Assets and Shots contain

Project Style as generation context
-> controls how Assets and Shots are represented
```

A style suffix alone does not satisfy the feature.

## 2. Two Accepted Pillars

### World & Design Language

Defines the content and design logic of the fictional world:

- era and technological level;
- genre, subgenre, tone and register;
- cultural and historical codes;
- character, costume and silhouette language;
- prop, vehicle and technology language;
- architecture, environment and set dressing;
- materials, shapes and recurring motifs;
- world-level negative constraints.

### Visual Treatment

Defines the representation of that world:

- visual identity and rendering medium;
- stylization and level of detail;
- palette and color script;
- lighting and photographic direction;
- shadows, highlights and specular treatment;
- textures, hatching and graphic layers;
- character and environment rendering;
- camera, lenses, composition and movement;
- animation and motion language;
- post-processing and visual negative constraints.

Neither pillar is a mandatory questionnaire.

## 3. Simplicity And Sparse Content

Accepted rules:

- every Style field is optional;
- the user may work entirely by hand;
- one or a few sentences can form a valid Project Style;
- no completion percentage blocks saving or publishing;
- advanced categories appear only on demand;
- an atomic rule requires only non-empty instruction text;
- category, strength, applicability, source and status are optional metadata;
- internal metadata is not literal prompt content.

The compiler must:

- trim inputs;
- omit empty fields and rules;
- omit headings with no compiled content;
- omit empty form templates;
- omit disabled or unapproved candidate rules;
- never inject blank `Rule`, `Category`, `Strength`, `Applies to`, `Source` or
  `Status` scaffolding;
- display the exact compiled Style before generation.

## 4. Workspace MVP

The disabled Project navigation item becomes a real Project-level workspace
with:

1. `Direction Brief`;
2. `Creative Influences`;
3. `Reference Board`;
4. `Style Bible`;
5. `Look Development`;
6. `Versions & Publish`.

The workspace is persistent and freely navigable. It is not a blocking wizard.

## 5. Creative Influences

The MVP treats a person, studio, work or artistic movement as a durable
influence dossier.

The dossier can record:

- identity and discipline;
- relevant works or period;
- what interests the user;
- concerned domains;
- references and notes;
- what must be avoided;
- saved research sources;
- source-grounded syntheses;
- candidate Style Bible rules.

The name expresses intent and remains visible as provenance. Normal prompt
compilation uses the observable, user-approved characteristics derived from
the dossier rather than blindly appending only the name.

### Auto-feed

`Research influence` is user-triggered and:

1. disambiguates the subject;
2. finds candidate Internet sources;
3. explains their relevance;
4. lets the user save or dismiss each source;
5. stores approved URLs, metadata, bounded evidence and notes;
6. creates a versioned cross-source synthesis;
7. proposes editable Style rules.

Nothing discovered is applied automatically.

The MVP does not permanently crawl or monitor the Internet. A normal LLM chat
call must never be presented as having browsed the Web.

## 6. Reference Board

The MVP Reference Board is Project-scoped and stores reference images and
source links.

Each image can record:

- provenance;
- what interests the user;
- what should be avoided;
- analysis domains;
- intended consumers;
- approval for analysis or generation.

The LLM may analyze one or several selected references and propose common
traits. Project references become explicit selectable workflow sources; they
are not silently mapped to every image input.

Durable uploaded reference-video management is deferred.

## 7. Draft, Publish And Versions

Accepted model:

- one mutable Working Draft per Project;
- normal generations never consume an unpublished draft;
- Look Development may explicitly test a Working Draft;
- `Publish Style` creates an immutable active version;
- the previous active version remains historical;
- editing an active Style creates or reopens a Working Draft;
- each generation retains the exact Style version and compiled content used.

The original user term "locked" means published/active, not permanently
uneditable.

## 8. Sequence Inheritance

Every Sequence has a general `Project Style` panel.

Default behavior:

- the Sequence stores no duplicate;
- it dynamically inherits the active Project Style;
- publishing a new Project version affects future generations for inheriting
  Sequences.

Override behavior:

- `Customize for Sequence` starts from the current Project Style;
- the saved Sequence value completely replaces the Project Style for that
  Sequence;
- it spreads to the Sequence Storyboard, Sequence video and every Shot;
- later Project publications do not mutate the local override;
- `Reset to Project Style` removes the override and restores inheritance.

There is no Shot-level Style override in the MVP.

## 9. Generation Resolution

| Surface | Style used |
|---|---|
| Asset outside Sequence context | Active Project Style |
| Asset creative alignment | Active Project Style |
| Project Look Development | Explicit draft or published version |
| Storyboard Shot | Resolved Sequence Style |
| Sequence contact sheet | Resolved Sequence Style |
| Sequence video | Resolved Sequence Style |
| Shot image/video | Resolved Sequence Style |

If no effective Style exists, current generation behavior remains unchanged.

The Style is a distinct, inspectable compiled source. It is not merged
invisibly with the user prompt, Asset Bible, Story context, prompt segments or
system instructions.

The MVP performs no semantic clash analysis and shows no style-conflict
warning. Existing blocking generation and safety errors remain valid.

## 10. Asset Creative Alignment

The MVP must support more than prompt-time injection.

When a Project Style is active:

- Asset enhancement can use `World & Design Language`;
- Asset Bible enhancement receives relevant Style context;
- `Generate Content` Fill can use the Asset's Visual Identity and exposes
  Project Style separately;
- `Align with Project Style` proposes design-aware changes to an existing
  Asset.

Every proposal is editable and explicitly applied. Story facts, Asset
Description, Notes and Asset Bible fields are never silently overwritten.

## 11. Look Development

The MVP includes image and video Look Development.

Test source:

- editable suggestion from Story;
- editable neutral benchmark;
- custom subject and action.

A saved test retains:

- tested Style revision;
- subject and action;
- exact compiled prompt;
- selected references and order;
- workflow, provider and settings;
- seed when supported;
- durable output;
- review notes and result state.

The user can duplicate a test, compare results and mark a result as a
`Look Target`.

Look Development never creates or mutates a production Asset or Shot, and a
Look Target never publishes the Style automatically.

## 12. Explicitly Deferred To A Second Time

The following are not required to complete the accepted MVP:

- Shot-level Style overrides;
- `Style Variations` such as Night, Dream, Flashback or Alien Planet;
- semantic conflict detection between Style and local prompts;
- clash warnings;
- automatic correction of detected conflicts;
- Look Development proposals that turn result feedback into suggested Style
  corrections, including accept, edit and reject (`STYLE.2.LOOK.CORRECTIONS.1`,
  formerly considered as `STYLE.1.G.CORRECTIONS.1`);
- recurring or autonomous Web monitoring;
- automatic application of research discoveries;
- complete archiving of third-party Web pages;
- full Assist Director and specialist-agent orchestration;
- durable uploaded reference videos and video-to-video reference mapping;
- Project ratio, resolution and FPS editing;
- specialized camera and Workflow Tool interfaces;
- a general Workflow Tool registry;
- advanced per-provider Style packages;
- automatic multi-Sequence color-script orchestration;
- shared cross-Project influence libraries;
- collaborative permissions or multi-user review;
- automatic Story rewriting after a Style change;
- Crop/Fit tooling owned by Project Style;
- OpenReel integration;
- `SequencePreviewPlayer` changes.

These items may reuse the MVP foundations later, but must receive their own
product arbitration and tickets.

## 13. Technical Gates Already Identified

### Web research

Current LLM calls do not expose search or retrieval tools. A spike must prove
the search provider, URL safety, extraction, citations, credentials and rate
limits before implementation.

### Durable data

Project Style versions, influences, sources, references, Sequence overrides
and Look Development outputs are durable business facts. They require an
additive relational model; they must not be hidden in `localStorage`,
`app_settings` or existing description fields.

### Generation target

Current `generation_jobs` target only a Shot, Asset or Sequence. Look
Development needs an explicitly authorized Style-target/provenance extension
while reusing the canonical generation runtime.

### Prompt provenance

The existing `payloadSnapshot` and output snapshot patterns should be extended
rather than replaced by a second provenance system.

## 14. Definition Of MVP Completion

The MVP is complete only when:

- the workspace is reachable and durable;
- a sparse Style can be authored and published;
- Creative Influences, source review and synthesis work;
- Project reference images work;
- Sequence inheritance and replacement work;
- Asset alignment works with preview/apply;
- all specified generation surfaces resolve the correct Style;
- empty fields never leak into compiled prompts;
- image and video Look Development results are durable and comparable;
- provenance identifies the exact Style used;
- user-validation checklists for the visible tickets are accepted.

Delivering only the form, only the research feed or only prompt injection does
not satisfy the original user story.
