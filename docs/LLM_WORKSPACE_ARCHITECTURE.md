# LLM Workspace — Architecture Proposal

Status: Phase A delivered (§9). Phase B is broken down into seven tickets
(§11) but none is authorized yet — a prepared ticket file is still required
before any implementation.
Date: 2026-08-12, updated 2026-08-13.
Scope: architecture and product contract for LLM-assisted operations across
MikAI. No implementation is authorized by this document.

---

## 1. Problem And Evidence

### 1.1 Four feedback entries describe one missing layer

| Entry | Status | Request |
| --- | --- | --- |
| `FB-20260716-036` | `INBOX` | Specialist assistants per domain (story, asset, storyboard, editorial), coordinated by an Assist Director. Roadmap candidate `DIRECTOR.ASSIST.1`. |
| `FB-20260715-013` | `OPEN` | A Settings category exposing every LLM prompt used across the application. |
| `FB-20260716-035` | `OPEN` | Story LLM Assist is a black box; expose an extra system prompt and the effective prompt. |
| `FB-20260811-004` | `OPEN` | Auto Casting at Shot level, in addition to the existing Sequence level. |

These are not four features. They are one missing layer, observed four times
from four surfaces. `FB-20260811-004` in particular is the same operation at a
different scope, which is a cardinality problem, not a new capability.

### 1.2 Current cost, measured 2026-08-12

| Surface | Files | Lines |
| --- | --- | --- |
| `src/actions/llm/` | 15 | 2 742 |
| `src/lib/prompts/` | 25 | 3 620 |
| Near-duplicate assist panels | 10 | 2 541 |
| **Total** | **50** | **8 903** |

8 903 lines is roughly 8 % of `src/` (111 269 lines). The ten panels
(`AssetDescriptionEnhancePanel`, `AssetBibleEnhancePanel`,
`ShotPromptLLMAssistPanel`, `SequencePromptLLMAssistPanel`,
`CastingSuggestionsPanel`, `SequenceShotsLLMAssistPanel`,
`AssetsLLMExtractPanel`, `BatchAssetDescriptionEnhancePanel`,
`OutlineGenerationPanel`, `StoryGenerationPanel`) implement the same
call / display / apply-or-cancel cycle against different actions.

### 1.3 Duplicated protocol

`src/actions/llm/shotPrompt.ts` is the canonical shape. Of its ~145 lines,
roughly 90 are replayable protocol:

| Step | Lines | Variable? |
| --- | --- | --- |
| Validate incoming IDs | 48-63 | invariant |
| Check LLM config | 66-69 | invariant, duplicated in 7 files |
| Load entities, verify ownership | 71-82 | invariant *shape*, variable content |
| Aggregate relational context | 88-110 | **variable** |
| Build system + user prompt | 112-133 | invariant field mapping |
| Call `callLLMJson` | 135 | invariant |
| Strip code fence, parse JSON | 25-42 | invariant, duplicated verbatim in 3 files |
| Map error | 139-143 | invariant |

### 1.4 Existing assets to build on

- `src/lib/prompts/buildPromptCompilationContext.ts` already declares itself a
  *context contract*: pure, deterministic, serializable, order-preserving,
  no DB / network / `Date.now()` / `Math.random()`. It exposes context groups
  (`casting`, `references`, `assetBibles`, `sequenceContext`,
  `projectContext`) behind `PromptCompilationSourceFlags`. It is imported by
  12 files. Its header comment stating that surfaces were left untouched is
  stale relative to later tickets.
- `comfy_workflows` is the storage precedent: an externally authored template
  stored as data (`workflowJson`), global (no `projectId`), with
  `src/lib/comfy/parseWorkflow.ts` inferring exposed inputs and outputs from
  `(Input)` / `(Output)` node titles, and
  `src/lib/comfy/patchWorkflowPayload.ts` injecting resolved values.
- `src/app/settings/workflows/` is the route precedent: list, new, detail,
  edit — global, outside project scope.

### 1.5 Confirmed orphan

`src/lib/prompts/sequences-from-story.ts` exports
`buildSequencesFromStoryPrompt`, which has no caller anywhere in `src/`.

---

## 2. Mechanics

### 2.1 The invariant pipeline

Every LLM-assisted operation in MikAI follows the same ordered steps. What
varies between operations is **which context is resolved** and **which fields
are written** — never the topology.

```
--- dry part (read-only, replayable, no side effect) ---------------
1. collectInput      -> director intent (free text) + runtime options
2. resolveContext    -> from the anchor, via the variable registry
3. llm               -> role / system prompt / knowledge documents
4. parse             -> structured proposal, held in memory

--- Approve: atomic commit ----------------------------------------
5. invokeAction      -> e.g. shots.insertBetween(a, b) => $new
6. invokeAction      -> shots.patchFields($new, proposal)
```

The split at the Approve boundary is the core of the design:

- `Redo` replays the dry part. It has no side effect, so no compensation and
  no cleanup are required.
