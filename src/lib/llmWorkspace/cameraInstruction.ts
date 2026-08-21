// ---------------------------------------------------------------------------
// cameraInstruction.ts — renders `cameraVocabulary.ts` into the instruction
// text an LLM receives (B19d).
//
// `src/lib/cameraVocabulary.ts` declares the five axes and their values; it
// carries no engine knowledge — the same discipline `referenceImageRoles.ts`
// follows, whose own rendering (`first_frame` -> `as first frame`) lives in
// the conformation profile, not in the role catalogue itself
// (`conformation/profiles/guideDefault.ts`). This module is that rendering
// side for the camera vocabulary: the one place that knows how these five
// fields are *asked for* in a prompt.
//
// Two write instructions ask a model to fill these fields today:
// `shots.fromSequence` (`descriptors/shotsFromSequence.ts`, JSON schema block
// rendered by `renderShotsFromSequenceJsonSchemaBlock` in
// `variables/registry.ts`) and `shot.insertDirected`
// (`descriptors/shotInsertDirected.ts`). Before this ticket they each typed
// their own copy of the value lists by hand, and disagreed (`tracking`
// against `track`, `dolly` against `dolly in`) — both now call the functions
// below instead, so a value is declared once and rendered identically
// everywhere.
// ---------------------------------------------------------------------------

import {
  getCameraVocabularyAxis,
  writtenCameraVocabularyValue,
  type CameraVocabularyAxisId,
} from "@/lib/cameraVocabulary";

export type CameraInstructionFieldId =
  | "shot_size"
  | "camera_position"
  | "camera_movement"
  | "movement_speed"
  | "camera_subject"
  | "camera_lens";

const FIELD_TO_AXIS: Record<CameraInstructionFieldId, CameraVocabularyAxisId> = {
  shot_size: "shotSize",
  camera_position: "cameraPosition",
  camera_movement: "cameraMovement",
  movement_speed: "movementSpeed",
  camera_subject: "cameraSubject",
  camera_lens: "cameraLens",
};

// `cameraPosition`'s three independent questions (`cameraVocabulary.ts`'s own
// header: inclination, height, placement) are kept grouped and labelled
// rather than flattened into one list — flattening would silently hide that
// `eye_level` legitimately appears twice, once per question, which the
// catalogue itself says must never be elided.
const POSITION_GROUP_LABELS: Record<string, string> = {
  inclination: "tilt",
  height: "height",
  placement: "role",
};

function renderAxisValueList(axisId: CameraVocabularyAxisId): string {
  const axis = getCameraVocabularyAxis(axisId);
  const hasGroups = axis.values.some((v) => v.group);
  if (!hasGroups) {
    return axis.values.map((v) => writtenCameraVocabularyValue(axis, v)).join(", ");
  }
  const byGroup = new Map<string, string[]>();
  for (const value of axis.values) {
    const key = value.group ?? "";
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(writtenCameraVocabularyValue(axis, value));
  }
  // The group label leads its list rather than trailing it. Trailing put the
  // label immediately after the last value — "… Dutch / Canted (tilt)" — and a
  // model copied the whole thing into the field as one value, twice, on the
  // author's own shots. A label in front cannot be mistaken for part of a
  // value.
  return [...byGroup.entries()]
    .map(([group, codes]) => `${POSITION_GROUP_LABELS[group] ?? group}: ${codes.join(", ")}`)
    .join("; ");
}

/**
 * One JSON-schema description line per field, `"<field>": "<type — values>"`
 * — the exact shape `shots.fromSequence`'s JSON schema block already used
 * for `framing`/`camera_movement`/`camera_pitch`, now generated from the
 * vocabulary instead of typed by hand. No trailing comma: the caller joins.
 */
// B19d follow-up — values are listed comma-separated, not slash-separated.
// Several labels contain a slash of their own ("Static / Locked-off",
// "Bird's-Eye / Overhead", "Dutch / Canted"), so a slash separator turned one
// value into two and the list became ambiguous the moment it stopped printing
// bare codes.
export function renderCameraFieldSchemaLine(fieldId: CameraInstructionFieldId): string {
  switch (fieldId) {
    case "shot_size":
      // The example uses single quotes on purpose. This line sits inside a
      // block the instruction calls "a valid JSON object matching exactly this
      // schema", and double quotes here closed the string early — the schema
      // it showed the model was not itself valid JSON.
      return `"shot_size": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.shot_size)}, or a start-to-end interval such as 'MS to WS'"`;
    case "camera_position":
      return `"camera_position": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.camera_position)}"`;
    case "camera_movement":
      return `"camera_movement": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.camera_movement)}. One value only."`;
    case "movement_speed":
      return `"movement_speed": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.movement_speed)}"`;
    case "camera_subject":
      return `"camera_subject": "string or null — prose: movement + subject it follows + start + direction + arrival"`;
    case "camera_lens":
      return `"camera_lens": "string or null — lens or focal length, only when stated"`;
  }
}

/**
 * The rules block shared verbatim by both instructions that write these five
 * fields. Sourced:
 *
 * - `shot_size`'s start-to-end interval ("MS to WS") is the Seedance 2.5
 *   guide's own "starting"/"ending shot size" — a reversal of the old
 *   Insert Shot rule, which forbade intervals outright. That prohibition is
 *   not carried forward here.
 * - `camera_subject`'s formula ("movement + subject + start + direction +
 *   arrival") and its "do not use only a term detached from its subject"
 *   line are the Seedance 2.5 skill's own wording.
 *
 * **`camera_subject` restates the movement, and that is kept on purpose.**
 * The composed line reads "… — Tracking — Follow Azelle into the pocket …",
 * naming the move twice: once in its own field, once inside the prose. The
 * author saw this on his own shots on 2026-08-21 and decided to keep it. The
 * duplication is not an oversight and is not a defect to clean up — the 2.5
 * formula asks for the movement inside that sentence, and the guide states
 * that repeating a key instruction does not hurt. Removing it would need the
 * author's word, not a tidy-up.
 */
export function renderCameraInstructionRulesBlock(): string {
  const shotSize = renderAxisValueList(FIELD_TO_AXIS.shot_size);
  const cameraPosition = renderAxisValueList(FIELD_TO_AXIS.camera_position);
  const cameraMovement = renderAxisValueList(FIELD_TO_AXIS.camera_movement);
  const movementSpeed = renderAxisValueList(FIELD_TO_AXIS.movement_speed);
  return `CAMERA FIELDS:
- shot_size is exactly one value from this set: ${shotSize}. It may also be a start-to-end interval, such as "MS to WS", when the framing itself changes over the course of the shot.
- camera_position is exactly one value from this set: ${cameraPosition}.
- camera_movement is exactly one value from this set: ${cameraMovement}. One movement only — never two combined (e.g. "pan + tilt").
- movement_speed is exactly one value from this set: ${movementSpeed}.
- None of the four fields above takes prose or a combination of values — shot_size's interval is the one named exception. If the shot's camera behavior changes in a way these fields cannot state, describe it in camera_subject instead of forcing it into one of them.
- camera_subject is prose, not a palette value: who or what the camera follows, and where the move starts and ends — movement + subject + start + direction + arrival. Do not use only a term detached from its subject.
- camera_lens is the lens or focal length when the source states one ("35mm", "85mm macro", "wide-angle"). It has no list either, and it is secondary: never invent one.
- A value outside these lists is accepted as written. Choose from the list when it fits; never invent one to force a fit.`;
}
