# Sequence-Level Seedance Draft Workflow

Created: 2026-07-11

## Product Intent

Some Seedance workflows can generate a complete storyboard-like or
prompt-to-video sequence in one pass. The result can contain several shots
stitched together in a single video.

MikAI should use this as a fast sequence draft workflow:

```text
existing MikAI Sequence + existing MikAI Shots
-> compile shot prompts into one structured sequence prompt
-> optional storyboard/keyframes per shot
-> generate one Seedance sequence video
-> split the generated video back into shot clips
-> review mapping against existing shots
-> push accepted clips as video candidates on those shots
-> later extract keyframes or regenerate refined shot videos
```

This is not a replacement for shot-level production. It is a fast way to create
a rough animated sequence, recover useful shot clips/keyframes, and then refine
them with the normal MikAI generation and editorial tools.

## Important Architecture Rule

The detected splits must map to existing MikAI shots by explicit review.

Do not automatically create new narrative shots from detected cuts. In MikAI,
shots are narrative/production objects, while editorial items are the montage
layer. A generated video split is only a candidate clip until the user accepts
where it belongs.

Do not overwrite an approved shot video without explicit user confirmation.
The first version should create shot video candidates derived from the sequence
draft.

## Target Workflow

1. User opens a Sequence.
2. MikAI compiles a Sequence-level Seedance prompt from the ordered shots:
   prompt, duration target, camera intent, continuity context, characters,
   assets, style, and sequence summary.
3. The dedicated Storyboard workspace creates and reviews one draft
   composition per Shot. Approved storyboard images are the preferred visual
   anchors for Seedance; the sequence workflow should make their use explicit.
4. The Storyboard workspace can generate one sequence contact sheet from
   selected casting references and the full package, then save versioned drafts
   explicitly at Sequence level.
5. Seedance generates one full sequence video.
6. MikAI analyzes the generated video and detects split candidates.
7. MikAI compares detected segments with the expected shot count.
8. User reviews the proposed mapping:
   - expected shot count;
   - detected segment count;
   - confidence;
   - thumbnails;
   - segment duration;
   - mapped target shot;
   - merge/split/adjust/reject controls.
9. User confirms push.
10. MikAI cuts physical clips from the source sequence video and attaches each
   accepted clip to the mapped shot as a candidate video output.
11. Later workflows can extract first/last/best frames from those clips and use
    them as references for classic image-to-video regeneration.

## Split Strategy

This workflow should not use naive scene detection alone. MikAI knows the
number of expected shots.

For a sequence with `N` shots, the splitter should try to find `N - 1` useful
cut points when plausible.

Suggested scoring:

- visual cut score from FFmpeg, PySceneDetect, or a future ML detector;
- proximity to expected shot durations;
- minimum segment duration;
- ordered mapping to the existing shot list;
- optional storyboard/keyframe similarity;
- confidence downgrade when the detector finds too many, too few, or weak cuts.

Initial engine path:

1. FFmpeg fast detector, because MikAI already has bundled FFmpeg.
2. PySceneDetect as the likely V1 quality upgrade.
3. TransNetV2 or another neural shot-boundary model only later, as an optional
   heavier worker.

## Proposed Ticket Stack

### `SEQGEN.1` - Sequence Prompt Package For Seedance

Goal: compile ordered shot prompts into one structured sequence-generation
prompt/package.

Scope:

- no video split yet;
- no schema change unless explicitly approved in the ticket;
- reuse existing prompt and workflow concepts;
- output a clear package that Seedance workflows can consume.

### `SEQGEN.STORYBOARD.2` - Dedicated Storyboard Generation Workspace

Goal: provide the visual preparation surface before sequence-level video
generation.

Scope direction:

- dedicated Storyboard route with a Sequence selector like Editorial;
- Project/Sequence/Shot shortcut navigation;
- visual Shot grid present even when no media exists;
- unique Sequence casting inventory, with per-Asset reference selection and
  Asset Detail links;
- storyboard image generation and approval using existing workflow/generation
  foundations where possible;
- Sequence Generation Package options to ignore prompt segments and
  unapproved references, enabled by default for this workflow;
- audit and explicit migration authorization if storyboard result status,
  approval, selected references, or provenance need durable storage.

This ticket establishes storyboard images as the visual base for the later
Seedance sequence video. It does not yet perform split detection or push clips
back to Shots.

### `SEQGEN.STORYBOARD.3` - Generate A Sequence Storyboard Contact Sheet

Goal: generate one visual storyboard board for the whole Sequence from
selected casting references and an inspectable Sequence Generation Package.

Scope:

- CTA from the dedicated Storyboard workspace;
- image workflow selection and reuse of the existing Dynamic Batch/payload
  pipeline;
- deterministic `@ImageN` mapping and editable prompt preview;
- one output image containing the declared Shots in order;
- explicit `Save as Sequence Storyboard Draft` action;
- versioned durable Sequence-level drafts with prompt/reference provenance;
- additive migration is authorized for sequence-targeted jobs and storage.

No split, Shot mutation, or automatic approval belongs to this ticket.

### `SEQGEN.SPLIT.1` - Detect And Review Sequence Video Splits

Goal: analyze one generated sequence video and propose splits mapped to the
existing shots.

Scope:

- start with FFmpeg-based detection if possible;
- generate thumbnails and a segment manifest;
- compare detected count to expected shot count;
- provide review UI before any write to shots;
- no automatic shot creation.

Product decisions confirmed for the first implementation:

- the feature lives in the dedicated Storyboard workspace and always starts
  from an explicitly selected durable Sequence Video Draft;
- detection is only a proposal; count mismatch remains manually editable;
- extra transition/artifact segments may be skipped, but validation requires
  every current Shot to be mapped exactly once to one active segment;
- split reviews are versioned and persisted because the validated manifest is
  the future source of truth for `SEQGEN.PUSH.1`;
- a validated review is immutable; a new version is required for another
  interpretation of the same source video;
- this ticket creates thumbnails only, never physical Shot clips.

### `SEQGEN.PUSH.1` - Push Split Clips To Existing Shots

Goal: cut accepted segments and attach them as candidate videos to their mapped
shots.

Scope:

- explicit user confirmation;
- no silent overwrite of approved video;
- store provenance that the candidate came from a sequence-level generation;
- invalidate dependent sequence/film results only when product rules require it.

### `SEQGEN.KEYFRAMES.1` - Extract Keyframes From Sequence-Derived Clips

Goal: let the user recover useful frames from split clips for shot refinement.

Scope:

- first frame, last frame, selected keyframe, or best representative frame;
- attach frames with explicit reference roles;
- feed future image-to-video regeneration.

## Open Product Questions

- Should sequence-level generated clips become candidates only, or can the user
  choose "approve all mapped clips" after review?
- Should failed count matching block push, or allow manual mapping after warning?
- Should the storyboard step be required for Seedance sequence generation, or
  remain optional?
- Which UI owns the workflow first: Sequence Detail, Generate panel, or a
  dedicated Sequence Draft workspace?
- How much provenance is needed on each shot output to trace it back to the
  source sequence video and split boundaries?
