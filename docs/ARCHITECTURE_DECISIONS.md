# Architecture Decisions

Last updated: 2026-07-11

## MikAI Brain, OpenReel Sidecar

MikAI is the source of product truth: projects, narrative structure, shots,
sequence state, results, and film assembly.

OpenReel is an advanced editorial sidecar. It can edit and publish back to
MikAI, but it is not the source of truth for MikAI data.

## Shared Sequence Result Output

Basic Editorial and OpenReel Advanced both publish the same product concept:
a Sequence Result.

```text
Basic Editorial → Sequence Result sourceMode = basic
OpenReel Advanced → Sequence Result sourceMode = advanced
```

The viewer and Film Result pipeline should treat both as valid sequence
outputs.

## Film Results Assemble Active Sequence Results

A Film Result is assembled from the active Sequence Result of each included
sequence.

Changing or publishing a Sequence Result can make dependent Film Results
outdated.

## Editorial Duration vs Production Duration

Editorial duration is the timeline/story planning duration.

Production duration is the duration of generated or rendered media.

Tickets must keep this distinction explicit. OpenReel V1 timing patches are
start-only and do not turn duration drift into automatic production duration
changes.

## OpenReel Split Does Not Auto-Create Shots

OpenReel split is an editorial operation. It does not automatically create a
new MikAI Shot.

Shot creation must be an explicit MikAI action or a specifically scoped bridge
action.

## Snapshot Required For New OpenReel Routes

New OpenReel-to-MikAI write routes must use editorial snapshots or an equivalent
staleness guard.

Stale writes should fail clearly, normally with HTTP 409.

## `sequence_editorial_items` Is Independent

`sequence_editorial_items` is an editorial layer, not a duplicate of `shots`.

It can reference shots, carry ordering/timing/trim state, and support editorial
operations without making every timeline action a shot mutation.

## Bundled FFmpeg

MikAI uses bundled FFmpeg through `ffmpeg-ffprobe-static@6.1.1`.

Do not introduce a new FFmpeg dependency or system-FFmpeg requirement without a
ticket that explicitly authorizes the package/environment change.

## Active Uniqueness Is Applicative

Only one Sequence Result should be active per sequence, enforced by application
logic in transactions.

Only one Film Result should be active where the product model requires it,
also enforced by application logic unless a future ticket explicitly adds DB
constraints.

## Runtime Files Are Not Source

DB runtime files, uploads, render outputs, `storage`, `.next`, `dist`, and logs
are not source code. Do not commit them.
