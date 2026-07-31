// ---------------------------------------------------------------------------
// lookDevelopmentPresets.ts — STYLE.1.G.UI.1 / STYLE.1.POLISH.1
//
// Pure, client-safe. Deterministic initial Subject/Action text for the two
// non-Custom Test Content presets of the Look Development Bench, plus a
// pure Randomize helper for Neutral Benchmark. No DB, no network, no LLM —
// same input always yields the exact same output, so switching presets (or
// reopening the Bench) never invents facts.
// ---------------------------------------------------------------------------

/**
 * "Neutral Benchmark" is one fixed, concise, editable English benchmark
 * covering subject/material, lighting, depth and motion — deliberately
 * without naming any visual Style, so it can be reused to compare Style
 * sources against the same test content.
 */
export const NEUTRAL_BENCHMARK_SUBJECT =
  "A single subject, centered mid-body in frame, against a neutral studio background.";
export const NEUTRAL_BENCHMARK_ACTION =
  "The subject turns slowly under soft three-point lighting, revealing surface material and depth-of-field falloff, then comes to rest facing camera.";

export type LookDevelopmentProjectFields = {
  name: string;
  pitch: string | null;
  description: string | null;
  story: string | null;
};

const MAX_WORDS = 20;

/** Collapses any run of whitespace to a single space and trims the ends — the ONE normalization both the word counter and the truncator share, so "counted" and "kept" words are always the same words. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Word count of the normalized text — 0 for empty/whitespace-only input. Exported so multi-space/punctuation edge cases can be asserted directly against the same function the truncator uses internally. */
export function countWords(text: string): number {
  const normalized = normalizeWhitespace(text);
  return normalized.length === 0 ? 0 : normalized.split(" ").length;
}

/** Bounds `text` to at most `maxWords` words, word order preserved, no semantic change to a string already within the bound. Empty input stays empty. */
export function truncateToWords(text: string, maxWords: number): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) return "";
  const words = normalized.split(" ");
  return words.length <= maxWords ? normalized : words.slice(0, maxWords).join(" ");
}

/**
 * Documented list of action-signal verb FORMS used only to PICK which
 * already-existing sentence/clause to surface — never to invent or alter
 * wording. Deliberately generic (no Style, artist, brand, or IP terms).
 *
 * Codex retake round 1 (P2) — a version keyed on a single inflection per
 * verb (e.g. only "reads", never "read"/"reading") missed ordinary action
 * clauses like "She reads the report and signs it." and fell back to an
 * earlier, merely descriptive clause instead. Every verb below is spelled
 * out across its base, 3rd-person-singular, past, and -ing forms — an
 * explicit enumeration (not a generated/morphological regex) so matching
 * stays fully deterministic and each form is individually testable.
 */
const ACTION_SIGNAL_WORDS = [
  "walk", "walks", "walked", "walking",
  "run", "runs", "ran", "running",
  "turn", "turns", "turned", "turning",
  "move", "moves", "moved", "moving",
  "jump", "jumps", "jumped", "jumping",
  "open", "opens", "opened", "opening",
  "close", "closes", "closed", "closing",
  "drive", "drives", "drove", "driving",
  "fly", "flies", "flew", "flying",
  "swim", "swims", "swam", "swimming",
  "climb", "climbs", "climbed", "climbing",
  "dance", "dances", "danced", "dancing",
  "fire", "fires", "fired", "firing",
  "throw", "throws", "threw", "throwing",
  "catch", "catches", "caught", "catching",
  "chase", "chases", "chased", "chasing",
  "escape", "escapes", "escaped", "escaping",
  "attack", "attacks", "attacked", "attacking",
  "defend", "defends", "defended", "defending",
  "build", "builds", "built", "building",
  "destroy", "destroys", "destroyed", "destroying",
  "discover", "discovers", "discovered", "discovering",
  "explore", "explores", "explored", "exploring",
  "confront", "confronts", "confronted", "confronting",
  "embrace", "embraces", "embraced", "embracing",
  "fight", "fights", "fought", "fighting",
  "fall", "falls", "fell", "falling",
  "rise", "rises", "rose", "rising",
  "enter", "enters", "entered", "entering",
  "exit", "exits", "exited", "exiting",
  "reach", "reaches", "reached", "reaching",
  "grab", "grabs", "grabbed", "grabbing",
  "release", "releases", "released", "releasing",
  "spin", "spins", "spun", "spinning",
  "leap", "leaps", "leapt", "leaping",
  "charge", "charges", "charged", "charging",
  "strike", "strikes", "struck", "striking",
  "flee", "flees", "fled", "fleeing",
  "hide", "hides", "hid", "hiding",
  "reveal", "reveals", "revealed", "revealing",
  "transform", "transforms", "transformed", "transforming",
  "emerge", "emerges", "emerged", "emerging",
  "collapse", "collapses", "collapsed", "collapsing",
  "ignite", "ignites", "ignited", "igniting",
  "carry", "carries", "carried", "carrying",
  "push", "pushes", "pushed", "pushing",
  "pull", "pulls", "pulled", "pulling",
  "arrive", "arrives", "arrived", "arriving",
  "depart", "departs", "departed", "departing",
  "search", "searches", "searched", "searching",
  // Codex retake round 1 (P2) — the ordinary, non-physical action forms the
  // review flagged as missing.
  "read", "reads", "reading",
  "write", "writes", "wrote", "writing",
  "speak", "speaks", "spoke", "speaking",
  "hold", "holds", "held", "holding",
  "sit", "sits", "sat", "sitting",
  "stand", "stands", "stood", "standing",
  // Other common everyday actions.
  "sign", "signs", "signed", "signing",
  "look", "looks", "looked", "looking",
  "watch", "watches", "watched", "watching",
  "listen", "listens", "listened", "listening",
  "smile", "smiles", "smiled", "smiling",
  "laugh", "laughs", "laughed", "laughing",
  "whisper", "whispers", "whispered", "whispering",
  "shout", "shouts", "shouted", "shouting",
  "kneel", "kneels", "knelt", "kneeling",
  "kick", "kicks", "kicked", "kicking",
  "punch", "punches", "punched", "punching",
  "gesture", "gestures", "gestured", "gesturing",
  "point", "points", "pointed", "pointing",
  "nod", "nods", "nodded", "nodding",
  "wave", "waves", "waved", "waving",
  "step", "steps", "stepped", "stepping",
];

