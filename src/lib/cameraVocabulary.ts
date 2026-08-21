// ---------------------------------------------------------------------------
// cameraVocabulary.ts — the camera vocabulary, declared once (B19a).
//
// Pure, deterministic module: no DB, no browser, no LLM call, no rendering
// knowledge. Same precedent as `src/lib/referenceImageRoles.ts` (the role
// catalogue): a shared vocabulary with canonical codes, English labels,
// short definitions, and legacy-alias normalization — nothing here knows how
// a value becomes a prompt fragment. That belongs to the conformation
// profile, exactly as `referenceImageRoles.ts`'s own header says a
// `first_frame` role rendering `as first frame` belongs to conformation, not
// to the role catalogue.
//
// Why this file exists: the camera vocabulary is today copied by hand in
// three places that disagree —
//
//   - `variables/registry.ts:2360` (Generate Shots): framing
//     `CU / MCU / MS / WS / ECU / OTS / POV`, movement
//     `static / pan / tilt / tracking / dolly / handheld`;
//   - `descriptors/shotInsertDirected.ts:152` (Insert Shot): framing adds
//     `MLS`, `EWS`; movement is
//     `static, pan, tilt, dolly in, dolly out, track, crane, handheld, zoom`;
//   - the Shot form placeholders (`shots/new`, `shots/[shotId]/edit`):
//     `CU, MS, WS, ECU, OTS` only.
//
// `tracking` against `track`, `dolly` against `dolly in/out` — the exact
// disagreement this module resolves once, in the alias table below. This
// ticket creates the declaration and its net. It wires nothing: no prompt,
// no descriptor, no form, no composition, no conformation reads this module
// yet. The three copies above are not deleted here either — they die when
// their own consumer migrates, not before.
//
// Palette, not a closed enum — decided by the user 2026-08-21, sources: the
// BytePlus `sd25-pe` skill and the Seedance 2.0 guide. A value outside the
// palette is *flagged*, never substituted, never rejected: an `enum` field
// silently swaps an unrecognized answer for its own default, the exact
// silent-loss shape `output.item.fields` (`casting.fromSequence`) already
// refuses for `targetType`, and these axes refuse it the same way. So every
// value here is a plain string with a suggested set behind it, not a closed
// union of literals.
// ---------------------------------------------------------------------------

export type CameraVocabularyAxisId =
  | "shotSize"
  | "cameraPosition"
  | "cameraMovement"
  | "movementSpeed"
  | "cameraSubject";

/**
 * `cameraPosition` alone is split into three independent questions: how the
 * lens is tilted, how high the camera physically sits, and what narrative
 * role it plays. They are independent — a camera near the ground can still
 * be perfectly level, which a single tilt axis cannot say — so `Eye Level`
 * legitimately appears once per group, as two different answers to two
 * different questions. Never elided, never deduplicated across groups.
 */
export type CameraPositionGroupId = "inclination" | "height" | "placement";

export type CameraVocabularyValueDefinition = {
  /** Canonical, stored value. Never mutated once introduced. */
  code: string;
  /** English UI label, exactly as shown to the director. */
  label: string;
  /** Short definition of what the value means — the point of this module: today nothing says what "MS" is. */
  definition: string;
  /** Present only on `cameraPosition` values: which of the three independent questions this value answers. */
  group?: CameraPositionGroupId;
};

export type CameraVocabularyAxisDefinition = {
  id: CameraVocabularyAxisId;
  label: string;
  definition: string;
  /** Suggested values — a palette, not a closed enumeration. Empty for `cameraSubject`, which is free prose and has none. */
  values: readonly CameraVocabularyValueDefinition[];
  /**
   * Which form of a value is actually written — into the field by a human, and
   * into the JSON by a model. Declared per axis rather than guessed, because
   * the trade is not consistent and neither should we be: a shot size *is* its
   * sigle to anyone who works in film ("MS", "ECU"), while a position or a
   * movement is its words ("Low Angle", "Dolly In"). `low_angle` in a field a
   * storyboard artist fills is developer vocabulary, and this repository has no
   * reason to impose it.
   *
   * Both forms normalize to the same canonical code, so this changes what is
   * read and typed, never what anything means.
   */
  writtenForm: "code" | "label";
};

