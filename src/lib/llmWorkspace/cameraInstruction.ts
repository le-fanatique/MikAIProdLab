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
  type CameraVocabularyAxisId,
} from "@/lib/cameraVocabulary";

export type CameraInstructionFieldId =
  | "shot_size"
  | "camera_position"
  | "camera_movement"
  | "movement_speed"
  | "camera_subject";

const FIELD_TO_AXIS: Record<CameraInstructionFieldId, CameraVocabularyAxisId> = {
  shot_size: "shotSize",
  camera_position: "cameraPosition",
  camera_movement: "cameraMovement",
  movement_speed: "movementSpeed",
  camera_subject: "cameraSubject",
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
    return axis.values.map((v) => v.code).join(" / ");
  }
  const byGroup = new Map<string, string[]>();
  for (const value of axis.values) {
    const key = value.group ?? "";
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(value.code);
  }
  return [...byGroup.entries()]
    .map(([group, codes]) => `${codes.join(" / ")} (${POSITION_GROUP_LABELS[group] ?? group})`)
    .join("; ");
}

/**
 * One JSON-schema description line per field, `"<field>": "<type — values>"`
 * — the exact shape `shots.fromSequence`'s JSON schema block already used
 * for `framing`/`camera_movement`/`camera_pitch`, now generated from the
 * vocabulary instead of typed by hand. No trailing comma: the caller joins.
 */
export function renderCameraFieldSchemaLine(fieldId: CameraInstructionFieldId): string {
  switch (fieldId) {
    case "shot_size":
      return `"shot_size": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.shot_size)}, or a start-to-end interval such as "MS to WS""`;
    case "camera_position":
      return `"camera_position": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.camera_position)}"`;
    case "camera_movement":
      return `"camera_movement": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.camera_movement)}. One value only."`;
    case "movement_speed":
      return `"movement_speed": "string or null — ${renderAxisValueList(FIELD_TO_AXIS.movement_speed)}"`;
    case "camera_subject":
      return `"camera_subject": "string or null — prose: movement + subject it follows + start + direction + arrival"`;
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
- A value outside these lists is accepted as written. Choose from the list when it fits; never invent one to force a fit.`;
}
