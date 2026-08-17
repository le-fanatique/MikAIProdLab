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
//      `cameraPitch` 500 (raised from 200 by LLMW.UC1.TUNE.2, S7b, défaut 2
//      — see below), `continuityNotes` 500, `framing` 50, `cameraMovement`
//      50, `continuityIn` 500, `continuityOut` 500. A mismatch here would
//      truncate the same field twice, at two different lengths — the
//      ticket's own named risk.
//   5. `commit: ["createShotAtPosition"]`.
//
// Not wired to the bench's Approve step here — that is the next ticket
// (B11-b3). This descriptor runs at the bench (Run) without being
// approvable, the same situation the three list descriptors were in before
// their own wiring tickets.
//
// LLMW.UC1.TUNE.1 (S7) — three prompt/render tunings from a real response:
//
//   1. framing/cameraMovement rule rewritten to a closed value set with an
//      explicit ban on intervals ("MS to WS") and combinations ("pan +
//      tilt") — the model had returned exactly those. The fields stay plain
//      strings (`output.fields`), not `type: "enum"`: an enum field
//      substitutes its default for an unrecognized value, the exact
//      silent-loss shape `casting.fromSequence` already refused for
//      `targetType` (see that descriptor's own `output.item.fields`
//      comment). A value that still disobeys after this wording is a
//      `postResponse` correction, and a separate ticket.
//   2. A `continuity_out` scope rule added to the same rules bullet list:
//      the field describes this shot's own ending, never the following
//      shot's progress — the model had written the next shot's own arrival
//      into this shot's continuity_out.
//   3. `shotInsert.shotListLines` (`variables/registry.ts`) now reads
//      `afterShotId` as well as `SEQ.SHOT_TARGETS` — the block widened from
//      `{variable, render}` to `{variables, parameters, render}` — so the
//      render form can tell which shots are the insertion point's own
//      neighbors. `SEQ.SHOT_TARGETS` itself is untouched: it is
//      `casting.fromSequence`'s frozen-equality variable too, and bounding
//      it here would break that descriptor's own proof for no reason of
//      its own. Only the rendering that is unique to `shot.insertDirected`
//      changed.
//
// LLMW.UC1.TUNE.2 (S7b) — two more corrections from the user's second real
// Run:
//
//   1. Défaut 1 — the model wrote a fabricated shot code into `title`
//      (`"Sh_250 — Passage Through the Bulkhead Door"`), imitating our own
//      `Code — Title` rendering in `shotInsert.shotListLines` and
//      `shotInsert.positionLine` (`variables/registry.ts`). Fixed in two
//      places at once: an explicit rule above ("title is the name of the
//      shot alone... no field you write should carry [a shot code]") and
//      both render forms now show `Code "Title"` (quoted, no em dash)
//      instead — the rule alone would have left the inducing format in
//      place, the rendering fix alone would have left the model free to
//      invent a code elsewhere.
//   2. Défaut 2 — `camera_pitch` was cut mid-word at 200 characters. Raised
//      to 500 here AND in `normalizeProposedShot`
//      (`src/actions/llm/shotInsertion.ts`) in the same diff, aligning it
//      with `description`/`continuityNotes`/`continuityIn`/`continuityOut`,
//      which already carry 500 on both sides. The two bounds must stay
//      equal — see decision 4 above and `.agents/executor_report.md`.
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
- Read the shot before and the shot after the insertion point first. Your shot must leave the first and arrive at the second: continuity_in describes what carries over from the preceding shot, continuity_out what the following shot inherits.
- continuity_out describes the state of the world at the end of this shot, and only this shot — never what the following shot goes on to accomplish. Stop at the point your own shot reaches; leave the next shot's own progress to its own continuity_out.
- title is the name of the shot alone. It never contains a shot code — numbering is assigned by production, not by you — and no field you write should carry one either.`,
        },
        // Conditional, dropped entirely with no consigne — see the module
        // header and `renderShotInsertDirectiveRuleLine`'s own comment
        // (`variables/registry.ts`) for why this is not folded into the
        // static rules text above/below it.
        { freeText: true, render: "shotInsert.directiveRuleLine" },
        {
          text: `- framing is exactly one value from this set: ECU, CU, MCU, MS, MLS, WS, EWS, OTS, POV. camera_movement is exactly one value from this set: static, pan, tilt, dolly in, dolly out, track, crane, handheld, zoom. Never an interval ("MS to WS") and never a combination ("pan + tilt") — one value, chosen once, in each field. If the shot changes frame or camera behavior partway through, describe that change in camera_pitch, not in framing or camera_movement. camera_pitch is prose describing the camera intent behind them.
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
      { variables: ["SEQ.SHOT_TARGETS"], parameters: ["afterShotId"], render: "shotInsert.shotListLines" },
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
      { type: "string", field: "cameraPitch", jsonKey: "camera_pitch", truncateTo: 500 },
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
