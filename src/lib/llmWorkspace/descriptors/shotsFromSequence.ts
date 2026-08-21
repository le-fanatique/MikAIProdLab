// ---------------------------------------------------------------------------
// descriptors/shotsFromSequence.ts — LLMW.DESCRIPTOR.LIST.1 (B7c), registered
// by LLMW.BLOCK.VARPARAM.1 (B7c-n4)
//
// Descriptor for `shots.fromSequence`, matching `generateShotsFromSequenceDraft`
// (`src/actions/llm/sequenceShots.ts`) and its builder
// (`src/lib/prompts/shots-from-sequence.ts`, `buildShotsFromSequencePrompt`)
// — the first `kind: "list"` descriptor (LLMW.OUTPUT.LIST.1/2, B7a/B7b).
//
// B7c delivered this descriptor deliberately unregistered: `buildVariableDispatchers`
// (`runner.ts`) called every `{variables, render}` block positionally
// (`fn(...resolvedVariables, selectedMode)`), with no channel from
// `intent.parameters` into a render form — and the four render forms this
// descriptor needs (`shotsFromSequence.systemPathABody` / `systemPathBBody` /
// `templatePathA` / `templatePathB`, in `variables/registry.ts`) all need
// both a resolved variable's data (`sequence.sequencePrompt`, to pick a
// branch) *and* `intent.parameters.targetCount` (the number embedded in that
// branch's wording) at once. Registering it as-is would have silently baked
// a wrong shot count into the prompt for any `targetCount` other than 6, no
// error, no warning. B7c-n4 builds the missing `Block` variant this needed
// (`{variables, parameters, render}`, `types.ts`) and moves the four render
// forms onto it (`VARIABLE_PARAMETER_RENDER_FORMS`, `variables/registry.ts`)
// — see that table's own header for the calling convention. This descriptor
// is now registered in `DESCRIPTORS` (`descriptors/index.ts`).
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
        // (`shots-from-sequence.ts:71-72`), not on a mode. Both need
        // `targetCount` too (the number embedded in each branch's wording),
        // hence the `{variables, parameters, render}` variant
        // (LLMW.BLOCK.VARPARAM.1, B7c-n4).
        { variables: ["SEQ.CURRENT_PROMPT"], parameters: ["targetCount"], render: "shotsFromSequence.systemPathABody" },
        { variables: ["SEQ.CURRENT_PROMPT"], parameters: ["targetCount"], render: "shotsFromSequence.systemPathBBody" },
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
      // `shots-from-sequence.ts:131-151` for Path B). Both also need
      // `targetCount`.
      {
        variables: ["PROJECT.IDENTITY", "SEQ.CONTEXT", "SEQ.CURRENT_PROMPT"],
        parameters: ["targetCount"],
        render: "shotsFromSequence.templatePathA",
      },
      {
        variables: ["PROJECT.IDENTITY", "SEQ.CONTEXT", "SEQ.CURRENT_PROMPT"],
        parameters: ["targetCount"],
        render: "shotsFromSequence.templatePathB",
      },
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
        { type: "string", field: "shotSize", jsonKey: "framing", truncateTo: 50 },
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

  // `createGeneratedShots` (`src/actions/llm/sequenceShots.ts:131-214`) is
  // now declared in `ACTION_REGISTRY` as an `"insert"` entry
  // (`LLMW.ACTION.INSERT.1`, B7c-w) — the write side this descriptor was
  // missing.
  commit: ["createGeneratedShots"],

  executor: "inProcess",
};
