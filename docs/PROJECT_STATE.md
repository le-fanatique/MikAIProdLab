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

## LLM Workspace Phase B — B0 to B6c1 COMPLETE (2026-08-14)

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
