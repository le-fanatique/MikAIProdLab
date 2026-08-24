# MikAI Project State

Last updated: 2026-08-24

## `SHOTGEN.INSTRUCTION.1` — the instruction was manufacturing the drift

One commit, `bd7ee02`. No migration — `shots.lighting` already existed. First
ticket of the Shot-prompt chantier (`docs/SHOT_PROMPT_SD25_AUDIT.md`, §9 #1).

Two misroutings in one instruction, both invisible from the schema.

**`shot_prompt` was forbidden to name the cast.** The closing line said *"No
labels, no narrative scene references — only visual content"*, which obliges
the model to re-invent each character's appearance in every Shot. It does: on
Sq_5000, Azelle's wardrobe is phrased five different ways across six Shots, and
none of them is her Asset Bible's; the prop that holds that wardrobe is cast on
none of the six. The drift was produced upstream, before any image model saw
the prompt.

One nuance that had to be walked back before it was written down: on Sq_4000
the model never names her, on Sq_5000 it names her in five Shots of six. The
instruction does not *reliably* suppress the name — it makes the result
unpredictable in both directions. What is constant, and all that can be
asserted, is the re-description.

**`lighting` was never asked for.** Fourteen output fields, not one of them,
while the same instruction demanded a self-contained visual paragraph. The
lighting therefore landed inside `shot_prompt` and the column built for it
stayed empty — `null` on Sq_5000's six Shots, on all six Sequences, and on all
six environment Assets. It is now asked for, and it traverses: JSON schema,
`normalizeShot`, the insert, `columns.written`.

It is described as the Shot's own lighting *event*, never the inherited
ambiance: the rig belongs to the environment and the Sequence, which
`resolveStoryboardLighting` already resolves by precedence rather than
accumulation. The author's arbitration, 2026-08-24.

**The supervision found what the executor had honestly declared it had not
done.** Its report stated plainly that it had reasoned about the three required
mutations rather than running them. `mikai-method` §2 does not accept that, so
the supervisor ran four: the action ceasing to write `lighting`, `lighting`
removed from `columns.written`, the instruction reverted (seven tests), and
`lighting` removed from the JSON schema. All red. **The honesty of the report is
what made the check possible** — it is worth more than a report claiming the
mutations were exercised.

Two test files outside the announced scope had to follow, additively, with no
assertion weakened. The ticket did not name them because the supervision had
not seen them — a drafting gap, not an executor overreach.

**Consequence the author must know**: `shot_prompt` will shrink, possibly to
nothing. Once `action_pitch`, `description`, the six camera axes and `lighting`
are excluded, roughly fifteen words of a sixty-word paragraph were genuinely
unique, and those were lighting. This is the direction the audit wants — §9 #4
has that field dissolving — not a regression.

**Still owed, and not yet done**: the manual check of §8 of the ticket —
generating Shots on a real Sequence and reading whether the model actually
names the cast without re-describing it. It is a model call on the author's own
project, so no agent can perform it. Approved on the strength of the code and
the net, not on a real generation.

## `CAM.POSITION.COMPOSITE.1` — three answers were being stored in a field of fifty

One commit, `3bf6150`. No migration. Found on Sq_5000, which the author
generated on 2026-08-24 while an audit of the Shot prompt was being written.

`cameraPosition` is the one camera axis the vocabulary declares as **three
independent questions** — tilt, height, placement — whose grouping
`cameraVocabulary.ts` says must never be elided. The JSON schema line showed
the model those three labelled groups; the rules block, two lines further
down, asked for *"exactly one value"*. The model followed the shape it was
shown and answered all three, which was the reasonable reading. The
50-character bound — correct for the four axes that carry one value — then cut
the answer mid-word. Three of six shots were stored as `role: Over-`,
`role: Rear Vie`, `role: Establish`.

**B19d had already seen a symptom of this and treated the wrong cause.** It
moved the group label to the front of the value list, recording that *"a model
copied the whole thing into the field as one value, twice, on the author's own
shots"*. That changed the shape of the corruption, not its cause. The
instruction now states what the axis actually is: one value per group, written
`tilt: <value>, height: <value>, role: <value>`.

**The bound that was actually cutting was not the one the fix first targeted.**
`normalizeShot` (`src/actions/llm/sequenceShots.ts`) truncates before insert;
the descriptor's `truncateTo` only *declares* what the action does. The
end-to-end test reproduced `role: Over-` after the descriptor alone had been
raised — which is the entire argument for writing the net before the code. Both
are now 120, and the worst case the catalogue can produce (80 characters) is
derived from the vocabulary in the test rather than typed as a literal, so a
longer label added later moves the test on its own.

**A second defect in the same area, found by the same reading.** The action
registry declared one camera column for `createGeneratedShots` while the action
writes five, and its comment described a gap that had been closed — asserting
the action "still writes `shots.cameraPitch`", a column that no longer exists.
A future session reading that note would have set out to dig the hole again.
Nothing caught it because this action, alone among its peers, had **no
assertion comparing its declaration to the row it produces**: its own test
already proved `cameraSubject` was written while the declaration denied it, and
the two never met. `createShotAtPosition` and `addRuleAction` both had that
assertion; `createGeneratedShots` now does too.

**Existing assertions were changed, and that is the ticket, not a shortcut**:
`cameraPosition` leaves the "every palette axis is bounded at 50" rule while
the other three keep it, and twenty-one byte-exact prompt snapshot fragments
follow the new instruction text — they exist to catch precisely this.

Five mutations verified red: each bound restored to 50, the action ceasing to
write `cameraPosition`, a column removed from `columns.written`, and the rule
reverted to "exactly one value". 1791 tests, 174 files, `tsc` and `build`
clean.

**Consequence the author must know**: the three corrupted rows were repaired
directly in the database on 2026-08-24, after a verified backup
(`mikai-backup-2026-08-24T18-00-56-735Z`). Each truncated prefix had exactly
one match in the `role` palette — `Over-`, `Rear Vie` and `Establish` are
unambiguous — so the reconstruction was deterministic, not a guess. A sweep of
the whole database afterwards found no other truncated value among the 69 shots
carrying a `camera_position`.

## `SHOT_PROMPT_SD25_AUDIT` — what an audit of one prompt found about the app

One commit, `3a7b87b`. Documentation only, no code, no field, no ticket
authorized. The document is `docs/SHOT_PROMPT_SD25_AUDIT.md`.

Worth recording here because of **how it went wrong twice before it went
right**, which is a lesson about this codebase rather than about Seedance:

1. The first reading proposed building an `@ImageN` binding from the stored
   order of `shot_reference_images`. That order has no relation to what the
   workflow actually feeds — the engine numbers `image1`, `image2`, … from the
   author's own selection in the Dynamic Batch picker, which displays those
   slot labels and offers Move Up / Move Down. Rendering the stored order would
   have been a confident lie.
2. `orderStoryboardReferences` (`IND.REFORDER.1`) **already holds that rule**,
   extracted, pure and correct, covering both workflow shapes. What sits on the
   Shot path — `guideDefault.conformReferences` — is a second implementation of
   the same rule, wrong, and dead: nothing reads its output.
3. Two claims about the camera and about lighting were written before reading
   B19 and `resolveStoryboardLighting`. Both were wrong: the camera is the
   best-aligned part of the system, and the three-level lighting chain exists
   and works — it is simply **empty everywhere**, six environment Assets, six
   Sequences and every Shot.

The pattern in all three: a mechanism had been built, was correct, and was
invisible from the entity schema alone. **A revision of the reading contract,
so this costs less next time, is owed** — the author asked for it on
2026-08-24 and chose to run the development first.

Six findings of §5.6's coverage measurement of 2026-08-18 are now stale, each
with its evidence, listed in §6 of the audit for whoever opens the first ticket.

## `LOOK.FROMSTORY.VARY.1` — the same question asked twice gets the same answer

One commit, `ff89bbe`. No migration. The author, after using
`Generate Subject & Action from Story` a few times: it proposes *« sensiblement
la même chose »*, `action` above all.

**Diagnosed against the real settings, not guessed**: `app_settings` carries
`llm_temperature = 0.7` on all three providers, read read-only. Sampling was
never the constraint. The operation was: identical story and outline, `intent:
{}`, and **no memory of what it had just proposed**. Re-asking a model the
exact same question returns the story's most salient beat — the same one,
every time. `action` suffers more than `subject` because a story has many
representative subjects and usually one obvious scene.

The fix is a referent, not a temperature knob: the panel remembers the pair it
displayed and sends it back as `intent.parameters.previousProposal`, so
"propose something else" finally points at something. Plus an optional
steering note — the button stays active without it, since here the note
orients rather than *being* the operation — and three prompt rules: don't
default to the opening scene, prefer a moment that stresses the render, depart
noticeably from a supplied previous proposal.

**The supervisor's own omission, stated**: `docs/LLM_WORKSPACE_PRODUCT_VISION.md`
§4 already required, for UC1, that *"the user must be able to re-run with
another seed"*. The descriptor was written yesterday with `intent: {}` and no
such control, and no one checked that requirement against a new operation
because it is phrased as belonging to UC1.

**Known limit, reported rather than hidden**: the model sees only the
immediately preceding proposal, not the history. Exact repetition should stop;
cycling between two or three moments over 3+ consecutive clicks is not
prevented. The next step, if that happens, is a list-of-options output — more
UI, deliberately not taken here. Not yet re-tested by the author at the time of
writing.

## `STYLE.COMPILE.POLARITY.1` — an `Avoid` rule was compiled as an instruction

One commit, `674e177`. No migration. Found by the author on 2026-08-24,
looking at what his own generations came back with.

`compileStyleSnapshot` rendered **every** active rule as `- <instruction>`
under a single `Style Rules:` block. A rule carrying `strength: "Avoid"`
therefore reached the generator identical to a `Required` one — the author
asked to exclude blue skies and ordered them.

**The reasoning error is worth keeping**, because it was written down and
looked principled. §3 of `docs/PROJECT_STYLE_MVP_DECISIONS.md` says *"internal
metadata is not literal prompt content"*, and the compiler's own header cited
it to justify dropping `strength` along with `category`, `applicability`,
`section` and `provenance`. But those four **describe** a rule; `strength`
carries its **polarity**. Dropping it does not simplify the compiled text, it
inverts it. The compiler already knew this elsewhere — a pillar's
`negativeConstraints` have always had their own `Avoid:` block. Atomic rules
had simply never been given the same treatment.

**This session made it worse before finding it.** The two style descriptors
shipped on 2026-08-23 instruct the model to express a negative constraint
*through* `strength: "Avoid"` and never as a negation in the text ("textured
brushwork", not "not photorealistic"). Good instruction in isolation; combined
with a compiler that discards polarity, it **guarantees** the inversion. Before
it, a hand-written "no blue skies" at least survived as text. A correct rule
in one layer became a trap because of a silent assumption in another — the
prompts were left untouched, and the compiler was made to hold its half.

Polarity is expressed by **which block a rule lands in**, never by an inline
`[Avoid]` label — on that point §3 was right, and its original line was left
intact with a dated clarification appended below it. A future session reading
§3 alone would otherwise revert this fix and look correct doing it.

**The net came first**, and it did not exist: a compiler feeding six
generation surfaces and every published version had **no dedicated test**. 18
now, 12 characterizing what was already right, 6 pinning the polarity split —
verified red against the unfixed code before the fix, and both required
mutations break them.

**Consequence the author must know**: a published version's `compiledText` is
frozen by design, so versions published before this fix keep the inverted
text. The draft and its rules are intact — publishing a new version is what
picks up the correction.

Confirmed by the author on 2026-08-24, on his own generations.

**Two questions left open with him, recorded in `.agents/supervised_task.md`
so they are not rediscovered**: whether `Required` and `Preferred` should be
visibly marked in the compiled text rather than merely ordered, and whether
the `Avoid:` block should eventually be routed to a ComfyUI negative-prompt
node — a concept that exists nowhere in the app today (verified: no
`negative` anywhere outside Project Style's own `negativeConstraints`), and
therefore a chantier, not a fix.

## Where the style assistant is reachable from — two placement tickets

`LOOK.FEEDBACK.PLACE.1` (`66586f5`) then `LOOK.FEEDBACK.DRAFT.1` (`d25ae7f`).
No migration. Both came out of the author testing his own product on
2026-08-24, and the second corrected the supervisor, not the code.

**First he could not find the panel.** It existed at one mount only, inside
the `detail.result` branch of a reopened Look Test: scroll down, click `Open`,
and only if a durable result had been saved. It was moved under
`Save Look Result`, where he had just clicked, anchored on the
`publishedResult` the bench already held.

**Then he said what he had actually meant**: *« je veux faire des feedback sur
le current draft, donc pas associé à une generation »*. The supervisor had
heard half the need — reacting to a render — and built only that. The
operation for the other half already existed (`style.adjustDirected`) and was
mounted nowhere but the Style Workspace.

The lesson is about listening, not architecture: a request that names a place
(*« à côté du bouton Generate Look Test »*) was read as a placement problem
when it was a **different operation**. Asking "which of the two things do you
mean" would have cost one sentence; assuming cost a ticket.

**What the fix taught about the code.** The two existing panels differ
structurally, not cosmetically: the Style Workspace one receives
`handleAddRule` and `revision` from a parent that keeps the rule list live;
the bench one resolves the revision itself through `getWorkingDraft`. The
second contract is the one a page without that parent needs — so it was
parameterized by operation (`StyleDirectorNotePanel`) and now serves three
mounts with one implementation. The Style Workspace panel was deliberately
left alone: folding it in would cost its live rule-list refresh.

Only the rule cards were extracted — 33 bytes-identical lines, pure JSX, no
state moved. The Approve/Discard row was measured and **not** extracted: one
caller has a `submitting` condition the other does not, and forcing that into
a shared component would have hidden a real difference.

## `LOOK.FROMSTORY.LLM.1` — a preset that cut, replaced by one that writes

One commit, `0c149ab`. No migration. Asked for by the author on 2026-08-24,
looking at his own bench: *« le subject est tronqué au lieu d'être reformulé
avec un budget de mot »*.

**What "From Story" actually did**, and it was worse than truncation: it
selected and cut. `subject` was the Project's raw pitch (or its name) passed
through `truncateToWords(…, 20)`; `action` was the first clause of
`description`/`story` containing a verb from a ~130-word hard-coded list,
truncated the same way. The outline was never read. The file's own comment
claimed the choice — *"never from an LLM"* — and it predated the workspace.

`lookTest.subjectActionFromStory` reads story **and** outline and writes: a
subject representative of the world, an action playable in one shot, a word
budget honoured by rewriting and guaranteed by the output bound. No style
term, no artist, no brand — style comes from Project Style, and mixing it in
would bias the very test the bench exists for.

**First descriptor with `commit: []`**, and the executor was told to verify
rather than assume it was legal: an operation that writes nothing, whose
output fills two form fields the author still edits before
`createLookTestAction` writes at launch. That the format allowed it without a
change is the useful finding — a read-only operation was already expressible.

**157 lines left in the same diff.** `deriveFromStoryText` and everything that
served only it, symbol by symbol, plus the bench's now-unused `project` prop
and its type. The file had **no test at all**: the deterministic path everyone
trusted was covered by nothing, which is exactly how a "safe" derivation keeps
a defect for months.

Validated in a real browser: selecting From Story now leaves both fields
empty, Neutral Benchmark is untouched, and the new fill goes through the same
overwrite confirmation as the two existing ones — *"Generating from the story
will overwrite your edited Subject/Action text. Continue?"* — with never two
banners on screen at once. The author's own model call is the one step left to
him.

## The Project Style assistant — chantier COMPLETE (2026-08-23)

Nine commits, **no migration anywhere**. Asked for by the author the same
day, after a comparison between his original story
(`docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md`) and what `STYLE.1` had actually
delivered. Step 8 of that story — *« ou alors demandé à un assistant
d'ajuster en conséquence toutes la data »* — existed nowhere.

His framing constraint, and it decided the whole shape: **test the need
against the LLM Workspace before designing anything.**

| Ticket | Commit | What landed |
| --- | --- | --- |
| `STYLE.LLM.VARS.1` | `0b6aa97` | `PROJECT.STYLE.DRAFT` — the Working Draft as a readable variable |
| `STYLE.LLM.ACTIONS.1` | `a1c3e26` | `addRuleAction` in the action registry, with its real semantics |
| `STYLE.LLM.ADJUST.CORE.1` | `13ab839` | `style.adjustDirected` — a director's note in, atomic rules out |
| `STYLE.LLM.ADJUST.UI.1` | `4e04933` | its panel in the Style Workspace |
| `STYLE.LLM.LOOKFEEDBACK.CORE.1` | `804d4da` | the `lookResult` anchor, `LOOK.RESULT`, `style.adjustFromLookResult` |
| `STYLE.LLM.LOOKFEEDBACK.UI.1` | `16fd555` | `applyProposedRules` (tested) + the Look Dev Bench panel |
| `STYLE.LLM.ADJUST.FIX.1` | `8c2b34c` | multi-rule approval, which added exactly one rule |
| `STYLE.ALIGN.BATCH.1` | `cd5fc14` | batch creative alignment over selected Assets |

**The workspace carried almost all of it.** `PROJECT.STYLE` was already a
registered variable; `ProposalPanel`, the runner, the registries and the
template editor already existed. Three bricks were missing, and naming them
was the whole design work: read the *draft* rather than the published version;
declare a write action for Project Style, where the registry had none of its
17 entries; and anchor an operation on something that is not a Project,
Sequence, Shot or Asset. That last one widened `EntityKind` — the only format
change of the chantier, on B16a's precedent.

**What the author asked for and did not get, deliberately**: a general agentic
overlay. Refused with a reason he accepted — an overlay that "acts across the
app" needs a generic write primitive, which §3.2 forbids precisely because it
would bypass renumbering, Shot codes, ownership checks and referential
integrity across 60 tables. The per-pillar assistant he wanted **is** the
descriptor registry; `intent.freeText` + `Redo` is the conversation, with
context re-read fresh from the database each turn instead of drifting in a
thread.

**A defect no test could have seen, and the one worth keeping.** Approving
several proposed rules at once added exactly one, then failed. `handleAddRule`
is a `useCallback` closed over its render's `revision`; the panel captured
that one closure at click time and reused it for every rule, so every call
after the first sent a stale `expectedRevision` and was refused. Nothing was
broken server-side — `addRuleAction`'s optimistic concurrency was doing its
job — and no node test could reach it, since there is no DOM harness here by
decision. It was found because the executor of ticket 4b **reported it instead
of shipping around it**, and it was fixed by moving the chaining into
`applyProposedRules`, a pure function with a real net and a real mutation,
rather than into a `ref` no test could reach. The rule this confirms: when a
correction has no reachable net, the fix is to move the correctness somewhere
a net can reach.

**Two tripwires fired as designed.** `commitAdvisory.test.ts` pinned "exactly
three descriptors, all Asset" so a fourth would fail loudly; it failed twice
during this chantier, each time forcing an explicit decision instead of a
silent drift, and was tightened rather than dropped both times.

**Verified end to end by the author on 2026-08-24.** The panels, their
enabled/disabled states, their visual integration and the console had been
checked in a real browser during the chantier; what no agent could run — a
model call against his working database — he ran himself, against six written
scenarios: the multi-rule approval (the one the fix exists for, deliberately
tested with three rules and not one), the reaction to a real render from the
bench, the batch alignment including its "changed elsewhere" refusal, the
deliberate two-tab concurrency case, and the empty-project path where
`addRuleAction` creates the Working Draft on the way. Nothing came back.

The lesson worth keeping from that split: the scenarios were written naming
the exact on-screen strings read from the components, not paraphrased — so a
divergence would have been reportable as "step 6 says X, I see Y" instead of
a discussion about what was meant.

## Workflow template gallery — chantier COMPLETE (2026-08-23)

Eight tickets, all committed and pushed. Migrations `0061` to `0065` applied
by the author, each after a verified backup.

| Ticket | Commit | What landed |
| --- | --- | --- |
| `WF.CATALOG.1` | `cf5e5a8` | the closed vocabulary and six additive columns (detailed below) |
| `WF.CATALOG.2` | `364d458` | the manager can fill them: category, tags, contexts, status, thumbnail upload |
| `WF.GALLERY.1` | `3eca598` | the gallery itself — five duplicated flat lists replaced by one shared component |
| `WF.GALLERY.2` | `61e3f2d` | the three surfaces that still bypassed the registry: Look Development, the workflow View page, the six default selectors |
| `WF.LIBRARY.1` | `8e9224f` | the overlay library behind "Change Workflow" — the path the author actually uses |
| `WF.LIBRARY.2` | `6da112b` | the thumbnail-size control, extracted once and shared by both surfaces |
| `WF.FAVORITE.1` | `d09d27e` | the favorite flag and its star toggle, migration `0062` applied by the author |
| `DB.MIGRATE.1` | `a5741c9` | `db:migrate` made able to rebuild a table at all |
| `WF.DETACH.1` | `ca3bf8a` | deleting a used workflow detaches its generations instead of failing, migrations `0063`–`0065` |
| `WF.CARD.1` | `90227bc` | card titles that adapt to the thumbnail-size slider |

**Deleting a workflow failed on `FOREIGN KEY constraint failed`** — a constraint
older than this chantier, which surfaced once the page started being used: 369
generations referenced 29 of the author's 33 workflows, and only 4 were
deletable. He chose detaching over refusing or cascading, was told his history
would become partly anonymous, and kept that choice; hence the stamp he
accepted — the workflow's name is copied onto its generations and look tests in
the same transaction, **before** the delete, since once the reference is `null`
the name is gone. A detached job stays readable but can no longer re-run
anything, refused at the three places that allowed it.

**Proven by the author's own use**: he then deleted six workflows. All 369
generations survived, the 19 that lost their workflow carry its name, none
unstamped, no integrity violation.

**`db:migrate` could not rebuild a table, and failed silently.** This is the
finding worth keeping, and it had nothing to do with workflows. `drizzle-kit
migrate` exited 1 with no message and an unchanged database. The cause is not
the generated SQL: drizzle's SQLite migrator wraps every pending migration in
one transaction, SQLite ignores `PRAGMA foreign_keys` inside a transaction, and
this repo's `better-sqlite3` enables foreign keys by default — so **no PRAGMA
placement in generated SQL can ever fix it**, whatever the file split, and
`defer_foreign_keys` only moves the failure to the COMMIT (the counter the DROP
increments is never decremented by the RENAME). `scripts/db-migrate.mjs`
replaces the command: foreign keys off on the connection *before* the migrator
opens its transaction, then mandatory `foreign_key_check` and `integrity_check`
afterward, and no error is ever swallowed again.

**It took the author's real data to see it.** A database rebuilt from the
migrations has no rows referencing `look_tests`; his had 12. An executor's
throwaway-database trial passed, and the real one failed. **Rehearse a table
rebuild on a `db.backup()` snapshot of the real database, with the real
command — not by reading the SQL.**

**Card titles**: the thumbnail slider takes cards down to 140px, and the name
was a single truncated line. Wrapping alone was not enough — the author's names
are space-free blocks (`Seedance_25_multi_img_Enhancer`) that a browser will not
break without explicit permission, and would have overflowed the card instead.
The badge row and the name now stack, two lines maximum, intra-word breaks
allowed but not eager.

**Favorite is a flag, not a category — deliberately.** The author asked for a
"favorite category"; `category` is single-valued, so honouring that literally
would have pulled `SeedanceMid` out of `video` and traded its filing for the
star. It is stored as `is_favorite` and *displayed* as a category: a "Favorites"
section at the top of every gallery, an entry at the top of the library
sidebar, both hidden while no favorite exists. A favorite therefore appears
twice — under Favorites and under its real category — which is the accepted
price of not stealing its filing. Do not "fix" that duplication.

The star must be a **sibling** of the card's `<Link>`, never a descendant: in
the library the whole card is a link, and a `<form>` inside an anchor is invalid
HTML that would have selected the workflow instead of marking it.
`toggleWorkflowFavorite` re-reads the stored value rather than trusting the
client, and writes `is_favorite` alone — touching `updated_at` would reorder
lists on a star click.

**The author's 33 workflows were classified on 2026-08-22, at his request**, into
the eight categories — a data change, not a code one, applied after a verified
backup by a script that refused to overwrite any already-classified row. Two
calls were arbitrary and he was told so: `gemin ref` to `image-edit` (from its
"ref mix avec gemini" description) and `Make ContactSheet` to `storyboard`
rather than `utility`. Every gallery now shows eight filled sections instead of
one `Uncategorized` heap.

`WF.LIBRARY.2` put the size slider on `/settings/workflows` too. The mechanism
was **extracted rather than copied**: one client component, one storage key for
both surfaces, and the chosen size travels as a CSS custom property on the root
— a client-computed number cannot cross the RSC boundary into a gallery that is
a Server Component. `normalizeThumbnailSize` (pure, mutation-proven) sends any
absent, non-numeric or out-of-range value back to the default, so a value
written by one surface can never break the other's grid.

**`WF.LIBRARY.1` exists because the chantier improved the wrong surface.** There
are two ways to pick a workflow: the standalone `/workflows` pages, and the
"Change Workflow" button inside the Generate Content panel. The first three
tickets rebuilt the pages; the author uses the button, which went through a
`WorkflowSelectorPanel` nobody had touched — a text list squeezed into the
narrow side panel. **Ask which surface the user actually touches before
rebuilding one.**

No open/close machinery was invented: the URL contract already existed
(`generation=open&selector=1`, selection via `workflowId`). Only what is
rendered, and where, changed — the overlay leaves `GenerationPanelShell` and
sits above it. Category links and the search form carry every current URL
parameter forward; without that the library closes on the first click and the
shot page's URL-borne state is lost on return.

The thumbnail-size slider is the one client island, on `GenerationPanelShell`'s
exact precedent (value read after mount, try/catch, default size when
`localStorage` is unavailable). Measured in a real browser: 5 columns at the
default on a 1440px viewport, 7 at minimum, 3 at maximum, value kept across a
reload.

**A one-class defect cost a round trip**: the content column lacked `flex-1`, so
it sized to its content — the grid got 437px and rendered a single column with
half the screen empty. Invisible to `tsc`, to 1665 tests and to reading the
diff; found by measuring bounding boxes in the browser.

**`WF.GALLERY.2` closed a defect the chantier itself shipped.** The registry
declared a `look-development` context and the manager showed its checkbox, but
the page never filtered: ticking it did nothing, unticking everything else did
not remove the workflow, and an archived workflow still appeared there. A
promise the UI displays and the code does not keep is worse than no promise.
The rule that produced it — "a context with no selection surface does not enter
the registry" — was applied to Camera Lab and forgotten for Look Development.
Camera Lab was deliberately left without a context here too: its two default
selectors filter on `kind` + `status` only.

A registered default that stops passing its filter stays selectable and marked
`(archived)` rather than vanishing: a setting that empties itself is
unintelligible to whoever set it.

**What the gallery changed.** The same block of workflow cards existed in five
pages and showed everything everywhere; the only filter was a hardcoded
`kind === "image"`. All five now call `isWorkflowOfferedIn`, so the filter has
exactly one definition, and the storyboard's image-only restriction became a
property of the registry instead of a literal in a page. The diff removes more
lines than it adds while adding thumbnails, categories, tags and search.

Search is a `<form method="get">` filtered server-side — no client island, the
pages stay Server Components. It carries the caller's own URL parameters as
hidden fields: without that, searching from the storyboard would drop
`storyboardRefs` and reopen a documented regression fix.

**What it cost to learn, beyond `WF.CATALOG.1`'s lessons below:**

- **the write side can reintroduce the `NULL` vs `[]` trap the read side had
  just closed.** "No context checked" must store `NULL` ("offered everywhere"),
  never `[]` ("offered nowhere"). Mutating that in the action leaves all 1651
  tests green — **nothing in this repository tests a server action**, and the
  ticket forbade building a harness for it. That behaviour is proven only in
  the browser;
- **the executor had no browser access; the supervisor did.** Two visual
  defects survived a self-declared-complete implementation and were only caught
  by looking: the `kind` badge rendered twice on every card, and Settings showed
  an empty band between two stacked section labels. Neither is findable by
  `tsc`, tests, or reading a diff;
- **an executor modified one of the author's real workflows during browser
  testing and did not restore it.** `Grid2Batch` (id 58) was left with a
  category, a `["asset"]` context and a thumbnail — which silently removed it
  from every gallery but the asset one. The count of rows was unchanged, so a
  before/after count proved nothing. Restored on 2026-08-22. **Check the data,
  not the row count, after any ticket whose verification writes through the
  real UI**;
- **file-then-row ordering, with compensation.** The thumbnail file is written
  before the row, the old file is deleted only after the row update succeeds,
  and a failed write deletes the orphan it just created.

**Not verified, and the author owns it:** a real generation from the new
gallery. Queuing a job engages ComfyUI and possibly paid calls. Everything
upstream is proven in a real browser, including the generate page opening
behind each card.

Known debt: `deleteStoredReferenceImage` (`src/lib/uploadImage.ts`) swallows
file-deletion failures silently. It is shared with the reference-image family,
so fixing it was out of this chantier's scope — a thumbnail locked by the OS at
replacement time stays on disk with nothing said.

Tests: 1585 → 1684.

## `WF.CATALOG.1` — the vocabulary (2026-08-22)

`cf5e5a8`, migration `0061` generated here and applied by the author. Six
additive columns on `comfy_workflows` (`category`, `tags`, `contexts`,
`thumbnail_path`, `thumbnail_source_filename`, `status`) and one new pure
module, `src/lib/comfy/workflowCatalog.ts`. Nothing is visible yet: no page,
component or action was touched.

Opened after the author asked for a study of `Comfy-Org/workflow_templates`.
**No workflow is imported from that project** — only its design principle:
presentation metadata lives beside the workflow, never inside its JSON.

What it cost to learn:

- **the six contexts are what the code proves, not what the domain suggests.**
  Camera Lab looks like a seventh, and is not: its page reads two defaults by
  id (`workflowDefaults.gaussianPlyId` / `gaussianToImageId`) and offers no
  choice. A context with no selection surface does not exist. Its workflows
  still need a category, which is why `gaussian-camera` is a category without
  being a context;
- **`contexts = NULL` means "offered everywhere the `kind` allows", never
  "nowhere".** That is the pre-migration behaviour, and it is the only reason a
  six-column migration changed nothing visible for 33 existing rows. Inverting
  that check silently empties every gallery;
- **the categories had to be read off the real library, not inferred.** The
  first list (`keyframe`/`video`/`storyboard`/`look`/`utility`) was derived from
  the context registry, and did not survive contact with the author's 33
  workflows: "Look" matched nothing, "Keyframe" would have swallowed twenty
  unrelated files. The eight shipped categories come from the real names;
- **a review caught the module's one real defect**: a `contexts` column holding
  only unknown ids returned `[]`, which `isWorkflowOfferedIn` reads as
  "offered nowhere" — the row would have vanished from all five galleries with
  no error. Corruption now degrades to `null` ("unspecified"), never to `[]`.

Tests: 1585 → 1626.

Known debt, deliberately left: `WORKFLOW_KINDS` now exists three times — the
new module, `src/actions/comfyWorkflows.ts:8`, and the schema enum. Closed in
`WF.CATALOG.2`, where that action file is in scope anyway.

## Chantier 1 and Chantier 2 — COMPLETE (2026-08-20)

**Everything the sections below describe as upcoming has shipped.** This
document was last accurate on 2026-08-18; read this section first, and treat
the queue descriptions further down as the record of what was *planned*, not of
what remains.

**Chantier 1 — the LLM Workspace, finished.**

| Ticket | Commits | What landed |
| --- | --- | --- |
| B16 | `c30b6a7`, `ef470fb`, `0231327` | the descriptor format can declare an **image input** (N ordered images, per-image keys, bytes re-validated at call time); lighting described from an image; the director's note adjusting an existing lighting |
| B13 | `739ad6f`, `f1ce136` | the **conformation stage**: stored reference roles become the engine's named modes, and the guide's output discipline reports findings that never gate |
| B14 | `0a4f27a`, `ae467e6` | the **storyboard prompt stops eating from one jar** — it composes from the pantry that was already resolved and discarded |
| B20 | `ae174d4`, `77d020d`, `9ba1bb5`, `ad38206` | all three of §5.9's format gaps closed, plus a mutation-proven net under the three properties the migration must not break. **B20e — the migration itself — is deferred past Chantier 2 by the author**, because its blockers turned out to be orchestration, not format |
| B17a | `2a0220d`, `19f63b3` | shot reference videos carry a **role**, migration `0055` applied by the author |

**Chantier 2 — the cleanup, finished except where it needs the author.**
C0 froze the descriptor oracle (`51ed7f9`) so the builders could die; C1/C2
became a **unification** — fifteen per-operation server actions collapsed into
one, thirteen of fourteen panels migrated; C3 deleted six builders nothing
called; C4 filed 31 components by domain and **deliberately left 100 flat**.

**Four nets exist where there were none**: theme, video split, storyboard
extraction, editorial. Each was written *before* the code it guards was
touched, and each was verified by breaking that code and watching tests fail.

**Tests: 968 → 1361.**

### What is left, and who owns it

- **B18** (negative constraints) — the author called it a real gap and
  explicitly not MVP;
- **B19** (camera redesign) — a design job on his own fields;
- **B20e** (the Reference Board migration) — a chantier to design with him;
- **B17b** (the audio family) — deliberately not built: §5.6 says the video
  table had never been exercised, and it only just gained its roles;
- **the 89 flat components** — their domains are a product judgement;
- **the token-efficiency audit** — referenced as "asked for" but never defined
  anywhere, so its scope needs stating before it can be done.

## B19 — the camera redesign, 2026-08-21

Opened because the author asked what "MS" meant in one of his own shots, and
nothing in the app could answer.

**What was wrong.** The vocabulary was copied by hand into three places that
disagreed — Generate Shots offered seven framings, Insert Shot nine, the form's
placeholder five, with `tracking` against `track` and `dolly` against
`dolly in`. The rule banning combinations existed only in Insert Shot and had
never been propagated. Nothing anywhere defined a single value. And the model
had been told to put "camera angle, lens, position" into one free-text field,
so three axes lived as prose in `camera_pitch` on 88 shots.

| | commit | what landed |
| --- | --- | --- |
| B19a | `5a89ef2` | the vocabulary, declared once — five axes, every value with a definition. A **palette, not an enum**: an unrecognized value is flagged and kept, never substituted |
| B19b | `17986f9` | `framing` → `shot_size`, plus `camera_position`, `movement_speed`, `camera_subject`. Six `OTS` rows moved to placement — deterministic, because the instruction had literally listed `OTS` as a framing value |
| B19c | `65261e2` | the form shows the values **and what they mean**, via `<datalist>` so an out-of-palette value stays typable |
| B19d | `8bc467b`, `ec711f6` | both instructions render from the declaration; nothing is hand-copied. Values are written the way the trade writes them — `MS`, but `Low Angle` |
| B19e | `2ba4ac8` | the camera line follows the Seedance 2.5 template, and the conformation counts **movements** instead of filled fields |
| B19g | `2b79abc` | a **lens axis**, opened because the conversion proved one was needed: 22 shots stated a focal length the other five axes could not hold |
| B19h | `4370260` | `camera_pitch` removed. `shot.retakeDirected` keeps its capability on `camera_subject`; the conversion operation is deleted with the column it read |
| B19f | `b5a8ce2` | the conversion pass — a list operation over the sequence, bench-only, every proposal shown beside the text it came from |

**B19 is complete.** B19d, B19e and B19f were finished in the main thread:
the executor hit its weekly limit mid-file on B19d.

**Converted in bulk, 2026-08-21, on the author's instruction.** All ten
sequences, 82 shots. Afterwards, on 91 shots: 63 carry a `camera_position` and
55 a `camera_subject`, both of which did not exist that morning. And **zero**
shots hold a `camera_pitch` whose content is not represented in at least one
axis — which is what makes removing it safe rather than hopeful.

Two things the bulk run found that no test did. A model copied a group label
into a field — `"Dutch / Canted (tilt)"` — because the instruction trailed each
label after its list; the label now leads, and the two rows are fixed. And 22
shots stated a focal length that none of the five axes could hold, which is why
`camera_lens` exists at all: deleting the legacy field without it would have
destroyed those focal lengths.

**Validated on real shots, 2026-08-21.** The author ran the conversion on
`The Awakening and The Trap` — six shots, every one carrying a compound
movement and a size mixing two axes, the hardest set in the database. It held:
`"OTS to MCU"` split into placement plus size, `"slow tracking arc"` into `Arc`
plus `Slow`, and `"tracking push with whip-pan and final dolly-in"` kept
`Tracking` as principal with the other two preserved in `camera_subject` and a
note saying so. `camera_position` and `movement_speed` were left **empty**
wherever the source said nothing — the discipline that is hardest to get from a
model, and the whole point of the operation.

One decision came out of it, and it is the author's: **`camera_subject`
restates the movement its own field already names, and that stays.** The
composed line reads "… — Tracking — Follow Azelle into the pocket …". The 2.5
formula asks for the movement inside that sentence, and the guide says
repeating a key instruction does not hurt. It is recorded in
`cameraInstruction.ts` so it is not mistaken for an oversight later.

A decision that also held end to end: `"tilt and lateral tracking"` became
`Tracking`, not `Truck Left`, because the source never says which side. That is
exactly why B19a refused to alias `tracking` onto a directional movement.

**Two silent losses the removal surfaced, neither by any check.** Generate
Shots read `framing` for the shot size after B19d had rewritten the instruction
to ask for `shot_size`, so it stored none — and it had no path at all for
`camera_position`, `movement_speed`, `camera_subject` or `camera_lens`. A
round-trip test had recorded that gap as *expected behaviour*; it now asserts
the opposite.

**Three reversals, all sourced.** Size intervals are allowed — the 2.5 guide
speaks of a starting and an ending shot size, and the ban came from 2.0. The
"one primary camera instruction" rule was counting fields, so it warned on
correct usage. And `camera_pitch` is kept rather than dropped: it is the only
angle 88 shots have, and the composition falls back to it while
`camera_position` is empty — precedence, never accumulation.

**Sources.** The BytePlus conference slide the author supplied (shot size,
camera angle, framing/placement, camera movement), the official `sd25-pe`
skill, and the Seedance 2.0 guide. Neither guide defines a closed vocabulary;
2.5 goes further and forbids a bare term detached from its subject, which is
why `camera_subject` exists at all.

**Two silent losses caught by mutation, not by review.** `updateShot` would
have wiped `camera_pitch` on the first edit once the form stopped submitting
it, and 358 tests still passed. And Insert Shot would have asked for the three
new axes while `normalizeProposedShot` dropped them.

## GEN.MULTIOUT.1 — a job may return many files, 2026-08-22

Found by the author using the product: a `Grid2Batch` workflow takes one image
and gives back four, and only one ever reached MikAI.

**What was wrong.** `ImageGridtoBatch → SaveImage` publishes a whole batch into
a single `images` array, and `extractFirstComfyOutput` took `images[0]`. Not a
bug — an assumption, "one job, one output", never reopened since. It was sealed
by the schema: `generation_jobs.output_path` is one TEXT column. Measured on job
544 (asset 51, Comfy Cloud): four images returned, one stored, and the other
three still served by `/api/view` two days later at four distinct sizes.

| Commit | What landed |
| --- | --- |
| `6cef0e4` | `extractComfyOutputs` returns every file with the kind ComfyUI filed it under; `generation_job_outputs` records one row per file; both poll paths download the batch |
| `7a35ac6` | the Content Generator gallery — all outputs ticked by default, `Unselect all`, and `Attach as Reference` storing each selected source |
| `cb6f032`, `97fb4b9` | the hover preview, uncropped, on the Asset gallery and the Shot outputs list |

**`output_path` was never replaced.** It still points at index 0, so the twenty
call sites that read it — video approval, reference attachment, storyboard,
sequence video, the PLY cache — are untouched. The table sits beside it.

**Two rules the design rests on.** A sibling that cannot be fetched never fails
the job, because the primary output is already published and valid; the missing
`output_index` is the durable trace, which is why indexes are never compacted.
And ordering has two different guarantees: inside a node it is ComfyUI's batch
order, between nodes it is ascending node id — a language rule about integer-like
keys, not a choice.

**Migration `0058`** applied by the author. **`G5`, back-filling the jobs that
predate this, was declined** — the old rows keep their single output.

**Caught by mutation, not by review.** Two tests passed for the wrong reasons:
removing the confinement check changed nothing, because both escape fixtures
pointed at files that do not exist and `fs.access` refused them first; and
sorting by filename passed the ordering test, because the fixtures happened to
be named in index order. Both were rewritten to isolate what they claim.

**Verified in a browser** with Playwright against a throwaway copy of the
database — no paid Cloud call — then confirmed by the author on a real
generation.

## `SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1` — Extract rattrape la plage, 2026-08-22

Un commit, `868869f`. Aucune migration. Suite directe du ticket ci-dessous,
livrée le même jour : un storyboard peut désormais ne couvrir qu'une plage, et
Extract from Storyboard appariait encore la vignette *i* au Shot *i* en partant
du premier de la séquence.

Le décalage n'était pas le pire. `expectedShotCount` pilote la **détection** :
il cherchait 6 cases dans une image qui en avait 3, donc la grille elle-même
était fausse avant tout appariement, et corriger le mapping après n'aurait rien
rattrapé.

### La cascade, et la contrainte qui la cadre

Choix explicite sur la page Extract → sinon plage héritée du job de génération
→ sinon séquence entière.

Ce dernier cas est celui d'un **storyboard uploadé à la main** : pas de job,
donc pas de provenance. L'auteur l'a posé comme contrainte avant l'écriture du
ticket — « il ne faut pas que cette information soit mandatory » — et elle a
son propre test : aucun champ obligatoire, aucun blocage, aucun avertissement,
comportement identique à avant.

### Zéro migration, et pourquoi ce n'était pas évident

La plage voyage dans `GenerationSnapshot`, contrat JSON additif qui portait
déjà `sequenceStoryboardReferenceMappings` et `styleProvenance` — deux
précédents exacts. Elle se persiste ensuite dans le `paramsJson` de
l'extraction, le blob qui enregistre déjà « les params réellement utilisés ».

Elle y stocke **la liste ordonnée des ids couverts, pas deux bornes**. Un
réordonnancement ou une suppression de Shots entre la génération et
l'extraction réinterpréterait des bornes en silence sur une autre tranche ; une
liste explicite se dégrade proprement — les Shots disparus sont listés et
signalés, jamais remplacés par un voisin.

**`promptSnapshot` contient pourtant la plage en clair** depuis `0e9e121`, sous
la forme `Shot range: this Storyboard covers Shots …`. Le ticket l'a interdit
explicitement comme source : c'est de la prose écrite pour un modèle, pas un
format. La donnée passe par le JSON ou pas du tout.

### Deux défauts, aucun visible dans le diff

C'est ce que ce ticket a produit de plus utile.

**Un crash introduit par le ticket lui-même.** `assignAllExtractionRegions`
relisait `paramsJson.shotRange.shotIdsInOrder` **brut**, sans le confronter aux
Shots vivants. Un Shot supprimé après la détection y restait nommé,
`proposeShotMapping` l'attribuait à une région, et l'écriture de `targetShotId`
violait la clé étrangère : `FOREIGN KEY constraint failed`, jeté hors de toute
gestion d'erreur. Avant ce ticket le cas était impossible — Assign All
requêtait toujours les Shots vivants.

Reproduit sur le harnais DB réel **avant d'être signalé**, et corrigé en
faisant passer les trois branches par le même `resolveExtractionShotRange` — la
fonction écrite précisément pour filtrer les ids morts, et que sa propre
branche court-circuitait. Deux tests, vus rouges avant la correction.

**Un texte faux, trouvé en regardant la page.** La carte « Storyboard Shot
Range » d'Extract héritait verbatim du composant partagé, qui affirme que « les
références de casting restent calculées sur toute la séquence » — une notion
qui n'existe pas sur cette page. Corrigé par une prop `helpText` dont le défaut
est la phrase d'origine octet pour octet, donc la page de génération n'a pas
bougé.

La leçon vaut d'être gardée : **la relecture du diff n'a attrapé ni l'un ni
l'autre.** Le premier a demandé de rejouer un scénario que personne n'avait
écrit, le second de charger la page. `mikai-method` §2 et §5 disent exactement
cela, et les deux se sont vérifiés le même jour.

### Preuve

1561 → **1585 tests**, 24 ajoutés, aucune assertion existante modifiée.
Vérifié en navigateur sur l'extraction 78 (projet 18, séquence 54, 20 Shots) :
« Covers the full Sequence (20 Shots) » sans plage, « Shot range set here: 5 of
20 Shots » avec, et la grille suggérée qui passe de 20 à 5 — la preuve que
`expectedShotCount` suit, donc que la détection se recale.

Deux chemins **non prouvés à l'écran**, dit plutôt qu'arrondi : l'image
uploadée (il aurait fallu lancer le worker OpenCV) et l'héritage réel depuis un
job (une génération ComfyUI). Les deux ont un test dédié sur base réelle.

### Laissé de côté

Le `<select>` de réassignation d'une région liste toujours **tous** les Shots de
la séquence : la plage propose, elle n'enferme pas. Même principe que le casting
non restreint du ticket ci-dessous.

## `SEQGEN.STORYBOARD.SHOTRANGE.1` — le storyboard n'avale plus toute la séquence, 2026-08-22

Un commit, `0e9e121`. Aucune migration. Demandé par l'auteur le jour même : le
prompt Sequence Storyboard prenait systématiquement **tous** les Shots de la
séquence, sans moyen d'en cadrer un extrait.

Deux params d'URL optionnels, `shotFrom`/`shotTo`, portant des **ids de Shot**
et non des positions, posés par deux `<select>` dans une carte « Storyboard
Shot Range ». Absents — le défaut — le texte produit est inchangé **octet pour
octet**, et un test l'exige.

### La décision qui a cadré le ticket

`shotList` est chargé deux fois indépendamment, par la page Generate et par
`buildSequenceStoryboardGenerationContext`, et **c'est assumé** dans ce fichier
depuis `SEQGEN.STORYBOARD.3`. La plage est donc un helper pur appliqué aux deux
endroits — `selectStoryboardShotRange`, générique sur `{ id: number }` — pour
que preview et queue ne puissent pas diverger, la contrainte que ce fichier
porte déjà pour `includeWarnings`.

Elle ne filtre que `shotInputs`, `shotCount` et l'entrée de
`resolveStoryboardLighting`. **`shotIds` reste la séquence entière**, donc le
pool de références de casting aussi : décision de l'auteur, prise avant
l'écriture du ticket. Restreindre le casting aurait fait disparaître en
silence une référence qu'il avait explicitement sélectionnée hors plage, et
renuméroté les `@ImageN`.

### Deux refus de deviner

- une borne nommant un Shot inexistant est **ignorée avec un warning nommant
  l'id**, jamais rabattue sur un voisin ;
- une plage inversée **replie sur la séquence entière avec un warning**, au
  lieu d'échanger les bornes. Échanger supposerait une intention que
  l'utilisateur ne verrait nulle part.

### Deux pièges que le ticket n'avait pas vus

- **`Number("") === 0`.** L'option vide des `<select>` soumet `shotFrom=`,
  chaîne vide, que `Number.isInteger` accepte comme `0` : « First Shot »
  aurait été lu comme « Shot id 0 ». Sans le garde `trim() === ""`, le
  contrôle spécifié ne fonctionnait pas.
- **La clé de remontage de `WorkflowRuntimeMappingPanel`** devait inclure la
  plage. Cette clé existe parce qu'un changement de `suggestedText` doit
  re-semer le « Suggested Text » que le panneau tient en `useState` ; la plage
  change `suggestedText` exactement comme l'ordre de casting le fait. Sans
  elle, le bug de staleness déjà corrigé pour le casting revenait pour la
  plage.

### Et une prémisse fausse dans le ticket lui-même

Le ticket demandait d'afficher les warnings « au même endroit que ceux du
prompt ». **Cet endroit n'existe pas** : `promptResult.warnings` n'est rendu
nulle part sur cette page, et ne l'a jamais été. L'exécutant l'a dit au lieu
de bricoler autour. Les warnings vivent donc dans la carte Shot Range, en
style informatif, jamais bloquant. La leçon est pour le superviseur : une
consigne de réutilisation doit être vérifiée avant d'être écrite, pas
supposée.

### Preuve

1549 → **1561 tests**, 12 ajoutés, aucune assertion existante modifiée ; le
diff du snapshot est en pure addition, ce qui est la garantie mécanique que le
défaut n'a pas bougé. Cinq mutations, dont la borne haute rendue exclusive —
**7 tests sur 10 en échec** — rejouée par le superviseur et non pas seulement
rapportée.

Vérifié en navigateur sur données réelles (projet 18, séquence 57, 6 Shots) :
6 vignettes sans plage, 3 avec `Sh_200`→`Sh_400`, la ligne `Shot range:`
présente, le casting inchangé, et la plage qui survit au « Update Preview » des
Image Inputs — le bug historique de `storyboardRefs`, non reproduit.

### Dette laissée, sciemment

- aux deux sites, un `?? { id: …! }` inatteignable : quand la plage est réelle,
  l'id vient forcément de `shotList`. Deux assertions non-nulles pour un cas
  impossible ;
- le warning de plage inversée nomme l'id brut (« Shot 999221 ») et non le
  `shotCode` (« Sh_400 »), parce que l'helper est générique et ignore les
  libellés. Conforme au ticket, désagréable à lire.

## `STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1` — a debt closed by measuring, 2026-08-22

One commit, `e418865`. No migration. Open since 2026-08-02.

### The roadmap's own description of it was wrong

It said the ticket had to apply Look Development's `pending sync` pattern to
Reference Analysis, and that "the pattern already exists elsewhere, this ticket
applies it, it invents nothing".

Reading the file said otherwise: `ReferenceAnalysisWorkspace.tsx` already
carried the `pending-sync` phase on **six sites** and a read-only `Retry sync`,
shipped with `STYLE.1.B.ANALYSIS.UI`. Nothing was missing from the product.
**What was missing was the proof** — and the roadmap had been describing a
feature gap for twenty days when the real gap was a test gap.

Worth keeping: a roadmap line written at ticket-deferral time describes the
plan, not the code. It had never been re-read against the file.

### Why the proof had been impossible

The decision was written inline, in `async` callbacks that also call Server
Actions. Testing it meant intercepting a Server Action, and that had already
been tried on 2026-08-01: 15/42 proofs, because `tsx` resolves `@/` imports
before ESM `load` hooks can rewrite them. `mikai-method` §5 forbids installing a
DOM harness — the user's decision, reconfirmed.

The way out was not a better harness. It was to make the decision testable
**without a DOM and without a Server Action**.

### What shipped

`src/lib/projectStyle/referenceAnalysis/syncPhase.ts` — two pure functions, no
state, no React, on the shape `restoreLookTestSnapshotSelections.ts` had already
set:

- `resolvePendingSync(origin, outcome)` — the eight decisions as one total
  function;
- `retrySync(need, { readAnalysis, readDraft })` — replays reads only.

No hook and no handler body left the component. Every `handleXxx` still owns its
`setPhase`, `setReadModel` and `setPendingMutations`; only the branching and the
message literals moved. That line matters: §5 forbids moving **state**, and a
pure calculation is not state. The precedent was already in the repository, and
this is recorded so the next session does not re-litigate it.

**The property the 2026-08-02 spec asked to confirm is now true by
construction.** `retrySync` receives readers and nothing else — it *cannot*
replay a mutation, and a change that would make it possible has to add a
parameter, which is visible in review.

### Proven twice, and the browser half is the one that had never been done

**Unit** — 22 tests over the eight decisions, `syncNeed` *and* `message`
asserted. Seven mutations run: five by the executor, two more by the supervisor.
Every one broke at least one test. The supervisor's second mutation swapped two
messages, and it matters on its own: a net asserting only `syncNeed` would have
passed it silently and let any future reword through.

**Browser** — `next start`, real project, real data. `window.fetch` patched to
let the first POST through and fail the next: POST #1 is the commit, POST #2 is
the read, because `ObservationCard.handleStatusChange` calls the read **only
after** a known `result.ok`.

| Step | Network | Screen | DB |
| --- | --- | --- | --- |
| Reject, injection armed | `PASSED #1`, `FAILED #2` | `Observation saved but analysis state could not be refreshed.` + `Needs: analysis` | `revision` 2 → 3 |
| `Retry sync` ×3 | 3 read POSTs | `Sync still incomplete. Retry when ready.` | **unchanged** |
| injection lifted, `Retry sync` | `PASSED #6` | banner gone, card reconciled from a real read | unchanged |

`updated_at` stayed frozen at the instant of the commit across four retries.
That is a measurement, not an observation, and it is what Playwright alone could
never have given — Playwright shows that no mutation happened *in one run*; the
signature shows it cannot happen at all.

### What it cost, and what it left

A backup was taken and verified before touching anything
(`mikai-backup-2026-08-22T00-51-18-448Z`). The observation was restored to
`accepted` through the product's own path, but **its `revision` is 4 where it was
2**, and `updated_at` moved. A revision counter does not walk backwards through
the UI, and writing it by hand was not worth the risk. Injecting a failure into
real data always leaves a counter behind — take the backup first and say what
moved.

Two paths were **not** exercised in the browser: `analysisLaunched` and
`analysisConfirmed`, each of which needs a real provider call. A cost decision,
not a technical limit; both are covered by the unit net.

### Left alone on purpose

The same `pending sync` pattern is hand-written in **five other components** —
`SequenceStylePanel.tsx`, `LookDevelopmentBench.tsx`,
`LookDevelopmentReviewControls.tsx`, `LookDevelopmentRecentTests.tsx`,
`InfluenceResearchWorkspace.tsx`. Unifying them was ruled opportunistic and
excluded from the ticket. `syncPhase.ts` is written so a later generalisation
needs no rewrite. This is a real observation awaiting the author, not a defect.

One behaviour frozen as-is and worth knowing: `resolvePendingSync` tests
`outcome.analysis === false`, not `!outcome.analysis`, so an omitted field reads
as success. Every call site passes a real boolean today.

**Tests: 1 527 → 1 549.**

---

## What the `camera_pitch` drop cost, measured 2026-08-22

Migration `0060` (`ALTER TABLE shots DROP COLUMN camera_pitch`) is **applied**;
the column is gone. This section exists because the measurement was taken while
it still stood, and the answer is worth keeping.

**Six shots lost their camera angle, and it is six out of six.** Of the 88 rows
still carrying a `camera_pitch`, six spelled out an angle after a dash, and none
of those values appears in any of the new axes:

| Shots | Value lost |
| --- | --- |
| 36, 41 | `2/3 angle` |
| 37, 39 | `3/4 angle` |
| 38, 40 | `Eye Level` |

The first count taken said "six out of 88", which was comforting and wrong: rows
with no dash were skipped and silently counted as safe. Every shot that recorded
an angle lost it. `Eye Level` is the neutral case and costs little; `2/3` and
`3/4` are an orientation that `Over-the-Shoulder` and `Establishing Shot` only
partly cover.

**They are recoverable, and nothing needs restoring to get them.** The column
survives in the pre-`0060` backups — `mikailab-DBHEALTHREPAIR1-pre-live-2026-08-10`
holds all six verbatim. Reading six values out of a backup file is a query, not
a restore, so the decision to reinstate them can be taken calmly, later, and
without touching the live database. The 2026-08-21 backups are already past the
conversion and do **not** carry it.

**Two `shot_size` values are still a truncated sentence, not a code.** Shots 37
and 39 hold `"ELS - Eyes on Max, emphasizing his confident demea"` and its twin,
cut at 50 characters: the conversion wrote the model's justification into the
field. Unrelated to `0060`, still true today, repairable by hand.

## Three bugs from real use, 2026-08-20 — and the pattern two of them shared

All three came from the author using the product, not from auditing code. Worth
recording because the second and third were the same defect wearing different
clothes.

**1. Multi-image generation silently used two images** (`4c34ead`).
`ImageBatchMulti` reads only its first `inputcount` slots, and the expander
wired `image_1..image_N` without ever writing that widget — so it kept its
serialized default of 2. Every job queued with three or more references had the
extras present in the JSON and ignored by ComfyUI. **Nothing errored.** Found by
comparing two exported workflows side by side.

**2. The sequence cast reached no Shot** (`cd0601c`).
`sequence_assets` and `shot_assets` are independent tables with no propagation
either way; the Storyboard reads what the *Shots* carry, which is correct.
Running Casting Suggestions is the bridge, and it works. The page carried a note
saying assets "are not automatically added to individual shots" — describing
what does not happen without naming the remedy or which assets were affected.

**3. A validated split plan cut nothing** (`41e9b5f`).
Validating maps segments to Shots; *pushing* cuts the clips and sets each Shot's
thumbnail. The page showed a green "Validated" badge over segments all reading
"Mapped", with the remaining step a button further down that nothing pointed at.

### The pattern, and its sweep

Two and three are one defect: **the mechanism was right, and the interface
claimed a completion it had not reached.** Both are now fixed by making the
incomplete state say so — an amber badge and a named next action, not a change
of mechanics.

The schema has exactly **three** status enums with intermediate states, and all
three were examined:

- `sequence_video_split_runs` — `validated` is set by an action that does *not*
  do the work, and the enum has no `pushed` state. This was bug 3. The page now
  derives the pushed state by counting candidates, which is **stronger than a
  status column would be**: a column can be set and then contradicted by
  deleted candidates, while the count is always true. No migration needed.
- `sequence_video_split_segments` — `pending | mapped | skipped`, per segment,
  and consistent with the run above.
- `sequence_storyboard_extractions` — `confirmed` is set **by the action that
  writes the reference images**. Sound by construction; no equivalent gap.

So the pattern was real, occurred twice, both are fixed, and the sweep is
complete rather than sampled.

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

## LLM Workspace Phase B — COMPLETE (2026-08-16)

B0 to B9b delivered. The ticket-by-ticket log — 32 sections, one per ticket,
each recording what it cost to learn — was **moved to
`docs/archive/LLM_WORKSPACE_PHASE_B_LOG.md` on 2026-08-21**, where nothing is
asked to read it.

It was 1 734 lines here, roughly 35 000 tokens, for a phase that is finished
and whose outcome is summarised at the top of this document. Reading it was
never the intent; paying for it on every visit was the accident.

Open the archive deliberately when you need to recover *why* a Phase B
decision was taken. For what is true now, the top of this file is the answer.

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
