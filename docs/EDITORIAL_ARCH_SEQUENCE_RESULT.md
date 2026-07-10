# Editorial Architecture: Sequence Results and Editorial Modes

Status: architecture decision document. No code, schema, or migration changed by this ticket. MikAI HEAD at time of writing: `18436cd — Add OpenReel V1 user test report`. Sidecar HEAD (read-only reference): `50bfde1 — Keep MikAI timing patches start-only`. Both repos confirmed clean before this ticket.

## 1. Context

Across `NLE.OPENREEL.1`–`.6`, `BUG.OPENREEL.MEDIA.1`, `BUG.OPENREEL.PATCH.1`, `OPENREEL.URL.1`, `MIKAI.ORIGIN.1`, and `OPENREEL.V1.USERTEST`, MikAI built and validated a working bridge to an external OpenReel sidecar: MikAI exports a sequence as `mikai-editorial-export-v1`, OpenReel imports it, hydrates approved videos as real media, lets the user reorder clips, and posts back a `mikai-editorial-timing-patch-v1` that MikAI validates and applies — writing only `startSeconds`.

That work is solid and stays. But it was framed the whole time as **"MikAI timeline ↔ OpenReel timeline"** — two systems keeping a shared timeline in sync. That framing has run its course: it invites thinking about the bridge as permanent bidirectional sync infrastructure, which is not what this product needs and not what the next tickets (conflict safety, insert shot, trim/duration/split/speed) should be built against.

## 2. Product Goal

MikAI ProdLab's actual output is a **film**, assembled from **sequences**, each of which needs a **playable result**. The editorial layer's job is to produce that result — not to mirror a second application's internal state indefinitely.

```text
Project
→ Sequences
→ Sequence Results
→ Film / Short Film Result
```

## 3. Key Decision

> **MikAI ProdLab does not try to keep two timelines synchronized forever. It tries to produce Sequence Results, and eventually a Film Result.**
>
> **Basic Editorial Mode and Advanced Editorial Mode (OpenReel) are two different paths to the same kind of published output.**

```text
Basic Editorial Mode        →  publish Sequence Result
Advanced Editorial Mode      →  publish Sequence Result
(OpenReel)
```

A **Sequence Result** is the published, playable output of a sequence. It can be produced either by MikAI's own Basic Editorial Mode or by the OpenReel Advanced Editorial Mode. The MikAI player reads a Sequence Result the same way regardless of which mode produced it.

This reframing does not invalidate the existing bridge. The start-only timing patch (`NLE.OPENREEL.3`/`.5`) is the V1 mechanism for Advanced Mode to influence a sequence's structure before a real Sequence Result concept exists. It becomes one possible *input* to a future "publish" step, not the end goal in itself.

## 4. Sequence Result

### Concept

A `SequenceResult` is a published, playable rendering of a sequence's editorial arrangement — the thing the MikAI player actually shows, independent of how it was produced.

### Conceptual fields (no migration in this ticket)

```text
SequenceResult
- id
- projectId
- sequenceId
- sourceMode: "basic" | "advanced"
- status: "draft" | "published" | "active" | "archived" | "outdated"
- videoPath
- durationSeconds
- publishedAt
- createdAt
- updatedAt
- sourceSnapshot   -- the editorial arrangement (items/positions/trims) this result was built from
- cutManifest       -- ordered list of {shotId, trimIn, trimOut, sourcePath} describing how videoPath was assembled, or how it should be assembled/played if no rendered file exists yet
- notes
- warnings
```

### Decisions

- **A sequence can have several `SequenceResult` rows** — every publish (from either mode) creates a new one. Nothing is overwritten; history is kept.
- **A sequence has at most one `active` `SequenceResult`** at a time — the one the player/rest of MikAI treats as "the current cut." Publishing a new result can promote itself to active, or a separate "activate" action can do it — left open, see §11.
- **A result can come from either mode** (`sourceMode`), and both modes are expected to eventually produce something the player can read identically. Neither mode's result is privileged over the other at the data-model level; whichever was most recently activated wins.
- **Basic Editorial Mode must produce a real, readable result**, not just an internal draft state — publishing from Basic is a first-class path, not a fallback for when OpenReel isn't used.
- **OpenReel Advanced must be able to publish a result readable by MikAI**, not just move `startSeconds` around forever.

