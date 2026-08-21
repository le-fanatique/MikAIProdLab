# LLM Workspace — archived planning

**Archived 2026-08-21. Not in any reading contract.**

Two blocks moved out of `docs/LLM_WORKSPACE_ARCHITECTURE.md`, which had grown
to 2 033 lines. Both describe work that is finished; neither is deleted.

- **B0 to B6 — the ticket specifications.** All delivered. What they *decided*
  lives in sections 3 and 4 of the architecture, which are the durable
  reference; what they *planned* is here.
- **C1/C2 re-measured — the plan's lines are stale.** Its own title says it.
  Chantier 2 completed on 2026-08-20.

Open this deliberately, to recover why something was scoped the way it was.
Never as background. Sections 1 to 10 of the architecture remain the
reference, and §11.3 still holds the live queue.

---

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

---

### C1/C2 re-measured, 2026-08-19 — the plan's lines are stale

Measured after C0 landed, before writing a C1 ticket.

**C1 is already delivered in substance.** The plan reads *"Remove the 10 assist
panels in favour of the proposal component — ~2 541 lines replaced"*. That
replacement **already happened**, during B5 and the migration tickets:
`src/components/llmWorkspace/ProposalPanel.tsx` (326 shared lines) is imported
by **10 consumers today**, and what remains in each is per-operation glue
averaging ~146 lines — which action to call, what to label the button, how to
map a result into a draft, which commit binding to use. `StoryGenerationPanel`
is 76 lines of exactly that.

There is no pile of duplicated panel logic left to delete. Writing a C1 ticket
against that line would have produced either a no-op or a gratuitous rewrite.

**C2 as written is not possible.** The plan reads *"Remove the 15 LLM actions in
favour of runner + descriptors"*. Those actions are `"use server"` — they **are**
the RPC boundary through which a client panel reaches the server. `runOperation`
is server-only and a client component cannot call it. Removing them is not
deleting debt; it would be deleting the only door.

**What C1/C2 actually are, then.** Not removal — **unification**. Nine
per-operation panels and fifteen per-operation server actions collapse into one
descriptor-driven panel plus one generic server action taking a descriptor id.

And that shape is not speculative: **the bench already is it.**
`BenchRunPanel` + `runBenchOperation` run any of the 19 descriptors from one
surface through one action. The work is generalising a proven pair, not
inventing one.

**The Prompt Compiler's removal, done 2026-08-19 — and it is smaller than the
plan implied.** The beta judged its replacement better, which was the one thing
holding it back. But "remove the Prompt Compiler" turned out to name **two
different things**, and only one of them could go:

- **removable, and removed**: `PromptCompilerPanel.tsx`, its action
  `actions/llm/promptCompiler.ts`, and `promptCompilerSystemPrompt.ts` — each
  used by exactly one caller, ending at the Shot detail page's own card;
- **not removable**: `promptCompilerPresets.ts` is imported by
  `src/lib/comfy/workflowProfiles.ts`, which `AGENTS.md` protects;
  `promptCompilerHandoff.ts` and `PromptCompilerHandoffGate.tsx` are used by
  `ShotGenerationPanel`, `WorkflowProfilePanel` and the Shot map page — they
  resolve **which workflow node receives the text**, which is generation
  plumbing wearing the compiler's name; and `buildPromptCompilationContext.ts`
  has thirteen consumers, including `composeStoryboardShot` itself.

So the compiler's *preset vocabulary* and its *node handoff* leaked into the
generation path long ago. Prising them out is an untangling ticket that touches
`src/lib/comfy/`, not part of this removal, and it should be scoped on its own
terms rather than smuggled into a deletion.

#### The unification, scoped 2026-08-19 after the beta

Measured on the nine panels and the fifteen actions. **What each panel
hand-codes, its descriptor already declares:**

| The panel hard-codes | The descriptor already declares |
| --- | --- |
| which action to call | the descriptor id itself |
| a free-text box, a parameter input | `intent.freeText`, `intent.parameters` |
| how to shape the draft | `output` (`object` / `list` / `text` / `composite`) |
| whether Approve returns a value or redirects | `commit: ActionId[]` → `ACTION_REGISTRY[...].response` |
| what to do on Approve | `commit` + `ACTION_BINDINGS` |

Nothing in that column is a judgement call: it is all declared and already read
by `runBenchOperation`, which runs **all nineteen descriptors** through one
action and one panel today. Generalising it is not a design, it is a promotion.

**Split along what can be proven**, which is the same line every ticket this
session has followed:

