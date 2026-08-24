# Shot Prompt Composition — Audit Against Seedance 2.5

Status: audit only. **No ticket is authorized by this document**, no field is
created, no code is changed.
Date: 2026-08-24.
Scope: how a Shot's prompt is composed, measured against the Seedance 2.5
conference material the author supplied, the `sd25-pe` skill, and the
*Seedance 2.0 Complete Prompting Guide* that
`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.5 names as the conformation norm.

Every claim below was read in the code or queried against `data/mikailab.db`
before being written. Where this document contradicts §5.6's coverage
measurement of 2026-08-18, §6 says so explicitly and gives the evidence.

---

## 1. Why this audit exists

The author supplied three slides from a ByteDance Seedance 2.5 conference and
asked how our Shot template compares. The comparison turned into an audit
because the first reading was wrong twice, and the second reading found that
several mechanisms this document would have proposed **already exist and are
correct** — while a second, incorrect implementation of one of them sits on the
Shot path.

The value of this document is therefore less "here is what to build" than
**"here is what is already true, and where the two halves of the codebase
disagree with each other."**

### What the guide is, and is not

§5.5's framing is unchanged and binds everything below: the guide is the
**default conformation rule**, replaceable per engine. No ingredient, variable
or entity field may be named after Seedance. Every adjustment proposed here
lands in the composition or the conformation profile, never in the product
vocabulary.

---

## 2. What Seedance 2.5 asks for that 2.0 did not

The three slides give a multi-shot template — `Style` / `Subject Definition` /
`General Description` / `Shot Detail` / `Constraints` — and a basic formula
(`Subject + Motion` required; `Environment`, `Camera Movement / Cut`, `Audio`,
`Style`, `Constraints` optional).

The one genuinely new mechanism is the **subject token**:

```text
Define the robot in [Image 1] as <subject 1>
...
Shot 1: <subject 1> (the robot) is running excitedly toward <subject 2>
```

A subject is bound once to a reference, then re-invoked by name in every shot.

**Seedance 2.0 has no such mechanism.** Read on 2026-08-24 from the guide §5.5
cites: consistency is held *"through repeated explicit reference to uploaded
image files (`@Image1 as character reference`) rather than through a shorthand
variable or naming system within the prompt text itself."* Its tag budget is
`@Image1-9` / `@Video1-3` / `@Audio1-3`, twelve files total, and its formula is
`[Subject], [Action], in [Environment], camera [Camera Movement], style
[Style], avoid [Constraints]`.

ByteDance's own 2.5 examples use the *defines* form rather than chevrons —
`@Image 1 defines Sol's identity and work clothes` — and their stated guidance
is to **name the part of a reference to use, never the part to avoid**.

### One budget correction, from the 2.0 guide itself

The guide's `60–100 words` target applies to the **single-shot formula**. Its
own shot-script format is explicitly exempt: *"Shot-script formats do not have
an explicit word limit."*

`guideDefault` applies the budget to everything it inspects
(`src/lib/llmWorkspace/conformation/profiles/guideDefault.ts:108-112`),
including a multi-shot package. Part of the author's concern about being beaten
by the word budget comes from a rule applied outside its own scope.

### Higgsfield — the same design, already productized

Their **Elements** system stores an asset once under a short role-based name
(`@hero`, `@kitchen`), *"roles, not descriptions"*, *"stable across the whole
project"*, and a project opens with an explicit element list. Three of their
rules bear directly on §9 below:

- *"a character or product that recurs in every scene must come from ONE locked
  reference, or the model reinvents it slightly each time"*;
- *"Do not re-describe an Element's appearance in shot text. The Element itself
  anchors the look; restating it in prose creates conflicting instructions"*;
- restate only **3–5 geometric anchors** as consistency insurance, and give a
  state variant its **own** Element rather than mutating the reference.

---

## 3. What MikAI composes today

Two assemblers, and the one wired to generation is the poorer.

**`compileShotPrompt`** — the text actually queued to ComfyUI for one Shot — is
`shotPrompt`, plus `\n\nTimeline:\n…` for a video Shot that has Prompt Segments
(`src/lib/prompts/compileShotPrompt.ts:113-115`). Nothing else.

**`runShotGeneration`** loads the cast, `shot_reference_images`, the cast
assets' own reference images and the segments
(`src/lib/comfy/runShotGeneration.ts:200-238`), then calls `compileShotPrompt`
(`:240`), **which reads none of it**. The ingredients are resolved and
discarded — the exact reproach §5.7 made of the storyboard path, still true on
the Shot path.