// ---------------------------------------------------------------------------
// The five axes.
// ---------------------------------------------------------------------------

export const CAMERA_VOCABULARY: readonly CameraVocabularyAxisDefinition[] = [
  {
    id: "shotSize",
    writtenForm: "code",
    label: "Shot Size",
    definition: "How much of the subject fills the frame.",
    values: [
      { code: "EWS", label: "Extreme Wide Shot", definition: "The subject is small in the frame, dominated by the surrounding space — establishes location or scale." },
      { code: "WS", label: "Wide Shot", definition: "The subject's full body is visible, with generous space around it." },
      { code: "FS", label: "Full Shot", definition: "The subject's full body fills most of the frame, head to feet." },
      { code: "MWS", label: "Medium Wide Shot (Cowboy)", definition: "Frames the subject roughly from mid-thigh up — named for the classic Western gunslinger frame." },
      { code: "MS", label: "Medium Shot", definition: "Frames the subject roughly from the waist up." },
      { code: "MCU", label: "Medium Close-Up", definition: "Frames the subject from the chest up — between a Medium Shot and a Close-Up." },
      { code: "CU", label: "Close-Up", definition: "Frames the subject's face, or a similarly detailed subject, filling most of the frame." },
      { code: "ECU", label: "Extreme Close-Up", definition: "Frames a small detail — eyes, a hand, an object — filling the entire frame." },
    ],
  },
  {
    id: "cameraPosition",
    writtenForm: "label",
    label: "Camera Position",
    // The user-facing wording stays plain on purpose: a storyboard artist
    // needs to know what the axis is, not which guide named it. The reason
    // this is "position" rather than the narrower "angle" — the term the
    // Seedance 2.5 skill itself uses, wide enough to hold height as well as
    // tilt — belongs here, in the code, not on screen.
    definition:
      "Where the camera is: how it tilts, how high it sits, and where it stands in relation to the subject.",
    values: [
      // inclination — how the lens is tilted
      { code: "eye_level", group: "inclination", label: "Eye Level", definition: "The lens points neither up nor down, level with the subject's eyes." },
      { code: "high_angle", group: "inclination", label: "High Angle", definition: "The lens tilts downward, looking down at the subject." },
      { code: "low_angle", group: "inclination", label: "Low Angle", definition: "The lens tilts upward, looking up at the subject." },
      { code: "birds_eye_overhead", group: "inclination", label: "Bird's-Eye / Overhead", definition: "The lens points straight down from directly above the subject." },
      { code: "worms_eye", group: "inclination", label: "Worm's-Eye", definition: "The lens points straight up from ground level — an extreme low angle." },
      { code: "dutch_canted", group: "inclination", label: "Dutch / Canted", definition: "The camera is tilted off the horizontal axis; the horizon line is skewed." },
      // height — how high the camera physically sits, independent of tilt
      { code: "ground_level", group: "height", label: "Ground Level", definition: "The camera sits at or near the ground." },
      { code: "low", group: "height", label: "Low", definition: "The camera is positioned below the subject's eye line, without necessarily tilting up." },
      { code: "chest_level", group: "height", label: "Chest Level", definition: "The camera sits at roughly chest height." },
      { code: "eye_level", group: "height", label: "Eye Level", definition: "The camera physically sits at the subject's eye height, independent of which way the lens is tilted." },
      { code: "overhead", group: "height", label: "Overhead", definition: "The camera is positioned high above, near the ceiling or the sky." },
      // placement — the shot's narrative role
      { code: "pov", group: "placement", label: "POV", definition: "The camera stands in for a character's own eyes — what they see." },
      { code: "ots", group: "placement", label: "Over-the-Shoulder (OTS)", definition: "The camera looks past one character's shoulder toward another — grounds the shot in that character's presence without taking their POV." },
      { code: "two_shot", group: "placement", label: "Two-Shot", definition: "Two subjects share the frame together." },
      { code: "single", group: "placement", label: "Single", definition: "One subject alone fills the frame." },
      { code: "reverse_shot", group: "placement", label: "Reverse Shot", definition: "The camera faces the opposite direction of the preceding shot, typically completing a shot/reverse-shot exchange." },
      { code: "establishing_shot", group: "placement", label: "Establishing Shot", definition: "The camera shows a location or setup, orienting the audience before the scene continues." },
      { code: "profile", group: "placement", label: "Profile", definition: "The camera frames the subject from the side." },
      { code: "front_view", group: "placement", label: "Front View", definition: "The camera frames the subject facing directly toward it." },
      { code: "rear_view", group: "placement", label: "Rear View", definition: "The camera frames the subject from directly behind." },
    ],
  },
  {
    id: "cameraMovement",
    writtenForm: "label",
    label: "Camera Movement",
    definition: "How the camera moves during the shot. One move only — never two combined.",
    values: [
      { code: "static", label: "Static / Locked-off", definition: "The camera does not move for the duration of the shot." },
      { code: "dolly", label: "Dolly", definition: "The camera moves physically toward or away from the subject, direction unspecified." },
      { code: "dolly_in", label: "Dolly In", definition: "The camera moves physically toward the subject." },
      { code: "dolly_out", label: "Dolly Out", definition: "The camera moves physically away from the subject." },
      { code: "tracking", label: "Tracking", definition: "The camera moves alongside or follows the subject, direction and axis unspecified." },
      { code: "truck_left", label: "Truck Left", definition: "The camera moves laterally to the left, subject usually kept in frame." },
      { code: "truck_right", label: "Truck Right", definition: "The camera moves laterally to the right, subject usually kept in frame." },
      { code: "pan", label: "Pan", definition: "The camera rotates horizontally around its own vertical axis, without changing position." },
      { code: "tilt", label: "Tilt", definition: "The camera rotates vertically around its own horizontal axis, without changing position." },
      { code: "pedestal_up", label: "Pedestal Up", definition: "The camera moves straight up while keeping the same framing angle." },
      { code: "pedestal_down", label: "Pedestal Down", definition: "The camera moves straight down while keeping the same framing angle." },
      { code: "roll", label: "Roll", definition: "The camera rotates around its own lens axis, rolling the horizon line." },
      { code: "zoom", label: "Zoom", definition: "The lens focal length changes, narrowing or widening the frame without the camera moving." },
      { code: "arc", label: "Arc", definition: "The camera moves along a curved path around the subject." },
      { code: "crane", label: "Crane", definition: "The camera moves on a crane arm, typically combining a height change with horizontal travel." },
      { code: "handheld", label: "Handheld", definition: "The camera is held by the operator rather than mounted, carrying the operator's own motion." },
      { code: "rack_focus", label: "Rack Focus", definition: "Focus shifts from one plane to another during the shot, without moving the camera." },
    ],
  },
  {
    id: "movementSpeed",
    writtenForm: "label",
    label: "Movement Speed",
    // Kept a separate axis from the movement itself, on the author's call:
    // 22 of his shots already carried a speed inside `camera_movement`, and
    // the Seedance 2.0 guide names this rhythm vocabulary explicitly.
    definition: "How fast, and how smoothly, the camera moves.",
    values: [
      { code: "slow", label: "Slow", definition: "The movement unfolds at a slow pace." },
      { code: "smooth", label: "Smooth", definition: "The movement is even, without jerks or steps." },
      { code: "stable", label: "Stable", definition: "The movement holds steady, without drift or wobble." },
      { code: "gradual", label: "Gradual", definition: "The movement builds up incrementally rather than starting abruptly." },
      { code: "gentle", label: "Gentle", definition: "The movement is soft, without sudden acceleration." },
      { code: "rapid", label: "Rapid", definition: "The movement unfolds quickly." },
    ],
  },
  {
    id: "cameraSubject",
    writtenForm: "label",
    label: "Camera Subject",
    // No palette: this is the one axis that has to be written, not chosen.
    // The Seedance 2.5 skill's formula is "movement + subject + start +
    // direction + arrival", under the rule "do not use only a term detached
    // from its subject" — which is why a bare "tracking" is not enough and
    // this field exists at all.
    definition:
      "Who or what the camera follows, and where the move starts and ends.",
    values: [],
  },
];

