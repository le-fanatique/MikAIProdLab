// ---------------------------------------------------------------------------
// lookDevelopmentPresets.ts — STYLE.1.G.UI.1
//
// Pure, client-safe. Deterministic initial Subject/Action text for the two
// non-Custom Test Content presets of the Look Development Bench. No DB, no
// network, no randomness — same input always yields the exact same output,
// so switching presets (or reopening the Bench) never invents facts.
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

/**
 * "From Story" initial text — derived ONLY from real Project fields, never
 * from an LLM or invented content. Subject comes from the Project's pitch
 * (or, failing that, its name); Action comes from the Project's description
 * (or, failing that, its story). Either can be empty if the Project has no
 * matching field yet — the Bench leaves the field blank rather than
 * fabricating placeholder text.
 */
export function deriveFromStoryText(project: LookDevelopmentProjectFields): { subject: string; action: string } {
  const pitch = project.pitch?.trim() ?? "";
  const description = project.description?.trim() ?? "";
  const story = project.story?.trim() ?? "";
  const name = project.name.trim();

  const subject = pitch.length > 0 ? pitch : name;
  const action = description.length > 0 ? description : story;

  return { subject, action };
}