**`composeStoryboardShot`** — the seven-part composition (`Subject / Action /
Environment / Camera / Lighting / Style / Constraints`,
`src/lib/llmWorkspace/composition/storyboardShot.ts:184-280`) — works, was
judged better by the author in the 2026-08-19 beta (§5.7b), and is wired
**only** to the Sequence package
(`src/lib/prompts/buildSequenceGenerationPackage.ts:351-365`).

---

## 4. The generators, and what they actually instruct

This is where the audit's sharpest finding sits, and it is not visible from the
schema alone.

### `shots.fromSequence` manufactures wardrobe drift

Its JSON schema asks for fourteen fields
(`src/lib/llmWorkspace/descriptors/shotsFromSequence.ts`, rendered by
`src/lib/llmWorkspace/variables/registry.ts:2584-2612`) and closes with:

> `shot_prompt must be a dense, cinematic visual description suitable for AI
> image/video generation. No labels, no narrative scene references — only
> visual content.`

Measured on two generated Sequences, and the two disagree on one point — which
is why the claim below is narrower than an earlier draft of this document made
it.

**Sq_4000, 2026-08-19** — `shot_prompt` never names Azelle:

| Shot | How `shot_prompt` designates Azelle |
| --- | --- |
| `Sh_100` | `Anthropomorphic macaque space pirate in worn utility gear` |
| `Sh_200` | `Nervous anthropomorphic macaque` |
| `Sh_300` | `Anthropomorphic macaque` |

**Sq_5000, 2026-08-24** — it names her in five Shots out of six. So the
instruction does **not** reliably suppress the cast name; that depends on the
model's reading on the day, which makes it unreliable in both directions.

**What is constant across both Sequences is the re-description, and it drifts.**
Her wardrobe, Shot by Shot, on Sq_5000:

`worn pirate gear` · `fur-lined face` · `her worn pirate sleeve and fur` ·
`worn space-pirate gear` · `battered pirate gear`

Five phrasings in six Shots, and **not one of them is her Asset Bible's**
*scuffed utilitarian flight jacket over a faded undersuit*. Meanwhile the prop
that holds that wardrobe — `Worn Flight Jacket` — is cast on **none** of the six
Shots.

**The drift is produced upstream, before any generator sees the prompt.** It is
the exact failure Higgsfield's Elements documentation describes, and its cause
is the instruction to write a self-contained visual paragraph — not a missing
field.

On Sq_4000 the same `shot_prompt` values end with `no text, no labels` — the
model improvising its own per-shot negative constraint because no field holds
one.

### `shot.insertDirected` already decided the opposite

Its schema has **thirteen fields and no `shot_prompt`**
(`src/lib/llmWorkspace/descriptors/shotInsertDirected.ts:184-186`), and its
rule for `action_pitch` is explicit: *"describes what happens on screen, in
terms an animation team can act — who does what, in what order."*

So the author's newer instruction already made `action_pitch` the carrier and
dropped `shot_prompt`. The two generators disagree, and only one of them is
compatible with a Subject Definition header.

One consequence to know: an inserted Shot carries no `shot_prompt`, so under
today's `compileShotPrompt` it queues with an empty prompt.

### `action_pitch` already carries the token

`action_pitch` names the cast in plain text — *"Azelle advances past sealed
cargo architecture…"*. The re-invocation mechanism Seedance 2.5 introduces
therefore needs **no rewriting of Shot data**: it needs a header that declares
what `Azelle` designates. This is the single cheapest structural gain in this
document.

---

## 5. Reference ordering — the mechanism that already exists

### `@ImageN` is decided by the author, in the picker

The images fed to a workflow come from `buildRuntimeImageOptions`
(`src/lib/comfy/mapWorkflowInputs.ts:98-130`), which lists the Shot's own
reference images first, then the cast assets' reference images — **and the
latter carry `assetName` and `assetType`**. The asset-to-image binding this
audit was going to propose already exists at this layer.

A Dynamic Batch workflow then clones its chain once per selected image and
names the inputs `image1`, `image2`, … from the index in the **selected list**
(`src/lib/comfy/expandDynamicBatch.ts:473-489`). `DynamicBatchImageList`
displays those slot labels literally
(`src/components/DynamicBatchImageList.tsx:92-94`) and offers Move Up / Move
Down (`:202-215`). The selection persists ordered as
`batchImages_<nodeId>=id1,id2,…`.

