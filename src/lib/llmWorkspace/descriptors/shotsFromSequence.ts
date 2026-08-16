// ---------------------------------------------------------------------------
// descriptors/shotsFromSequence.ts — LLMW.DESCRIPTOR.LIST.1 (B7c)
//
// Descriptor for `shots.fromSequence`, matching `generateShotsFromSequenceDraft`
// (`src/actions/llm/sequenceShots.ts`) and its builder
// (`src/lib/prompts/shots-from-sequence.ts`, `buildShotsFromSequencePrompt`)
// — the first `kind: "list"` descriptor (LLMW.OUTPUT.LIST.1/2, B7a/B7b) and
// the first of the ticket's three candidate list-creating operations to
// actually ship (§0 of the ticket: `sequences-from-outline` and asset
// extraction both wait on a missing brick, named there but not built here).
//
// THIS DESCRIPTOR IS DELIBERATELY NOT REGISTERED IN `DESCRIPTORS`
// (`descriptors/index.ts`), and this is not a leftover — it is the point of
// the B7c review correction. `DESCRIPTORS` is the table the runner and the
// `/settings/llm-workflows` test bench actually execute. Wiring this
// descriptor into it today would not fail loudly: it would silently produce
// a wrong prompt every time a user picks a `targetCount` other than 6.
//
// Why: `buildVariableDispatchers` (`runner.ts:347-353`) calls
// `fn(...args, selectedMode)` — every `{variables, render}` block's render
// form receives the resolved variables, then `selectedMode` as its trailing
// argument, never `intent.parameters`. This descriptor declares no
// `intent.mode`, so `selectedMode` is always `undefined`. The four render
// forms this descriptor relies on
// (`shotsFromSequence.systemPathABody` / `systemPathBBody` /
// `templatePathA` / `templatePathB`, in `variables/registry.ts`) all take
// `targetCount` as that same trailing slot, and all fall back with
// `targetCount ?? 6` when it is missing. Ran through the real runner as-is,
// every one of them would receive `undefined` in that slot and silently
// render a prompt asking for exactly 6 shots, regardless of what the user
// actually requested via `intent.parameters.targetCount` — no error, no
// warning, just a wrong number baked into the prompt text.
//
// `buildShotsFromSequencePrompt` branches entirely on
// `sequence.sequencePrompt` (`shots-from-sequence.ts:71-72`,
// `hasSequencePrompt`), not on a user-selected `intent.mode`: Path A (an
// Approved Sequence Prompt exists) and Path B (it does not) produce two
// structurally different `{system, user}` pairs, both still needing
// `targetCount` throughout. The frozen `Block` union (`types.ts`) lets a
// `{variables, render}` block see resolved variable data, and a `{mode,
// render}` block see the selected `intent.mode`, but no block sees both
// resolved variable data *and* an `intent.parameters` value at once. A
// plain per-branch split into separate blocks cannot route around this
// either: the wording itself depends on the branch (Path A says "Your task
// is to generate exactly N shots for the given sequence.", Path B says
// "Your task is to break a production sequence into exactly N individual
// shots." — `variables/registry.ts`'s `renderShotsFromSequenceSystemPathABody`
// / `...PathBBody`), so a bare `{parameter: "targetCount"}` block, which
// has no notion of which branch is active, cannot stand in for either
// wording. The missing brick is therefore a `Block` variant that carries
// both variables and parameters together — a real contract change to
// `types.ts` and `runner.ts`, out of this ticket's scope, and named here so
// whoever builds it does not have to rediscover this wall from scratch.
//
// What IS proven here: `assembleDescriptorMessages`, fed this descriptor's
// blocks through a hand-built test dispatcher that threads `targetCount`
// directly (same pattern as
// `tests/llmWorkspace/outline.generate.render.test.ts`), reproduces
// `buildShotsFromSequencePrompt`'s output byte for byte — see
// `tests/llmWorkspace/shotsFromSequence.render.test.ts`. The descriptor's
// *content* is correct and tested; only its production wiring through the
// generic runner is what remains unbuilt.
//
// `context.variables` widens from the two the ticket's §2.1 names
// (`PROJECT.IDENTITY`, `SEQ.CONTEXT`) to three: `SEQ.CURRENT_PROMPT` is
// added too, because the path-branch above and the "Approved Sequence
// Prompt" text it embeds both come straight from
// `sequence.sequencePrompt` — the field `SEQ.CURRENT_PROMPT` already owns
// (§2.2 of the ticket: "sequencePrompt: ne le rajoute pas [à SEQ.CONTEXT]
// ... Utilise donc un bloc {variables, render} déclarant les deux
// variables qu'il lit"). Declaring the block without declaring the
// variable it reads in `context.variables` would leave the runner with no
// row to resolve it from (`runner.ts`'s `resolveVariables` iterates
// `descriptor.context.variables` only) — see the report for this reading
// of §2.1 vs. §2.2.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