const AXES_BY_ID: ReadonlyMap<CameraVocabularyAxisId, CameraVocabularyAxisDefinition> = new Map(
  CAMERA_VOCABULARY.map((axis) => [axis.id, axis])
);

export function getCameraVocabularyAxis(axisId: CameraVocabularyAxisId): CameraVocabularyAxisDefinition {
  const axis = AXES_BY_ID.get(axisId);
  if (!axis) throw new Error(`Unknown camera vocabulary axis: ${axisId}`);
  return axis;
}

// ---------------------------------------------------------------------------
// Alias normalization — the mechanism copied from `referenceImageRoles.ts`'s
// `ROLE_ALIASES`: every canonical code maps to itself, plus its
// space-separated and no-separator spellings, plus its lowercase label.
// Exact-match only, case-insensitive — never fuzzy/substring, so an
// out-of-palette string is never accidentally treated as known.
//
// Real-data alias decisions (`.agents/executor_report.md` has the same
// table, this is the source of it):
//
//   - `static` / `Static` / `STATIC`: pure casing — the generic mechanism
//     below handles it with no extra entry needed. `locked-off` /
//     `locked off` are added manually: the palette names them as one value
//     ("Static / Locked-off"), so they alias to the same code.
//   - `tracking` vs `track`: aliased to the SAME code, `tracking`. Both
//     spellings already exist in this app's own two disagreeing copies
//     (Generate Shots writes `tracking`, Insert Shot writes `track`) for the
//     same movement — a camera that follows the subject, direction and axis
//     unspecified. Deliberately NOT aliased to `truck_left`/`truck_right`:
//     that would guess a lateral direction the value never states, exactly
//     the silent substitution this module refuses.
//   - `dolly` vs `dolly in` / `dolly out`: kept as THREE separate codes, not
//     aliased together. Generate Shots always wrote bare `dolly`; Insert
//     Shot always wrote the directional form. Aliasing bare `dolly` to
//     `dolly_in` would invent a direction nothing in the value states — the
//     same reasoning as `tracking`/`truck`, applied to the pair the ticket
//     names directly.
// ---------------------------------------------------------------------------