**The author already arranges `@ImageN` by hand and already sees the numbers.**

### The rule is already extracted, and already correct

`orderStoryboardReferences` (`src/lib/prompts/orderStoryboardReferences.ts`,
`IND.REFORDER.1`) states it:

> *`@ImageN` must designate the image actually sent at that position. When the
> workflow has a Dynamic Batch node, that is the batch's own selected order and
> subset — never the raw Storyboard Assets order… Only a workflow without a
> batch node, where images are assigned per node instead, falls back to the
> full available order.*

Pure, shared, and it covers both workflow shapes.

### `conformReferences` is a second, wrong implementation of the same rule

`guideDefault.conformReferences` numbers `@ImageN` from the stored order of
`shot_reference_images` (`guideDefault.ts:79-89`). That order has no relation
to what the workflow feeds. Rendering it would label `@Image1` an image the
engine receives as `image3` — a confident lie, worse than rendering nothing.

**It is also dead.** Its only caller is `storyboardShot.ts:258`;
`composeStoryboardShot`'s only two consumers read `.text`
(`buildSequenceGenerationPackage.ts:352`) and `.findings`
(the storyboard generate page, `:507`). Nothing reads `.references`.

Removing it is safe and corrective. Verified as part of that check: **neither
asset generation nor the image-selection path imports the conformation module
at all** — `runAssetGeneration`, `buildRuntimeImageOptions` and
`expandDynamicBatch` are untouched by it. Only `conformReferences` goes;
`inspect` stays, since its findings are displayed, and its counts do not depend
on order.

---

## 6. Where §5.6's measurement of 2026-08-18 is now stale

Recorded so the corrections are carried into
`docs/LLM_WORKSPACE_PRODUCT_VISION.md` when a ticket opens, and so no future
session rediscovers them.

1. **"Nothing holds negative constraints" is false at project level.**
   `project_style_drafts` carries `worldNegativeConstraints` and
   `visualNegativeConstraints` (`src/db/schema/projectStyle.ts:78-81`), and
   rules carry `strength: "Avoid"`. Since `STYLE.COMPILE.POLARITY.1`
   (`674e177`, 2026-08-24) the compiler emits a top-level `Avoid:` block
   (`src/lib/projectStyle/compileStyleSnapshot.ts:78-93`). What remains missing
   is the **Shot** level. What is wrong is the **routing**: the whole compiled
   Style text, `Avoid:` block included, is dropped into the composition's
   `Style:` part.
2. **The camera is not debt — five of its six axes are the best-aligned part
   of the system.** `camera_subject` is asked for as *"prose: movement +
   subject it follows + start + direction + arrival"*
   (`src/lib/llmWorkspace/cameraInstruction.ts:104`), which is the `sd25-pe`
   cinematography formula verbatim, and `shot_size` accepts a start-to-end
   interval per 2.5's own starting/ending shot size. B19 already did this work.
   Measured on Sq_5000 (six Shots, generated 2026-08-24): `shot_size`,
   `camera_movement`, `movement_speed` and `camera_subject` are correct 6/6,
   including the interval `MS to WS`.
3. **Lighting is not a missing ingredient.** The three-level chain exists —
   environment Asset → Sequence → Shot, precedence not accumulation, from the
   author's own craft model
   (`src/lib/llmWorkspace/composition/resolveStoryboardLighting.ts:8-30`) —
   with fill and assist bricks around it. See §7.
4. **The conformation caps are 2.0's.** 9 images / 12 files
   (`guideDefault.ts:113-115`) against 2.5's 30 images / 10 videos / 10 audio /
   50 assets total.
5. **The word budget is applied outside its scope** — see §2.
6. **`shot_reference_videos` has carried `video_role` since B17a** and is still
   composed nowhere, while 2.5 treats video as a first-class subject source
   (`Define [Core_Features_Of_Subject_1] in [Video 1] as <subject 1>`).

Audio remains genuinely out of scope, per the author's decision of 2026-08-18.
A **dialogue text field on the Shot** is a separate question from the audio
asset entity, and is the only element of the 2.5 template MikAI cannot express
at all today.

---

## 7. Lighting — designed, built, and empty

`resolveStoryboardLighting` resolves the Shot's own field, else the Sequence's
effective lighting, which itself resolves the Sequence's own field, else the
lighting of its cast environment Assets rendered `name: lighting`.

