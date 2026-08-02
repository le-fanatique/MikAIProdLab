# MikAI ProdLab - Product Vision

Source: vision utilisateur consolidee le 11 juillet 2026, enrichie le 15
juillet 2026 avec la vision du Storyboard workspace.

## Product Intent

MikAI is a creative direction and animation-film production tool. It is not a
generic prompt-to-output application.

The target pipeline is:

```text
Pitch -> Story -> Outline -> Sequences -> Shots -> Assets
-> Style / World / Characters / Sets
-> Shot direction -> References / Keyframes
-> Video generations -> Sequence editorial pass
-> Sequence Results -> Global Film Result
```

The application should help an artist think in cinematic terms: action,
camera, lighting, continuity, rhythm, duration, staging and emotional intent.
The artist should not have to become a prompt engineer.

## Storyboard Workspace

Storyboard is a dedicated workspace between Story/Sequence definition and
video generation. It is not a passive gallery and it must remain useful when
Shots have no images yet. The user switches Sequence at the top, sees every
declared Shot in a visual grid, and creates or reviews draft compositions that
lock framing, staging, camera intent, lighting and visual continuity.

The workspace also shows each Asset cast anywhere in the Sequence exactly
once. The user can expand an Asset, choose which reference images are sent to
the storyboard workflow, open the Asset Detail page, and keep the interface
manageable through compact rows, disclosure and selection counts.

The storyboard generation flow is:

```text
story/context + Shot prompt + selected cast references
-> draft storyboard image per Shot
-> user review and approval
-> visual anchors for Sequence-level Seedance
-> one continuous Sequence video
-> explicit split review and push to existing Shots
```

The Sequence Generation Package should expose explicit controls for ignoring
prompt segments and unapproved references, both enabled by default for the
storyboard-first workflow. These controls change compilation inputs and
warnings visibly; they must not silently delete stored source data.

### Sequence-level storyboard contact sheet

The Storyboard workspace must also support a sequence-level generation pass.
The user selects casting references, chooses a prepared image workflow, and
MikAI builds an editable prompt that maps each reference to `@ImageN` and
includes the full Sequence Generation Package. The expected output is one
contact sheet containing one visual panel per declared Shot in order. The
result is a durable, versioned Sequence storyboard draft saved only after the
explicit `Save as Sequence Storyboard Draft` action. It does not yet split the
image/video or modify Shot records.

## Two Editorial Modes

### Basic Editorial

MikAI's integrated, lightweight editor for common needs:

- shot order;
- simple trims and duration adjustments;
- gaps and placeholders;
- quick bout-a-bout preview;
- publish a playable Sequence Result.

Basic Editorial must stay focused and must not grow into a full Premiere or
Resolve replacement.

### Advanced Editorial

OpenReel is the advanced NLE surface:

- richer timeline operations;
- timing and rhythm exploration;
- trims, split and speed decisions inside the editorial surface;
- advanced preview and export;
- publish a playable Sequence Result back to MikAI.

OpenReel is an editing surface, not a second source of truth for MikAI's
narrative and production data.

## Results and Film Assembly

The final product objective has two levels of playable output:

```text
Sequence editorial work
-> playable Sequence Result for each sequence

Active Sequence Results across a project
-> playable global Film Result
```

A Sequence Result is the published result of one sequence, whether produced by
Basic Editorial or OpenReel Advanced. A Film Result assembles the active
Sequence Results across the project in sequence order.

Existing results are historical outputs. New editorial or production decisions
must not silently rewrite them. Activation, publication, invalidation and
replacement must remain explicit and traceable.

## Artist-Friendly to Model-Compliant

MikAI should translate cinematic intent into provider-specific instructions.
The product layer should understand concepts such as:

- subject, action and environment;
- camera direction and movement;
- lighting and visual continuity;
- character, environment, style and camera references;
- first frame, last frame and keyframe;
- motion, rhythm and continuity anchors;
- timed prompt segments;
- negative constraints;
- workflow-specific packages for Seedance, GPT Image, ComfyUI and future
  providers.

The prompt system is therefore a translation pipeline, not a text snippet
library:

```text
creative intent + story context + shot context + style + references
-> workflow package + provider rules + compiled prompt
```

## Style and Reference Language

Style is a reusable visual language, not a single free-text field. The future
Style Bible should be able to express:

- palette and color script;
- lighting direction and mood;
- rendering and pictorial treatment;
- texture, hatching and graphic layers;
- shadow and specular treatment;
- character design rules;
- environment and set-dressing rules;
- negative style constraints;
- reusable visual-reference analysis directives.

References need explicit roles so models know what to extract from each file.
Expected roles include first frame, last frame, character, environment,
background, style, camera, motion, rhythm, keyframe, storyboard and
continuity anchor.

## Editorial Back-Propagation

Editorial decisions and narrative/production decisions remain separate.

```text
sequence_editorial_items -> montage usage, occurrence, trim, timing and gaps
shots -> narrative production target, prompts and generation intent
```

An editorial change must not silently mutate a Shot. Any deliberate transfer
from montage to production intent requires an explicit action, such as the
existing `Push Duration to MikAI` workflow. Future back-propagation features
must define their scope and confirmation separately.

## Priority Implication

The immediate Film Result/OpenReel block remains the current delivery priority.
After it, creative direction should be audited before adding isolated prompt
features:

1. Creative Prompt System pipeline audit;
2. Style Bible and visual-reference audit;
3. Reference Role System audit;
4. Prompt Packages audit;
5. Prompt Compiler rework;
6. Sequence montage and rhythm audits;
7. generation and output polish.

This ordering keeps the product centered on direction, continuity, rhythm and
film assembly rather than accumulating disconnected prompt controls.