const EXTRA_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "cameraMovement:static": ["locked-off", "locked off"],
  "cameraMovement:tracking": ["track"],
};

function buildAliasMap(axis: CameraVocabularyAxisDefinition): ReadonlyMap<string, string> {
  const entries: Array<readonly [string, string]> = [];
  for (const value of axis.values) {
    const spaced = value.code.replace(/_/g, " ");
    const joined = value.code.replace(/_/g, "");
    const extra = EXTRA_ALIASES[`${axis.id}:${value.code}`] ?? [];
    const variants = new Set([value.code, spaced, joined, value.label.toLowerCase(), ...extra]);
    for (const alias of variants) {
      entries.push([alias.toLowerCase(), value.code]);
    }
  }
  return new Map(entries);
}

const ALIASES_BY_AXIS: ReadonlyMap<CameraVocabularyAxisId, ReadonlyMap<string, string>> = new Map(
  CAMERA_VOCABULARY.map((axis) => [axis.id, buildAliasMap(axis)])
);

/**
 * Resolves a raw string to its canonical palette code for the given axis
 * (case/space-insensitive). Returns `null` when the value is not in the
 * palette — that is not an error, see `recognizeCameraVocabularyValue`.
 * Never guesses, never substitutes a default.
 */
/**
 * The form of a value that is actually written — see `writtenForm` on the axis.
 * Use this everywhere a value is offered to a human or asked of a model, so the
 * two never disagree about notation.
 */
export function writtenCameraVocabularyValue(
  axis: CameraVocabularyAxisDefinition,
  value: CameraVocabularyValueDefinition
): string {
  return axis.writtenForm === "code" ? value.code : value.label;
}