- **the generic server action is provable.** It is server-side, node-testable,
  and `runBenchOperation` is the working prototype. Its tests look exactly like
  `narrativePromptCompose.surface.test.ts`;
- **the generic panel is not.** No DOM harness (the author's standing decision,
  re-confirmed by a beta that surfaced no interface bug), so `tsc` plus review
  is all there is.

**Therefore the order, and it is incremental rather than a big-bang:**

1. add the generic action **beside** the fifteen, with its own tests;
2. migrate **one panel at a time** onto it, deleting that panel's action in the
   same commit. Nine small, reversible steps instead of one rewrite of every
   assist surface;
3. once every panel is migrated, collapse the nine into the generic panel — by
   then the risky half is already done and proven.

The point of the order is that at no moment is more than one surface in flight.
The author validated these nine surfaces in his beta; they should not all move
at once.

#### Chantier 2 closed, 2026-08-20 — four things decided as "not doing"

Each was measured, put to the author, and **ruled on**. They are decisions, not
omissions, and a future ticket that meets one of them should read this rather
than reopen it.

**The 89 components that stayed flat are not debt.** C4's rule placed 31 by
evidence — an existing `lib`-domain import, or a matching folder. The rest have
neither, and a component that one page imports is not a domain member: it is
that page's component. Filing it would invent a structure the code does not
ask for, and a wrong domain is paid on every import afterwards. **A component
staying flat is a legitimate resting state.** A domain gets created when a
second consumer or a sibling appears — not before.

**The 11 components the rule would send under `comfy/` stay flat by
protection.** `AGENTS.md` guards that area because it is the generation
runtime. They work; the cost of leaving them is zero and the cost of touching
them is a broken generation path. The same holds for `promptCompilerPresets`,
which `src/lib/comfy/workflowProfiles.ts` imports. Recorded as **flat by
protection**, which is not the same as pending.

**The batch primitive is not built.** `BatchAssetDescriptionEnhancePanel` is the
last unmigrated panel; it drives the only `entitySet`-anchored descriptor, and
§11.3's own rule says a brick is worth building when **more than one** operation
waits on it. Exactly one does. The hand-written loop in its adapter works. If a
second `entitySet` operation ever appears, the brick becomes obvious and
worthwhile on that day.

**`SidebarLLMChat.tsx` is not split.** Chat is a deliberate migration exception,
so its 1 617 lines will not move again; splitting them buys navigability on
code that is finished.

**And the token-efficiency audit is replaced.** It was referenced as "asked for"
but defined nowhere. What actually became worth measuring is the fine-tuning of
B14's storyboard composition rules against real generations — opened as a ticket
in `docs/ROADMAP.md`, deliberately **not to be started until the author has
produced several sequences with the new composition**, since its whole value is
in real data.

#### C4/C5/C6 measured 2026-08-20 — and not started, on purpose

Measured before committing to the largest remaining item. Three findings, and
together they say this should not be done blind.

**C4 and C6 contradict each other.** C4 says *reorganise the flat components in
`src/components/`*; C6 says *migrate to `src/features/`*. Doing C4 first means
grouping 131 files into `src/components/<domain>/` and then moving the same 131
into `src/features/<domain>/` — every file moved twice, every import rewritten
twice, for one end state.

**The taxonomy is a product judgement, not a mechanical one.** 64 of the 131 fall
into obvious name prefixes (Sequence, Workflow, Asset, Shot…), but the hard
cases are the ones that matter: is `AssetGenerationPanel` the LLM domain or
image generation? Is `CastingPanel` casting or assets? Getting those wrong bakes
a bad structure into the repository, and the imports make it expensive to
revisit. **Only the author can answer them**, and the existing folders
(`cameraLab`, `projectStyle`, `theme`…) show he already has opinions about where
things belong.

There is no large unambiguous slice to do meanwhile: exactly **two** flat
components obviously belong to an existing folder. That is not worth a
restructuring ticket.

**C5's premise is already satisfied.** It reads *"Break up large UI files
hosting assist surfaces — they shrink first"*. They shrank: the assist panels
now hold presentation only, after the unification moved their plumbing behind
one action. What remains large is a different set — `SidebarLLMChat` (1 617
lines, a deliberate exception), `EditorialTimeline` (1 086),
`ShotGenerationPanel` (1 059) — none of them an assist surface. C5 as written
has no subject left; splitting those three is a new ticket with its own
justification, and two of them are client components with no test harness.

**So C4/C5/C6 waits for one decision from the author: the target structure and
the domain boundaries.** Everything else in the cleanup is done.

