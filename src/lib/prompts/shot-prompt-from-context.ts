import type { LLMPrompt } from "@/types/llm";

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
};

export function buildShotPromptFromContextPrompt(
  input: BuildShotPromptFromContextInput
): LLMPrompt {
  const lines: string[] = [];

  lines.push(`Project: ${input.projectName}`);
  if (input.projectPitch?.trim()) lines.push(`Pitch: ${input.projectPitch}`);
  if (input.projectStory?.trim()) {
    lines.push(`Story: ${input.projectStory.slice(0, 400)}`);
  }

  lines.push(`Sequence: ${input.sequenceTitle}`);
  if (input.sequenceSummary?.trim()) {
    lines.push(`Sequence summary: ${input.sequenceSummary}`);
  }
  if (input.sequenceDescription?.trim()) {
    lines.push(`Sequence description: ${input.sequenceDescription}`);
  }
  if (input.sequenceMood?.trim()) lines.push(`Mood: ${input.sequenceMood}`);
  if (input.sequenceLocationHint?.trim()) {
    lines.push(`Location: ${input.sequenceLocationHint}`);
  }

  const shotLabel = input.shotCode
    ? `${input.shotCode} — ${input.shotTitle}`
    : input.shotTitle;
  lines.push(`Shot: ${shotLabel}`);
  if (input.durationSeconds != null) {
    lines.push(`Duration: ${input.durationSeconds}s`);
  }
  if (input.shotDescription?.trim()) {
    lines.push(`Description: ${input.shotDescription}`);
  }
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

  return {
    system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Your task is to write a single clean, dense, cinematic visual prompt for the given shot context.
Focus on: visible action, subject, composition, camera angle, lighting, atmosphere, environment, and cinematic style.
Do not include labels, headers, explanations, bullet points, or markdown.
Do not mention project names, sequence names, or shot codes explicitly in the prompt.
Write in English. Output one dense paragraph of visual description.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`,

    user: `${lines.join("\n")}

Write a visual generation prompt for this shot.`,
  };
}
