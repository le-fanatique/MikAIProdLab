# LLM Workspace — Architecture Proposal

Status: proposal, not approved. Prepared for Codex ticket breakdown.
Date: 2026-08-12.
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
files that found them are not tracked:

- **Delete `getPromptCompilerPreset`** (`src/lib/prompts/promptCompilerPresets.ts:172`)
  — third confirmed orphan, zero callers. Deliberately left untested by A2:
  snapshotting dead code makes it harder to remove. Use the same evidence
  standard as the first two, including the `git log -S` step — a `grep` proves
  an export is unreferenced, only the history proves removing it is safe.
- **Fix the double punctuation in `composeShotPrompt`** — it joins sentences
  without checking whether a field already ends in terminal punctuation,
  producing `"Mara looks up., in a rooftop. Short summary text.. Handheld."`
  A2 froze the defect in a snapshot rather than fixing it, so the fix ticket
  must update that snapshot deliberately.
- **Decide where `src/lib/llm/translationPrompt.ts` belongs.** It is the only
  prompt builder outside `src/lib/prompts/`. Moving it is cosmetic; the real
  decision is whether the Phase B registry tolerates builders anywhere, which
  it must, per the discovery constraint above.

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

### 2. `context.userAdjustable` per template or per variable — **DEFERRED**

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
