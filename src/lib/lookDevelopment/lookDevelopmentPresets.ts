// ---------------------------------------------------------------------------
// lookDevelopmentPresets.ts — STYLE.1.G.UI.1 / STYLE.1.POLISH.1
//
// Pure, client-safe. Deterministic initial Subject/Action text for the
// "Neutral Benchmark" Test Content preset of the Look Development Bench,
// plus a pure Randomize helper for it. No DB, no network, no LLM — same
// input always yields the exact same output, so reopening the Bench never
// invents facts.
//
// LOOK.FROMSTORY.LLM.1 removed this file's other preset,
// `deriveFromStoryText`, and everything that existed only to serve it
// (`LookDevelopmentProjectFields`, `MAX_WORDS`, `normalizeWhitespace`,
// `countWords`, `truncateToWords`, `ACTION_SIGNAL_WORDS`, `splitClauses`,
// `pickActionClause`) — it only ever selected and cut existing pitch/
// description/story text, never read the outline, and never rewrote
// anything. "From Story" is now an explicit LLM-backed operation
// (`lookTest.subjectActionFromStory`,
// `src/lib/llmWorkspace/descriptors/lookTestSubjectActionFromStory.ts`),
// triggered from `LookDevelopmentBench.tsx`, not a deterministic preset
// installed on selection.
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