### Relationship to the existing player

`SequencePreviewPlayer` (untouched by this ticket, and not touched by any ticket implementing this document without a dedicated decision) currently plays directly off `EditorialDocument`/`sequence_editorial_items`. Once `SequenceResult` exists, the natural direction is for the player to read the *active* `SequenceResult` instead of recomputing an `EditorialDocument` live — but that migration is explicitly out of scope here; this section only defines the target shape.

## 5. Basic Editorial Mode

Basic Editorial Mode is MikAI's own built-in editing surface — today, roughly what `/nle-prototype` and the `editorial` actions (`moveEditorialItem`, `updateEditorialItemTrim`, `resizeEditorialItemRightEdge`) already provide, reframed with an explicit publish step.

**Scope**:

```text
Basic Editorial Mode:
- reorder shots
- select approved video per shot if needed
- trim start/end
- insert new shot between existing shots
- preview simple bout-à-bout
- publish Sequence Result
```

**Explicitly out of scope for Basic** — these stay Advanced-only, or later:

```text
- advanced multi-track
- speed ramps
- transitions
- advanced audio editing
- effects
- complex split workflows
- full NLE UI
```

Basic Mode is a **simple assembler / rough-cut builder** — not a lightweight clone of OpenReel. If a Basic-mode feature request starts to look like "now we need multi-track" or "now we need transitions," that is a signal the feature belongs in Advanced Mode instead, not that Basic Mode should grow to match it.

## 6. Advanced Editorial Mode / OpenReel

OpenReel is renamed, conceptually, from "the sidecar" to **Advanced Editorial Mode**. It already supports richer timeline operations than Basic Mode ever will:

```text
- reorder
- trim
- split
- speed changes
- richer timeline operations
- future transitions/effects if needed
```

**MikAI does not need to translate every one of those operations into fine-grained mutations of the `Shot`/`sequence_editorial_items` model.** That was an implicit assumption in the original "two timelines in sync" framing, and it does not hold — OpenReel's internal operations (splits, speed, multi-track composition) have no clean 1:1 mapping onto MikAI's production-shot model, and forcing one would either cripple OpenReel's editing power or corrupt MikAI's production data.

The advanced-mode finality is:

```text
Publish Advanced Sequence Result to MikAI
```

— i.e., OpenReel does its own editing however it wants internally, then produces a `SequenceResult` (via a rendered file, or a `cutManifest` MikAI can play/interpret) and pushes *that* back, rather than a live-syncable timing patch alone.

**The existing start-only patch bridge (`mikai-editorial-timing-patch-v1`) remains useful and does not need to be torn out.** It is the V1 mechanism for Advanced Mode to nudge a sequence's shot positions, and it continues to work exactly as validated in `OPENREEL.V1.USERTEST`. But it should now be understood as **one narrow, already-shipped capability under the Advanced Mode umbrella — not the final or only shape "publish Advanced Sequence Result" will take.** A future ticket (`OPENREEL.PUBLISH.1`, see §10) defines the actual publish mechanism; this document does not commit to whether that reuses, extends, or sits alongside the existing patch endpoint.

## 7. Insert New Shot from Editorial Context

Confirmed product decisions for this ticket:

1. When editorial work reveals a missing shot, MikAI creates a **real production `Shot`** — not an editorial-only placeholder.
2. From either Basic or Advanced (OpenReel), the action is direct, with a confirmation step.
3. Default target duration for the new shot: **5 seconds**.
4. An AI action must be offered: **Generate Shot Brief from Neighbors**.

### Flow

```text
Insert New Shot Here
→ creates a real production Shot immediately
→ status: missing / draft
→ default target duration: 5s
→ inserted between previous and next shots
→ optional: Generate Shot Brief from Neighbors
```