export const shotsFromSequenceDescriptor: OperationDescriptor = {
  id: "shots.fromSequence",
  name: "Generate Shots from Sequence",

  // `generateShotsFromSequenceDraft` reads both `projectId` and
  // `sequenceId` (`sequenceShots.ts:74-75`) and verifies
  // `sequence.projectId === projectId` (`sequenceShots.ts:98`) — exactly
  // the chain `requiredAnchorIdKeys("sequence")` already requires.
  anchor: { kind: "entity", entity: "sequence" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "SEQ.CURRENT_PROMPT", userAdjustable: false },
    ],
  },

  expertise: {
    role: "shotsFromSequenceWriter",
    system: {
      blocks: [
        // Exactly one of these two is ever non-empty — gated on
        // `sequence.sequencePrompt`'s presence
        // (`shots-from-sequence.ts:71-72`), not on a mode.
        { variables: ["SEQ.CURRENT_PROMPT"], render: "shotsFromSequence.systemPathABody" },
        { variables: ["SEQ.CURRENT_PROMPT"], render: "shotsFromSequence.systemPathBBody" },
        // `CONTINUITY_RULES` (`shots-from-sequence.ts:58-67`) — identical
        // in both paths, own leading `"\n"` reopening the blank line
        // (§4.1 correction 4's device, as `outline.ts`'s tail block uses).
        {
          text: `
CONTINUITY RULES:
- Generate the shots as a continuous causal action chain, not as disconnected moments.
- Each shot must begin from the previous shot's continuity_out state.
- Do not reset character positions, locations, emotional states, injuries, transformations, held objects, lost objects, or action outcomes between shots.
- If a character is killed, wounded, trapped, transformed, leaves the scene, loses an object, gains an object, or changes emotional state, every later shot must respect that new state.
- Every shot must include both continuity_in and continuity_out fields.
- Shot 1 continuity_in establishes the initial state of the sequence.
- Shot N continuity_out becomes the starting state of Shot N+1.
- Last shot continuity_out describes the final state reached by the end of the sequence.
- Before writing each shot, silently track: character positions, alive/dead/injured/transformed state, objects held/lost/destroyed, location, emotional state, and consequences of previous action. Do not output this reasoning. Only output the JSON.`,
        },
        // `JSON_SCHEMA(count)` (`shots-from-sequence.ts:36-56`) — identical
        // in both paths, needs only `targetCount`, own leading `"\n"`.
        { parameter: "targetCount", render: "shotsFromSequence.jsonSchemaBlock" },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      // Exactly one of these two is ever non-empty — same gate as the
      // system blocks above, over the full user message
      // (`shots-from-sequence.ts:90-121` for Path A,
      // `shots-from-sequence.ts:131-151` for Path B).
      { variables: ["PROJECT.IDENTITY", "SEQ.CONTEXT", "SEQ.CURRENT_PROMPT"], render: "shotsFromSequence.templatePathA" },
      { variables: ["PROJECT.IDENTITY", "SEQ.CONTEXT", "SEQ.CURRENT_PROMPT"], render: "shotsFromSequence.templatePathB" },
    ],
    separator: "\n",
  },

  intent: {
    // `shotCount` (`sequenceShots.ts:76,85-87`):
    // `const shotCount = Number.isInteger(shotCountRaw) && shotCountRaw >= 1 && shotCountRaw <= 30 ? shotCountRaw : 6;`
    // — bound 1-30, default 6 on absence or on any out-of-bound value.
    parameters: [
      {
        id: "targetCount",
        type: "integer",
        label: "Target number of shots",
        min: 1,
        max: 30,
        default: 6,
      },
    ],
  },

  // Read verbatim from `generateShotsFromSequenceDraft`
  // (`sequenceShots.ts`): `"Invalid request."` (line 82) on a malformed
  // `projectId`/`sequenceId`, `"LLM not configured. Go to Settings to set
  // up Ollama."` (line 91), the two-level chain `"Project not found."`
  // (line 95) / `"Sequence not found."` (line 99, the
  // `sequence.projectId !== projectId` ownership check). No `invalidMode`:
  // the action takes no assist mode. No `preconditions`: the action
  // validates nothing else before calling the model — an absent entry is
  // honest, not an omission (§2.1 of the ticket).
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", sequence: "Sequence not found." },
  },

  // Reproduces `normalizeShot` (`sequenceShots.ts:23-49`) field by field, in
  // its own declaration order. Every string field's bound is `str()`'s own
  // `maxLen` (`sequenceShots.ts:17-21`: trim, empty -> filtered by
  // `item.validity` below where relevant, else truncate). `duration_seconds`
  // (`sequenceShots.ts:29-34`) is the one numeric field: accepted only when
  // `> 0 && <= 120`, otherwise omitted (never defaulted from the item's
  // index — `sequenceShots.ts` has no such fallback, unlike
  // `sequenceGeneration.ts`'s `order_index`).
  output: {
    kind: "list",
    // `parseShotsResult`'s own top-level key (`sequenceShots.ts:59`).
    arrayKey: "shots",
    item: {
      fields: [
        { type: "string", field: "title", jsonKey: "title", truncateTo: 200 },
        { type: "string", field: "shotCode", jsonKey: "shot_code", truncateTo: 50 },
        { type: "string", field: "description", jsonKey: "description", truncateTo: 500 },
        { type: "number", field: "durationSeconds", jsonKey: "duration_seconds", exclusiveMin: 0, max: 120, fallback: "omit" },
        { type: "string", field: "continuityIn", jsonKey: "continuity_in", truncateTo: 500 },
        { type: "string", field: "actionPitch", jsonKey: "action_pitch", truncateTo: 300 },
        { type: "string", field: "cameraPitch", jsonKey: "camera_pitch", truncateTo: 200 },
        { type: "string", field: "framing", jsonKey: "framing", truncateTo: 50 },
        { type: "string", field: "cameraMovement", jsonKey: "camera_movement", truncateTo: 50 },
        { type: "string", field: "continuityOut", jsonKey: "continuity_out", truncateTo: 500 },
        { type: "string", field: "shotPrompt", jsonKey: "shot_prompt", truncateTo: 1000 },
      ],
      // `normalizeShot` returns `null` (item dropped) only when `title` is
      // missing (`sequenceShots.ts:26-27`) — the sole gate.
      validity: { fields: ["title"], require: "all" },
    },
    // No `maxItems`: `parseShotsResult` (`sequenceShots.ts:51-68`) never
    // slices the filtered array. No `sort`: it never sorts either (unlike
    // `sequenceGeneration.ts`'s `order_index` sort).
    // `selection.formDataKey` — `createGeneratedShots` reads `shotsJson`
    // (`sequenceShots.ts:137`).
    selection: { formDataKey: "shotsJson" },
    errors: {
      // `parseShotsResult` (`sequenceShots.ts:51-68`).
      unparsable: "The model returned an unexpected format. Try again.",
      notArray: "The model did not return a shots array. Try again.",
      empty: "The model returned no valid shots. Try again.",
    },
  },

  // Deliberately empty. `createGeneratedShots` (`sequenceShots.ts:131-214`)
  // *inserts* new Shot rows (`db.insert(shots).values(...)`, in a loop) —
  // every existing `ActionId` in `ACTION_REGISTRY` instead *updates* an
  // already-existing row, and `columns.written` /
  // `writeSemantics: "replace" | "partialPerItem"` (§3.2's vocabulary) was
  // built to describe an update, not an insert with a nomenclature-derived
  // `shotCode` and an `orderIndex` computed from the Sequence's current max.
  // Declaring the write side here is a ticket of its own (§2.1 of this
  // ticket). An empty `commit` is not rejected by `templateStorage.ts`'s
  // validator (`templateStorage.ts:377-380` checks the array shape, not its
  // length) and does not claim a write path that does not exist yet.
  commit: [],

  executor: "inProcess",
};
