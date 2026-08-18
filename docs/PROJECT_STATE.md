# MikAI Project State

Last updated: 2026-08-13

## Repository Heads

## LLM Workspace Phase A — COMPLETE (2026-08-13)

Phase A of `docs/LLM_WORKSPACE_ARCHITECTURE.md` §9 is delivered, committed and
pushed. It was the "work that will not be redone" gate before the workspace.

| Item | Commit | Result |
| --- | --- | --- |
| A1 — schema split | `0074f2e` | `src/db/schema.ts` → 13 domain modules + barrel; `db:generate` reports no schema change |
| A4 — LLM operations inventory | `6a730b6`, `f31416a` | `docs/LLM_OPERATIONS_INVENTORY.md`, 26 rows |
| A3 — orphan deletions | `6a730b6`, `ba41bb3` | `sequences-from-story.ts`, `generateAssetDescriptionDraft` |
| A2 — snapshot tests | `cfc8745` | **first test suite in the repository**: 22 builders, 99 tests, 86 snapshots |

Also pushed in the same window: `82428bd` (ignore local `.agents/` material),
`22208b8` (ComfyUI `PrimitiveString` write fix), `0949d48` (pnpm 11.7.0 in the
OpenReel start command), `6bf2abd` (project tab order, Editorial Actions above
the timeline). The last three were authored directly by Codex outside the
supervision loop and validated manually by the user before commit.

**New durable capability:** `npm test`. The repository had no tests before
`cfc8745`. Any change to a prompt builder now fails a snapshot instead of
passing silently.

**The two frozen defects are now fixed (2026-08-13)**, together with the third
independent item, in the follow-up pass on
`docs/LLM_WORKSPACE_ARCHITECTURE.md` §9 "Independent": `composeShotPrompt` no
longer emits double punctuation (its frozen snapshot was updated deliberately,
the other two are untouched), the `getPromptCompilerPreset` orphan is deleted,
and `translationPrompt.ts` stays in `src/lib/llm/` by decision — prompt builder
location carries no contract. The suite is 100 tests.

## LLM Workspace Phase B — B0 to B9b COMPLETE (2026-08-16)

Delivered, committed, pushed, and validated manually by the user on the real
application after each production switch.

| Item | Commit | Result |
| --- | --- | --- |
| B0 — write coverage | `9ffd15f` | 38 tests, first **database-backed** test capability: a disposable migrated SQLite per test file |
| B0b — the two writes B0 missed | `e2f21ff` | `applyGeneratedStory`, `applyGeneratedOutline`; unblocked `src/actions/llm/` under vitest with a `server-only` stub |
| B1a — the frozen contract | `ceb24dd` | descriptor format, closed variable registry, `userAdjustable` settled per variable |
| B1b — the eight descriptors | `3da4134`, `7cff4ab` | thirteen variables; the three Asset operations share one declared context |
| B1c — descriptors carry their prompt | `907604c` | strict `toBe` equality against every builder; caught three drifted system prompts |
| B2 — the runner | `5415c66`, `fbc632f` | one §2.1 pipeline, 8 operations, **the runner names no operation** |
| B3 — the switch | `5f11464`, `0b40a74` | the 8 actions became thin adapters; ~1150 lines of replaced code deleted |
| B4a — the declaration | `33a289f` | seven declared entries, `ActionId` closed into a union, each entry's `columns.written` verified against a real full-row diff |
| B4b — the resolution | `89768f7` | `actions/bindings.ts`: `ActionId` resolves to the real Server Action; the 7 Approve-side callers switched |
| B5 — the proposal component | (this ticket) | `ProposalPanel` + `proposalCommit.ts`; 6 panels collapsed onto one Approve/Redo/Cancel engine, net −408 lines |

The suite went from 100 tests to 263. No A2 snapshot moved in any of these
tickets, and no exported signature or user-visible message changed.

**What B4b decided by refusing to decide.** A uniform commit call —
`commitOperation(descriptorId, ids, values)` — was deliberately not built. The
seven actions' conventions are not reducible to a descriptor's output values:
`replace|append` mode, `returnTo`, the two fields `updateAssetDetailsInline`
replaces without generating, the batch's item list. A uniform shape would have
meant inventing an options bag with no consumer to constrain it. **That call
shape is B5's to define**, from what the proposal component actually needs.

The refusal is also what kept the switch free of visible change. `updateShotPrompt`
and `updateSequencePrompt` are consumed as `<form action={...}>`; the binding
holds the Server Action reference itself, so form identity, no-JS submission and
the server-side redirect are structurally unchanged. A client-side wrapper would
have destroyed all three. Consequently the entire non-regression claim reduces to
reference identity (`toBe` against each module's own export) — no behavioural
re-proof of the seven actions was needed, they already have their own files under
`tests/actions/`.

Known limit, carried into B5: no test in this repository exercises the compiled
browser path of those two forms. `npm run build` proves they bundle, not that they
submit. The user validated all seven Approve paths manually on 2026-08-13.

**What the phase produced beyond the code.** Seven gaps in the descriptor
format were found and closed *before* anything was wired to production, each
because the executor stopped and reported instead of working around it:
`intent` composability, the closed mode with preconditions, per-variable
adjustability, the JSON key mapping and per-operation parse contracts, the
per-operation refusal messages, multi-field preconditions, and silent
truncation. A format that had been guessed would have failed at the switch.

**Deliberate retention, not debt.** The prompt builders under
`src/lib/prompts/` no longer have a production caller. They are kept as the
frozen oracle: the A2 snapshots pin them, and the descriptor proofs assert
byte-for-byte equality against them. Retiring them needs a ticket that first
re-anchors those snapshots on the runner's own output.

**Known environment instability.** `vitest` intermittently fails *every* file
at once with `Vitest failed to find the runner`, reported as "53 failed" or
"no tests". It has hit files untouched for weeks, so no repository code is
implicated; one captured occurrence showed a lowercase drive letter in the run
header. It always fails loudly and has never produced a false green. **Read the
log before rerunning** — a real failure names a file and an assertion. Prefer
redirecting vitest output to a file over piping it.

**What B4 inherited, and declared rather than fixed.** Four behaviours measured
in B0 and frozen by tests, not fixed — each now appears in its B4a registry
entry as the contract, arbitrated by the user on 2026-08-13: the batch asset-description write is not atomic and applies partially;
it answers `ok: true` having applied nothing when every item is refused;
`updateAssetDetailsInline` is a full replacement that nulls omitted fields; and
ownership check and mutation are not transactional on any of the five. Plus
`applyGeneratedStory` and `applyGeneratedOutline`, which never check that the
Project exists. Each must appear in its registry entry, or the registry will
describe an action it has mis-modelled.

**Phase B is not authorised by this**, but nothing in §10 blocks it either.
Migration order is settled, `userAdjustable` is deferred to the
descriptor-format work, Auto Casting is off the critical path, and the
Settings-naming question dissolved: `FB-20260715-013` is an unpromoted
`USER_FEEDBACK` observation, and the workspace's bench and variable library
likely supersede it. Phase B now needs a prepared ticket, not another
decision.

### `LLMW.BATCH.OUTCOME.1` — the batch stops lying about its outcome (2026-08-14)

The batch Asset-description panel painted every `ok: true` answer green, so a
batch that saved nothing displayed `Batch replaced: 0 assets updated. 5 failed.`
as a success. Registry behaviours 1 and 2 (not atomic; `ok: true` with
`applied: []` when every item is refused) are the arbitrated contract and were
**not** changed — `src/actions/assets.ts` and `registry.ts` are absent from the
diff. Only what the interface says about that answer changed.

Three outcomes, three tones, arbitrated by the user: all applied stays green,
partial is amber (`N of M updated`), nothing applied is red and says no changes
were saved. Failures are listed by Asset name with the action's own reason,
resolved from the `assets` prop already in hand.

`resolveBatchApplyOutcome` is a pure function outside the client component
(`.claude/rules/frontend.md`), and that is what makes the ticket provable: the
"nothing applied" case is unreachable from the interface — the panel only lists
the current project's Assets, so every one would have to be refused. It is
covered by unit tests instead of by a claim. Suite 274 → 279. The nominal
Replace/Append paths were verified in a real browser on the disposable
`ZZ-TEST-PLAYWRIGHT` Project (named `ZZ-B5-PLAYWRIGHT-TEST` at the time); partial and nothing-applied are recorded as
not tested there, deliberately, rather than forced.

Known unreachable edge, left alone on purpose: `resolveBatchApplyOutcome([], [])`
would render `No changes were saved. 0 assets failed.` The action refuses an
empty batch upstream, so adding a branch with no caller would be debt.

### B5 — the proposal component, object mode (2026-08-14)

`LLMW.PROPOSAL.COMPONENT.1`. One `ProposalPanel` (Approve / Redo / Cancel)
now backs the **seven mono-entity operations** (`anchor.kind === "entity"`);
`assetDescription.batch` (`entitySet`) is untouched and still calls
`ACTION_BINDINGS` directly. Six panel files collapsed onto it: 8 files
modified, 3 added (`ProposalPanel.tsx`, `actions/proposalCommit.ts`,
`tests/actions/proposalCommit.test.ts`), +469 / −877. Suite 263 → 274.

**The two things B4b deliberately left open are now closed.**

*The commit call shape.* There is no single uniform signature, and the ticket
proved why rather than assuming it: `updateAssetDetailsInline` and
`updateAssetDescriptionFieldInline` take an object,
`applyGeneratedStory`/`applyGeneratedOutline` are positional, and the two
prompt actions take `FormData`. `proposalCommit.ts` holds one adapter per
entry, each typed `Parameters<typeof ACTION_BINDINGS[K]>`, so a signature
drift fails `tsc` instead of a production Approve click. It covers the seven
mono-entity entries **and only those** — the batch item list is not in the
payload, because the `entitySet` entry has its own migration. B4b's refusal
was right: the shape could only be written once a consumer constrained it.

*Post-Approve.* Arbitrated by the user on 2026-08-14, and **derived from the
`response` field `registry.ts` already declares** — no second field was added.
`redirectOnly` renders `<form action={binding}>` with adapter-built hidden
fields, so the server `redirect()`, form identity and no-JS submission stay
structurally intact (exactly what B4b protected). `returnValue` calls the
binding then `router.refresh()`. The four inconsistent behaviours that existed
before — server redirect, `window.location.href`, `router.refresh()`, and
*nothing at all* — collapse to two, chosen by declaration rather than by
accident. Asset Bible's `?bibleUpdated=1` round trip is gone, replaced by a
local confirmation; the searchParam plumbing was removed in the same diff.

**The defect the automated battery could not see.** `tsc`, the full suite and
`npm run build` were green on all three passes. The user found by hand what
none of them could: after Approve, the asset Description/Notes fields kept
their stale value until F5. Cause — `AssetInlineDetailsForm` seeded state with
`useState(initial ?? "")`, a mount-time-only seed, and `router.refresh()`
re-renders with fresh props but never updates state React already owns. The
old code hid this: Asset Bible did a full `window.location.href` reload.
Fixed by the repository's own existing pattern (`OutlineEditorForm.tsx:21-23`,
`StoryFoundationEditor.tsx:34-36`) — a per-prop resync `useEffect` — applied to
**all five** fields, since Asset Bible writes the other three through the same
display component and was silently exposed to the identical defect.

