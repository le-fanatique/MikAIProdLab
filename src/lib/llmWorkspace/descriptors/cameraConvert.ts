// ---------------------------------------------------------------------------
// descriptors/cameraConvert.ts — B19f.
//
// Converts what 88 shots hold in `cameraPitch` into the five camera axes.
//
// **Why the legacy field is full of angles.** The instruction that produced
// these shots asked, literally, for "camera angle, lens, position" in that one
// free-text field. The model obeyed. So `cameraPitch` is not noise to be
// discarded — it is the only angle and placement the project has, written in
// prose because no field existed to hold it.
//
// **This operation repairs nothing.** `composeStoryboardShot` already falls
// back to `cameraPitch` while `cameraPosition` is empty, so existing shots
// still produce a correct camera line. It moves prose into structure, under
// the author's eye, one shot at a time.
//
// Bench-only, like UC1 and UC3. List output over the sequence's shots with a
// selection, the shape `casting.fromSequence` established: the author sees
// every proposal beside the text it came from, and accepts the ones he wants.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { renderCameraInstructionRulesBlock } from "../cameraInstruction";

export const cameraConvertDescriptor: OperationDescriptor = {
  id: "camera.convertLegacy",
  name: "Convert Legacy Camera Text",

  anchor: { kind: "entity", entity: "sequence" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.IDENTITY", userAdjustable: false },
      { id: "SEQ.SHOT_CAMERA", userAdjustable: false },
    ],
  },

  expertise: {
    role: "cameraConversionSupervisor",
    knowledge: [],
    system: {
      blocks: [
        {
          text: `You are a storyboard supervisor. You are re-filing camera notes that were written as free prose into named fields, without changing what they say.`,
      },
        {
          text: `Rules:
- Convert only what the text actually states. An axis the text says nothing about stays empty — never guess, never fill it with a default. An empty field is a correct answer.
- Never overwrite a field that already holds a valid value. Propose a replacement only when what is there is not a value from the palette, and say so in \`note\`.
- One movement per shot. If the text names several ("tracking push with whip-pan and final dolly-in"), keep the principal one, put the rest in camera_subject, and say in \`note\` that you chose.
- A value that mixes two axes belongs to both: "OTS to MCU" is camera_position "Over-the-Shoulder (OTS)" and shot_size "MCU". That is a conversion, not an interval.
- Prose that describes what the camera follows goes to camera_subject — "following her gloved hand" names a subject, not a position.
- Return one entry per shot you can convert, and none for a shot whose text yields nothing.`,
      },
      { text: renderCameraInstructionRulesBlock() },
        {
          text: `Always respond with a valid JSON object matching exactly this schema:
{
  "conversions": [
    {
      "shot_id": number — the id shown for that shot, copied exactly,
      "shot_size": "string or null",
      "camera_position": "string or null",
      "camera_movement": "string or null",
      "movement_speed": "string or null",
      "camera_subject": "string or null",
      "note": "string or null — only when you had to choose, in one short sentence"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`,
      },
      ],
      separator: "\n\n",
    },
  },

  template: {
    blocks: [
      { variables: ["PROJECT.IDENTITY", "SEQ.IDENTITY"], render: "cameraConvert.header" },
      { variable: "SEQ.SHOT_CAMERA", render: "cameraConvert.shotLines" },
    ],
    separator: "\n\n",
  },

  intent: {},

  output: {
    kind: "list",
    arrayKey: "conversions",
    item: {
      fields: [
        { type: "number", field: "shotId", jsonKey: "shot_id", exclusiveMin: 0, fallback: "omit" },
        { type: "string", field: "shotSize", jsonKey: "shot_size", truncateTo: 50 },
        { type: "string", field: "cameraPosition", jsonKey: "camera_position", truncateTo: 50 },
        { type: "string", field: "cameraMovement", jsonKey: "camera_movement", truncateTo: 50 },
        { type: "string", field: "movementSpeed", jsonKey: "movement_speed", truncateTo: 50 },
        { type: "string", field: "cameraSubject", jsonKey: "camera_subject", truncateTo: 300 },
        { type: "string", field: "note", jsonKey: "note", truncateTo: 300 },
      ],
      // The format only lets a validity rule reference *string* fields, so it
      // cannot require `shot_id`, which is a number. That is handled on the
      // other side instead: `fallback: "omit"` drops an unusable `shotId`, and
      // the write action refuses any proposal without one, checked against the
      // sequence rather than by bare id.
      //
      // What a string rule *can* say here is the rule worth having: a
      // conversion that fills no axis at all is not a conversion. `require:
      // "any"` rather than `"all"` because an axis the source does not mention
      // must stay empty — requiring all five would force exactly the guessing
      // this operation exists to prevent.
      validity: {
        fields: ["shotSize", "cameraPosition", "cameraMovement", "movementSpeed", "cameraSubject"],
        require: "any",
      },
    },
    maxItems: 200,
    selection: { formDataKey: "selectedJson" },
    errors: {
      unparsable: "The model returned an unexpected format. Try again.",
      notArray: "The model did not return a conversions array. Try again.",
      empty: "The model found nothing to convert in this sequence.",
    },
  },

  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found.", sequence: "Sequence not found." },
  },

  commit: ["applyCameraConversions"],

  executor: "inProcess",
};