- `Cancel` discards in-memory state. Nothing was written, so nothing is undone.
- `Approve` performs a single atomic commit, satisfying
  `.claude/rules/database.md` ("keep ownership, concurrency checks, mutation
  and durable publication atomic").

### 2.2 Anchor and target are separate

The anchor is where context is *read from*. The target is where fields are
*written to*. They coincide for existing entities and diverge for creation.

| Use case | Anchor | Target |
| --- | --- | --- |
| UC1 — insert a directed Shot between two Shots | insertion interval `shotA -> shotB` | Shot created at Approve |
| UC2 — retake the current Shot | the Shot | the same Shot |
| UC3 — adjust a character design | the Asset | the same Asset |

Because nothing is created before Approve, no Shot entity exists when the LLM
runs in UC1. Context therefore resolves relative to the insertion interval —
its neighbouring Shots, the Sequence, the casting.

### 2.3 Proposals are ephemeral

A proposal is client-side state. There is no proposal table, no status model,
no run history, no `todo / wip / approved` vocabulary.

- `Cancel` — discard.
- `Approve` — commit to the database.
- `Redo` — replay the dry part, replacing the current proposal.

Consequence to accept knowingly: two proposals cannot be compared
side by side. If that need arises, the answer is to hold N proposals in
component state and show tabs — not to introduce persistence.

"Draft" in this document always means in-memory, never a database row with a
draft status.

---

## 3. Registries

The workflow template is data. It never contains SQL, paths, or database
access. It only references **identifiers** resolved by MikAI.

### 3.1 Variable registry (read)

A **closed** registry of named variables, each backed by a small typed
resolver in TypeScript. Deliberately not an open path or query language: an
open expression syntax would grow filters, conditions and joins, becoming an
untyped, unreviewed query language.

Illustrative entries:

```
SEQ.CONTEXT              sequence narrative fields
SHOT.CONTINUITY.BEFORE   n previous Shots -> continuityOut + description
SHOT.CONTINUITY.AFTER    n next Shots     -> continuityIn + description
SEQ.CASTING              cast Assets      -> name + visual identity
ASSET.VISUAL_IDENTITY    visual identity of the anchored Asset
ASSET.SHOT_APPEARANCES   Shots featuring the Asset -> description + actionPitch
PROJECT.STORY            project story
```

#### Resolver contract (settled in B1a)

A variable is **one named unit of context with exactly one resolver**. The
resolver is `async`, reads the database, and receives the already-verified
anchor — it never re-checks ownership and never widens the chain the runner
resolved. It returns typed data, never a formatted string: formatting belongs
to the template, which is what makes a variable reusable across operations
that phrase it differently.

The pattern is not invented here. `resolveAssetBibleContext(projectId, assetId)`
and `resolveAssetStyleContext(projectId)` already do exactly this, and
`generateAssetBibleDraft` already consumes them. The registry generalises an
existing shape rather than introducing one.

**`buildPromptCompilationContext.ts` is not the resolution layer**, and B1
must not turn it into one. It is a pure normaliser of data the caller already
selected — no database, no network, no clock. What it contributes is the
*naming*: its five boolean source flags (`casting`, `references`,
`assetBibles`, `sequenceContext`, `projectContext`) are the first five named
variables, and its purity contract survives untouched because resolvers are a
separate layer above it. It also serves the Prompt Compiler, not the eight
flat-JSON actions, which pass flat scalar props straight to their builders.
Conflating the two layers would destroy a contract Phase A paid for.

#### The closed registry for Phase B

Ten variables cover the eight flat-JSON operations. Each declares the anchor
kinds it supports and whether the user may adjust it per run.

```
PROJECT.IDENTITY       name, pitch, story,
                       description, outline          anchors: project, sequence, shot, asset
PROJECT.STYLE          world/visual/rules segments   anchors: project, sequence, shot, asset
SEQ.CONTEXT            title, summary, description,
                       mood, locationHint            anchors: sequence, shot
SEQ.CURRENT_PROMPT     sequencePrompt                anchors: sequence
SHOT.CORE              title, code, description,
                       actionPitch, cameraPitch,
                       framing, cameraMovement,
                       durationSeconds               anchors: shot
SHOT.CURRENT_PROMPT    shotPrompt                    anchors: shot
SHOT.CAST              cast Assets -> name, type,
                       description, notes            anchors: shot
SHOT.REFERENCES        reference images -> label,
                       role, source filename         anchors: shot
ASSET.CORE             name, type, description,
                       notes                         anchors: asset
ASSET.BIBLE            visualIdentity, usageRules,
                       forbiddenVariations           anchors: asset
ASSET.SEQ_APPEARANCES  Sequences featuring the Asset
                       -> title, summary, mood,
                       locationHint,
                       narrativePurpose  (max 5)     anchors: asset
ASSET.SHOT_APPEARANCES Shots featuring the Asset
                       -> shotCode, title,
                       description, actionPitch,
                       cameraPitch       (max 10)    anchors: asset
ASSET.REFERENCES       reference images -> label,
                       role, source filename (max 5) anchors: asset
```

Thirteen, not the ten first written: the three `ASSET.*_APPEARANCES` /
`ASSET.REFERENCES` entries were missing, and `PROJECT.IDENTITY` was missing
`outline`. Found by reading what `fetchAssetContextInput`
(`src/actions/llm/assetDescription.ts`) actually loads before B1b-2 was
written, rather than by blocking that ticket.

**Every render form is reachable by name from one lookup surface, and the
runner imports no operation's module.** Variable forms already had a registry;
mode and parameter forms did not, so B2a had to catalogue them in two tables
inside the runner and import one function straight from a descriptor module.
That works for three operations and rots at eight: the runner would grow a
line per operation, which is precisely what a declarative descriptor exists to
avoid. Render functions therefore live beside the resolvers, never inside a
descriptor module — descriptors stay data, because §4.2 stores them as JSON —
and the runner resolves `render` strings through the registry alone.

**A variable owns named render forms beside its resolver** (settled by
`LLMW.RENDER.SPIKE.1`). The resolver returns typed data; a render form turns
that data into a text block. A variable may expose several forms — the spike
found `PROJECT.STYLE` needs two, a multi-line context block and a one-line
conditional rule appended to the system message — and a template references a
form by name. This keeps formatting in reviewed TypeScript instead of a
template expression language, which §3.1 refuses.

**A variable owns its ordering and its limit.** `ASSET.SHOT_APPEARANCES` is
`orderBy(shots.orderIndex).limit(10)`, its sequence counterpart `limit(5)`,
`ASSET.REFERENCES` `limit(5)`. Those bounds are part of the variable's
contract, not of the caller's: the runner must not be able to widen them, or
two operations sharing a variable would stop sharing a prompt.

`PROJECT.STYLE` is in the registry because `generateAssetBibleDraft` and the
asset-description actions already inject Project Style segments. A registry
that omitted it could not reproduce their prompts byte-for-byte, which is B2's
whole acceptance criterion.

`PROJECT.IDENTITY` carries `description` alongside `name`, `pitch` and `story`
because `generateStory` passes `project.description` and `generateOutlineDraft`
passes `project.story` — the same variable serves both only if it holds the
union. A template uses the subset it needs; a variable is not narrowed to one
caller.

`ASSET.SHOT_APPEARANCES` demonstrates why flags are insufficient and paths are
unnecessary: the `shotAssets -> shots` join and the two-field projection live
inside the resolver, typed and reviewable, while the template references one
identifier.

Properties this buys:

- schema changes touch one resolver, not every template;
- a new variable is an addition, never a modification;
- each variable declares which anchor types it supports.

`buildPromptCompilationContext.ts` is the starting point. It must evolve from
boolean source flags to named variables while preserving its purity contract.

### 3.2 Action registry (write)

Symmetric to the variable registry. Templates never receive a generic
"create entity" or "write row" primitive — that would bypass renumbering,
Shot codes, ownership checks and foreign-key integrity exactly as a direct
database writer would.

A commit step invokes an **existing, named, reviewed Server Action**:

```
shots.insertBetween
shots.patchFields
assets.patchFields
```

Each entry declares the action's real semantics, not an idealised one. B0
measured the five Approve-side writes and found three that a generic
description would misrepresent: a batch that applies partially, a batch that
answers `ok: true` having applied nothing, and a "patch" that is in fact a full
replacement nulling every field the caller omits. See "B0 — outcome, and what
B4 inherits" in section 11.2.

### 3.3 Knowledge document registry

Specialisation documents (for example a distilled storyboard-language
reference) live in their own global library and are referenced by identifier
(`KB.*`). Storing them inside templates would destroy reuse.

V1 injects the distilled document as-is. No RAG, no embeddings, no new
dependency. Selective retrieval is deferred until measured need.

---

## 4. Template Format And Storage

### 4.1 Descriptor

```ts
{
  id: "shot.insert.directed",
  name: "Insert directed Shot",

  anchor:  { kind: "insertionPoint", entity: "shot" },
  //       { kind: "entity", entity: "shot" }    // UC2
  //       { kind: "entity", entity: "asset" }   // UC3

  context: {
    variables: ["SEQ.CONTEXT", "SHOT.CONTINUITY.BEFORE",
                "SHOT.CONTINUITY.AFTER", "SEQ.CASTING"],
    userAdjustable: true,
  },

  expertise: {
    role: "storyboardSupervisor",
    systemPrompt: "...",
    knowledge: ["KB.STORYBOARD.LANGUAGE"],
  },

  intent: { kind: "freeText", label: "Director note" },

  output: {
    target: { entity: "shot" },
    fields: ["shotCode", "title", "description", "durationSeconds",
             "actionPitch", "cameraPitch", "continuityNotes",
             "productionDetails", "framing", "cameraMovement",
             "continuityIn", "continuityOut"],
  },

  commit: ["shots.insertBetween", "shots.patchFields"],

  executor: "inProcess",   // "n8n" reserved, see section 7
  variation: { seed: true },
}
```

UC2 and UC3 are the same object with different values and a `commit` reduced
to `patchFields`.

#### Two corrections the eight flat-JSON actions force (settled in B1a)

The sketch above was written against UC1-UC3. Measured against the eight
actions actually migrating first, it loses two things — and "without loss" is
B1's acceptance criterion.

**1. `context.userAdjustable` is per variable, not per template.** Deferred in
section 10.2, decided here as that section required. Phase A's evidence holds:
`asset-description-from-context.ts` serves three actions through three
builders over different subsets of one context, so adjustability varies
*within* a shared context, not across templates. A per-template boolean cannot
express "the user may drop the cast list but not the anchored Shot itself".

**2. `intent` is composable, carries closed modes, and a mode may carry a
precondition.** Five of the eight take an `assistMode` — `generate | enhance |
rewrite | shorten | expand` — and four of those five modes are illegal when the
target field is empty: `generateShotPromptDraft` refuses with "A Shot Prompt is
required for this assist mode." That refusal happens *before* the LLM call and
is part of the operation's contract, not of its prompt.
`intent: { kind: "freeText" }` cannot express it, so the runner would either
lose the guard or hard-code it.

A tagged union was the first attempt and it did not survive B1b-1:
`generateOutlineDraft` takes `targetSections`, an integer the user supplies,
which is neither free text nor a mode. A union also forbids an operation from
having a mode *and* a parameter, for no reason other than the shape of the
type — the same exclusivity mistake as a per-template `userAdjustable`. `intent`
is therefore an object with optional parts, and an empty object means the user
steers nothing.

```ts
type OperationDescriptor = {
  id: string;
  name: string;

  // Correction 3. `entitySet` exists because generateBatchAssetDescriptionDrafts
  // anchors on a bounded set of Assets, not on one: it reads `assetIds` and
  // refuses beyond BATCH_LIMIT. Modelling it as a single entity would have
  // forced the runner to invent a loop the descriptor never declared.
  anchor:
    | { kind: "entity"; entity: EntityKind }
    | { kind: "insertionPoint"; entity: EntityKind }
    | { kind: "entitySet"; entity: EntityKind; maxSize: number };

  context: {
    variables: Array<{
      id: VariableId;            // closed registry, section 3.1
      userAdjustable: boolean;   // per variable — correction 1
    }>;
  };

  // Correction 4, measured by LLMW.RENDER.SPIKE.1 rather than guessed, then
  // widened by reading `outline-from-story.ts`.
  //
  // Both messages are a list of blocks joined by a separator. A block is
  // static text, or a named render form of a variable, or a named render
  // form of an intent parameter. A block that renders empty is dropped —
  // `blocks.filter(Boolean).join(separator)` reproduced all three
  // asset-description builders byte-for-byte, and nothing more was needed.
  //
  // The system message needs blocks too, and not only appended ones:
  // `buildOutlineFromStoryPrompt` interpolates its section instruction from
  // the `targetSections` intent parameter, in the *middle* of its rules. A
  // fragment list appended at the end could not express that; a block list
  // can, and without an expression language, per section 3.1.
  expertise: {
    role: string;
    system: { blocks: Block[]; separator: string };
    knowledge: KnowledgeId[];
  };

  template: { blocks: Block[]; separator: string };

  // Correction 2. Composable, not a tagged union: an operation may take a
  // mode AND a parameter. An empty object means "the user steers nothing".
  intent: {
    freeText?: { label: string };
    mode?: {
      modes: Array<{ id: string }>;
      defaultMode: string;
    };
    parameters?: Array<{
      id: string;
      type: "integer" | "string";
      label: string;
      default?: number | string;
      min?: number;
      max?: number;
    }>;
  };

  // Correction 6, reported by B2a: the pipeline refuses in several places
  // before it ever calls the model, and **every refusal message differs per
  // operation**. `generateStory` says "LLM provider not configured. Go to
  // Settings to configure Ollama."; `generateSequencePromptDraft` says "LLM
  // not configured. Go to Settings to set up Ollama." No generic runner text
  // can stand in for either without changing what the user reads, and B3 is
  // forbidden from changing observable behaviour.
  //
  // `preconditions` also absorbs what `intent.mode.requiresNonEmpty` used to
  // express, which carried no message and could not describe a gate that is
  // not mode-driven: `generateStory` refuses with "Add a pitch first." on an
  // empty pitch, in every mode. One concept — a named field that must be
  // non-empty, optionally restricted to some modes, with its own message.
  messages: {
    invalidRequest?: string;   // absent when the action has no id validation
                               // to reproduce — `generateStory` takes a
                               // number, not a FormData field. An absent
                               // message is honest; an invented one is not.
    invalidMode?: string;      // "Invalid assist mode." — a real refusal path
                               // on the five mode-driven operations
    notConfigured: string;
    chainNotFound: Partial<Record<EntityKind, string>>;  // per level of the chain
  };

  // `fields` + `require` rather than a single field, reported by B2b:
  // `generateAssetBibleDraft` refuses unless Description **or** Notes is
  // non-empty. Two single-field gates would refuse when either one is empty,
  // which is not the rule and would change observable behaviour in B3.
  preconditions?: Array<{
    fields: FieldRef[];        // on the anchor entity
    require: "all" | "any";    // every field non-empty, or at least one
    modes?: string[];          // absent = every mode
    message: string;
  }>;

  // Correction 5, read off the seven existing parsers rather than assumed.
  // `fields` named entity fields only, but the model answers in snake_case
  // and each operation validates differently. A runner cannot guess the key
  // mapping, the strictness, or the error text — and B3 must not change one
  // observable message.
  output: {
    target: { entity: EntityKind };
    fields: Array<{
      field: string;          // entity field, e.g. "shotPrompt"
      jsonKey: string;        // model key,   e.g. "shot_prompt"
      maxLength?: number;     // 4000 on the single-field asset parsers: reject
      truncateTo?: number;    // 800 on the Asset Bible fields: silently cut.
                              // Distinct from maxLength — one refuses, the
                              // other keeps a shortened value. B3b first
                              // reproduced this in the adapter, which left
                              // operation-specific output logic outside the
                              // descriptor: a stored descriptor (section 4.2)
                              // would then be incomplete, and B4's registry
                              // would describe an operation that quietly does
                              // more than it declares.
    }>;
    require: "all" | "any";   // every declared field non-empty, or at least one
    exactKeysOnly?: boolean;  // reject any key not declared — the strict
                              // single-field asset parsers, which refuse a
                              // stray draft for the other field
    errors: {
      unparsable: string;     // JSON.parse failed, or the shape is wrong
      empty: string;          // the `require` rule was not satisfied
    };
  };

  commit: ActionId[];                       // section 3.2

  executor: "inProcess" | "n8n";
  variation?: { seed: boolean };
};

type Block =
  | { text: string }
  | { variable: VariableId; render: string }
  | { variables: VariableId[]; render: string }  // see "a block may consume two"
  | { parameter: string; render: string }        // an intent parameter, e.g. targetSections
  | { mode: true; render: string };              // the selected intent.mode

// Two forms added after B1c reported them, rather than left to a reading of
// the type's examples.
//
// `{ mode: true }` because the assist operations branch on the mode selected
// through `intent.mode`, which is not an `intent.parameters` entry. Writing it
// as `{ parameter: "assistMode" }` would send a reader looking for a declared
// parameter that does not exist.
//
// **A block may consume two variables.** The transform branches of
// `shot-prompt-from-context.ts` and `sequence-prompt-from-context.ts`
// concatenate the current prompt with a subset of the sequence context using
// no separator at all. Splitting that into two blocks would insert the
// uniform block separator the builder never emits. The block therefore
// declares every variable it reads: a runner must never have to guess that a
// block needs more data than it names.
```

Everything else in the sketch survives contact with the eight unchanged.

### 4.2 Storage

Follows the `comfy_workflows` precedent: one table, template stored as JSON,
file import and export.

- **`projectId` is nullable.** Templates are global by default, because
  anchors (`shot`, `asset`, `sequence`) are structural rather than
  project-specific. A nullable `projectId` allows pinning a template to one
  project when a production requires it — a music video will not want the same
  workflow as a feature-film sequence.
- Knowledge documents follow the same rule: global by default, optionally
  project-scoped.
- Export produces a short, readable JSON: identifier lists and two text
  blocks. This is deliberately not a node graph.

Any table creation requires an explicit schema and migration authorisation in
its own ticket.

### 4.3 Context selection at run time

`context.userAdjustable` lets the template define a default selection that the
user can adjust when launching. This mirrors the intent of the existing
`PromptCompilationSourceFlags`. Because no run record is persisted, the
effective selection costs nothing to store.

---

## 5. LLM Workspace

Standalone authoring and testing surface, mirroring
`src/app/settings/workflows/`:

```
src/app/settings/llm-workflows/page.tsx                  list
src/app/settings/llm-workflows/new/page.tsx              create
src/app/settings/llm-workflows/[templateId]/page.tsx     three-pane bench
```

The list satisfies `FB-20260715-013`: every LLM prompt in the application in
one place, each associated with its purpose.

### 5.1 Three-pane bench

```
Test target: [Project v] [Sequence v] [Shot 12 v]            [ Run > ]

TEMPLATE              | RESOLVED CONTEXT        | PROPOSED OUTPUT
                      | (live, no LLM call)     | (after Run)
Anchor                |                         |
Context variables  +  | per-variable resolved    | field / proposed value
Role / system prompt  | value and token cost     |
Knowledge          +  |                          | [Approve] [Redo]
Output fields      +  | -- EFFECTIVE PROMPT --   |
                      | system: ...              |
                      | user:   ...              |
                      | total token estimate     |
```

Design intent:

- The centre pane updates **without calling the LLM**. Toggling
  `PROJECT.STORY` immediately shows what it adds and what it costs. This is
  the fast iteration loop, not a node canvas.
- The centre pane directly answers `FB-20260716-035` — the effective prompt
  stops being a black box, in authoring and in production.
- The right pane is **the same component** used for production review, so
  templates are prototyped under real conditions.

### 5.2 Variable library

The `+` control opens the registry filtered by anchor type, showing each
variable's **resolved value for the current test entity** alongside its token
cost. This provides the discoverability of a node library, plus something a
node canvas does not: seeing what a block produces before wiring it.

### 5.3 Entity picker

The only genuinely new UI primitive: project -> sequence -> shot (or asset),
filtered by the template's anchor type. Required because the workspace lives
outside project scope.

---

## 6. Product Integration

Production surfaces become generic. A page invokes a template by identifier
and renders the shared proposal component:

```
runTemplate("shot.retakeDirected", { anchor: shot(42) })
```

Adding an assist therefore means creating a template and placing a button — no
LLM logic in product screens.

Target migration:

| Today | After |
| --- | --- |
| 15 action files (2 742 lines) | runner + template descriptors |
| 25 prompt builders (3 620 lines) | variable resolvers + template data |
| 10 assist panels (2 541 lines) | one proposal component |

UC1, UC2 and UC3 become three registry entries with no new code.

---

## 7. Growth Paths

The template describes **steps**, even though they are currently fixed. Two
exits stay open without redesign:

- **Node canvas** layered over the same template format — the form remains the
  simple view, the canvas becomes the advanced view. Justified only when real
  branching appears (Assist Director coordinating specialists, fan-out across
  Shots, cross-critique loops).
- **`executor: "n8n"`** per template, via webhook: MikAI resolves context and
  posts it, n8n runs the graph as a pure function and returns proposed
  mutations. No database access, no second writer.

Two constraints established during design and to be preserved:

- n8n's exported JSON is its **internal representation**, tied to its node
  implementations. "Author in n8n, execute in MikAI" is not an option; it
  would require an n8n interpreter. Note that MikAI does not interpret ComfyUI
  graphs either — it patches inputs and delegates execution.
- n8n must never write to the database. `src/db/index.ts` uses
  `better-sqlite3`, a synchronous embedded driver. A second writer would hold
  write locks that block the Node event loop, and `foreign_keys` is a
  per-connection pragma, so an external connection could silently violate
  referential integrity across 60 related tables. Ownership checks such as
  `sequence.projectId !== projectId` exist only in application code.

`src/actions/research.ts` (1 389 lines) and Influence Research are the only
area with genuine multi-step orchestration and the only serious `executor:
n8n` candidate. It should be revisited after the workspace exists.

---

## 8. Explicitly Out Of V1 Scope

- Proposal persistence, status model, run history, side-by-side comparison.
- RAG, embeddings, vector storage.
- Node canvas.
- n8n or any external orchestrator.
- Autonomous actions: every write passes through explicit user Approve.
- New model providers. `src/lib/llm/` already supports Ollama, vLLM and
  OpenRouter.
- Changes to ComfyUI, the generation runtime, the job runner, polling,
  `SequencePreviewPlayer`, or OpenReel core.

---

## 9. Sequencing

### Phase A — before the workspace — **COMPLETE (2026-08-13)**

Only work that will not be redone.

| # | Item | Delivered |
| --- | --- | --- |
| A1 | Split `src/db/schema.ts` into `src/db/schema/` with a re-export barrel | `0074f2e` — 13 domain modules, 59 tables (not 60), barrel keeps all importers unchanged, `db:generate` reports no schema change |
| A2 | Snapshot tests over the prompt builders | `cfc8745` — 22 pure builders, 99 tests, 86 snapshots, `vitest` authorised in `devDependencies` |
| A3 | Delete confirmed orphans | `6a730b6` (`sequences-from-story.ts`), `ba41bb3` (`generateAssetDescriptionDraft`) |
| A4 | Inventory of LLM operations | `6a730b6`, `f31416a` — `docs/LLM_OPERATIONS_INVENTORY.md` |

Three figures in the original plan were wrong and are corrected above: 59
tables not 60, 26 actions not 15 (15 *files*, one row per exported action),
and 22 testable builders not 25.

What Phase A actually established, beyond the deliverables:

- **Neither registry can be built by directory discovery.** Prompt building
  escapes `src/lib/prompts/` (`translationPrompt.ts`) and the Approve-side
  writes live entirely outside `src/actions/llm/` — six assist panels reach
  five write actions in `@/actions/assets`, `/shots`, `/sequences`. Each
  operation must declare itself explicitly. See the inventory's "Scope
  limitation" section.
- **Sharing between prompt builders is far lower than assumed** — 1 shared
  file out of the 16 reachable from `src/actions/llm/`. A shared-resolver
  layer has less to consolidate than §3.1 anticipated.
- **Six of the sixteen LLM-calling actions do not fit a single JSON-object
  proposal component**: 4 return array-wrapped lists, 2 return free text.
  §6's "one proposal component" needs at least a list mode and a text mode.

### Phase B — the workspace

Registries, template format, bench, generic proposal component, migration of
existing operations, UC1 / UC2 / UC3 as three templates.

### Phase C — after the workspace

| # | Item | Rationale |
| --- | --- | --- |
| C1 | Remove the 10 assist panels in favour of the proposal component | ~2 541 lines replaced, not reorganised |
| C2 | Remove the 15 LLM actions in favour of runner + descriptors | replaced |
| C3 | Convert the 25 prompt builders into declarative templates | replaced |
| C4 | Reorganise the 128 flat components in `src/components/` | ~10 disappear in C1 |
| C5 | Break up large UI files hosting assist surfaces | they shrink first |
| C6 | Migrate to `src/features/`, LLM domain first | it will be the cleanest domain |

### Independent — schedulable at any time

No interaction with the workspace.

- `src/components/ThemeModeToggle.tsx` — 1 835 lines, a full theme editor that
  should be a directory
- `src/actions/sequenceVideoSplit.ts` — 1 828 lines
- Large storyboard and editorial page files

Three items surfaced by Phase A itself, recorded here because the supervision
files that found them are not tracked. **All three are closed (2026-08-13).**

- **Delete `getPromptCompilerPreset`** — **DONE**. Third confirmed orphan,
  removed from `src/lib/prompts/promptCompilerPresets.ts`. Evidence met the
  standard set by the first two: `grep` returned only the definition itself
  plus two doc mentions, and `git log -S getPromptCompilerPreset` returned only
  the commit that introduced it (`7a54808`) — it never had a caller at any
  point in its history. Deliberately left untested by A2, since snapshotting
  dead code makes it harder to remove.
- **Fix the double punctuation in `composeShotPrompt`** — **DONE**. The builder
  appended `"."` to every composed sentence without checking whether a field
  already ended in terminal punctuation, producing
  `"Mara looks up., in a rooftop. Short summary text.. Handheld."` One
  `joinSentence` helper now strips terminal punctuation from every fragment but
  the last, and terminates the result only when it is not already terminated —
  so an existing `!` or `?` survives instead of becoming `"!."`. The A2
  snapshot that froze the defect was updated deliberately; the other two
  `composeShotPrompt` snapshots are unchanged, which is the evidence that the
  fix is confined to the defective path. A regression test asserts the output
  never contains two adjacent terminators.
- **Decide where `src/lib/llm/translationPrompt.ts` belongs** — **DECIDED: it
  stays.** It remains the only prompt builder outside `src/lib/prompts/`. The
  registry must be explicit rather than directory-derived regardless, per the
  discovery constraint above, so location carries no contract and moving the
  file would be import churn for no gain. Recorded durably in
  `docs/ARCHITECTURE_DECISIONS.md`, "Prompt Builder Location Carries No
  Contract".

---

## 10. Open Questions For Ticket Preparation

Arbitrated 2026-08-13 after Phase A. Two are settled, one is deferred with a
reason, one remains the user's.

### 1. Migration order — **SETTLED**

Migrate the **8 flat-JSON single-entity draft actions first**:
`generateAssetBibleDraft`, `generateAssetDescriptionOnlyDraft`,
`generateAssetNotesOnlyDraft`, `generateBatchAssetDescriptionDrafts`,
`generateOutlineDraft`, `generateSequencePromptDraft`,
`generateShotPromptDraft`, `generateStory`.

They are the homogeneous core: same output shape, same anchor-to-draft
pattern, and every one of their builders is covered by an A2 snapshot. If the
runner reproduces these eight byte-for-byte, the format is proven before
anything harder is attempted.

Defer in this order: the 4 array-wrapped list actions (need a list mode in
the proposal component), then the 2 free-text ones, then chat/image — which
may never belong in the registry at all, being conversational rather than
anchored.

Does any of them change observable behaviour? The A2 snapshots answer that
per builder, but only for **prompt construction**. They say nothing about the
Approve-side writes, which live outside `src/actions/llm/` and have no test
coverage. Those writes are the real migration risk and need their own
verification in the Phase B ticket.

### 2. `context.userAdjustable` per template or per variable — **SETTLED: per variable**

Decided in B1a, where this section said it should be: against the descriptor
format, with the eight real operations in hand. See section 4.1, "Two
corrections the eight flat-JSON actions force". The original reasoning below
is kept because it is what the decision rests on.

Not blocking, and answering it now would be guessing. It is a property of the
descriptor format, so it should be decided while writing §4.1, against real
descriptors rather than in the abstract.

One input from Phase A: `asset-description-from-context.ts` serves 3 actions
through 3 different exported builders, each using a different subset of the
same context. That is evidence for **per variable**, since adjustability
varies within one shared context, not across templates. Recorded as evidence,
not as the decision.

### 3. Settings section naming — **DISSOLVED, NOT BLOCKING**

Initially arbitrated as a user decision gating Phase B. That was wrong on two
counts, corrected the same day.

First, `FB-20260715-013` is an `OPEN` entry in `docs/USER_FEEDBACK.md` that
has **not been promoted to the roadmap**. An unpromoted observation is not a
commitment and cannot gate anything.

Second, and more decisive: the workspace probably makes the request moot. The
observation asked for one place to see and tune the prompts of every LLM
process. That is what §5.1's three-pane bench, §5.2's variable library and the
§3 registries provide, as a by-product of existing. Designing a separate
Settings category now would build the thing the workspace is about to
supersede.

**Decision: do not design a Settings section.** Re-evaluate
`FB-20260715-013` once the workspace exists, against what it actually
delivers. Naming is then a question about the workspace's own surface, to be
answered when that surface is designed — not a prerequisite.

### 4. Shot-level Auto Casting (`FB-20260811-004`) — **OUT OF THE CRITICAL PATH**

A feature question about something not yet built, not a workspace design
question. It belongs to that feature's own ticket and does not gate Phase B.
Left open deliberately.

---

## 11. Phase B — Ticket Breakdown

Prepared 2026-08-13, after §9's three independent items closed. Phase B is
seven tickets. The order below is not a preference: each ticket's proof
depends on the previous one existing.

### 11.1 Two sequencing arbitrations

Both change what the tickets are, so they are settled here rather than inside
a ticket.

**Descriptors live in TypeScript before they live in a table.** §4.2 specifies
one table storing templates as JSON, on the `comfy_workflows` precedent. That
remains the destination, but it must not be the starting point. A table forces
a migration, an authoring UI and a validation layer before a single line of
the format has been proven against a real operation. A code-side registry
proves the format against the 8 flat-JSON actions at zero migration risk, and
the format that survives that contact is the one worth storing. Storage and
the bench therefore arrive in B6, after the runner has already replaced
production code paths.

**The write-side test harness comes first.** §10.1 named the real migration
risk: the A2 snapshots cover prompt construction only, and the five
Approve-side write actions have no coverage at all. Building the runner on top
of untested writes means the first thing that breaks breaks silently, in the
one place with no snapshot to catch it. B0 exists to remove that condition and
is a prerequisite for B4, not a nice-to-have.

### 11.2 The tickets

| # | Ticket | Depends on | What it proves |
| --- | --- | --- | --- |
| B0 | `LLMW.WRITE.COVERAGE.1` | — | the 5 Approve-side write actions behave, against a real disposable database |
| B1 | `LLMW.DESCRIPTOR.FORMAT.1` | — | the descriptor + variable registry describe the 8 flat-JSON operations without loss |
| B2 | `LLMW.RUNNER.1` | B1 | one runner reproduces the 8 actions' prompts byte-for-byte |
| B3 | `LLMW.MIGRATE.FLATJSON.1` | B0, B2 | the 8 actions can be deleted in favour of the runner, snapshots unmoved |
| B4 | `LLMW.ACTION.REGISTRY.1` | B0, B3 | commits go through named, declared actions |
| B5 | `LLMW.PROPOSAL.COMPONENT.1` | B3 | one component replaces the single-entity assist panels |
| B6 | `LLMW.STORAGE.BENCH.1` | B1-B5 | templates as data, plus the three-pane bench |

### B0 — `LLMW.WRITE.COVERAGE.1`

Coverage for `updateAssetDetailsInline`, `updateAssetDescriptionFieldInline`,
`applyBatchAssetDescriptionDraftsInline`, `updateShotPrompt`,
`updateSequencePrompt` (inventory, "Approve-side writes").

`src/db/index.ts` binds one `better-sqlite3` handle at module load from
`DB_PATH`, so a test can point that variable at a temporary file before
importing anything, then replay the 50 migrations in `drizzle/` and seed a
minimal Project -> Sequence -> Shot / Asset chain. This gives the repository
its first real database test capability, which outlives Phase B.

**Unknown to resolve first:** whether a `"use server"` module can be imported
under vitest at all, and what `next/cache` requires as a stub. If it cannot be
imported cleanly, the ticket extracts the write logic behind a testable
boundary — it does **not** mock the database. A test that mocks the database
proves nothing about a write action, and A2 already refused that trade.

Each action must be proven on three axes: it writes exactly the columns the
inventory attributes to it and no others; it refuses a cross-project or
cross-owner chain; ownership check, mutation and publication stay atomic under
a mid-transaction failure (`.claude/rules/database.md`).

#### B0 — outcome, and what B4 inherits

Delivered in `9ffd15f`: 38 tests under `tests/actions/`, each file migrating
its own disposable SQLite database. The unknown resolved in the executor's
favour — a `"use server"` module imports cleanly under vitest, none of the five
actions calls `revalidatePath`, so no `next/cache` stub was needed and no
business logic had to be extracted. That conclusion covers these five actions
only: an Approve-side action that did call `revalidatePath` remains untested.

Four behaviours were found and deliberately left unfixed. They are contracts
B4's action registry inherits, not bugs of the tests:

1. **`applyBatchAssetDescriptionDraftsInline` is not atomic.** One independent
   `UPDATE` per item, no enclosing transaction, so a mixed batch commits its
   valid items and reports the rest. Partial application is the real contract.
2. **The same action answers `ok: true` with `applied: []`** when every item is
   refused. A caller testing only `result.ok` concludes success.
3. **`updateAssetDetailsInline` is a full replacement.** All five text fields
   are written on every call and a blank field becomes `null`, so a caller
   changing one field must resend the other four.
4. **Ownership check and mutation are not transactional**, on all five actions:
   a `SELECT` for ownership then a separate `UPDATE`. A real TOCTOU gap against
   `.claude/rules/database.md`, low impact under single-process SQLite but not
   a conformance.

**Arbitrated by the user on 2026-08-13: partial application is the contract.**
A batch keeps every item it applied when a sibling item fails. An LLM draft is
expensive to reproduce, and discarding four accepted drafts because a fifth
failed would punish the user for the failure. The batch therefore does **not**
move under `db.transaction`, and B4's registry entry must state the partial
behaviour rather than describe the action as a plain field patch.

Point 2 is not a user-facing lie: `BatchAssetDescriptionEnhancePanel` renders
"N assets. M failed.", so a fully refused batch reads "0 assets. 3 failed."
The content is honest and only the styling is that of a success. That is a
small interface ticket, not an arbitration.

Points 1 and 2 need an arbitration **before** B4, not during it: either the
batch moves under `db.transaction`, or partial application is declared the
contract and the registry describes it. A registry that describes an action it
has mis-modelled is worse than no registry. Point 3 must appear explicitly in
that action's registry entry — a generic "patch fields" description of it would
be false.

### B1 — `LLMW.DESCRIPTOR.FORMAT.1`

The §4.1 descriptor as a TypeScript type, plus the §3.1 closed variable
registry, plus descriptors for the 8 flat-JSON single-entity actions. No
production path changes: nothing calls this yet.

`buildPromptCompilationContext.ts` is the starting point and must keep its
purity contract while moving from boolean source flags to named variables.
Both registries declare each entry explicitly — directory discovery is
excluded by §9's constraint and by `docs/ARCHITECTURE_DECISIONS.md`, "Prompt
Builder Location Carries No Contract".

This ticket owns the deferred `context.userAdjustable` decision (§10.2). It
was deferred precisely so it would be answered here, against real descriptors.
Phase A's evidence points to **per variable**:
`asset-description-from-context.ts` serves 3 actions through 3 builders over
different subsets of one context.

Proof: for each of the 8, the descriptor's resolved context equals what the
current action assembles today. Same data, declared instead of coded.

**Split into B1a and B1b**, per the arbitration rule in
`.agents/SUPERVISION_PROTOCOL.md`, "Arbitration — who implements". The two
halves have opposite risk profiles.

*B1a — supervisor.* The descriptor type, the closed variable registry, and
`userAdjustable`. No production path changes, so **no check can fail if these
are wrong**: the error would surface in B2 as a prompt that cannot be
reproduced, or in B4 as a registry describing an action it mis-modelled. Small
in tokens, expensive to get wrong. Delivered: section 3.1 "Resolver contract"
and "The closed registry for Phase B", section 4.1 "Two corrections the eight
flat-JSON actions force", section 10.2 settled.

*B1b — executor.* The eight per-action descriptors, written against the frozen
format. High volume — eight actions plus their builders — repetitive, and
provable: each descriptor's resolved context must equal what its action
assembles today. An error fails a check the same day.

**Scope correction for B3 and B4, found while writing B1a.** The inventory's
"five Approve-side write actions" was scoped to assist panels and is not the
whole write surface. Four more live *inside* `src/actions/llm/`:
`applyGeneratedStory`, `applyGeneratedOutline`,
`applySelectedCastingSuggestions`, `saveLLMChatImageAsReference`. The first two
belong to operations in the eight, so B3 cannot migrate `generateStory` and
`generateOutlineDraft` without touching writes that **B0 did not cover**.
Either B3 carries coverage for those two, or a B0b extends it first. Neither
performs an ownership check, which is defensible only because a Project is the
root of its own chain — it stops being defensible the moment either is reached
through a registry.

### B2 — `LLMW.RUNNER.1`

The §2.1 invariant pipeline as one function: validate IDs, check LLM config,
load and verify ownership, resolve context from the registry, build system and
user prompt, `callLLMJson`, strip fence and parse, map error. §1.3 measured
this as ~90 of the 145 lines of `shotPrompt.ts`, with the fence-stripping
duplicated verbatim in three files.

Proof: driven by each of the 8 descriptors, the runner produces prompts
identical to the existing builders' A2 snapshots. Byte-for-byte, or the format
is not proven. Existing actions stay in place and untouched — this ticket adds
a second path and compares it, it does not switch anything over.

### B3 — `LLMW.MIGRATE.FLATJSON.1`

**What B3 deletes, and what it deliberately keeps.** The replaced code is each
action's inline pipeline — id validation, config check, ownership loads,
context assembly, builder call, fence stripping, parse — plus the three
verbatim copies of `extractCodeFence`. The action itself survives as a thin
adapter: its exported signature and its return shape are a contract its
components depend on, and B3 changes neither.

The prompt builders under `src/lib/prompts/` are **kept on purpose**, and this
is a declared retention rather than leftover debt. They are the frozen oracle:
the A2 snapshots pin them, and the `*.render.test.ts` proofs assert that a
descriptor's blocks reproduce them byte-for-byte. Deleting them in B3 would
remove the only independent evidence that the runner still emits the same
prompt. They lose their production caller and keep their oracle role. Retiring
them belongs to a later ticket, and only once the snapshots are re-anchored on
the runner's own output.

**One proof dies at the moment of the switch, and must be replaced.** The
`*.runner.test.ts` files prove prompt equality by mocking the builder module
and capturing what the *action* passes it. Once the action calls the runner, it
never calls the builder, so that capture is empty and the assertion becomes
vacuous. The comparison must be re-pointed: call the builder directly with the
same seeded data and compare it to the runner's prompt. Same claim, without the
action in the middle — which is the honest form of it after the switch.

Switch the 8 actions to the runner and delete the replaced code, in the same
diff, per the Definition of Done. The A2 snapshots must not move: a changed
snapshot here is a defect, not an update — the opposite of the punctuation fix
in `da48cbf`, where moving one snapshot was the point.

B0's coverage is what makes this safe on the Approve side, which is why it is
a dependency rather than a parallel track.

### B4 — `LLMW.ACTION.REGISTRY.1`

The §3.2 write registry: commits invoke existing, named, reviewed Server
Actions rather than a generic write primitive. The five actions from B0 are
its first entries, and B0's tests are what protect the indirection.

No template ever receives a "create entity" or "write row" primitive. That
would bypass renumbering, Shot codes, ownership checks and foreign-key
integrity exactly as a direct database writer would.

### B5 — `LLMW.PROPOSAL.COMPONENT.1`

One proposal component with Approve / Redo / Cancel, replacing the assist
panels for the migrated single-entity operations. §9 established the
constraint the original §6 missed: 6 of the 16 LLM-calling actions do not fit
a single JSON-object component — 4 return array-wrapped lists, 2 return free
text. **This ticket delivers object mode only.** List mode and text mode
follow with their own migrations; pretending one component covers all three
now is how the component ends up with three modes bolted on badly.

### B6 — `LLMW.STORAGE.BENCH.1`

Templates become data (§4.2) and the workspace appears (§5): the
`src/app/settings/llm-workflows/` routes, the three-pane bench, the variable
library, the entity picker.

**Requires explicit schema and migration authorisation in its own ticket** —
nullable `projectId`, template JSON, import/export. That authorisation is not
granted by this breakdown.

This is where `FB-20260715-013` (every prompt in one place) and
`FB-20260716-035` (the effective prompt stops being a black box) are actually
answered — by the list and the centre pane respectively, as a by-product of
the workspace existing rather than as features of their own.

### 11.3 After B6

**Revised 2026-08-15 after B7a and after the user restated the founding use
cases.** This list supersedes the ordering written earlier the same day: B7a
proved there are three list migrations and not four, and the user's challenge
established that nothing in the queue served UC1/UC2/UC3.

### The governing rule — a node library, decided by the user on 2026-08-16

**When an operation needs something the workspace cannot express, build the
missing brick. Do not drop the operation.** The user stated it in the terms he
works in: this is a nodal system. You want an action, you look for a node that
does it; if none exists you develop the node, and your library has grown.

This settles a question that had been answered the wrong way twice. B7a met
`castingSuggestions` and recorded it as "not representable"; B7c's preparation
met two more operations and first framed them as "excluded". Both framings are
dead ends — an operation the workspace never learns to express keeps its
hand-written code forever, and Phase C's deletion never completes for it.

Two consequences. A gap is a **ticket to write a brick**, not a reason to
exclude. And a brick is worth building when more than one operation waits on it:
the post-response stage below is wanted by two, which is what turns it from a
special case into library growth.

### Chantier 1 — finishing the workspace

| # | Ticket | Delivers | UC impact |
| --- | --- | --- | --- |
| ~~B7b~~ | ~~Format extensions~~ | **Delivered 2026-08-16, commit `12fdcc7`.** The five declarative gaps plus the selection declaration. Item fields are now a union discriminated on `type` (`string` / `number` / `enum`), `RunOperationResult` list items carry `string \| number`, and `selection.formDataKey` is mandatory. The three representable parsers are now proven by **complete** field equality, not string-only. See `docs/PROJECT_STATE.md`, section B7b. | none |
| ~~B7c~~ | ~~One row-creating descriptor~~ | **Delivered 2026-08-16, commit `e1ac26d`.** `shots-from-sequence`, byte-for-byte against its builder, shipped deliberately **unregistered** because the runner would have silently rendered a prompt asking for 6 shots whatever the user picked. `commit: []` — the write side is still open. See `docs/PROJECT_STATE.md`, section B7c. | none |
| ~~B7c-n4~~ | ~~Node — a block carrying variables **and** parameters~~ | **Delivered 2026-08-16, commit `a419e89`.** The seventh `Block` variant, dispatched by name through a `satisfies`-constrained table rather than positionally, and `shots.fromSequence` registered as its acceptance proof — verified through the real runner and by mutation. The first brick built under the governing rule above. | prepares UC1 |
| ~~B7c-w~~ | ~~The write side of the row-creating operations~~ | `createGeneratedShots` / `createSelectedAssets` / `createGeneratedSequences` **insert** rows, while all eight declared `ActionId`s update, and `ACTION_REGISTRY`'s vocabulary (`columns.written`, `writeSemantics: "replace" \| "partialPerItem"`) was written for updates. Until this lands, `shots.fromSequence` runs in the bench and nothing can be approved. **Delivered 2026-08-16, commits `85ea5ac` (declaration) and `e5fa0a4` (the two repairs).** `ACTION_REGISTRY` gained `operation: "update" \| "insert"` and `writeSemantics: "insertPerItem"`, the three insert actions are declared and proven against a disposable database, and `shots.fromSequence` finally has its `commit`. Two declared defects were then repaired; the missing transaction on the three insert loops was **classified** by the user, and the sourcing metadata `createSelectedAssets` drops is **deferred** until a surface can display it. | none |
| ~~B7c-n1~~ | ~~Node — boolean and multi-choice inputs~~ | **Delivered 2026-08-17, commit `bd38db5`** (with B7f). `intent.parameters` gains `"boolean"` and `"multiEnum"`. The six asset-type checkboxes became **one** `multiEnum` over a closed set, not six booleans: checkboxes are a shape of the interface, and turning a form into an intent is the adapter's job. An array with an unknown member is rejected whole, never silently filtered. | none |
| ~~B7c-n2~~ | ~~Node — project-scope collection variables~~ | **Delivered 2026-08-17, commit `95d2a3c`.** `PROJECT.SEQUENCES`, `PROJECT.SHOTS` (crossing every sequence), `PROJECT.ASSETS`. Shipped ahead of its consumer because a variable proves itself through its resolver, unlike a pipeline stage. Isolation is the property under test, not the shape: a leak across projects is a confidentiality defect. | none |
| ~~B7c-n3~~ | ~~Node — the post-response stage~~ | **Delivered 2026-08-17, commit `e867636`** (with B7g). `postResponse` names a form and declares every variable and parameter it reads. Shipped with its consumer, because a stage with no consumer is code no honest test exercises. | none |
| ~~B7d~~ | ~~List mode in `ProposalPanel`~~ | **Delivered 2026-08-16, commit `4e550d9`.** The title was wrong: `ProposalPanel` is generic on `TDraft` and needed zero lines of change — a list draft already passes through its `redirectOnly` branch. What was actually missing was the **selection** itself (absent anywhere in the workspace) and the bench's list branch: a list-kind Run action, `BenchRunPanel`'s cherry-pick UI (checkboxes, `N of M selected`, all-checked default), and `buildListSelectionPayload` — the pure rebuild from the runner's entity-field-keyed items to the write action's own `jsonKey`s, proven round-trip through the real runner and the real `createGeneratedShots`, and by mutation. | none |
| ~~B7d-f~~ | ~~The bench's silent Approve~~ | **Delivered 2026-08-17, commit `f892850`.** Found by B7d's browser validation and pre-existing: the bench read none of `shotsCreated`, `shotPromptSaved`, `sequencePromptSaved`, so every `redirectOnly` Approve returned to Run with no confirmation. The keys become one table, `REDIRECT_CONFIRMATION_KEYS`, constrained by `satisfies` over `RedirectOnlyActionId`, from which both the exclusion list and the banner derive — **a future `redirectOnly` action no longer compiles until it declares how it reports itself**. Removing an entry fails `tsc` with TS1360. | none |
| ~~B7e~~ | ~~Migration 1 of 3 — `shots.fromSequence`~~ | **Delivered 2026-08-17, commit `c6ad874`.** `generateShotsFromSequenceDraft` becomes a thin adapter over `runOperation`; `SequenceShotsLLMAssistPanel` never opened, so the cherry-pick selection stays a bench capability rather than arriving in production through a migration. Proven **indiscernible** from the old `parseShotsResult` chain by a hand-computed equality test (`""`→`null` and the omitted numeric both bridged), and B7d's `mapListItemToModelKeys` reused rather than copied. | none |
| ~~B7e-n~~ | ~~Node — declared parameter bounds~~ | **Delivered 2026-08-17, commit `e67a187`.** Found by B7e: `intent.parameters`' `default`/`min`/`max` had been decorative since B1a. `normalizeIntentParameters` applies them once, upstream of both dispatchers — invalid or out-of-range becomes the declared `default`, or is omitted when none exists, **never clamped** (clamping would look smarter and would not be what the two actions did). Closes B7e's regression and covers the bench's URL-driven control without touching a bench file. | none |
| ~~B7f~~ | ~~`assets.fromProject` — descriptor~~ | **Delivered 2026-08-17, commit `bd38db5`.** With B7c-n1, and a third extension: `preconditions[].fields` becomes `refs`, so a gate can name an anchor field, a parameter **or a resolved variable** — the half no field rule could state (« no pitch, no story, no outline **and no sequences** »). | none |
| ~~B7f-m~~ | ~~`assets.fromProject` — migration~~ | **Delivered 2026-08-17, commit `9fdda6a`.** The last of the three list migrations. The empty `multiEnum` is passed through untouched, never replaced by the default — that is what lets the « Select at least one asset type. » gate fire at all. | none |
| ~~B7g~~ | ~~`sequences.fromOutline` — descriptor~~ | **Delivered 2026-08-17, commit `e867636`.** With the post-response brick, plus `PROJECT.OUTLINE_SECTIONS`. | none |
| ~~B7g-m~~ | ~~`sequences.fromOutline` — migration~~ | **Delivered 2026-08-17, commit `f4f0201`.** Carried a trap: the action still held its own copy of the override B7g had moved into the runner. Idempotent, so nothing looked wrong — found by reading, and the mutation control proves the tests were blind to it. | none |
| ~~B7h-a~~ | ~~Casting — the write action declared~~ | **Delivered 2026-08-17, commit `a6f1711`.** The registry learns to name **two** targets: this action inserts into `shot_assets` or `sequence_assets` depending on the item. | none |
| ~~B7h-b1~~ | ~~Casting — the addressable variables~~ | **Delivered 2026-08-17, commit `5e57e67`.** `SEQ.SHOT_TARGETS`, `PROJECT.ASSET_LIBRARY`, `SEQ.EXISTING_CASTINGS`. Addressable is not descriptive: `SEQ.SHOTS` carries no id, and widening `PROJECT.ASSETS` would have broken `assets.fromProject`'s proof. | none |
| ~~B7h-b2~~ | ~~Casting — the descriptor~~ | **Delivered 2026-08-17, commit `d89ee87`.** The last « not representable », open since B7a. A first blocked report was right: this is the **first builder needing its own anchor's id**, which `SEQ.IDENTITY` now carries. Enrichment **replaces** the model's names (« don't trust LLM names »); `ListItemField` gains no boolean, since `alreadyAssigned` is computed, never parsed. | none |
| ~~B7h-m~~ | ~~Casting — the migration~~ | **Delivered 2026-08-17, commit `ba1e435`.** The eighth and last list operation loses its own engine, and the bench gains its fourth Approve branch. **The first of the four list migrations that is not strictly indiscernible**: the old id gate ran before the empty-refusal, the runner's equivalent runs after it in `postResponse`, so an unrecognised `targetType` or a non-positive-integer id now yields an empty list where the old chain threw « no valid suggestions ». Accepted by the user rather than repaired — folding the message onto a post-filter empty array would corrupt the far more common hallucinated-id case, where both chains already agree. `No castings applied.` on a count of 0 is a deliberate break from the three `create*` actions: for this action alone, 0 is an ordinary outcome. | none |
| ~~S1~~ | ~~Schema — Asset Bible freshness, and asset sourcing metadata~~ | **Delivered 2026-08-18**, two tickets as planned: `9022dde` (sourcing) and `5d41b7b` (freshness). The sourcing columns shipped with the asset detail surface that displays them, which was the condition attached to the authorization, and render nothing at all when the three are null. Freshness took a corrective round worth remembering: `updateAssetDetailsInline` is the only path that writes a Bible, but not a path that *only* writes Bibles — it rewrites all five columns every call, so capturing the fingerprint unconditionally declared a Bible current at the exact moment a description edit made it stale. The fingerprint now moves only when a Bible value actually differs. Migrations `0051`/`0052`, generated and applied by the user on 2026-08-18. | none |
| ~~S2~~ | ~~The asset-type filter becomes a real filter~~ | **Delivered 2026-08-18, commit `5fc5156`.** A `postResponse` form drops a candidate whose type was not requested — **the first deliberate change in observable behaviour of the chantier**, every migration before it having been held to indiscernibility. The migration proof was narrowed rather than deleted. Two divergences named rather than discovered later: an unrecognised type arrives already normalized to `"other"` and is filtered like any member, and dropping every candidate yields an empty list rather than the "empty" refusal, since the runner's empty check runs before `postResponse`. A **second** proof needed narrowing and only running the suite revealed it — the B7b field-parsing equality test compares the real action against a synthetic descriptor with no `postResponse`. | none |
| ~~S3~~ | ~~Bench controls for boolean and multi-choice~~ | **Delivered 2026-08-18, commit `7a985ad`.** Two traps, both from the same fact that an unchecked box sends nothing in a GET form: a boolean whose default is `true` could never be set back to `false`, and — the serious one — an all-empty `multiEnum` would have become *absent*, restoring the default and making `assets.fromProject`'s « Select at least one asset type. » precondition unreachable from the bench, undoing the guarantee B7f-m spent half its proof establishing. A presence marker separates absent from present-and-empty from present-with-members. | none |
| ~~S4~~ | ~~UC3 on the Asset page~~ | **Delivered 2026-08-18, commit `4210df8`.** A directed retake beside Enhance Description, committing through `updateAssetDescriptionFieldInline` with `mode` fixed to `"replace"` — one column, so notes and the three Bible fields are untouched **by construction**, not by careful carrying. The Bible advisory shows only when the Bible is genuinely stale (S1b's gate), proven in all three states. **The first version of this ticket was wrong and the executor refused it**: it insisted UC3 writes through the five-column action and that approving would erase notes and Bible — against the descriptor's own `commit`, the bench routing, `PROJECT_STATE` and an existing test, all four saying otherwise. Complying would have rewired UC3 to the wider write to guard against a danger that rewiring would itself have created. | **surfaces UC3** |
| ~~S5~~ | ~~Field translation becomes a read-only popup~~ | **Delivered 2026-08-18, commit `e5c054c`.** Replace and Append are gone from eleven files; Copy and Cancel stay, since copying changes nothing. The panel was **not** turned into a floating modal: the supervisor read « popup » as « read-only », because the panel already displayed the translation without letting it be edited — what the request removed were the two buttons that *write*. A real overlay is a separate interface job and would have delivered nothing that was asked for. | none |
| ~~B8~~ | ~~Text mode + `promptCompiler`~~ | **Dissolved 2026-08-18.** Preparing it revealed that its cost was the price of reproducing a design the author had never used — the five presets, the five source checkboxes, the hand-ordered image selection. The user restated the intended prompt mechanics instead, now `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5. What survives is **B12** (text output mode + the narrative jar); the rest becomes B13, B14 and two deferred families. See "B8 dissolved" below. | none |
| ~~B6c2~~ | ~~The variable library (§5.2)~~ | **Delivered 2026-08-18, commit `627e79a`.** `/settings/llm-workflows/variables`: the whole registry filtered by anchor, each variable resolved against a chosen test entity with its token cost. Derived from `VARIABLE_REGISTRY`, so a new variable appears the day it is registered, and the anchor comes from the identifier prefix mirroring `anchorIdForVariable` rather than a second table. The trap was resolving twenty-two at once: every resolver throws on a missing entity, and a plain `Promise.all` would blank the page on the first failure — each call sits in its own `try/catch` inside the async callback, so a broken variable keeps its row and shows its message. Read-only: no writes, no model call, no cost. | prepares all three |
| ~~B9~~ | ~~`intent.freeText` + the UC2 descriptor~~ | **Delivered 2026-08-15, commits `865ae59` (B9a, the primitive) and `6aa8cbf` (B9b, `shot.retakeDirected`).** The first tickets of the phase to deliver a new capability rather than reorganise one. `intent.freeText` had been declared since B1a and deferred by B6b and B6c1 — each time on correct local reasoning, cumulatively deferring the one primitive all three founding use cases need. | **UC2 delivered** |
| ~~B10~~ | ~~The UC3 descriptor~~ | **Delivered 2026-08-17, commit `41d16b8`.** Two rounds: the first left « Respond to the director's direction below » standing unconditionally in the *system* message — the B9b defect one message higher. Writing `description` alone means **no preservation trap at all**. No oracle: the prompt is written, so its quality is a human judgement, not a test result. | **delivers UC3** |
| ~~B10-f~~ | ~~UC3 — the stale Asset Bible~~ | **Delivered 2026-08-17, commit `9266d64`.** An operation declares what its write leaves stale. Re-running the Bible tool is the right move — it already reads the current description and is told to reconcile rather than overwrite. Project Style is deliberately excluded: it writes all five fields itself and already owns a fingerprint model. | none |
| ~~B11~~ | ~~UC1~~ | **Delivered 2026-08-17**, in four commits: `548e8e9` (the write action), `0895907` (object output learns numbers), `78ccc14` (the descriptor), `b560cf9` (the bench). **Two of the three things this row predicted turned out not to be needed.** `insertionPoint` is **not** implemented and will not be — an insertion point is not an anchor identity, it changes with every request, so the position is an `intent.parameters` entry and the operation is anchored on the sequence, exactly as `shots.fromSequence` already is while creating shots. The anchor kind stays nominal in the type union, now with a reason. "Re-run with another seed" is Redo, decided by the user 2026-08-17: the bench's own Run and `ProposalPanel`'s Redo already provide it, and `src/lib/llm/` has no seed plumbing at all. The output is **ten** fields, not twelve: "Production Details" in §4 of the vision is a form section heading, not a column, and `shotCode` is generated from the nomenclature template rather than taken from the model. UC1 is bench-only, like UC3. | **delivers UC1** |
| ~~S6~~ | ~~UC1 on the Sequence page~~ | **Delivered 2026-08-18, commit `05f381a`**, and validated in the running product by the user the same day. The affordance is per shot, on the connector between two of them, and `afterShotId` is **implicit in the click** — the bench asked for an id in a field because a bench may; making an artist hunt for a numeric identifier is the technical friction §1 of the vision rules out. Everything else is reuse: `ProposalPanel` with B9a's pre-trigger input, `shotPrompt.assist`'s own `redirectOnly` envelope, `createShotAtPosition`, and `buildShotJsonPayload` deliberately not rewritten. | **surfaces UC1** |
| E1 | The template editor | `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md`. Must make `intent.freeText` editable — see that file's 2026-08-15 correction. | makes all three authorable |

### What remains — the whole of it, 2026-08-18

**Written as a checklist because it was under-reported once.** On 2026-08-18 the
supervisor summarised the remaining work as "C0 and the deletions" three times
running, silently dropping **E1** — the ticket that makes the user an author,
and §7's own third success criterion — and collapsing six cleanup tickets into
one word. A reader of this file must be able to count what is left without
reconstructing it from struck-through rows.

**Order settled by the user 2026-08-18: B8, then E1, then Chantier 2** — and
revised later the same day, after §5 and the author's rulings, to
B12 → E1 → B15 → B16 → B13 → B14 → B20 → Chantier 2 → B17/B18/B19.

**Revised 2026-08-18 after the vision's §5 was written** — B8 is dissolved and
the queue re-derived; see "B8 dissolved" below for the full table and the
reasoning. Chantier 1 now has seven tickets left:

1. **B12** — text output mode + the narrative jar. All that survives of B8.
2. **E1** — the template editor, the user's own "saved shopping lists". **The
   point of the chantier**: it turns the workspace from a thing that runs the
   eight built-ins into a thing the user authors in. Scoped in
   `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md`, and it **must** make
   `intent.freeText` editable — that file's own 2026-08-15 correction.
3. **B15** — lighting, the field, at Shot / Sequence / Environment Asset level.
4. **B16** — lighting, assisted: the vision fill and the director's-note adjust.
5. **B13** — the conformation stage: the engine formatting the app owns.
6. **B14** — the storyboard prompt brought under the workspace.
7. **B20** — Reference Board analysis joins the registry, ruled a brick to build.

Three more are scheduled **after** Chantier 2 rather than inside it — the media
reference families (B17), negative constraints (B18) and the camera redesign
(B19). Reasons per item in "B8 dissolved" below.

Chantier 2, seven tickets plus three independents, all listed below: C0 (the
prerequisite), C1, C2, C3, C4, C5, C6, then `ThemeModeToggle.tsx`,
`src/actions/sequenceVideoSplit.ts` and the large storyboard/editorial pages.
Then, and only then, the token-efficiency audit and the roadmap reconciliation.

Everything else in the Chantier 1 table above is delivered and struck through.

### Chantier 2 — the cleanup, which only B7-B8 make possible

A panel that still serves an unmigrated operation cannot be deleted. Phase C
therefore starts after the migrations, not before.

- **C0 — re-anchor the A2 snapshots on the runner's own output.** Prerequisite
  for everything else: the builders under `src/lib/prompts/` (23 files, 3 526
  lines) are the frozen oracle the descriptor proofs assert against. Deleting
  them without re-anchoring destroys the proof along with the code.
- **C1** remove the assist panels · **C2** remove the LLM actions · **C3**
  convert the prompt builders into declarative templates · **C4** reorganise the
  128 flat components in `src/components/` · **C5** break up the large UI files
  · **C6** migrate to `src/features/`, LLM domain first.
- **Independent, schedulable any time**, no interaction with the workspace:
  `ThemeModeToggle.tsx` (1 835 lines), `src/actions/sequenceVideoSplit.ts`
  (1 828 lines), the large storyboard and editorial page files.
- **Then** the code-level token-efficiency audit the user asked for, and only
  then the roadmap reconciliation — both are worth far more once ~6 000 lines of
  superseded code have actually left the repository.

### The ordering the user settled, and what B7a changed

**Order settled by the user on 2026-08-15**, revised as above:

1. **List mode in the proposal component, then the 4 array-wrapped list
   actions.** The mode ships as its own ticket, never mixed with a migration —
   the discipline B5 established.
2. **Text mode, then the 2 free-text actions.**
3. **B6c2** — the variable library (§5.2).
4. **The template editor, E1** — scoped in
   `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md`. Placed here, not
   later: §5.2 delivers *seeing* what a block produces, E1 delivers *wiring*
   it. It is what turns the workspace from a thing that runs the eight
   built-ins into a thing the user authors in.
5. **Phase C** (§9) — the removal.

**Chat and image generation are out, permanently.** Decided by the user on
2026-08-15: they stay exactly as they are and do not join the registry. The
earlier "may never belong at all, being conversational rather than anchored"
is now settled rather than open. No ticket, no migration, no descriptor.

**Field translation is out too, permanently — decided by the user 2026-08-17.**
`translateTextField` (`src/actions/llm/translation.ts`) joins chat and image
generation rather than the registry. The user described the feature in his own
terms: there are two translation affordances, and both are conveniences around
the same free service — one is a stored system-prompt template inside the chat,
the other is the button under a field, and what he actually wants from the
latter is *a visible translation on demand, in a popup, not editable*. Nothing
about that is an assistant proposing entity field values for approval.

The technical facts agreed with him, which is why this is recorded rather than
argued: the operation has **no anchor at all** (`EntityKind` is closed to four,
and `loadAndVerifyChain` always starts from a project), its input is not a
variable but whatever text the user clicked, it uses `getChatLLMConfig()` — the
*chat* provider, separately configurable — and it declares per-call model
options (`temperature: 0`, `numPredict`, `think: false`) the descriptor format
cannot express. Four bricks, for one operation that would still have no write
action.

**The consequence is accepted explicitly:** `src/actions/llm/translation.ts`
will never be deleted by Phase C and stays hand-written. That is precisely what
the governing rule above warns about — but it is the same status chat and image
generation already hold, and it is the user's call about what the workspace is
*for*, not a gap in what it can express.

### B8 dissolved, and the queue re-derived — 2026-08-18

**Everything below the horizontal rule in this subsection is superseded.** It is
kept because the reasoning that killed it is worth reading beside it.

B8 was scoped as "migrate `promptCompiler`", with two hard parts: the action
reads no database, and its staleness fingerprint serialises the whole context.
Preparing it required reading the operation end to end, and that reading found a
third fact neither hard part named: **the context is chosen by the user, not
derived from the database.** Five presets, five source checkboxes, and a
hand-ordered subset of reference images whose click order becomes `@Image1..N`.
No variable can express "the ordered subset the user just ticked", so the
migration implied inventing a whole new primitive.

The supervisor put that cost in front of the user before writing the ticket. The
answer reframed the chantier: **the author has never used the presets.** The
whole cost was the price of faithfully reproducing a design nobody had re-judged
since it was written — before the workspace existed, before UC1/UC2/UC3 ran.

What followed is now `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5, and it is
binding: ingredients, jars and recipes; assembly and cooking as two stages of
one chain, of which **only the generated one is stored**; the user owning
ingredient choice and the director's note, the app owning the engine formatting.
§5.8 lists what is deliberately not reproduced — the presets, the checkboxes,
the manual image ordering, the fingerprint in its current form, the
`sessionStorage` handoff.

Two facts established by reading, recorded here because they are load-bearing:

1. **The fingerprint was never the adapter's.** `PromptCompilerPanel` builds the
   context and computes the fingerprint client-side; the action's returned
   fingerprint is a byte-identical echo, and `PromptCompilerHandoffGate`
   recomputes it client-side too. Under §5.3 the whole mechanism has no subject
   left: staleness attaches to jars.
2. **The reference roles already are the engine's reference modes.**
   `src/lib/referenceImageRoles.ts` carries `first_frame`, `last_frame`,
   `character`, `environment`, `style`, with an explicit stored order. The
   information the panel asks the user to restate is already in the database.
   What is missing is the rendering, which §5.4 assigns to the app.

**Order settled 2026-08-18, after §5 was written, and revised the same day once
the author had ruled on lighting, negative constraints, the camera and the media
families.** The user delegated the sequencing and asked explicitly which items
would be better off *after* Chantier 2. Ticket ids are stable labels, not an
ordering — read the list, not the numbers.

**Chantier 1 — finishing the workspace, in this order:**

| # | Ticket | Why here |
| --- | --- | --- |
| 1 | **B12** — text output mode + the narrative jar. **Split 2026-08-18 into B12a (done, `c4d7af1`) and B12b.** | All that survives of B8. `output.kind: "text"` in the runner (`RunOperationResult` gains a third variant, breaking the ~14 declared consumers on purpose, B11-b1's pattern), plus the Shot column the generated narrative prompt lands in — §5.3's jar, distinct from `shots.shot_prompt` so a human's text and a model's are never merged again. Bench-only, like UC1 and UC3 were. Needs a schema authorization and a migration the user runs. |
| 2 | **E1** — the template editor, the saved recipes. **Split 2026-08-18 into E1a (`6f44c72`) and E1b (`638832f`) — both delivered.** E1a is the pure module plus the save action, which accepts a *patch* of the editable surface and never a descriptor — the barrier that keeps E1 from becoming E2. E1b is the screen. | Unchanged in intent, and now named in the user's own vocabulary ("listes de course sauvegardées", §5.2). After B12 because a recipe that can neither cook text nor fill a jar is a thin thing to author against. Must make `intent.freeText` editable — the 2026-08-15 correction in `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md`. |
| 3 | **B15** — lighting, the field. **Split 2026-08-18 into B15a (`f163da6`, done) and B15b.** B15a is the three columns, the three write actions and the reads, including `SEQ.LIGHTING`'s precedence rule (own field wins when filled, else the environment assets of the Sequence's cast) and its `source` reporting. B15b is the three form surfaces plus the "Fill from environment" button. No relation column was needed: `sequence_assets` already links them. | §5.9. Three levels: Shot, Sequence, and Environment Asset — the last being the point, since a Sequence can then read its environment's lighting instead of inventing one. Manual fill, plus the reuse path. No model involved. |
| 4 | **B16** — lighting, assisted | §5.9's other two fills. **Cheaper than first estimated:** the multimodal capability is already built and hardened in `src/lib/projectStyle/referenceAnalysis/` — byte re-validation at call time, one `ChatMessage` the router already translates for both provider families, a leak-proof error wrapper, a validated JSON answer, and a prompt that already asks about lighting by name. What is missing is that **the descriptor format cannot declare an image input**, so that capability sits outside the workspace, anchored on the Reference Board. B16 makes it reachable from another anchor and another question. Plus the director's-note adjustment at Shot and Sequence level, which is `intent.freeText` over the current value and needs no new primitive. **Design constraint from B20:** the image-input declaration must be designed against Reference Board analysis's needs — N ordered images with per-image keys, bytes re-validated at call time — not only against lighting's single-image case, or it will be widened immediately afterwards. |
| 5 | **B13** — the conformation stage | §5.4/§5.5: the engine formatting the app owns. Renders stored reference roles into the guide's named image modes, applies the word budget, the one-primary-camera rule and the tag caps. Placed after B15/B16 so it has lighting to render. Must be replaceable per engine, nothing named after Seedance — and per §5.6 it **must not hard-code today's camera shape**, since that shape is scheduled to change after Chantier 2. |
| 6 | **B14** — the storyboard prompt under the workspace | §5.7 opened it: per Shot it carries **only** the Shot Prompt text. Becomes a recipe that cherry-picks ingredients and consumes jars, instead of depending on what the author typed by hand into each Shot. |
| 7 | **B20** — Reference Board analysis joins the registry | Ruled a **brick to build** by the author 2026-08-18, not an exception like chat/image generation/translation. `src/actions/projectStyleReferenceAnalysis.ts` is 1 259 hand-written lines doing exactly what the workspace exists to express. Its migration needs three format gaps closed, not one — an image input with per-image keys, a **composite output** (one scalar plus two lists, where `output.kind` picks one shape today), and cross-item referential validity. Three things must survive untouched: the file confinement/decode gate, the prompt's provenance hash, and the pre-call/in-transaction snapshot drift detection. See `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.9. Big enough that it may split; scoped when reached. |

**B12 split, 2026-08-18.** The schema change is put on a ticket boundary rather
than in the middle of one, because `.agents/SUPERVISION_PROTOCOL.md` §5 makes an
unapplied migration a hard stop: the user runs `db:migrate` himself, always.

- **B12a — the jar** (`LLMW.JAR.1`, delivered, `c4d7af1`). The column
  `shots.narrative_prompt` (migration `0053_light_killraven`), the write action
  `updateShotNarrativePrompt`, and the variable `SHOT.NARRATIVE_PROMPT`. No
  descriptor, no text mode, no product surface. Provable without its consumer
  because a write action is proven against a disposable database and a variable
  by its resolver — neither is a pipeline stage.
- **B12b-1 — the text engine** (`LLMW.TEXT.1`, delivered, `00093d8`). Split out
  once preparation found that `runOperation` only ever called `callLLMJson`, and
  that this call **forces JSON on both provider families**. `callLLMText` (the
  `LLMPrompt` -> `ChatMessage[]` adapter over the existing `callLLMChat`; no
  provider code written), the third `output.kind`, the third
  `RunOperationResult` variant broken deliberately on B11-b1's pattern, and the
  runner's text branch — which strips no code fence, because a strip correct
  against corrupted JSON would mutilate prose. No descriptor, no bench render.
- **B12b-2 — the narrative prompt composer** (`LLMW.NARRATIVE.1`, delivered,
  `d097278`). `narrativePrompt.compose`: the six ingredients of
  `shotPrompt.assist`, no mode and no `intent.freeText` (§5.3's marmite mixes
  the same way every time; the director's note is E1's and B16's subject), and
  deliberately **not** `SHOT.NARRATIVE_PROMPT`, which is its own output. Bench
  render surface, `commit: ["updateShotNarrativePrompt"]`, and B12b-1's named
  refusal removed in the same diff. Also closed a hole B12b-1 left: the template
  storage validator had no `"text"` branch, so a stored template declaring the
  new kind would have been refused on import.

**B12 is complete.** The generated narrative prompt has a jar of its own, and an
Approve can no longer merge it into the field the user types by hand — proven end
to end by `narrativePromptCompose.surface.test.ts`.

**Then Chantier 2** — C0 → C6 and the three independents, unchanged.

**After Chantier 2 — decided 2026-08-18, with the reason each item waits:**

- **B17 — the media reference families.** The author's own call: tune
  `shot_reference_videos` (delivered, never exercised), give it the **role
  column** it lacks — the guide's video modes are keyed on roles — and add the
  audio family. He asked for it *après qu'on aura terminé le chantier llm
  workspace et le clean de code base*.
- **B18 — negative constraints.** He named it a real gap in his own work and
  **explicitly not MVP**. Nothing depends on it.
- **B19 — the camera redesign.** *On devrait designer quelque chose pour
  améliorer ce qu'on a déjà* — a design job on the existing fields, not the
  adoption of a foreign vocabulary. It waits because it touches Shot forms and
  component layout, and C4–C6 are about to move all of that: doing it first
  means doing it twice.
- The code-level token-efficiency audit and the roadmap reconciliation, as
  already scheduled.


---

### B8 rescoped — deferred 2026-08-17

With `translation` out, `promptCompiler` is the **only** remaining text-mode
consumer, so text mode no longer unblocks anything else and B8 stops being
"a mode plus two migrations". It becomes a family of tickets around the single
heaviest operation in the repository, and the user deferred it behind B11,
B6c2 and C0.

Two things make it heavy, both established by reading the code on 2026-08-17:

1. **The action does no database access at all.** The calling page assembles the
   context and passes it in (`GeneratePromptCompilerDraftInput.contextInput`),
   which is the opposite of the workspace's premise. Migrating it properly means
   new variables for reference images and their roles, cast assets, Asset
   Bibles, prompt segments and shot duration.
2. **The fingerprint.** `computePromptCompilerFingerprint` is a `JSON.stringify`
   of the whole assembled context, stored with a draft and recomputed later from
   live data by `evaluatePromptCompilerHandoff` to warn that a draft has gone
   stale. If the runner assembles the context internally, the adapter no longer
   holds the object to fingerprint — and the *checking* side calls
   `buildPromptCompilationContext` directly, so both sides must move together or
   they compare different things and produce false staleness warnings.

**The user chose the resolution in advance (2026-08-17): the runner exposes its
resolved context so the same fingerprint stays computable, rather than
redefining the fingerprint over the effective prompt.** The alternative was
rejected because it would invalidate every stored handoff on the day it ships.
The rejected shortcut — leaving the operation its externally-assembled context
and moving only the prompt build and the model call — is recorded as refused
too: it would create a second class of descriptor, "context handed in" beside
"context resolved by variables", contradicting §3.2 of the vision.

Two consequences worth stating. Phase C cannot start before steps 1 and 2: a
panel that still serves an unmigrated operation cannot be deleted. And the
prompt builders under `src/lib/prompts/` cannot be retired until a ticket first
re-anchors the A2 snapshots on the runner's own output — they are the frozen
oracle the descriptor proofs assert against byte-for-byte.