Accepted trade-off, identical to Outline and Story Foundation: an unsaved edit
in one of those five fields is overwritten by the server value on the next
refresh. The five new `useEffect`s trip `react-hooks/set-state-in-effect`;
verified to be pre-existing repository drift, since the two unmodified
reference files fail the same rule. Reproducing the established pattern was
preferred to inventing a second one for the same problem.

**The lesson worth carrying, not the bug.** B5 is the first Phase B ticket
whose result lives in the browser, and Phase B has no tooling for that. The
supervisor named the gap as a residual risk and closed the verdict on green
checks; it was an outright blind spot — Playwright was available the whole time
and simply was not used. **From now on, any ticket visible in the product gets
a Playwright pass — delegated to a Sonnet subagent to contain the token cost —
before a verdict.** Note that the seven Approve paths write to the live
database, so the pass writes only into the **standing test Project**, never into
real data.

**The standing test Project.** `ZZ-TEST-PLAYWRIGHT` (id 999005) is kept on
purpose and reused by every browser pass, decided by the user on 2026-08-14:
re-creating a Project, an Asset, a Sequence and a Shot at the start of each pass
was burning a large share of the subagent's tokens for no added proof. Find it
by name, do not create a second one. It currently holds three Assets, one
Sequence and one Shot.

Two consequences a pass must account for rather than be surprised by: it
accumulates state between passes — its Assets already have descriptions and
notes, so precondition-gated affordances (`Select Missing Descriptions`, the
Enhance/Rewrite modes that need an existing value) will not be in their
first-run state — and anything it needs beyond that, it adds there rather than
elsewhere.

B5 itself was validated that way before commit, on a disposable
`ZZ-TEST-PLAYWRIGHT` Project (named `ZZ-B5-PLAYWRIGHT-TEST` at the time): all nine cases passed — the five in-place
refresh paths update without a reload, the two `redirectOnly` paths do navigate
(`?shotPromptSaved=1` / `?sequencePromptSaved=1`), Asset Bible's Apply leaves
Description and Notes intact rather than nulling them, a double click on
Generate starts one generation, and Discard writes nothing. The only console
errors come from a local antivirus script and the hydration warning it causes,
on every page, unrelated to this code.

**Deliberate scope line.** `ProposalPanel` owns the proposal phase and the
generic trigger chrome (trigger row, loading, error, not-configured message);
the trigger *definitions* stay in the six wrapper components, which remain
genuinely heterogeneous. Two adapters (`buildApplyGeneratedStoryArgs`,
`...OutlineArgs`) are identity passthroughs; kept for a uniform typed surface,
not to be multiplied.

Known limit, unchanged from B4b: `tests/actions/proposalCommit.test.ts` proves
the hidden-field keys against a hardcoded list, not against `shots.ts` itself,
so a simultaneous rename on both sides would still pass.

### B6a — templates become storable, and the list appears (2026-08-14)

`LLMW.STORAGE.1`, the **first of three** tickets B6 was split into by the user:
B6a storage + list, B6b the read-only three-pane bench (resolved context and
effective prompt, no LLM call), B6c Run + right pane + variable library.

**The scope decision that shapes everything after it.** Arbitrated by the user
on 2026-08-14: **code stays the source of truth.** The eight descriptors remain
TypeScript and keep serving production untouched; `runner.ts` was not modified
and still reads no database. `llm_templates` holds only what the workshop
creates or imports. The list shows both origins — the eight code descriptors
read-only, the rows editable. What this protects is concrete: the seven Approve
paths the user validated by hand on 2026-08-13, and the byte-for-byte descriptor
proofs against the frozen prompt builders, both survive the ticket untouched.

**Schema and migration authorisation** (§4.2 requires it in the ticket itself)
was granted for exactly one table and one generated migration —
`drizzle/0050_mighty_lockheed.sql`, `llm_templates`, `project_id` nullable with
`ON DELETE set null`. `llm_knowledge_documents` was **deliberately deferred**:
all eight descriptors declare `knowledge: []`, so the table would have had no
reader. `anchor_kind` is the one authorised denormalisation, so the list and
B6b's entity picker can filter without deserialising every row.

**The validator is the ticket's real proof.** `templateStorage.ts` is pure and
checks membership in the closed registries — variable ids, action ids, entity
kinds, and **every render form a block references**, read from
`variables/registry.ts`'s four tables rather than copied. This matters because
`runner.ts:307-341` *throws* on an unknown render form: without the validator,
an imported template naming a nonexistent one would only detonate at Run, in
B6c. It reads the registries instead of duplicating them, so it cannot drift.

**What the supervisor's own review caught, and the automated battery did not.**
`tsc`, 301 tests and `npm run build` were all green on the first submission, and
`projectId` was nevertheless unreachable from the product: both creation paths
wrote `null` outright, and `updateLlmTemplateMetadata` — the only write that set
it — had no caller outside tests. A dead column, a scope badge permanently
reading `Global`, an unused join, and a production export with no caller. The
cause was a hole in the ticket, which specified the write without the control
that triggers it. Fixed with a plain `<form action={...}>` per row (a project
`<select>` plus "Global", hidden `name`/`description` so changing scope does not
wipe the row), plus runtime validation of `projectId` before the write — a
non-integer or a nonexistent project now redirects with a message instead of
letting `foreign_keys = ON` (`src/db/index.ts:22`) throw a 500.

**Two browser passes, both on the standing test Project.** The first covered the
Settings entry point, the eight built-ins, duplicate, scope round trip to
`ZZ-TEST-PLAYWRIGHT` and back, export (200, `attachment`, indented JSON), a 404
on an absent id, and delete. The second covered the one production path the
first left unproven — **import** — as a genuine round trip: the fixture was the
file the product had itself exported, and a second fixture, the same JSON plus a
block naming a nonexistent render form, was **refused** at import with "This
file is not a valid LLM template." That is the validator proven end to end
rather than claimed. Suite 279 → 303. The table was left empty both times.

**Note for later passes.** The `/settings` card lives under the **Language
Model** tab, not the default Appearance tab.

### B6b — the bench, in read-only form (2026-08-14)

`LLMW.BENCH.READ.1`, the second of B6's three tickets: the §5.1 three-pane
bench with **no LLM call**, the §5.3 entity picker, and no right pane.
`FB-20260716-035` is answered — the effective prompt stops being a black box.
`/settings/llm-workflows/[templateId]` resolves both origins: an integer
segment addresses an `llm_templates` row, anything else a `DESCRIPTORS` key.

**The pipeline was already there.** `resolveOperationPrompt` — runner steps 1
to 5, no model call — has existed since B2. The bench needed two things it did
not give, and `runner.ts` was changed in exactly three authorised ways and no
more: a `requireLlmConfig` option (default `true`, production untouched), a new
`resolveOperationPreview` export returning the per-variable resolved data
alongside the prompt, and `requiredIdKeys` exported as `requiredAnchorIdKeys`
so the picker reads the one anchor→required-levels table instead of copying it.
`resolveOperationPrompt` and `runOperation` keep signature and behaviour, and
the proof is a test, not a claim: with no LLM configured the former still
refuses with `messages.notConfigured` while the preview succeeds.

**Read-only by construction.** No Run button, no `ProposalPanel`, no variable
library, no write path, no schema change, no migration, no new dependency.
`llm_knowledge_documents` stays deferred. `intent.freeText` was deliberately
not built: none of the eight descriptors declares it, so a control for it would
have been untestable dead code — B6c's, if ever.

**What the automated battery could not see, again.** `tsc`, 333 tests and
`npm run build` were green on a first delivery carrying two selector-state
defects, both found by reading the diff: the shot list was queried from the
unvalidated `sequenceId`, so after a project switch the Shot `<select>` still
listed the previous project's shots while Sequence had gone back to empty (the
*resolution* was correctly blocked — `normalizeBenchSelection` had already
dropped both — so the screen showed a state that did not exist rather than
wrong data); and the Mode `<select>` reset to `defaultMode` on every Apply made
while the selection was still incomplete, wiping the user's choice exactly while
they worked down the cascade. Both fixed, both then verified in a browser.

**Every decision is a pure tested function**, none of it inside the Server
Component: `parseTemplateRef`, `normalizeBenchSelection`, the search-param
parsers and `buildVariablePreviewRows` in `bench.ts`, plus `estimateTokens`.
Suite 303 → 333.

**Token cost is an estimate and says so.** `Math.ceil(chars / 4)`, rendered
everywhere as `~N tokens (est.)` beside the exact character count. No tokenizer
is a dependency of this repository and this ticket authorised none.

**Sixteen enumerated browser paths, sixteen PASS**, on the standing test
Project. All four anchors plus the `entitySet` case, all eight built-ins, and
the stored-row path end to end (duplicate → `Stored` badge → resolve → delete,
table left empty). The proofs worth keeping: the intent parameter genuinely
reaches the prompt (blank gives `"Choose a natural number of sections based on
the story structure (typically 4 to 8)."`, 6 gives `"Write exactly 6
sections."`); a precondition refusal renders instead of crashing (`"A Shot
Prompt is required for this assist mode."`); and both an unknown textual id and
an absent numeric one answer 404, never a 500. Two built-ins were missing from
the first pass and were covered by a second — what a scenario does not
enumerate does not get tested, which is now the third ticket in a row where
that held true.

**Known limit.** The page itself has no automated test: this repository has no
precedent for testing a Server Component. Its proof is the browser pass, not a
test file. Also deliberate: `parseTemplateRef("12abc")` resolves stored row 12,
reproducing the export route's own `parseInt` convention rather than fixing it
on one side only — tested as such.

B6c remains: the Run button, the right pane on `ProposalPanel`, and the
variable library (§5.2).

### B6b follow-up — the cascade fills itself (2026-08-14)