Measured on Space Corsair, 2026-08-24: **six environment Assets, six Sequences
and every Shot carry `lighting = null`.** Nothing resolves anywhere, so the
`Lighting:` part is never rendered. Sq_5000, generated the same day with the
latest instruction, is `null` on all six of its Shots — the newest data
confirms it, it is not a legacy state.

There is a mechanical cause, not only an unfilled field: **`shots.fromSequence`
never asks for `lighting`** — fourteen output fields, not one of them — while
instructing the model to write a *dense cinematic visual description*. The
generator pushes lighting into `shot_prompt` by construction and leaves the
field built for it empty. On `Sh_100` that is *cold blue pulses*, *deep
industrial shadows*, *tense cinematic lighting*. Same shape as the Style
routing defect in §6.1: a misrouting, not a gap.

**The author's arbitration, 2026-08-24**: the LLM may write `shots.lighting` at
Shot creation, but in multi-shot the Sequence level governs, inspired by the
cast environment's lighting.

That is already the resolution `resolveSeqLighting` implements. The tension is
that today's precedence is Shot over Sequence, which inverts the multi-shot
intent. The proposal that avoids changing the precedence rule — and therefore
breaks nothing — is to render lighting in **two distinct slots**:

- the **header** carries the rig, resolved at Sequence level;
- a **Shot block** carries only that Shot's own field, and only when it is a
  lighting *event* of that shot (`Sh_100`'s synchronized pulses), never the
  inherited ambiance.

Prerequisite, and it is data, not code: fill the six environments.

---

## 8. What the numbers say

Measured on **Sq_1000** (20 Shots, legacy data, 7 cast assets):

| | Words |
| --- | --- |
| Seven parts repeated per Shot, as composed today | **14 644** |
| Header factorized once, long identities unchanged | **2 465** |
| + 25-word cards, `forbidden_variations` dropped | **2 029** |
| Header + Shot blocks, as §9 proposes | **≈ 1 350** |

The dominant term is **repetition, not length**. Factorizing saves 12 179
words; the cards save 196 and dropping `forbidden_variations` 221. After
factorization, 1 824 of the remaining 2 465 words are Shot bodies — the
`description` / `action_pitch` / `shot_prompt` triple, whose redundancy §4
explains.

For one Shot (`Sh_200`, Sq_1000): what is queued today is **85 words**; the
seven parts wired as-is would be **450**; a pure structured render of the same
data, with no rewriting, is **299**.

That last figure matters more than it looks: **a structural render is
necessary and not sufficient.** It puts every ingredient in its place; it
cannot condense a Bible field written for a human reader. Going from 299 to a
prompt-shaped ~250 is a second, different operation — assembly cannot do it,
which is what §9's card exists for.

---

## 9. The adjustments, ordered

Descriptive. No ticket is opened by this document.

### The design rule that keeps this multi-shot-safe

The author will run a pass on storyboard image and storyboard video after this.
Both are multi-shot. The rule this audit recommends holding, so nothing has to
be rebuilt:

> **One composer, parameterized by shot count. A single Shot is the case
> N = 1.**

The header is computed once from the reference selection; Shot blocks are
computed in a loop. The Sequence package already has that shape
(`header + === Shot i/N ===` blocks) and already builds its casting header from
`orderStoryboardReferences`. The Shot path is the one that diverged, not the
model to invent.

### The list

| # | Adjustment | Where | Migration |
| --- | --- | --- | --- |
| 1 | Rewrite the `shots.fromSequence` instruction: stop forbidding cast names, stop demanding a self-contained paragraph, ask for `lighting` | `variables/registry.ts:2604-2612` | no |
| 2 | Fill the six environment Assets' `lighting` | data | no |
| 3 | One N-shot composer: header (Style, Subject Definition, General Description) + Shot blocks; `@ImageN` from `orderStoryboardReferences`; `【Unused Assets】` from what the batch did not select; delete `conformReferences`, keep `inspect` | composition | no |
| 4 | The **prompt card** — 3 to 5 anchors per Asset, proposed by an assist, approved, stored, then copied verbatim | column on `assets` | **yes** |
| 5 | Conformation profile: 2.5 caps; do not apply the single-shot word budget to a shot-script | `guideDefault.ts:108-115` | no |
| 6 | Camera: render the `camera_subject` prose **or** the palette axes, never both concatenated — the prose already contains the move | composition | no |
| 7 | A Shot-level constraints field — the model already improvises `no text, no labels` | column on `shots` | yes |
| 8 | `forbidden_variations` leaves the composed prompt and stays in design review | composition | no |

**#1 is first.** It costs nothing, it stops drift being manufactured at the
source, and without it #3 and #4 fight a `shot_prompt` that re-describes
everything.

**#3 is the one that must be designed multi-shot on day one.** It is the only
place where a shot-only design would have to be broken and rebuilt.

### A precondition on #3 that Sq_5000 exposed

The header's Subject Definition is built from the Shot's cast. On Sq_5000 that
cast is unreliable, and a header would print its errors with authority:

- `Sh_200` is a close-up on Azelle's face alone, and is cast with
  `Cryogenic Bay`, `Cryogenic Capsules` and `Crew Scientist` — none of which
  appear in its own description, action or prompt. A header would declare a
  second character who is not in the Shot.
- The Sequence is set in an *interior reactor control room*, and **no such
  environment Asset exists** in the project. `castingFromSequence` fell back to
  `Corporate Corridors`, which is a different place.

Neither is a composition defect — the composer would be faithfully rendering
what it was given. But #3 changes the cost of a casting error from invisible to
load-bearing, so the casting pass wants a review gesture before, or alongside,
the header. Recorded here rather than solved: it is its own subject.

### On the card

The Asset Bible fields stay exactly as they are: they are long because their
job — design arbitration, briefing, review — requires it. The card is their
**approved engine-facing translation**, a jar in §5.2's sense, with the same
life cycle as `narrativePrompt`: an assist proposes, the author approves, it is
stored, and composition copies it verbatim with no model involved.

Two rules, both taken from Higgsfield's own experience: the card carries the
**invariant** (a shot-specific state belongs to the action), and a genuine
**variant is its own entry**, never an edit to the card.

### On dropping `forbidden_variations`

Not only a word-count argument. Naming the forbidden thing puts it in the
conditioning; a character reference image is a far stronger and cheaper
guarantee; and the field's prose (*"as her attire must remain…"*, *"as these
contradict…"*) was written for design review, not for an engine. ByteDance's
own 2.5 guidance is to name the part of a reference to **use**, never the part
to avoid.

What those negatives defended is said positively in the card — *scuffed,
utilitarian, heavily worn; seasoned survivalist build; cool cyan nav light*
covers Azelle's three prohibitions in thirteen words without ever printing
*bright*, *clean* or *warm*.

`Constraints:` survives as a block, fed by #7 — the shot-level exclusions the
author types, which is the use the 2.5 slide actually describes.

---

## 10. What this audit does not decide

Left to the author, and written down so no ticket decides in his place:

- whether the subject token is the Asset's plain name (this audit's
  recommendation — it is what ByteDance's own examples do, it avoids the
  `<>`/sound-effect collision `sd25-pe` warns about, and `action_pitch`
  already contains it) or a chevroned form;