/** Splits normalized text into sentence/clause candidates on ./!/?/; — never on commas, so a single descriptive clause is not fragmented mid-thought. */
function splitClauses(normalized: string): string[] {
  return normalized
    .split(/[.!?;]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Deterministically picks the first clause containing a documented action
 * signal; falls back to the first available clause if none match. Never
 * fabricates content — only selects among what is actually present.
 */
function pickActionClause(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) return "";
  const clauses = splitClauses(normalized);
  if (clauses.length === 0) return "";
  const withSignal = clauses.find((clause) =>
    ACTION_SIGNAL_WORDS.some((word) => new RegExp(`\\b${word}\\b`, "i").test(clause))
  );
  return withSignal ?? clauses[0];
}

/**
 * "From Story" initial text — derived ONLY from real Project fields, never
 * from an LLM or invented content, and always bounded to 20 words per
 * field. Subject comes from the Project's pitch (or, failing that, its
 * name); Action comes from the Project's description (or, failing that,
 * its story), preferring the first clause that reads as an action over one
 * that merely exposes character/setting. Either can be empty if the
 * Project has no matching field yet — the Bench leaves the field blank
 * rather than fabricating placeholder text.
 */
export function deriveFromStoryText(project: LookDevelopmentProjectFields): { subject: string; action: string } {
  const pitch = project.pitch?.trim() ?? "";
  const description = project.description?.trim() ?? "";
  const story = project.story?.trim() ?? "";
  const name = project.name.trim();

  const subjectSource = pitch.length > 0 ? pitch : name;
  const actionSource = description.length > 0 ? description : story;

  const subject = truncateToWords(subjectSource, MAX_WORDS);
  const action = truncateToWords(pickActionClause(actionSource), MAX_WORDS);

  return { subject, action };
}

// ---------------------------------------------------------------------------
// Neutral Benchmark Random (STYLE.1.POLISH.1, Lot D2)
// ---------------------------------------------------------------------------

/**
 * Concise, bounded banks — no artist name, brand, IP, or visual Style term,
 * so a random pick can never leak a Style choice into a supposedly neutral
 * benchmark. Local and fixed: no network, no LLM.
 */
export const NEUTRAL_RANDOM_SUBJECTS: readonly string[] = [
  "A single subject, seated at a plain table, lit from one side.",
  "A lone figure standing beside a tall window, backlit by daylight.",
  "A single object resting on a matte pedestal, centered in frame.",
  "A subject positioned near a doorway, half in shadow.",
  "A single figure kneeling on bare ground, camera at eye level.",
  "A subject standing in an empty corridor, lit from overhead.",
  "A lone figure near a plain wall, facing slightly off-camera.",
  "A single subject on an open floor, framed from a low angle.",
];

export const NEUTRAL_RANDOM_ACTIONS: readonly string[] = [
  "The subject reaches toward camera, then withdraws the hand slowly.",
  "The subject turns its head to follow an off-frame sound.",
  "The subject shifts weight from one side to the other, settling into stillness.",
  "The subject lowers itself gradually, coming to rest close to the ground.",
  "The subject raises an arm, pauses, then lets it fall back down.",
  "The subject steps forward once, then holds the new position.",
  "The subject tilts slightly toward the light, then straightens again.",
  "The subject closes the distance to camera by a single slow step.",
];

/** Pure index-based pick — the primitive both the rng-based helper and unit tests use, so a fixed pair of indices always reproduces the exact same result. Indices are wrapped (modulo) so any integer is safe to pass. */
export function pickNeutralSubjectAndActionByIndex(
  subjectIndex: number,
  actionIndex: number,
  subjects: readonly string[] = NEUTRAL_RANDOM_SUBJECTS,
  actions: readonly string[] = NEUTRAL_RANDOM_ACTIONS
): { subject: string; action: string } {
  const si = ((subjectIndex % subjects.length) + subjects.length) % subjects.length;
  const ai = ((actionIndex % actions.length) + actions.length) % actions.length;
  return { subject: subjects[si], action: actions[ai] };
}

/**
 * Random pick used by the Bench's "Randomize subject and action" button.
 * Accepts an injectable random source (defaulting to `Math.random`) so
 * callers can pass a fixed function in tests and get a reproducible,
 * non-flaky result via `pickNeutralSubjectAndActionByIndex`.
 */
export function randomizeNeutralSubjectAndAction(
  rng: () => number = Math.random,
  subjects: readonly string[] = NEUTRAL_RANDOM_SUBJECTS,
  actions: readonly string[] = NEUTRAL_RANDOM_ACTIONS
): { subject: string; action: string } {
  const subjectIndex = Math.floor(rng() * subjects.length);
  const actionIndex = Math.floor(rng() * actions.length);
  return pickNeutralSubjectAndActionByIndex(subjectIndex, actionIndex, subjects, actions);
}