export function normalizeCameraVocabularyValue(
  axisId: CameraVocabularyAxisId,
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return ALIASES_BY_AXIS.get(axisId)?.get(trimmed) ?? null;
}

/** Looks up the full definition for a known (or aliased) value on the given axis. Null when unrecognized. */
export function getCameraVocabularyValueDefinition(
  axisId: CameraVocabularyAxisId,
  raw: string | null | undefined
): CameraVocabularyValueDefinition | null {
  const code = normalizeCameraVocabularyValue(axisId, raw);
  if (!code) return null;
  return getCameraVocabularyAxis(axisId).values.find((v) => v.code === code) ?? null;
}

export function isKnownCameraVocabularyValue(
  axisId: CameraVocabularyAxisId,
  raw: string | null | undefined
): boolean {
  return normalizeCameraVocabularyValue(axisId, raw) !== null;
}

// ---------------------------------------------------------------------------
// Recognition — the palette contract in full: a raw string is either a known
// palette code, a size interval ("MS to WS", `shotSize` only — the old rule
// forbade intervals; the 2.0 guide's own examples use them, so this ticket
// makes them representable), or out of palette. Out-of-palette is signaled
// and returned exactly as given: never substituted, never rejected, never
// silently dropped.
//
// A candidate only counts as an interval when BOTH sides resolve to a known
// `shotSize` palette value on their own. A separator alone is not enough:
// free-text descriptions ("MS - Medium Shot of Max on phone call") also
// contain a space-padded hyphen and would otherwise be misread as an
// interval whose second side is a sentence fragment.
// ---------------------------------------------------------------------------

export type CameraVocabularyRecognition =
  | { kind: "known"; code: string }
  | { kind: "interval"; from: string; to: string }
  | { kind: "unknown"; raw: string };

// The hyphen/arrow separators require at least one surrounding space: a bare
// "floor-level" (no spaces) is a compound word, not an interval, and must
// stay out-of-palette rather than being split into "floor" / "level".
const INTERVAL_PATTERNS: readonly RegExp[] = [
  /^(.+?)\s+to\s+(.+)$/i,
  /^(.+?)\s+→\s+(.+)$/, // "→"
  /^(.+?)\s+->\s+(.+)$/,
  /^(.+?)\s+-\s+(.+)$/,
];

function trySplitShotSizeInterval(raw: string): readonly [string, string] | null {
  for (const pattern of INTERVAL_PATTERNS) {
    const match = raw.match(pattern);
    if (match) return [match[1].trim(), match[2].trim()];
  }
  return null;
}

/**
 * The recognizer every consumer should use: never throws, never picks a
 * default. `shotSize` alone accepts a "start to end" interval — the other
 * four axes have no such shape (`cameraMovement` is explicitly one value per
 * shot, decided by the user alongside this palette).
 */
export function recognizeCameraVocabularyValue(
  axisId: CameraVocabularyAxisId,
  raw: string | null | undefined
): CameraVocabularyRecognition {
  if (!raw || !raw.trim()) return { kind: "unknown", raw: raw ?? "" };

  const code = normalizeCameraVocabularyValue(axisId, raw);
  if (code) return { kind: "known", code };

  if (axisId === "shotSize") {
    const split = trySplitShotSizeInterval(raw.trim());
    if (split) {
      const [fromRaw, toRaw] = split;
      const from = normalizeCameraVocabularyValue("shotSize", fromRaw);
      const to = normalizeCameraVocabularyValue("shotSize", toRaw);
      // An interval is only real when BOTH sides are themselves recognized
      // palette values of this axis. Otherwise the "to"/"-" is prose, not a
      // separator: a description like "MS - Medium Shot of Max on phone
      // call" has spaces around its hyphen too, so requiring space-padding
      // alone (the previous rule) is not enough to keep it out. Real data
      // audit (2026-08-21) found five such descriptions on `shotSize`
      // falsely reported as intervals before this check — see
      // `.agents/executor_report.md`.
      if (from && to) return { kind: "interval", from, to };
    }
  }

  return { kind: "unknown", raw };
}
