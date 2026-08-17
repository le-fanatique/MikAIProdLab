// ---------------------------------------------------------------------------
// descriptors/shotInsertDirected.ts — LLMW.UC1.INSERT.1 (B11-b2)
//
// `shot.insertDirected` — the descriptor that delivers UC1 (§4 of
// `docs/LLM_WORKSPACE_PRODUCT_VISION.md`): "j aimerai bien un plan un peu à
// raz de terre montrant Le hero rentrer dans le champ de la camera et en
// sorti" — a plan dirigé, inséré entre deux autres.
//
// Same "no oracle" situation as `shot.retakeDirected` (B9b) and
// `asset.retakeDirected` (B10): no flat-JSON action to migrate from, no
// builder to reproduce byte-for-byte. Every block below is authored for this
// ticket. Proof is unit-level assembly plus the human-readable resolved
// prompt in `.agents/executor_report.md` — the ticket's own §"Pas d'oracle".
//
// Design decisions frozen by the supervisor (`.agents/supervised_task.md`):
//
//   1. The anchor is the Sequence, not an `insertionPoint` — the operation
//      reads a Sequence and writes a Shot into it, exactly what
//      `shots.fromSequence` already does. `insertionPoint` stays nominal, a
//      constraint to report, not a gap to fill here.
//   2. The insertion position (`afterShotId`) is an `intent.parameters`
//      entry, not part of the anchor — it varies per request. No `default`,
//      no `min`/`max`: an id has no sensible numeric bound, and
//      `normalizeIntentParameters` (B7e-n) simply omits an invalid value
//      rather than defaulting it. Absent -> insert at the very start of the
//      sequence, `createShotAtPosition`'s own contract for a blank
//      `afterShotId`. Declared `type: "integer"`, not the ticket's own
//      literal `"number"` — `intent.parameters[].type` (`types.ts`) is a
//      closed union of `"integer" | "string" | "boolean" | "multiEnum"`,
//      with no `"number"` member (that spelling exists only on
//      `output.fields`'s `ObjectOutputField`, a distinct type the ticket's
//      own §"la position est un paramètre d'intention" cites in the same
//      breath but does not conflate). `"integer"` is the correct, and only
//      compiling, choice for a database id — reported in
//      `.agents/executor_report.md` rather than silently typed around.
//   3. Exactly three context variables: `PROJECT.IDENTITY`, `SEQ.CONTEXT`,
//      `SEQ.SHOT_TARGETS`. No `SEQ.SHOTS` alongside `SEQ.SHOT_TARGETS` — the
//      latter already carries `title`/`description`/`actionPitch`, and the
//      double-declaration this would create already cost a ticket in this
//      series (`SEQ.SHOT_CONTINUITY`, added and reverted the same day).
//   4. Ten output fields, `require: "any"`, no `shotCode` — the write side
//      (`createShotAtPosition`, `src/actions/llm/shotInsertion.ts`) generates
//      it from the nomenclature template and never reads it from the JSON;
//      declaring it here would be the same silent-loss shape already refused
//      for sourcing metadata elsewhere in this series. `durationSeconds`'s
//      bound (`exclusiveMin: 0, max: 120`) and every `truncateTo` are copied
//      field-by-field from `normalizeProposedShot` (`shotInsertion.ts:75-98`)
//      — verified against that file directly, not assumed from the ticket's
//      own table: `title` 200, `description` 500, `actionPitch` 300,
//      `cameraPitch` 200, `continuityNotes` 500, `framing` 50,
//      `cameraMovement` 50, `continuityIn` 500, `continuityOut` 500. A
//      mismatch here would truncate the same field twice, at two different
//      lengths — the ticket's own named risk.
//   5. `commit: ["createShotAtPosition"]`.
//
// Not wired to the bench's Approve step here — that is the next ticket
// (B11-b3). This descriptor runs at the bench (Run) without being
// approvable, the same situation the three list descriptors were in before
// their own wiring tickets.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { SHOT_INSERT_SYSTEM_INTRO } from "../variables/registry";