This is a **production structure change**, not merely an editorial/montage-layer edit. It creates a row in `shots` (with `sequenceId`, `orderIndex` placed between its neighbors, `durationSeconds: 5`, no `approvedVideoPath`) — the same kind of row every other shot in the sequence already is. The editorial layer (`sequence_editorial_items`) then gets a corresponding item referencing it, exactly like any other shot-backed item.

### Conceptual fields for the insert action itself (not a new table — describes the operation's inputs/context)

```text
Inserted Shot:
- sequenceId
- previousShotId
- nextShotId
- orderIndex / position
- title
- description / brief
- targetDurationSeconds: 5
- status: missing / draft
- editorialReason / notes
```

### Generate Shot Brief from Neighbors

An AI-assisted action, available immediately after insertion (or as part of the insert flow), that drafts the new shot's `title`/`description`/`actionPitch`/`cameraPitch` using:

- previous shot's title, description, prompt;
- next shot's title, description, prompt;
- the sequence's `summary`/`narrativePurpose`/`mood`/`locationHint`;
- the project's `story`/`pitch`;
- cast/assets attached to the sequence or its neighbors, if available.

This mirrors the existing pattern of AI-assisted generation actions already in MikAI (story generation, etc.) — it is additive scope for a future ticket (`EDITORIAL.INSERT.1`), not implemented here.

## 8. Trim, Duration, Split, and Speed

Four distinct concepts, currently conflated in casual discussion, that must stay separated in the model:

```text
1. Source media duration       — the real length of the generated/approved video file
2. Editorial trim              — in/out points used *for this occurrence* in a sequence
3. Editorial playback speed    — a preview-only playback modifier (Advanced Mode)
4. Production target duration  — shots.durationSeconds, what future generation should aim for
```

### Rule

```text
Apply Timing / Editorial Patch  = update editorial usage.
Push Duration to MikAI           = explicit production intent.
```

These are never the same action. Editorial operations describe how existing material is *used* in a cut. Only an explicit, user-initiated "push" changes what MikAI will *generate* next.

### Per-operation rules

```text
Trim
  → editorial usage (already implemented: sequence_editorial_items.trimInSeconds/trimOutSeconds,
     per occurrence, non-destructive — see updateEditorialItemTrim)

Split
  → advanced editorial operation (Advanced Mode only)
  → may become multiple editorial usages of the same shot
    (e.g. two sequence_editorial_items rows both referencing the same shotId,
     each with its own trim range)
  → should not automatically create new production shots

Speed modifier
  → advanced editorial preview (Advanced Mode only)
  → should not automatically change production duration
  → the sped-up/slowed-down cut is an editorial result, not a source-of-truth
    change to the shot's own target duration

Push Duration to MikAI
  → explicit, separate, user-initiated action
  → updates shots.durationSeconds for future generation
  → distinct from, and never implied by, any editorial trim/split/speed action
```

### Worked example (from the ticket)

```text
Original generated shot: 2s
OpenReel speed x0.5 makes it play as 4s
User decides it works better as a 4s beat
User clicks "Push Duration to MikAI"
MikAI updates the shot's target duration to 4s for future regeneration
The existing slowed-down edit remains an editorial preview/result,
not the source of truth for normal action speed.
```

This means the current V1 timing-patch's duration guard (`TIMING_EPSILON_SECONDS`, rejecting any `durationSeconds` mismatch — `src/lib/editorial/editorialTimingPatch.ts`) is *correct* as a temporary safety rail: it prevents an editorial-side duration drift from silently corrupting production data before "Push Duration to MikAI" exists as its own explicit action. Once that action exists, the epsilon-reject behavior should be reconsidered specifically for the "Push Duration" path (which should update `shots.durationSeconds` on purpose), while remaining in force for any patch/publish path that is *not* an explicit duration push.

## 9. Conflict Safety Implications

`OPENREEL.CONFLICT.1` (next ticket) must be re-scoped against this architecture before implementation:

**Old framing**: avoid stale timing patch.

**New framing**: protect publishing/applying editorial decisions from stale sequence state.

Conflict safety must protect, in order of what exists today vs. what's coming:

1. **Apply timing patch V1** (exists today) — a patch built from a stale export must not silently clobber structural changes (e.g. an insert, a manual reorder) made in MikAI after the export was taken.
2. **Future publish Sequence Result** — publishing a Basic or Advanced result must detect if the underlying sequence structure changed since the source snapshot was taken, and mark the result `outdated` rather than silently activating a result built against stale structure.
3. **Future insert new shot** — inserting a shot changes `orderIndex`/structure for every shot after it; any in-flight Advanced Mode session (or un-applied patch) becomes stale the moment this happens and should be flagged, not silently misapplied.
4. **Future trim/duration actions** — same category of staleness risk once "Push Duration to MikAI" exists as an explicit action with its own write path.

The common mechanism across all four is likely the same: a structural version/fingerprint on the sequence (or its editorial items) that both the export payload and any patch/publish carry, so MikAI can detect "this was built against an older structure" and reject or flag rather than blindly apply. `OPENREEL.CONFLICT.1` should design that mechanism generically enough to cover all four cases, not just the existing timing patch.

## 10. Proposed Roadmap

```text
1. EDITORIAL.ARCH.1     — Sequence Result and Editorial Modes decision        (this ticket)
2. OPENREEL.CONFLICT.1  — stale export / conflict safety (re-scoped per §9)
3. SEQUENCE.RESULT.1    — Sequence Result data model + viewer
4. BASIC.EDITORIAL.1    — Basic assembler: reorder / trim / insert / preview
5. EDITORIAL.INSERT.1   — Insert New Shot from editorial context
6. OPENREEL.PUBLISH.1   — Publish Advanced Sequence Result from OpenReel
7. NLE.OPENREEL.7.A     — trim/duration audit under the new model
8. FILM.RESULT.1        — assemble final short film from Sequence Results
```

This matches the order suggested in the ticket, and the audit did not surface a reason to reorder it: `OPENREEL.CONFLICT.1` naturally comes right after this document because it's needed both by the existing V1 patch bridge *today* and by every later step; `SEQUENCE.RESULT.1` must land before `BASIC.EDITORIAL.1`/`EDITORIAL.INSERT.1`/`OPENREEL.PUBLISH.1` since all three need something to publish into; `EDITORIAL.INSERT.1` is listed after `BASIC.EDITORIAL.1` since insert is usable from Basic Mode and benefits from Basic Mode's UI/actions existing first, but it has no hard dependency on `OPENREEL.PUBLISH.1` and could be pulled earlier if the AI shot-brief feature becomes a priority sooner. `NLE.OPENREEL.7.A` is placed after publish exists because the trim/duration/split/speed rules in §8 are much easier to audit for correctness once there's a real "Push Duration to MikAI" action to check them against.

## 11. Open Questions

- Should `SequenceResult` be created before Basic Editorial Mode gets its publish step, or can Basic Mode ship its own ad hoc "current cut" representation first and be migrated onto `SequenceResult` later? (This document assumes `SequenceResult` comes first, per the roadmap in §10, but the dependency is not hard-blocking if a lighter interim exists.)
- Where should the `cutManifest` live — inlined JSON on the `SequenceResult` row (matches the existing `app_settings`/JSON-in-text-column pattern used elsewhere in this schema), or a separate table if manifests need their own querying/versioning?
- Does publishing from Basic Mode need to render an actual video file immediately, or is a `cutManifest` + on-the-fly playback (same as `SequencePreviewPlayer` does today) sufficient for an initial `SequenceResult.status: "published"`, with real rendering added later?
- How does OpenReel Advanced Mode actually produce/export a final rendered file, if that's ever needed (vs. MikAI assembling a `cutManifest`-described playback itself)? This depends on OpenReel's own export/render capabilities, which have not been audited in this ticket.
- Should MikAI store OpenReel's own project file/state (not just the resulting patch or manifest) for a published Advanced result, to allow re-opening/re-editing later? This has storage and versioning implications not explored here.
- How will audio assets be represented once they exist — as part of `cutManifest`, or as a separate concern layered on top of `SequenceResult`?
- What marks a `SequenceResult` `outdated`? A structural change to the sequence's shot list (insert, delete, reorder) is the obvious trigger, but does an unrelated shot regeneration (new `approvedVideoPath` on a shot already referenced by a published result) also count?
- Who/what promotes a `SequenceResult` to `active` — is publish-and-activate a single action, or two separate steps (publish, then a deliberate "make this the active cut")?

