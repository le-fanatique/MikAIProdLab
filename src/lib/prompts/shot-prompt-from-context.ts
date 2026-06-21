import type { LLMPrompt } from "@/types/llm";

export type ShotPromptAssistMode =
  | "generate"
  | "enhance"
  | "rewrite"
  | "shorten"
  | "expand";

export type BuildShotPromptFromContextInput = {
  projectName: string;
  projectPitch?: string | null;
  projectStory?: string | null;
  sequenceTitle: string;
  sequenceSummary?: string | null;
  sequenceDescription?: string | null;
  sequenceMood?: string | null;
  sequenceLocationHint?: string | null;
  shotTitle: string;
  shotCode?: string | null;
  shotDescription?: string | null;
  actionPitch?: string | null;
  cameraPitch?: string | null;
  framing?: string | null;
  cameraMovement?: string | null;
  durationSeconds?: number | null;
  currentShotPrompt?: string | null;
  castSummary?: string[];
  referenceSummary?: string[];
  assistMode?: ShotPromptAssistMode;
};

const JSON_CONSTRAINT = `Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`;

const NO_MARKUP = `Do not include labels, headers, explanations, bullet points, or markdown.`;

const TRANSFORM_INSTRUCTIONS: Record<Exclude<ShotPromptAssistMode, "generate">, string> = {
  enhance:
    "Enhance the existing visual prompt by adding detail: camera angle precision, lighting nuances, atmospheric quality, compositional elements. Preserve the original intent and action. Do not change the core subject or scene dramatically.",
  rewrite:
    "Rewrite the existing visual prompt to be cleaner, more cinematic, and more precise. Preserve the meaning and intent. Remove awkward phrasing and make it flow naturally as a visual description.",
  shorten:
    "Compress the existing visual prompt into a shorter, more focused version. Keep the most essential visual elements: subject, action, key composition, mood. Remove redundancy and secondary details.",
  expand:
    "Expand the existing visual prompt by adding useful visual details: camera specifics, lighting setup, environment texture, mood and atmosphere. Stay focused on what a camera would capture. Avoid non-visual narrative details.",
};

function buildGenerateContextLines(input: BuildShotPromptFromContextInput): string[] {
  const lines: string[] = [];
  lines.push(`Project: ${input.projectName}`);
  if (input.projectPitch?.trim()) lines.push(`Pitch: ${input.projectPitch}`);
  if (input.projectStory?.trim()) lines.push(`Story: ${input.projectStory.slice(0, 400)}`);
  lines.push(`Sequence: ${input.sequenceTitle}`);
  if (input.sequenceSummary?.trim()) lines.push(`Sequence summary: ${input.sequenceSummary}`);
  if (input.sequenceDescription?.trim()) lines.push(`Sequence description: ${input.sequenceDescription}`);
  if (input.sequenceMood?.trim()) lines.push(`Mood: ${input.sequenceMood}`);
  if (input.sequenceLocationHint?.trim()) lines.push(`Location: ${input.sequenceLocationHint}`);
  const shotLabel = input.shotCode
    ? `${input.shotCode} — ${input.shotTitle}`
    : input.shotTitle;
  lines.push(`Shot: ${shotLabel}`);
  if (input.durationSeconds != null) lines.push(`Duration: ${input.durationSeconds}s`);
  if (input.shotDescription?.trim()) lines.push(`Description: ${input.shotDescription}`);
  if (input.actionPitch?.trim()) lines.push(`Action: ${input.actionPitch}`);
  if (input.cameraPitch?.trim()) lines.push(`Camera intent: ${input.cameraPitch}`);
  if (input.framing?.trim()) lines.push(`Framing: ${input.framing}`);
  if (input.cameraMovement?.trim()) lines.push(`Camera movement: ${input.cameraMovement}`);
  if (input.castSummary && input.castSummary.length > 0) {
    lines.push(`Cast: ${input.castSummary.join(", ")}`);
  }
  if (input.referenceSummary && input.referenceSummary.length > 0) {
    lines.push(`References: ${input.referenceSummary.join(", ")}`);
  }
  if (input.currentShotPrompt?.trim()) {
    lines.push(`Existing prompt draft: ${input.currentShotPrompt}`);
  }
  return lines;
}

export function buildShotPromptFromContextPrompt(
  input: BuildShotPromptFromContextInput
): LLMPrompt {
  const mode = input.assistMode ?? "generate";

  if (mode === "generate") {
    const lines = buildGenerateContextLines(input);
    return {
      system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Write a clean, dense, cinematic visual prompt for the given shot context.
Focus on: visible action, subject, composition, camera angle, lighting, atmosphere, environment, and cinematic style.
Do not mention project names, sequence names, or shot codes explicitly in the prompt.
${NO_MARKUP}
${JSON_CONSTRAINT}`,
      user: `${lines.join("\n")}\n\nWrite a visual generation prompt for this shot.`,
    };
  }

  // Background context block for transform modes (kept minimal)
  const ctxParts: string[] = [];
  if (input.shotDescription?.trim()) ctxParts.push(`Shot: ${input.shotDescription}`);
  if (input.sequenceMood?.trim()) ctxParts.push(`Mood: ${input.sequenceMood}`);
  if (input.sequenceLocationHint?.trim()) ctxParts.push(`Location: ${input.sequenceLocationHint}`);
  const contextBlock =
    ctxParts.length > 0 ? `\n\nShot context (background only):\n${ctxParts.join("\n")}` : "";

  return {
    system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
${TRANSFORM_INSTRUCTIONS[mode]}
${NO_MARKUP}
${JSON_CONSTRAINT}`,
    user: `Current prompt:\n${input.currentShotPrompt ?? ""}${contextBlock}\n\nTransform the prompt as instructed.`,
  };
}