`LLMW.BENCH.CASCADE.1`, from the user's first hands-on trial of the bench
(`FB-20260814-001`). B6b's entity picker was a server-rendered
`<form method="get">` with an explicit `Apply`, so choosing a Project left the
Sequence list empty until the form was submitted — the data was never missing,
but nothing said a submit was needed, and `Apply` reads as "run the preview".
The five `<select>`s now submit on change through one shared
`AutoSubmitSelect` client component that renders and submits and holds no
business logic; `intent.parameters` inputs keep their manual `Apply`, which
also remains the no-JavaScript path.

`Mode` was included beyond the literal request, on the argument that leaving
one select manual is worse than either behaviour applied throughout. Rejected
on the way: loading every Project's Sequences and Shots up front to filter in
the browser.

No test was added — the component renders and submits, there is nothing pure to
cover, and a decorative test would have proven nothing. Thirteen browser paths,
twelve PASS: the cascade fills with zero `Apply` clicks at every anchor level,
and **both of B6b's review fixes still hold** under a regime that exercises
them far more often (no shot of the previous Project survives a Project switch;
a chosen mode survives an incomplete round trip). The thirteenth, the
no-JavaScript fallback, is reasoned rather than proven: the tooling offers no
safe way to disable JavaScript, and the pass refused to reach for an
arbitrary-code-execution tool to force it.

### B6c1 — the bench executes and applies (2026-08-14)

`LLMW.BENCH.RUN.1`. B6c was split in two by the user before implementation:
**B6c1** is the Run button, the right pane on `ProposalPanel`, and an Approve
that really writes; **B6c2** is the variable library (§5.2), still to do. The
argument for splitting: only one of the two writes to the database, and it
deserved its own diff review and its own browser pass rather than sharing them
with a read-only surface.

**The question B6a and B6b both left open is now closed.** Neither ticket could
show that a stored template actually executes — B6a wrote `llm_templates`, B6b
read it for the workshop, and no path ran it. The mechanism needed no
invention: `loadBenchDescriptor` resolves the descriptor from both origins (a
`DESCRIPTORS` key, or an `llm_templates` row through
`validateLlmTemplateJson`), `runBenchOperation` calls `runOperation` on **that
same variable**, and `commitBenchProposal` writes through the descriptor's own
`commit`. Proven in the real database: a row duplicated from `story.generate`
was executed and applied on the standing test Project.

**What is still deferred, and must not be read as done**: §6 Product
Integration. No product screen invokes a stored template by identifier; the
eight production operations remain wired to their TypeScript descriptors. The
proof runs through the workshop, not through production.

**No second adapter layer, and the check that decided it.** The fear was that a
generic bench Approve would duplicate `proposalCommit.ts`. It does not, because
`updateShotPrompt`'s `returnTo` is entirely caller-supplied
(`src/actions/shots.ts:588-590`): the bench passes its own URL, so both
`redirectOnly` paths reuse B5's hidden-field builders unchanged and come back
to the bench with the selection intact — the server `redirect()`, form identity
and no-JS submission that B4b protected all stay structurally untouched.
`buildAssetBibleCommitArgs` already took the `existing*` values it needs. The
dispatch is on `ActionId`, exhaustive, so an eighth id would fail `tsc`.

**The write guard, and why it exists.** Approve is a request distinct from the
Run that resolved the preview, and two of the seven commit actions
(`applyGeneratedStory`, `applyGeneratedOutline`) verify nothing themselves
(registry behaviour 5). `runner.ts` therefore received its fourth authorised
change since B2, and only that: `loadAndVerifyChain` exported as
`verifyAnchorChain`, body untouched. One ownership-chain table, not a copy.

**`preservedAssetDetailColumns` is the ticket's quiet load-bearing piece.**
`updateAssetDetailsInline` replaces all five columns on every call and turns a
blank one into `null` (registry behaviour 3), while `assetBible.generate`
declares only three. The columns to carry through are derived from
`ACTION_REGISTRY`, not hard-coded, and the proof is asserted twice: in
`tests/actions/benchCommit.test.ts`, and in the browser, where the Asset's
`description` (925 chars) and `notes` (1113) were re-read intact after Approve.
Without it, two columns would have been erased in silence.

**Deliberate scope lines, stated rather than hidden.** The bench's Approve is
`replace` only — `append` is native on one action and pre-computed by the caller
on two others, production-panel ergonomics the workshop does not need. The
`entitySet` batch descriptor offers Run but refuses Approve, with the reason
visible **before** the Run so no model call is paid to learn it. No LLM
pre-check: an absent configuration surfaces through the Run error with the
descriptor's own `notConfigured` message, exactly as Shot/Sequence Prompt do in
production.

**What diff review caught that the green checks did not.** `tsc`, the full
suite and `npm run build` were green on the first delivery, which nonetheless
carried two dead fields, a stale "click Apply" instruction (false since
`ca46847` made the cascade auto-submit), a `returnTo` that re-injected the
current query so the URL grew by one confirmation parameter per Approve, and a
batch refusal only visible after a paid model call. All four fixed; the
exclusion list for `returnTo` was read off `shots.ts` and `sequences.ts` rather
than guessed, and lives in a tested pure function. This is the fourth ticket in
a row where the automated battery was green on something a diff read found.

Suite 333 → 346. Two browser passes on `ZZ-TEST-PLAYWRIGHT`: sixteen of
seventeen enumerated paths, then five of five on the corrections — including
two successive Approves returning byte-identical URLs, which is what proves the
accumulation gone. Writes were verified in the database afterwards to have
stayed inside project 999005, with `llm_templates` left empty.

**The one path not proven, kept as such.** Checking that no shot of the previous
Project survives a Project switch could not be exercised: the permission
classifier blocked navigation to a real production Project, and the pass refused
to force it. It is a B6b non-regression control, and the code concerned is
verified untouched by diff review — covered by reading, not by the browser.

### B7a — the list output contract, and the wall it found (2026-08-15)

`LLMW.OUTPUT.LIST.1`, first ticket of the order the user settled on 2026-08-15
(§11.3): list mode and its migrations before text mode, B6c2, the editor and
Phase C.

**Why the contract had to come before the component.** "List mode in the
proposal component" could not be the first ticket: `RunOperationResult` was
`{ ok: true; values: Record<string, string> }` — a flat string map that cannot
hold a list — and `parseOutput` turned any array into `{}`. The component would
have had nothing to consume. `output` is now a union discriminated on `kind`,
`RunOperationResult` likewise, and `parseOutput` dispatches to a list branch.
The eight existing descriptors gained `kind: "object"` and nothing else; no
visible message changed and no A2 snapshot moved.

**The ticket's real product is a finding, not code.** It was written to make the
executor stop and report format gaps rather than flatten them — the mechanism
that produced Phase B's seven format corrections. It produced six, two of which
decide what happens next.

*`castingSuggestions` is not describable, and not for a format reason.* Its item
validity rests on an enum and two integers, which no string-field rule can
express. More decisively, `generateCastingSuggestionsDraft` performs, **after**
parsing, a validation and enrichment against the live database: it filters
model-hallucinated ids by looking them up in the project's real shots and
assets, computes `alreadyAssigned`, and rewrites names from the existing rows.
No field declaration can express a database lookup. This is not a hole in the
output format — it is a resolution step that does not belong in a description
of output at all.

*Five declarative gaps, all needed for a behaviour-preserving migration:*
numeric item fields (`duration_seconds`, `order_index`) that
`Record<string, string>` cannot carry; a same-field fallback across two JSON
keys (`assetType ?? asset_type`); enum fields with a silent default; a default
that depends on the item's index in the array; and a sort of the whole list
after parsing. Without them a migration would change observable behaviour,
which B3 was forbidden to do.

**What the four parsers agree on**, and what the format therefore adopts: an
invalid item is filtered, not fatal; an empty result after filtering refuses the
whole response; an over-long string field is always silently truncated and never
refused — so the list branch has `truncateTo` and no `maxLength` counterpart,
unlike the object branch; and each operation keeps its own three refusal
messages, never unified.

**The defect the green checks did not show.** `validateLlmTemplateJson` had not
followed the format: it still checked `output` as if it had one shape and never
looked at `kind`, while claiming to return an `OperationDescriptor`. That
reopened exactly the gap B6a exists to close — an imported template that only
detonates at Run — on a real path, since hand-editing and importing JSON is
currently the only way a user can author their own workflow. Fixed by
dispatching on `kind` first, refusing an absent or unknown `kind` outright with
**no silent fallback to `"object"`**, and validating the list shape by
membership (a `validity` field must be declared in `item.fields`), the same
principle B6a already applied to render forms. A round-trip test over the eight
built-in descriptors now makes format and validator unable to drift apart in
silence.

Suite 346 → 366. Four browser paths, four PASS: the bench surface shipped that
same morning is unregressed, and a valid `kind: "list"` template is accepted at
import and opened in the bench without crashing, showing "List-output templates
cannot be inspected here yet." rather than its output fields.

**Two false alarms worth recording, both the supervisor's own doing.** The first
browser pass reported the list import refused — the supervisor's test JSON used
`notAnArray` where the format declares `notArray`; the validator was right. It
also captured a server-side `ReferenceError: isBenchReturnToQueryKey is not
defined`; the import is present, `tsc` and the build pass, and the page stopped
producing it — the cause was running `npm run build` twice against the live dev
server, which rewrites `.next` underneath it. **Do not run a production build
against a running dev server**, or expect a corrupted chunk and a phantom
defect.

**This ticket blocked the next one.** B7b was to write four list descriptors.
There are at most three, and they needed the five format extensions first. The
user arbitrated on 2026-08-15: B7b ships the extensions, the descriptors move to
B7c. Closed by the section below.

### B7b — the six gaps closed, and the test that was lying (2026-08-16)

`LLMW.OUTPUT.LIST.2`, commit `12fdcc7`. The six declarative gaps B7a found are
now expressible: numeric item fields, a second JSON-key fallback, an
enum-with-default, a default seeded from the item's own array position, a
post-parse sort of the whole list, and **the selection declaration** — which
`FormData` key carries the subset the user keeps at cherry-pick.

**Item fields became a union discriminated on `type`**, mandatory on every
entry, with no silent fallback to `"string"` — the principle B7a had already
applied to `output.kind` itself. `RunOperationResult`'s list items widened to
`Record<string, string | number>`, the point B7a signalled without being able to
model.

**Three shapes were read off the source rather than designed.** Numeric bounds
are `exclusiveMin` and `max` because `sequenceShots` accepts `duration_seconds`
at `> 0 && <= 120` — one strict bound, one inclusive, and no parser evidences an
inclusive lower one. A numeric field must declare whether an invalid value is
omitted or seeded from the index, because both behaviours exist in production
and differ. `sort.direction` is the literal `"asc"` and nothing else, because
one parser sorts and it sorts ascending.