## 12. Implementation Guardrails

For every ticket that follows this document:

- Do not implement `SequenceResult` as a schema/migration change inside a ticket that isn't explicitly scoped to do so (`SEQUENCE.RESULT.1`).
- Do not repurpose the existing start-only timing-patch contract's meaning — it keeps working exactly as-is until `OPENREEL.PUBLISH.1` makes an explicit, separate decision about what (if anything) replaces or wraps it.
- Do not let Basic Editorial Mode grow multi-track/transitions/effects — if a request needs those, it belongs in Advanced Mode.
- Do not let "insert new shot" bypass real `Shot` row creation — it is a production-structure change, never an editorial-only placeholder.
- Do not let any editorial trim/split/speed action silently write to `shots.durationSeconds` — only an explicit "Push Duration to MikAI" action may do that, once it exists.
- Do not build `OPENREEL.CONFLICT.1` scoped only to the existing timing patch — design its staleness-detection mechanism to also cover future publish/insert/duration-push paths per §9.

---

## Audit Trail

Files read for this audit (all read-only, none modified):

- `src/app/projects/[projectId]/sequences/[sequenceId]/nle-prototype/page.tsx` — current Basic-mode-equivalent UI entry point; already links to Advanced Mode (OpenReel) via the configurable sidecar/public-base-URL settings.
- `src/app/api/projects/[projectId]/sequences/[sequenceId]/editorial-export/route.ts` — the existing `mikai-editorial-export-v1` producer; read-only, builds an `EditorialDocument` then serializes it. No changes needed for this ticket; this is the shape a future `SequenceResult.sourceSnapshot` would likely build on.
- `src/app/api/projects/[projectId]/sequences/[sequenceId]/editorial-timing-patch/route.ts` (referenced, not re-read in full this ticket — already read and modified across `NLE.OPENREEL.5`/`OPENREEL.URL.1` work) — the existing start-only apply path this document positions as "V1 mechanism under Advanced Mode," not the final publish shape.
- `src/actions/editorialTimeline.ts` — `moveEditorialItem`, `updateEditorialItemTrim`, `resizeEditorialItemRightEdge`: today's Basic-mode-equivalent editing actions, already start-only/non-ripple/non-destructive-trim in spirit, matching the rules formalized in §8.
- `src/lib/editorial/editorialDocument.ts` — the `EditorialDocument`/`EditorialDocumentItem` adapter and `getEditorialItemEffectiveDuration` — the existing read model a `SequenceResult` viewer would likely sit next to or reuse.
- `src/lib/editorial/editorialTimingPatch.ts` — shape validation + apply planning for the existing patch; confirms the `TIMING_EPSILON_SECONDS`-based duration-reject behavior discussed in §8.
- `src/db/schema.ts` — confirmed current tables (`projects`, `sequences`, `shots`, `sequenceEditorialItems`, `appSettings`, etc.) and that no `SequenceResult`-equivalent table exists yet — this ticket does not add one.
- `docs/NLE_VENDOR_DECISION_OPENREEL.md`, `docs/NLE_OPENREEL_*.md`, `docs/BUG_OPENREEL_*.md`, `docs/OPENREEL_URL_1_CONFIGURABLE_SIDECAR_URL.md`, `docs/MIKAI_ORIGIN_1_CONFIGURABLE_PUBLIC_BASE_URL.md` — prior decision/report history establishing the "two timelines" framing this document intentionally supersedes, and the settings/CORS mechanics that Advanced Mode publishing will continue to rely on.
- Sidecar repo (`F:/AI/mikai-openreel-sidecar`) — `git status`/`git log` only, read-only, confirming HEAD `50bfde1` and a clean tree; no sidecar source files were read or modified in this ticket beyond what earlier tickets already established.