export const shotInsertDirectedDescriptor: OperationDescriptor = {
  id: "shot.insertDirected",
  name: "Insert Shot (Directed)",

  anchor: { kind: "entity", entity: "sequence" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "SEQ.SHOT_TARGETS", userAdjustable: false },
    ],
  },

  expertise: {
    role: "shotInsertSupervisor",
    system: {
      blocks: [
        { text: SHOT_INSERT_SYSTEM_INTRO },
        {
          text: `Rules:
- Write one shot, and only one. It will be inserted at the position the director names, between the shots shown below.
- Read the shot before and the shot after the insertion point first. Your shot must leave the first and arrive at the second: continuity_in describes what carries over from the preceding shot, continuity_out what the following shot inherits.`,
        },
        // Conditional, dropped entirely with no consigne — see the module
        // header and `renderShotInsertDirectiveRuleLine`'s own comment
        // (`variables/registry.ts`) for why this is not folded into the
        // static rules text above/below it.
        { freeText: true, render: "shotInsert.directiveRuleLine" },
        {
          text: `- framing and camera_movement are the technical fields: short, conventional notation the team already uses (for framing, values such as CU, MS, WS, ECU, OTS; for camera movement, values such as static, pan, tilt, dolly in, handheld). camera_pitch is prose describing the camera intent behind them.
- duration_seconds is a plain number of seconds, sized to the action you describe, never a range and never text.
- Stay inside the story that already exists. Do not invent characters, locations or plot facts that the sequence and its shots do not already establish.
- Leave a field empty only when the sequence genuinely gives you nothing to write in it. An empty string means "nothing to say", never "skipped".
- Write in English.`,
        },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{ "title": "<shot title>", "description": "<shot description>", "duration_seconds": <number>, "action_pitch": "<action pitch>", "camera_pitch": "<camera pitch>", "continuity_notes": "<continuity notes>", "framing": "<framing>", "camera_movement": "<camera movement>", "continuity_in": "<continuity in>", "continuity_out": "<continuity out>" }
No markdown. No explanation. Only the JSON object.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { variable: "PROJECT.IDENTITY", render: "shotInsert.projectLines" },
      { variable: "SEQ.CONTEXT", render: "shotInsert.sequenceLines" },
      { variable: "SEQ.SHOT_TARGETS", render: "shotInsert.shotListLines" },
      { variables: ["SEQ.SHOT_TARGETS"], parameters: ["afterShotId"], render: "shotInsert.positionLine" },
      { freeText: true, render: "shotInsert.freeTextDirective" },
    ],
    separator: "\n",
  },

  intent: {
    // §4 UC1's whole request is one free-text consigne, plus where to insert
    // it — see the module header, decision 2, for `type: "integer"` (not the
    // ticket's own literal `"number"`, which does not exist on this field).
    freeText: { label: "Director's note" },
    parameters: [{ id: "afterShotId", type: "integer", label: "Insert after shot (id)" }],
  },

  // Copied verbatim from `shots.fromSequence` (§ same two-level chain, same
  // anchor): `"Invalid request."`, `"LLM not configured. Go to Settings to
  // set up Ollama."`, `"Project not found."` / `"Sequence not found."`. No
  // `invalidMode`: this operation takes no assist mode. No `preconditions`:
  // nothing else is validated before the model is called.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", sequence: "Sequence not found." },
  },

  output: {
    kind: "object",
    target: { entity: "shot" },
    // Field-by-field bounds copied from `normalizeProposedShot`
    // (`src/actions/llm/shotInsertion.ts:75-98`) — see the module header,
    // decision 4.
    fields: [
      { type: "string", field: "title", jsonKey: "title", truncateTo: 200 },
      { type: "string", field: "description", jsonKey: "description", truncateTo: 500 },
      { type: "number", field: "durationSeconds", jsonKey: "duration_seconds", exclusiveMin: 0, max: 120, fallback: "omit" },
      { type: "string", field: "actionPitch", jsonKey: "action_pitch", truncateTo: 300 },
      { type: "string", field: "cameraPitch", jsonKey: "camera_pitch", truncateTo: 200 },
      { type: "string", field: "continuityNotes", jsonKey: "continuity_notes", truncateTo: 500 },
      { type: "string", field: "framing", jsonKey: "framing", truncateTo: 50 },
      { type: "string", field: "cameraMovement", jsonKey: "camera_movement", truncateTo: 50 },
      { type: "string", field: "continuityIn", jsonKey: "continuity_in", truncateTo: 500 },
      { type: "string", field: "continuityOut", jsonKey: "continuity_out", truncateTo: 500 },
    ],
    require: "any",
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      empty: "The model returned no shot data. Try again.",
    },
  },

  commit: ["createShotAtPosition"],

  executor: "inProcess",
};