#### C3 measured and partly done, 2026-08-20

The plan reads *"Convert the 25 prompt builders into declarative templates"*.
**That conversion already happened** — during B3, when each operation's prompt
moved into its descriptor's `expertise.system` and `template` blocks. What was
left was the deletion, and C0 is what made it safe by freezing the oracle those
builders were.

Measured on the real import graph (comments excluded, which matters — several
builders look consumed but are only *mentioned* in a descriptor's header):
**six builders had no production consumer at all**, kept alive solely by their
own unit tests.

`story-from-pitch`, `outline-from-story`, `asset-bible-from-context`,
`asset-description-from-context`, `assets-from-project`,
`casting-from-sequence` — 998 lines with their tests — deleted. The behaviour
they used to prove is proven by the descriptor equality tests C0 re-anchored,
which is exactly what C0 was for.

**The rest stay, and are not debt.** `compilePromptSegments` (nine consumers),
`buildPromptCompilationContext` (seven, including `composeStoryboardShot`),
`compileShotPrompt`, `defaultShotPrompt`, `composeShotPrompt`,
`buildSequenceGenerationPackage` and the sequence prompt builders are live
production code, not superseded builders. `promptCompilerPresets` and
`promptCompilerHandoff` are the untangling ticket of their own, since they reach
into `src/lib/comfy/`.

So C3 is complete for what it actually named. Whatever remains under
`src/lib/prompts/` is either in use or blocked behind that untangling.

#### The unification, done 2026-08-19 — and where it stops

**Thirteen of fourteen panels migrated.** `src/actions/llm/` went from nineteen
files to twelve, and every migrated panel now names its operation instead of
importing a function for it. `runWorkspaceOperation` is the single boundary.

**The acceptance criterion held throughout: not one refusal message changed.**
Across thirteen migrations, every declared refusal — "Project not found.",
"Add a pitch first.", "Select at least one asset type." — passes untouched,
because they come from the descriptors that declare them. Success assertions
changed shape, never value.

That criterion also caught a defect in the unification's own brick:
`mapListItemToModelKeys` emits only *declared* fields, so anything a
`postResponse` form attaches — `casting.fromSequence`'s `alreadyAssigned` —
was being dropped in silence. Fixed in `7ee0ed0`, found by the rule rather than
by review.

**One panel is deliberately left.** `BatchAssetDescriptionEnhancePanel` drives
the only `entitySet`-anchored descriptor in the registry, and the loop over that
set lives in its adapter — the runner has never honoured an `entitySet` anchor
as a set. Moving that loop into the generic action would also move per-asset
database enrichment there, which means a branch on the operation inside a file
whose whole contract is that it has none.

§11.3's own threshold decides it: *a brick is worth building when more than one
operation waits on it.* Exactly one does. So the batch primitive is **not**
built, and this is recorded as a measured decision rather than an oversight.

**And the ninth step — collapsing the panels into one generic component — is
not obviously worth doing any more.** It was scoped when the panels were
believed to hard-code what their descriptors declare. After migration, what
remains in them is 88 to 399 lines of **presentation**: layout, selection state,
display types, per-operation shaping. The descriptor declares an output's
*shape*, never how to display it. Collapsing would trade nine working, specific
surfaces for one generic renderer that no test in this repository can protect.

The plumbing goal — fifteen adapters becoming one action — is achieved. The
remaining step is a different project, and it should be judged on its own terms
rather than inherited from this plan's original wording.

**A cost worth naming.** Four list panels moved their display shaping (the
`"" -> null` fill-backs) out of node-testable adapters into client components.
That shaping is no longer under test, and this repo has no DOM harness by the
author's standing decision. The exposure did not grow — those panels were never
tested — but coverage that existed incidentally is gone. It is the second
concrete price of that decision this session.

**But it rewires nine production surfaces**, which is a poor thing to do
immediately before the author's from-scratch beta. Recommended order:

1. the **independents** — `ThemeModeToggle.tsx` (1 835 lines),
  `src/actions/sequenceVideoSplit.ts` (1 828), the large storyboard and
  editorial files. They touch none of this and are pure gain;
2. the **beta**, on a product whose surfaces have not just moved;
3. **then** the unification, and the Prompt Compiler's removal with it — the
  author decided 2026-08-19 to keep the Prompt Compiler until the beta has
  judged its replacement.

C3 (prompt builders → declarative templates) is unblocked by C0 and can run at
any point after it; C4/C5/C6 are reorganisation and want the unification done
first, since it is what makes ~10 components disappear.