**Two observable nuances were reproduced rather than improved**: the dual key
reads with `??` and not `||`, so an empty string on the primary key still wins
over the fallback; and enums compare by identity without trimming, so `" hero "`
falls to the default the way `normalizeAssetType` already makes it.

**`selection` carries only the destination key**, not a second payload shape.
The four write actions re-parse what they receive through their own
`normalize*`, so the payload must carry the model's own JSON keys — and B7d can
rebuild that from the descriptor alone, since re-normalisation is idempotent.
Recorded in the type itself so B7d does not invent a second mechanism.

**The real deliverable is the proof.** B7a could only compare the *string*
fields of the three representable parsers. All three equalities against the
real, unmodified draft actions are now complete — every field of
`GeneratedSequenceShot`, `GeneratedAssetCandidate` and `GeneratedSequence`
declared and compared. `castingSuggestions` stays unrepresentable and
**undecided**, per the user: B7h prices it now that typed item fields exist.

**The defect the green checks did not show — the eighth in a row.** 444 tests
were passing when the executor first reported, and one of them was lying:
`it("NaN and Infinity are both invalid")` built its payload with
`JSON.stringify`, which turns both into `null`. It exercised the
`typeof === "number"` branch twice and never touched `Number.isFinite` — the
guard added specifically to match `sequenceGeneration.ts:61`. The first
correction was still not enough: with `max: 120` declared, `Infinity` is
rejected by the upper bound whether or not the guard exists. It took a
**bound-less, index-seeded** field — `order_index`'s own shape — for the guard
to decide anything, proven by mutation: remove it and that test alone fails.

Suite 414 → 446. Five browser paths, five PASS: a new-format list template
imports and opens in the bench, an old-format one and a `selection`-less one are
both refused, object mode is unregressed, and `llm_templates` was left empty.

**Found by that pass, fixed separately.** The validator's precise refusal
messages never reach the user: `importLlmTemplate` computes `result.error` and
discards it, redirecting to a generic *"This file is not a valid LLM template."*
Every one of the eight new rules names its exact path, is tested, and is
invisible in the product — on the one path by which a user can currently author
a workflow at all. Out of B7b's authorized files; raised to the user, who
ordered it fixed as its own ticket (`LLMW.IMPORT.DETAIL.1`).

### The import says what is wrong (2026-08-16)

`LLMW.IMPORT.DETAIL.1`, commit `d628a5b`. The reason now travels on the query
string — the only channel a `redirect()` leaves open — and renders as a second
line under the human sentence, React-escaped. **On the `invalid_json` path
only**, arbitrated by the user: the other error codes already say enough, and a
browser path proves that submitting with no file still shows its own message
with no detail beneath it.

The two new tests decode through `URL` and assert the detail by **equality**
rather than containment, so a message arriving truncated or half-encoded fails.
Two pre-existing tests asserted the exact redirect target on this path and were
updated — an observable contract change, recorded as such.

**The executor corrected the ticket, and was right to.** The ticket said
`result.error`; the real field is `reason`. It used the correct one and flagged
the divergence instead of matching a wrong specification.

### B7c — one descriptor of three, and the wall the other two hit (2026-08-16)

`LLMW.DESCRIPTOR.LIST.1`, commit `e1ac26d`. §11.3 announced **three**
row-creating descriptors. Reading the three sources before writing the ticket
found only one describable with the bricks that existed — the same discovery
B7a made about "four" list operations, except made *before* an execution round
rather than after.