- whether to keep a word budget at all as internal discipline once #5 removes
  its misapplication;
- whether `keyframe` should finally map to `as first frame`, a decision
  deliberately suspended in `guideDefault.ts:31-46`;
- whether the compiled `Avoid:` block should eventually route to a ComfyUI
  negative-prompt node — already recorded as open in `docs/PROJECT_STATE.md`
  under `STYLE.COMPILE.POLARITY.1`, and a chantier rather than a fix;
- whether a Shot dialogue field is in scope, given that the audio asset entity
  is deferred past Chantier 2.

---

## 11. Sources

- Seedance 2.5 conference slides supplied by the author, 2026-08-24.
- `.claude/skills/sd25-pe/SKILL.md`.
- *Seedance 2.0 Complete Prompting Guide* —
  `https://github.com/issastash/AI_Complete_Prompting_Guides`.
- BytePlus ModelArk, Seedance 2.5 prompt guide —
  `https://docs.byteplus.com/en/docs/ModelArk/2607689`.
- Higgsfield Elements & consistency —
  `https://github.com/Abteeeen/higgsfield-prompting-skill/blob/main/elements_and_consistency.md`.
- `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.
- Space Corsair project data, `data/mikailab.db`, read 2026-08-24 — Sq_1000
  (legacy), Sq_4000 (generated 2026-08-19) and Sq_5000 (generated 2026-08-24,
  during this audit).