**This is where the user settled the governing rule** (§11.3, "The governing
rule"): a gap is a brick to build, never a reason to drop an operation. The two
excluded descriptors became three brick tickets instead of three refusals.

**The defect the green checks did not show — the ninth.** The executor reported
that `runner.ts` could not feed its render forms a `targetCount`. Checking that
report found worse: `buildVariableDispatchers` calls `fn(...args, selectedMode)`,
so the slot the forms read as `targetCount` receives `selectedMode` — always
`undefined` here — and every `targetCount ?? 6` falls back to 6. Registered, the
descriptor would have rendered a prompt asking for exactly 6 shots whatever the
user picked. No error. Invisible to `tsc`, the render-form tables carrying no
`satisfies` constraint; invisible to the equality test, which hand-builds its own
dispatcher.

Verified against the builder that this was a missing brick and not a botched
block split: every occurrence of the count sits in prose whose wording depends on
the branch, and the branch is chosen by sequence data, so a `{parameter}` block
cannot know which one it is in. **The descriptor therefore shipped deliberately
unregistered**, with a header stating what the runner would do if it were not.

`SEQ.CONTEXT` gained `narrativePurpose`, additively; four tests asserted the
resolver's exact shape and were updated. `commit` is deliberately empty:
`createGeneratedShots` **inserts** rows while all eight declared `ActionId`s
update, and `ACTION_REGISTRY`'s vocabulary was written for updates.

### B7c-n4 — the first brick, and the proof that goes through the real runner (2026-08-16)

`LLMW.BLOCK.VARPARAM.1`, commit `a419e89`. The seventh `Block` variant carries
variables **and** intent parameters into one render call, and
`shots.fromSequence` is registered as its acceptance proof.

**It takes one object argument**, against the five older variants' positional
convention, and its table carries a real `satisfies` constraint. That is the
point, not a style preference: B7c's near-miss came from positional dispatch
against a table cast to `(...args: unknown[]) => string`. The runner now
assembles the input from exactly what the block names, so declaration order
cannot mislead a render form. The older variants keep their convention — their
forms are shipped and proven, and rewriting them is its own chantier.

**The proof runs through the real runner** (`resolveOperationPrompt`), not a
hand-built dispatcher — precisely what B7c could not do, and precisely why the
defect got through. Five cases over both branches, each asserting byte-for-byte
equality against the builder *and* explicitly that the prompt says twelve shots
and never six. Confirmed by mutation: drop the parameter channel and the test
fails with 6; restore it and all five pass.

**A third block-shape check existed that the ticket's file list had missed** —
`describeBlock` on the bench page, testing `"variables"` with no `"parameters"`
branch. Registering the descriptor made that page reachable for it, where it
would have shown four blocks reading only `[SEQ.CURRENT_PROMPT]` while they also
read `targetCount`. Found by grepping every block-shape check in `src/`, not by
a test. **That one was the supervisor's own scoping error**, not the executor's.

Suite 448 → 456. Four browser paths, four PASS, including the one no automated
test could produce: the bench page now reads
`variables: [SEQ.CURRENT_PROMPT], parameters: [targetCount] :: …`.

**What this leaves.** `shots.fromSequence` runs in the bench but its `commit` is
empty, so nothing can be approved. The write side is the next lock, and the
three remaining bricks (§11.3) are what the other two row-creating operations
still wait on.

### B7d — the selection, and a title that was wrong (2026-08-16)

`LLMW.PROPOSAL.LIST.1`, commit `4e550d9`. The bench runs and approves a
list-output operation: propose, cherry-pick, approve.

**The queued title was wrong, and that was the finding.** B7d was written as
"list mode in `ProposalPanel`". `ProposalPanel` is generic on its own draft
type and its `redirectOnly` branch already renders exactly the hidden-field
form `createGeneratedShots` needs — it took **zero lines of change**. What was
missing was the **selection**, which existed nowhere in the workspace, and the
bench's list branch. The §11.3 row now says so, so a cold session does not
re-derive the wrong scope.

**The one thing that could have been wrong in silence** is the payload. The
runner produces items keyed by entity field name; the write action
re-normalizes through its own `normalizeShot`, which expects the model's own
JSON keys. `buildListSelectionPayload` bridges the two, driven entirely by the
descriptor's declared item fields — no operation name, no literal model key in
its body. An absent field is omitted rather than written `null`, so the write
action's own absence handling still applies, and selected indexes are emitted
in **list order**, never click order, because list order is insertion order and
therefore `orderIndex` order.

**The proof does not stop at the parser.** Neither `normalizeShot` nor
`parseShotsResult` is exported and `sequenceShots.ts` was out of scope, so
rather than widen scope the executor ran the real `createGeneratedShots` end to
end against a disposable database and asserted field by field on the rows
actually written — a stricter oracle than the ticket asked for. It also pins
that a reversed, non-contiguous selection comes out in list order, and that
`shotCode` is regenerated from the nomenclature template rather than passed
through by an accidental key match. Mutating `jsonKey` to `field` fails 2 of 3
tests, re-run by the supervisor rather than believed.

Suite 456 → 238 in `tests/llmWorkspace/` alone, all green; `tsc`, targeted
lint, `npm run build` and `git diff --check` clean. Browser-validated against a
real model call on a throwaway project since deleted: all checkboxes ticked by
default, `N of M selected` coherent, Approve disabled at zero, item fields
read-only, exactly the two ticked shots created in display order.

**Two supervisor errors worth keeping.** The validation checklist expected a
redirect to the sequence page; the bench passes its **own** URL as `returnTo`,
so returning to the bench is correct and the checklist was wrong. And the
mutation control was first reverted with `git checkout --`, which discarded the
executor's uncommitted work — restored from a copy taken before mutating. On an
uncommitted tree, a mutation control is reverted from a copy, never from git.

**What this leaves.** The bench renders **no confirmation after any
`redirectOnly` Approve** — `page.tsx` reads none of `shotsCreated`,
`shotPromptSaved`, `sequencePromptSaved`. Two shots are created and the panel
silently returns to its Run state. Identical for the two object-mode actions
B6c1 shipped, so B7d inherits it rather than causing it. Its own ticket.

Also outstanding, pre-existing: **B7c-w and B7c-w2 have no section here**,
though both are committed (`85ea5ac`, `e5fa0a4`). Only §11.3 records them.

### B7d-f — the bench's silent Approve (2026-08-17)

`LLMW.BENCH.CONFIRM.1`, commit `f892850`. Approving in the bench created rows
and said nothing: the panel fell back to its Run state, leaving only a query
parameter the page never read. Pre-existing and identical for the two
object-mode `redirectOnly` actions B6c1 shipped — the production surfaces have
consumed these parameters all along through a `saved` prop.

**A banner alone would have duplicated knowledge.** `BENCH_RETURN_TO_EXCLUDED_KEYS`
was a hand-written list of the same keys, so the keys become one table,
`REDIRECT_CONFIRMATION_KEYS`, constrained by
`satisfies Record<RedirectOnlyActionId, …>`, and both the exclusion list and
the banner derive from it. **That constraint is the deliverable**: a future
`redirectOnly` action does not compile until it declares how it reports itself
— which is to say, until it stops being able to write in silence. Removing an
entry fails `tsc` with TS1360.

**The supervisor's frozen contract was wrong**, and the executor caught it: the
table was frozen at three entries where `RedirectOnlyActionId` has five. The
contract reasoned about which ids `planBenchCommit` can *reach*, where
`satisfies` is a type-level check over the whole union. `createSelectedAssets`
and `createGeneratedSequences` were declared from their own actions' redirect
keys rather than by weakening the constraint, and both render nothing — no
wording was frozen for them and none was invented.

**A real build constraint, learned here:** `benchRun.ts` is pulled into the
client bundle through `BenchRunPanel`, so a runtime import from `bench.ts`
drags `runner → llm → comfy → fs/promises` in and the build fails. Only the
type is imported; the one-line reader is local, duplicated on purpose.

Validated by forging URLs rather than approving anything — the banner is a pure
function of the query string, so nine cases were played with no model call and
no write.

### B7e — the first list migration, and the bound that was decoration (2026-08-17)

`LLMW.MIGRATE.LIST.1`, commit `c6ad874`. `generateShotsFromSequenceDraft`
becomes a thin adapter over `runOperation`, the gesture the seven object-mode
operations already made. The four guards it carried are the runner's now, and
the descriptor's `messages` reproduces all four strings verbatim, so nothing
the user reads changed.

**`SequenceShotsLLMAssistPanel` was never opened.** The adapter keeps the exact
return shape, so the panel had no reason to move — and the cherry-pick
selection stayed a bench capability instead of arriving in production through
the back door of a migration. The supervisor had floated adding it; the
migration pattern dissolved the question.

**The contract was indiscernibility, not "it works".** Two gaps stood in the
way: `readStringField` always produces a value, so `""` arrives where
`normalizeShot` produced `null`; and an out-of-bounds number is dropped
entirely by the `omit` fallback where the old code kept the key with `null`.
Both are bridged, and proven by an equality test against a value computed by
hand from the pre-migration code, with a comment on every `null` naming the old
line it came from. B7d's bridge was reused rather than copied —
`benchListSelection.test.ts` passing **unmodified** is what proves the
extraction changed nothing.

**It shipped with one reported regression**, closed by the section below: the
old code pulled an out-of-range shot count back to 6, the new one let it reach
the prompt. Re-implementing the bound in the adapter would have duplicated a
rule the descriptor already declares, so it was reported rather than patched
locally — the user arbitrated to commit and fix it in the runner next.

### B7e-n — the runner enforces what the descriptors declare (2026-08-17)

`LLMW.PARAM.BOUNDS.1`, commit `e67a187`. `intent.parameters` has carried
`default`, `min` and `max` since B1a and **the runner enforced none of them**;
the render forms each patched around it with their own `?? 6`.

**The rule was read, not invented.** Both integer parameters the product has
behaved identically before migration: `targetCount` fell back to its declared
`6`, `targetSections` — which declares no default — fell back to being omitted.
One rule reproduces both: valid if it satisfies its type and, for an integer,
its declared bounds; otherwise the declared `default`, or dropped when there is
none. **Never clamped to `min`/`max`** — clamping would look smarter and would
not be what either action did. An undeclared key is dropped.

Applied **once**, in `resolvePromptInternal`, upstream of both dispatchers. That
single point also covers the bench for free: its parameter control is driven by
the query string and still accepts any finite number, but every path reaches the
model through `runOperation`. No bench file was touched.

The proof runs through the real `resolveOperationPrompt`, because the effect
being fixed is *what the model is asked* — `targetCount: 9999` must produce a
prompt asking for 6, and an out-of-range `targetSections` must produce a prompt
identical character for character to one built with no parameter. Removing the
bounds check fails five of nine cases. **No existing test was modified**, which
is the whole claim that no observable behaviour moved.

**What it means beyond the bug.** §7.3 of the vision has the author prototyping
without a dev ticket. A declaration the engine ignores is a trap for exactly
that author: write `min: 1, max: 30` and watch nothing enforce it.

### B7g → B7h-b2 — nine tickets, and what each one cost to learn (2026-08-17)

Written as one section rather than nine: the commits carry the detail, and what
a cold session needs is the handful of things it would otherwise re-derive
wrong. Queue rows and commits are in `docs/LLM_WORKSPACE_ARCHITECTURE.md`
§11.3, all struck through.

**The three bricks are built.** The post-response stage (`e867636`), boolean and
multi-choice inputs (`bd38db5`), project-scope collection variables
(`95d2a3c`). With them, **all four list operations have a descriptor** and three
of the four are migrated — only casting still carries its own engine.

**The rule that decided every split.** A variable proves itself through its
resolver, alone. A pipeline stage, a parameter type or a format extension
proves nothing until a descriptor consumes it. So variables ship early and
alone; bricks ship **with** their first consumer. Learned by paying for it: the
post-response stage had no consumer of its own, and shipping it bare would have
been code no honest test could exercise.

**Three defects that no test could have caught, found by reading.**
`sequences.fromOutline`'s migration inherited a second copy of the override the
runner had just taken over — idempotent, so nothing looked wrong, and the
mutation control proves the suite was blind to it. `assets.fromProject`'s
adapter had to pass an **empty** `multiEnum` through untouched, because
substituting the default there would have silently defeated the "Select at
least one asset type." gate and run an extraction the user had refused. And
`PROJECT.ASSETS` was first sorted by `orderIndex`, which buys no determinism
(every row defaults to `0`) and diverges from a source query that has no
`ORDER BY` — a divergence a fixture would naturally have hidden.

**Two supervisor errors worth keeping.** A frozen table was written with three
entries where the type demanded five, because the supervisor reasoned about
which action ids are *reachable* where `satisfies` checks the whole union; the
executor caught it and declared the missing two from their real sources rather
than weakening the constraint. And the phrase "one new source file" in a ticket
budget made an executor delete its own tests after running them — *source* means
`src/`, never `tests/`. Both are now written into the tickets that follow.

**UC3 is delivered** (`41d16b8`), and its retake (`9266d64`). Writing
`description` alone means there is **no preservation trap** in it at all, unlike
UC2. There is also no oracle: the prompt is written rather than transcribed, so
its quality is a human judgement and the resolved prompt goes in the report
instead of into a test. The first round left "Respond to the director's
direction below" standing unconditionally in the *system* message — the same
defect that sent UC2 back, one message higher, because the check had only looked
at the closing line.

**Casting stopped being unrepresentable** (`d89ee87`), and the way it happened
is the chantier's method working. An executor returned **blocked without writing
a file**: the builder embeds the sequence's own id, and no variable carried it.
Verified line by line — it is the **first builder in the repository needing its
own anchor's id** rather than a child's. `SEQ.IDENTITY` answers it. Enrichment
**replaces** the model's names rather than completing them ("don't trust LLM
names"), and `ListItemField` gains no boolean type: `alreadyAssigned` is
computed after parsing, never parsed, so only a post-response form's output
widens.

**Two things that are true and not defects.** `alreadyAssigned` is computed and
asserted but invisible in the bench, whose list renderer shows declared item
fields; production reads it from the returned object. And the asset-type filter
is a prompt instruction, so a model asked for three types may still answer with
a fourth — pre-existing, proven byte for byte against the builder, and now
scheduled to become a real filter (queue row S2).

**Four arbitrations were taken on 2026-08-17** and recorded in
`docs/ARCHITECTURE_DECISIONS.md`: schema authorized for Asset Bible freshness
and asset sourcing metadata, the asset-type filter becomes real, the bench gains
boolean and multi-choice controls, and the two untracked `.agents/` files stay
untracked on purpose.

### UC3 reaches the product, and a blocked report stops a supervisor (2026-08-18)

`4210df8`. With UC1 on the Sequence page, **all three founding use cases are
reachable where the work happens.**

**The ticket's central premise was false, and the executor refused it.** It
asserted — insistently, as the section the whole ticket was built around — that
`asset.retakeDirected` writes through `updateAssetDetailsInline`, the
five-column rewriter, and that approving a retake without carrying the other
four columns would erase the asset's notes and Bible. Four sources in the
repository said otherwise: the descriptor's own `commit:
["updateAssetDescriptionFieldInline"]`, `commitBenchProposal`'s routing, this
document's own B10 entry, and a passing test asserting the single-column write.

The executor read all four, stopped without writing a line, and reported the
contradiction. **Had it complied, UC3 would have been rewired to the wider write
to guard against a danger that the rewiring would itself have created** — and
the supervisor had already relayed that danger to the user as a risk of losing
real data.

This is the second blocked report in the chantier to prevent a design error, and
it is the strongest argument for the loop: **a ticket's authority must never
outweigh what the code demonstrates.** The rule generalizes past this incident —
when a ticket and four independent sources disagree, the ticket is the thing
most likely to be wrong, because it was written by whoever had least recently
read the code.

### UC1 reaches the product, tuned four times by its own answers (2026-08-18)

`shot.insertDirected` is on the Sequence page (`05f381a`) and the user validated
it in the running product. **All three founding use cases are now reachable
where he works.**

**Four tunings, none of which a test could have found.** Every one came from the
user reading a real answer on a real project: an interval (`"MS to WS"`) where
the rule gave examples but forbade nothing; a fabricated shot code in the title,
**taught to the model by our own rendering**, which glued code to title with an
em dash in two places; two fields — `action_pitch` and `continuity_notes` —
carrying no rule at all while their neighbours each had one, so the model filled
the vacuum with the intent from the director's note; and then a bound that
became too tight *because* the new rule made the field longer, cutting
`action_pitch` mid-word at 300.

That last one is the pattern worth keeping: **a prompt rule can create the next
defect.** S7c asked for beat-by-beat action and S7d had to widen the field that
answer needed. Neither was foreseeable from the other.

**What the final answer showed about the design.** Asked to convey hesitation
under a helmet, the model used Azelle's tail as an acting instrument and staged
a breath through the shoulders — neither is in any rule; both come from the
project pitch describing an anthropomorphic macaque. §3.2's bet, that context
selected by named variables produces craft rather than decoration, is visible in
the output.

**The surface's one design decision.** `afterShotId` is implicit in the click,
on the connector between two shots. The bench asked for an id in a field because
a bench may; a product may not, and §1 of the vision names that friction
directly.

**S2 shipped the chantier's first deliberate behaviour change** (`5fc5156`): an
asset candidate whose type was not requested is now dropped. It also cost a
lesson about scoping test changes — the ticket authorized one proof to move, and
two needed to, the second visible only by running the suite.

**The flaky suite had a second cause, found at last.** `maxWorkers` fixed the
contention failures; the total load failure — all files failing on
`Cannot read properties of undefined (reading 'config')` — is a **stale Vite
cache**, cured by `rm -rf node_modules/.vite`. Hours were spent treating it as a
scheduling problem. Every ticket since carries the remedy in its own text.

### S7, S5, S3, S1 — five tickets driven by first contact (2026-08-18)

All delivered the day after UC1 landed, and four of the five exist because
something was **used** rather than reasoned about.

**UC1's prompt was tuned twice by the user's own runs** (`133816e`, `85b276e`).
The first real answer returned `framing: "MS to WS"` — an interval, because the
rule offered examples and forbade nothing — and a `continuity_out` that
delivered the hero to the *next* shot's destination. The second returned
`title: "Sh_250 — Passage Through the Bulkhead Door"`, a fabricated shot code in
the title, **caused by our own rendering**: two lines glued code to title with
an em dash and the model copied the format it was shown. Fixing only the rule
would have left the inducing format in place. The shot list also cost 2477 of
2588 tokens on a fourteen-shot sequence and truncated mid-word; the four shots
framing the insertion point now render in full and the rest as one title line,
halving the block. `SEQ.SHOT_TARGETS` was deliberately **not** bounded —
`casting.fromSequence` reads it under a frozen proof.

**The test suite was answering at random** (`716fc55`). The same tree gave 655
passing, then 89 files failing to load, then 3 failures, then 12 — and 12 again
on a clean tree. Always the heavy DB-backed files. `maxWorkers: 4` holds it:
eight consecutive green runs, identical counts, for +65-85% wall time. **The
unstable runs were also skipping 15 to 26 tests outright** — the contention was
not only breaking tests, it was silently not running them. A second symptom
remains open and rarer: all files failing to load at once on
`Cannot read properties of undefined (reading 'config')`, cured by a re-run.

**The cost of a non-deterministic gate, paid in full.** Before the fix, the
supervisor accused an executor of mislabelling a flake as "pre-existing", then
verified on a clean tree and found the executor had been right. The lesson is
not about that executor: a gate that answers differently each run makes the
sentence "this failure is pre-existing" unverifiable, and every review after it
rests on the luck of the draw.

**S1's freshness took a corrective round on a subtle distinction.**
`updateAssetDetailsInline` is the only path that writes an Asset Bible — the
executor traced every caller and was right — but it is not a path that *only*
writes Bibles. It rewrites all five columns on every call, so a plain
description edit reports the Bible back unchanged. Capturing the fingerprint
unconditionally declared the Bible `current` at the exact moment it went stale,
silencing the advisory precisely where it earns its keep. The question to ask
was not "is this the only path that writes X" but "does this path write only X".

### B11 — UC1 delivered, and two predictions that were wrong (2026-08-17)

`LLMW.ACTION.INSERT_AT.1`, `LLMW.OUTPUT.OBJECT_NUMBER.1`, `LLMW.UC1.INSERT.1`,
`LLMW.UC1.BENCH.1` — commits `548e8e9`, `0895907`, `78ccc14`, `b560cf9`. **The
three founding use cases are now all delivered**, UC1 last and bench-only, like
UC3.

**The queue row for B11 predicted three things and two were wrong.** It said
`insertionPoint` had to be really implemented in the runner: it does not, and
will not be. An insertion point is not an anchor identity — it changes with
every request — so the position is an `intent.parameters` entry and the
operation is anchored on the sequence, exactly as `shots.fromSequence` already
is while creating shots. That deleted a whole ticket's worth of runner work. It
said twelve output fields: there are ten, because "Production Details" in §4 of
the vision is a **form section heading**, not a column, and `shotCode` is
generated from the nomenclature template like every other generated row rather
than taken from the model. Only the third prediction held, and only in the
user's own reading of it: "re-run with another seed" is Redo, decided by him on
2026-08-17 — `src/lib/llm/` has no seed plumbing at all, and the bench's Run
plus `ProposalPanel`'s Redo already provide what he meant.

**The one real brick was numbers in object mode.** `durationSeconds` could not
be declared: object fields were text-only. The runner's own comment had already
named the gap when B7b widened list items — "a plain `string` record cannot
honestly carry `duration_seconds`… the `"object"` variant is untouched" — so
this was a port, not an invention. Widening `RunOperationResult` broke eight
consumers on purpose, each given a throwing guard rather than a coercion.

**Three supervisor errors, all paid for in this series.** First, a redundant
variable: `SEQ.SHOT_CONTINUITY` was specified, built, shipped and removed the
same day, because `SEQ.SHOT_TARGETS` (B7h-b1) already projected both continuity
fields *and* the `id` UC1 needs. The overlap was visible in the diff that was
approved — the new variable's own comment argued for the distinction — and the
argument did not survive contact with the resolver, which already orders by
`orderIndex`. Second, a ticket rule written too wide: "no existing test may be
modified" protects byte-for-byte prompt proofs, not structural assertions on a
descriptor object, and an executor obeyed it into leaving the tree red rather
than adjusting four mechanical assertions. Third, a false claim in a commit
message: B11-b2 said `shot.insertDirected` was runnable at the bench while a
guard from B11-b1 still threw on any numeric value — true only after B11-b3.

**The trap the serializer could have hidden.** The bench edits every field in a
textarea, so a duration returns as text; emitting `"4"` instead of `4` makes the
write action drop it in silence, since it requires `typeof === "number"`. The
two halves are therefore proven *together* — a bench draft serialized, fed to
the real action against a disposable database, and the created row checked to
carry duration 4 at the right index. Mutating the serializer to emit a string
fails that test and two others.

**Browser validation is partial, and stated as such.** The resolved prompt was
verified in the real bench on a throwaway project: the position named in clear
("Insert the new shot after SH020 — Vex gives chase."), the director's direction
in place, ~746 estimated tokens. **The model round trip did not complete** — the
OpenRouter call was still pending after several minutes with no server-side
error — so the Approve button's own click path is unproven in a browser. What it
would do is proven at the action level end to end. 650 tests, 89 files.

### B7h-m — the eighth migration, and the first that is not indiscernible (2026-08-17)

`LLMW.MIGRATE.LIST.4`, commit `ba1e435`. **All eight list operations are now
migrated**, so Phase C's prerequisite on the list side is met. The bench also
gains its fourth Approve branch: `applySelectedCastingSuggestions` had sat in
`REDIRECT_CONFIRMATION_KEYS` since B7h-a, forced there by a `satisfies` clause
but reachable from no button.

**Three migrations were held to indiscernibility; this one could not be.** The
old chain's id gate lived in `normalizeRawSuggestion`, *before* its own empty
refusal. `item.validity` is frozen and gates only on non-empty **string**
fields, so the runner's equivalent gate lives in the `postResponse` form, which
always runs *after* that refusal. Consequence: a response whose items all carry
an unrecognised `targetType`, or an id that is not a positive integer, now
yields `{ ok: true, suggestions: [] }` where the old chain threw « The model
returned no valid suggestions. Try again. »

**The repair was refused on purpose**, and the reason matters more than the
divergence. Folding the `empty` message onto a post-filter empty array would
corrupt the *far more common* case — the model invents ids that are well formed
but do not exist — where the old chain already returns an empty list. A rare
divergence was preferred to a frequent one. That agreement case is now asserted
under its own name, so the next reader does not mistake it for the divergence.

**What the supervision loop caught, and what no check would have.** The first
round's divergence test used well-formed but non-existent ids (`999999`) — an
input on which **both chains agree**, because `num()` only checks « integer and
`> 0` ». The test passed, claimed to prove a divergence, and contained two
comments contradicting each other on what the old chain did. A corrective round
replaced it with the two families that genuinely disagree. The ambiguity came
from the ticket, which said « id invalide » meaning invalid per `num()` — the
same class of error as B7h-b2's frozen table: a supervisor's shorthand, read
literally by an executor who cannot see what was meant.

**A second divergence of the same family** was found by the executor and left
unrepaired by design: mixing an unrecognised `targetType` into a >60-item
response shifts the `maxItems` truncation boundary by one item between the two
chains, because the old chain dropped such an item before its own `.slice(0,
60)`. It refused to write a test that would have asserted a false equality, and
proved truncation on a uniformly valid array instead.

**`No castings applied.` on 0 breaks the precedent deliberately.** The three
`create*` actions render nothing on a count `<= 0`, which is safe because 0 is
unreachable for them — Approve is disabled with an empty selection, and every
selected item creates a row. For casting, 0 is ordinary: re-select a pairing
that already exists, the unique constraint rejects it, an empty `catch` swallows
it. Silence there is the Approve-went-nowhere gap B7d-f paid to close.

604 tests, 87 files. Eight browser paths PASS on a throwaway project. One state
was **not** reachable in the browser and is recorded as such: `alreadyAssigned:
true` never fired, because the prompt tells the model which pairings already
exist and it complied on all three runs — it is proven instead at the action and
runner levels, and by a mutation control.

### B9a — the plain-language directive becomes real (2026-08-15)

`LLMW.INTENT.FREETEXT.1`. **The first ticket of Phase B to deliver a new
capability rather than reorganise an existing one.** On a Shot's assist panel
the user can now write "low angle shot, show more empathy with the character"
and the model answers to it.

**Why it took nine tickets.** `intent.freeText` has been in the descriptor
format since B1a. No descriptor declared it, so no control was ever built: B6b
and B6c1 each deferred it, and each was locally right — a control with no
declarer would have been untestable dead code. The cumulative effect went
unnoticed until the user asked whether the work in flight still served his three
founding use cases. It did not: all three *are* a plain-language request, and
nothing in the queue delivered the primitive that carries them. See
`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §4 "Reachability".

**The constraint that made it safe.** `shotPrompt.assist` carries a
byte-for-byte prompt equality proof against its frozen builder (B1c discipline).
The format already had the answer — §4.1 correction 4, a block that renders
empty is dropped before joining — so an unfilled directive yields a
character-identical prompt. The two proof files do not appear in the ticket's
changed-file list at all, and both stayed green. The ticket stated that having
to modify one of them would be a defect, not a test to adjust.

**Landed on an operation that already worked end to end**, deliberately:
`shotPrompt.assist` is migrated, backed by `ProposalPanel`, runnable and
applicable from the bench, and its write action is already declared. No new
write action, no new registry entry.

`ProposalPanel` gained an optional pre-trigger input — the shared engine behind
seven wrappers, which UC1, UC2 and UC3 will all need. The other seven wrappers
pass nothing and are unchanged.

**The deviation worth keeping in mind.** The executor modified
`src/actions/llm/shotPrompt.ts`, which the ticket did not enumerate: without it
the production input existed but was silently ignored, since the action never
read a `freeText` field or passed it to the runner. A decorative control that
does nothing would have passed every test. It was flagged, not slipped in.

Suite 366 → 387. Seven browser paths, seven PASS, with the evidence that
matters: no occurrence of the directive in the effective prompt when the field
is empty (~669 tokens), exactly one occurrence at the declared position when
filled (~688), a draft that visibly answers the direction, and a production
Replace that rewrote shot 153's prompt end to end.

**Three user-visible strings await the user's own judgement**, written by the
executor for lack of a specification: the field label `Director's note
(optional)`, the rendered fragment `Director's direction: <text>`, and the
production placeholder `e.g. a low angle shot, the hero entering and exiting
frame` — the last being the user's own UC1 sentence returned in the interface.

**B9b is blocked on two arbitrations**, both found while preparing this ticket
and deliberately left out of it: `updateShot` fits neither `response` shape the
action registry declares (positional arguments *and* `FormData`, answering by
`redirect()`), and it silently rewrites `shotPrompt` from
`description`/`actionPitch`/`cameraPitch` while also doing nothing at all —
no write, no error, no redirect — when `title` is blank.

### B9b — UC2 delivered, then corrected by first use (2026-08-15)

`LLMW.UC2.RETAKE.1`, then `LLMW.RETAKE.OUTPUT.1` on the same day. **The user's
first founding use case works**: on a Shot he writes "propose me another action
and another framing, more empathy with the character" and the assistant answers.

**The arbitration that shaped it.** A directed retake rewrites **the three
narrative fields** — `description`, `actionPitch`, `cameraPitch` — and nothing
else. Decided by the user on 2026-08-15 after the supervisor surfaced what
`updateShot` really does: it redirects to Sequence Detail, silently rewrites
`shotPrompt` from the narrative fields, and does nothing at all — no write, no
error, no redirect — when `title` is blank. `updateShotNarrativeContext` was
already written for exactly this need, returns `{ ok }`, verifies the ownership
chain, and touches neither `shotPrompt` nor `framing` nor `cameraMovement`.
`framing` and `cameraMovement` stay the user's.

**`SEQ.SHOTS`, the fourteenth variable.** UC2 requires "the context of all other
Shots" and nothing resolved it — `SEQ.CONTEXT` returns the sequence's own five
fields only. The new variable serves UC1 too, which needs continuity with the
preceding and following Shots. One variable, two founding use cases.

**The first descriptor with no oracle.** Every prior descriptor was proven
byte-for-byte against a frozen prompt builder — the B1c discipline that caught
three drifted system prompts. Here the prompt is *written*, not transcribed, so
no equality test could prove anything. The ticket forbade inventing one and
required the full resolved prompt in the report instead. Its quality is a human
judgement, and that is exactly where the defect turned up.

**The preservation trap, and why it is not theoretical.** `output.require` is
`"any"`, so the model may leave a field empty, but the action replaces all
three. Without preservation, asking for "another action" would erase the shot's
description. The B6c1 pattern was reused and the column list derived from
`ACTION_REGISTRY`, not hardcoded. Proven in the real application: the model
returned an empty description and the stored value survived.

**What the supervisor's diff review caught.** The closing template block said
"per the director's direction above" — a static text, while the directive block
disappears when the note is blank. With an empty note the model was told to
follow a direction present nowhere, and nothing prevented triggering that way.
Fixed by a neutral closing block, a trigger disabled until a note exists, and
the regression test that was missing.

**What only first use could catch.** The user tried it on his own Shots and
reported fields coming back empty. The cause was in the prompt: "never all three
are required" plus "return an empty string" gave the model explicit permission
to answer half the question. The rules now read "fill in every field the
director's direction actually concerns… do not stop at one when the direction
names several", and an unfilled field is labelled `Unchanged — keeps current
value` with the shot's real value shown as placeholder — a blank box read as a
failure regardless of the help text beneath it.

The same round renamed the Shot Prompt card's main textarea from `Prompt` to
`Narrative Creative Prompt` (the user's own diagnosis: it holds literary prose
while it is meant to produce a technical image prompt) and added one explainer
line under each of the two adjacent cards. The two `Director's note` fields
still share a name; a further rename was proposed and **deferred by the user**
until he reworks the shot-prompt system as a whole.

Suite 387 → 414. Seven browser paths then six, all PASS, including the proof
that a two-theme direction now fills both fields and a single-theme one
correctly leaves the others untouched.

**Flagged, not fixed — a Phase C obstacle.** `buildShotRetakeCommitArgs` is the
second production caller of `preserveAssetBibleField`, which lives in
`src/lib/prompts/` — the frozen oracle this document describes as having no
production caller and scheduled for deletion. B5 created the dependency; B9b
deepened it. The three-line helper needs a neutral home before C3.

**A supervisor process failure worth keeping.** `npm run build` was run against
the live dev server and corrupted the bench route's dev chunk, producing a
phantom `ReferenceError` in two separate browser passes. The post-build check
had queried a different route than the one affected. Procedure corrected: verify
every route the ticket touched, or do not build while the dev server is live.

## DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1 - Implemented, awaiting Codex review (2026-08-10)

`install.bat`/`.sh`, `start.bat`/`.sh`, `update.bat`/`.sh` added at repo root
as thin wrappers around one new Node ESM orchestrator,
`scripts/mikai-deploy.mjs`. It reads `config/openreel-sidecar-release.json`
through a closed, runtime-validated schema (unknown keys, wrong types, a
non-40-hex commit/upstreamCommit, an out-of-range port, or any repository
other than the exact pinned GitHub identity are all refused before any
side effect); resolves the sidecar directory from `MIKAI_OPENREEL_DIR` or
the default sibling path with symlink-safety checks; preserves an existing
`.env.local` byte-for-byte; creates only the known runtime directories when
absent; requires a real `npm run backup:create` success before migrating an
existing DB (a fresh/missing DB needs none, and a `DB_PATH` outside the
supported `<repo>/data/` contract refuses outright rather than claiming
protection it can't provide); clones/moves the sidecar to exactly the
pinned commit (never a branch tip), refusing on tracked changes or an
origin mismatch on an existing checkout; and, for `update`, fast-forwards
MikAI's own `main` only (refuses on a diverged history) before re-reading
the possibly-new pin. `start` validates the sidecar `HEAD` against the pin
and delegates to the existing `npm run prod:all` launcher — no second
process manager. Every side-effecting command runs through one injectable
runner, used by the required command-order proof.

All five required proofs were run for real against disposable fixtures
(temporary git repos/clones/worktrees, isolated ports, cleaned up
afterward) and passed: pin validation matrix (33/33), command-order safety
with a fake runner (26/26), a genuine end-to-end fresh install against a
local git remote fixture pinned at an exact tag/commit (15/15, real `npm
ci`, real `pnpm install`, real `next build`, real migration), a genuine
end-to-end update including fast-forward, backup-before-migration, the
sidecar moving to a new pin, and dirty/mismatched-pin refusals with zero
mutation (19/19), and an isolated `start` on non-default ports with a CORS
check confirming MikAI's editorial-export route grants
`Access-Control-Allow-Origin` only to the explicitly configured sidecar
origin, never an unlisted one (8/8). Two real bugs were found and fixed by
these proofs, not just theorized: Windows `shell:true` was silently
stripping `^` from git revision arguments like `<tag>^{}` (cmd.exe's own
escape character), and `next build` was running BEFORE migrations, which
fails outright on a schema-less fresh DB because some routes prerender
against it — migration now runs first. See `.agents/claude_report.md` for
full evidence.

## OPENREEL.SIDECAR.PROMOTION.1 - Audited and prepared, awaiting Codex review (2026-08-10, retake)

Upstream-based sidecar candidate `mikai/upstream-8459024`
(`f80853ce3de432751847eb1bab3d03a669267c37`) was audited against legacy
sidecar `main` (`33f917a253bef632f65da7ef5175aa4130785fc0`): no supported
MikAI integration contract was lost, and the legacy native-playback patches
(`bace876`, `492dd01`, `33f917a`) are confirmed absent from the candidate's
history and source tree. Candidate typecheck, full test suite, lint, and
production build pass in an isolated worktree (2 pre-existing flaky tests in
`video-engine-export-effects.test.ts`, unrelated to MikAI, reproduced
independently unchanged). Two isolated browser smoke sessions (own ports,
mock export server, local disposable fixture media, no live `5173` use)
confirmed import, continuous multi-clip playback across two clip boundaries,
pause/seek/reload, and full MikAI Bridge visibility with no new console
errors — one against a normal export, one against an explicit
`videoSourceMode`/`timingBasis: "compact-real-duration"` export, which
correctly disabled Validate/Apply, Insert Shot, and Push Duration (each with
an explicit reason) while leaving Publish Advanced available. Grouped-drag +
undo/redo was reattempted with a properly frame-timed synthetic pointer
sequence (delays between `mousedown`/`mousemove` so React's listener-attach
effects flush) and conclusively demonstrated: two selected clips moved by an
identical delta, a single Undo reverted both, a single Redo reapplied both,
no console errors. `MIKAI_SIDECAR.md` now carries an explicit maintenance
contract (upstream base, deterministic release-pin sequencing, retired-patch
note, update/rollback procedure). The MikAIProdLab release pin
(`config/openreel-sidecar-release.json`) is deliberately **not created yet**
— its `commit` value must be the actual sidecar-doc commit once
`MIKAI_SIDECAR.md` is committed on `mikai/upstream-8459024`, which has not
happened; creating it now with the pre-documentation candidate SHA would be
stale the moment that commit lands. It is created in the closing sub-pass,
right after that commit, per the deterministic sequence documented in
`MIKAI_SIDECAR.md`. No git remote state (tags, branches, `main`) was changed
in this pass — promotion (`--force-with-lease` after verifying `origin/main`
is still `33f917a`) is deferred to a Codex-approved follow-up. See
`.agents/claude_report.md` for full evidence.

## DB.HEALTH.REPAIR.1 - Completed Live Maintenance (2026-08-10)

The live SQLite database was repaired during an explicit maintenance window.
Four corrupt Project Style indexes were rebuilt, and the user-authorized,
fully detached Project Style Research rows plus one orphan Working Draft were
removed only after a coherent SQLite backup and a successful disposable-copy
proof. The live database now reports `PRAGMA integrity_check = ok` and zero
rows from `PRAGMA foreign_key_check`; Project 18 and the remaining valid
Projects were verified unchanged. Two timestamped pre-repair SQLite-aware
backups exist under `data/backups/`. The next operational priority is
`OPS.DATA.BACKUP.RESTORE.1`, including media as well as SQLite.

- MikAI: `72f9d89 - feat(style): add Reference Board analysis UI`
- OpenReel sidecar: `4078de7 - Shot video library bridge support`

## STYLE.1.ACCEPTANCE.1 — ACCEPTED, epic STYLE.1 RESOLVED

`STYLE.1.ACCEPTANCE.1` (transversal acceptance gate for the `STYLE.1`
epic, A through G) is `ACCEPTED`: technical evidence complete, two bounded
Codex retakes closed (`REVISE` -> `REVISE` -> accepted), and manual user
confirmation received on 2026-08-02 (`c est ok`). Full matrix, DB/migration
audit, dead-code audit, cross-Project refusal proofs and sign-off are
recorded in `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md`. The `STYLE.1`
epic (A through G) is `RESOLVED` — see `docs/ROADMAP.md` for the delivered
ticket registry and the next active ticket.

Verification on 2026-07-13:

- MikAI committed HEAD is `c37e603`; its working tree has persistent
  `AGENTS.md` workflow change plus unrelated `.agents/skills/` and `.vscode/`.
- OpenReel sidecar remains at committed HEAD `e1c36d1`.

Current supervised work:

- `CAMLAB.POLISH.2` est termine et valide par l'utilisateur (`41d7004`) : la
  colonne Gaussian-to-image mappe le snapshot vers
  `Load Image Gaussian (Input)`, la source vers `Load Image (Input)`,
  independamment de l'ordre JSON, et expose ses autres nodes `(Input)`.

- `CAMLAB.POLISH.1`, `CAMLAB.VIEWER.CONTROLS.1` et `CAMLAB.POLISH.2` sont
  termines, pousses et valides par l'utilisateur. Camera Lab guide maintenant
  la generation PLY, le cadrage/capture avec profondeur et zoom ajustes, puis
  la generation Gaussian-to-image avec mapping nominal strict.
- L'epic `STYLE.1` (A a G) est `RESOLVED` : Working Draft et versions
  immuables, Reference Board et Creative Influences, Influence Research et
  Reference Analysis, heritage/override Sequence, injection dans les six
  consumers de generation, Asset Alignment et Look Development sont tous en
  place et pousses (dernier ticket applicatif livre :
  `feat(style): add Reference Board analysis UI`, HEAD `72f9d89`). Le gate
  transversal `STYLE.1.ACCEPTANCE.1` est `ACCEPTED` (voir section
  ci-dessus) — confirme manuellement par l'utilisateur le 2026-08-02. Le
  registre complet des tickets livres est dans `docs/ROADMAP.md`.
- `SEQGEN.VIDEO.CUT.1` reste le prochain candidat hors epic Project Style :
  retirer une plage frame-exacte d'un Sequence Video Draft, concatener les
  parties conservees et publier une nouvelle version sans ecraser la source.
- `SEQGEN.VIDEO.1`, `SEQGEN.SPLIT.1`, the unified Split Workspace, the EOF
  compatibility fix, `SEQGEN.PUSH.1`, `SEQGEN.PUSH.2`, the first-frame PNG
  fix, short frame-native segments and `SHOT.VIDEO.LIBRARY.1` are complete
  and pushed.
- Validated Split Plans now create durable Shot video candidates. Candidate
  review, explicit approval, result invalidation and safe deletion are live.
- `SEQGEN.KEYFRAMES.1` was removed because Shot-level `Capture Frame` already
  covers manual frame extraction.
- `SEQGEN.SPLIT.CLEANUP.1` and its native player-anchor retakes are complete.
- `CAMLAB.SPIKE.1`, `CAMLAB.PLY.1`, `CAMLAB.VIEWER.1` and `CAMLAB.SHOTREF.1`
  are complete and pushed at MikAI HEAD `c9d2982`. A validated Gaussian PLY is
  a secure job/cache artifact with Range serving; the Shot Camera Lab provides
  a PlayCanvas viewer, exact local offscreen PNG capture, and explicit atomic
  confirmation as a durable Shot Reference Image with role `camera`.
- The supplied
  `Gaussian.json` and real ComfyUI history prove a `SharpPredict`
  image-to-PLY workflow whose `GeomPackPreviewGaussian` output exposes a PLY
  downloadable through `/view` with Range support.

Project Style reference documents:

- `STYLE.1` (A through G) is functionally delivered — see the current
  supervised work note above and `docs/ROADMAP.md` for the full delivered
  ticket registry. The original user journey, accepted MVP/deferred
  decisions, detailed specification and development-supervisor handoff are
  preserved in `docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md`,
  `docs/PROJECT_STYLE_MVP_DECISIONS.md`,
  `docs/PROJECT_STYLE_MVP_SPEC.md` and
  `docs/PROJECT_STYLE_SUPERVISOR_HANDOFF.md`.
- Next work in this area is bounded `STYLE.2` follow-ups (Look Development
  corrections, Reference Analysis UI hardening) tracked in
  `docs/ROADMAP.md`, gated behind `STYLE.1.ACCEPTANCE.1` closure.

## Product Shape

MikAI is the production and narrative brain.

OpenReel is the advanced editorial sidecar.

Main output model:

```text
Shots
→ Sequence Results
→ Film Results
```

Two editorial paths produce the same type of sequence output:

```text
Basic Editorial
→ Sequence Result sourceMode = basic

OpenReel Advanced
→ Sequence Result sourceMode = advanced
```

Active Sequence Results are assembled into Film Results.

## Completed Capabilities

### Sequence Results

- Multi-version `sequence_results` model.
- One active result per sequence by application logic.
- Statuses: `draft`, `published`, `active`, `archived`, `outdated`.
- Sequence Detail viewer.
- Previous Results collapsed by default.
- Basic FFmpeg publish.
- OpenReel WebCodecs publish.
- Snapshot and staleness safety.

### Basic Editorial

- Sequence Detail is the main entry.
- Publish Basic Sequence Result.
- Insert Shot Here.
- Real Shot creation.
- Default duration: 5 seconds.
- Mirror write into `sequence_editorial_items`.
- Generate Shot Brief from Neighbors through Ollama.
- Sequence Result and Film Result invalidation.

The `/editorial` route remains useful for trims and fallback controls.

The `/nle-prototype` route is secondary/debug.

### OpenReel

- Open in Advanced Editor from Sequence Detail.
- Export Editorial JSON.
- Validate Patch.
- Apply Patch start-only.
- Publish Sequence Result to MikAI.
- Insert New Shot at Playhead.
- Push production target duration to MikAI without invalidating existing
  Sequence/Film Results.
- Collapsible MikAI Bridge panel.
- Stale HTTP 409.
- Reload from MikAI.

### Film Results

- Film Result model.
- Project Detail viewer.
- MP4 render through bundled FFmpeg.
- Multi-sequence render validated.
- Automatic invalidation when a Sequence Result changes.

### Infrastructure

- Combined launcher:
  - `npm run dev:all`
  - `npm run prod:all`
- Bundled FFmpeg via `ffmpeg-ffprobe-static@6.1.1`.
- File-based supervision loop:
  - `npm run ai:init`
  - `npm run ai:review`

## Current Seedance State

- Historical note: `31441d3` was the latest committed MikAI HEAD as of the
  Seedance handoff session below. It predates the `STYLE.1` epic and is no
  longer the current head — see `Repository Heads` at the top of this
  document (`72f9d89`) for the actual current state.
- The Seedance MVP block is complete through `GEN.SEEDANCE.3`.
- `GEN.SEEDANCE.3` found no real First/Last Frame workflow in the current
  library, so no active profile was invented.
- `THEME.TOPBAR.MASK.1` is complete: dedicated TopBar color with alpha-mask
  texture rendering.

## Known Limits

- The supervision loop is file-based. Codex review is manual in the connected
  Codex session; no untested Codex CLI automation is assumed.
- Live `.agents/*` files are per-ticket scratch state and gitignored.
- `sequence_results` active uniqueness is enforced by application transaction,
  not a DB partial unique index.
- OpenReel V1 timing patches are start-only. Duration changes are not pushed
  as general timeline edits.
- OpenReel split does not automatically create a MikAI Shot.
- Some legacy OpenReel patches without snapshots can still be accepted with
  warnings for backward compatibility.
- Runtime media/storage cleanup remains future work.
- Recent completed polish includes `THEME.MIKROS.1` through `.5` (Custom
  palette, fonts and logo) and `PLAYER.AUDIO.1` (audio controls in the
  frame-aware player).
- `EDITORIAL.NAV.1`, `SEQGEN.1`, the Sequence Storyboard generation/extraction
  chain and `SEQGEN.VIDEO.1` are complete. The dedicated Storyboard workspace
  now owns contact-sheet generation, panel extraction, durable Sequence Video
  drafts and their provenance. Split detection/review and `SEQGEN.PUSH.1` are
  complete: an explicitly validated plan now creates durable, reviewable Shot
  video candidates without automatic approval.

## Storyboard Direction

The Storyboard is not only a gallery of media that already exists. It is the
first visual production workspace for a Sequence, even when no Shot has an
image yet. It must provide a Sequence selector like Editorial, a persistent
Project navigation shortcut, a visual Shot grid, and a compact unique list of
the Assets cast anywhere in the Sequence.

The workspace will let the user select Asset reference images per Asset,
open the Asset Detail page, compile the Sequence package with explicit
options to ignore prompt segments and unapproved references, generate draft
storyboard images, and approve useful compositions before the later
Sequence-level Seedance video workflow.

The intended chain is:

```text
Story -> Storyboard images per Shot -> approved visual structure
-> Sequence-level Seedance video -> Split -> Push candidates to Shots
```

The accepted `SEQGEN.STORYBOARD.3` extension adds a first sequence-level
storyboard contact sheet before sequence video generation. It uses selected
casting references and the full inspectable Sequence Generation Package, and
stores explicit versioned drafts at Sequence level without mutating Shots.

## Last Validated Baseline

Latest reported validation before this handoff:

- `npx tsc --noEmit`: clean.
- `npm run build`: clean.
- `npm run ai:review`: validates Git failure handling and staged diff surface.
- `PLAYER.AUDIO.1`: `npx tsc --noEmit`, `npm run build`, and
  `git diff --check` clean; audio controls validated on Film Result, Sequence
  Result, and Shot Detail surfaces.

For this handoff ticket itself, validation is documentation-only:

- HEADs checked for both repos.
- Working trees checked for both repos.
- Existing docs audited.
- No app runtime, schema, migration, or package file changed.
