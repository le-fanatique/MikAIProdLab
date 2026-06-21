import type { LLMPrompt } from "@/types/llm";

export type SequencePromptAssistMode =
  | "generate"
  | "enhance"
  | "rewrite"
  | "shorten"
  | "expand";

export type BuildSequencePromptFromContextInput = {
  assistMode?: SequencePromptAssistMode;
  projectName: string;
  projectPitch?: string | null;
  projectStory?: string | null;
  sequenceTitle: string;
  sequenceSummary?: string | null;
  sequenceDescription?: string | null;
  sequenceMood?: string | null;
  sequenceLocationHint?: string | null;
  currentSequencePrompt?: string | null;
};

const JSON_CONSTRAINT = `Write in English. Output one or two paragraphs maximum.
Always respond with a valid JSON object matching exactly this schema:
{ "sequence_prompt": "<your sequence prompt here>" }
No explanation. Only the JSON object.`;

const NO_MARKUP = `Do not include labels, headers, explanations, bullet points, or markdown.`;

const TRANSFORM_INSTRUCTIONS: Record<Exclude<SequencePromptAssistMode, "generate">, string> = {
  enhance:
    "Enhance the existing sequence prompt by adding visual and narrative detail: atmosphere, lighting quality, camera approach, dramatic arc. Preserve the original intent. Do not change the core subject or setting dramatically.",
  rewrite:
    "Rewrite the existing sequence prompt to be cleaner, more cinematic, and more evocative. Preserve the meaning and intent. Remove awkward phrasing. Make it flow naturally as a visual and narrative description.",
  shorten:
    "Compress the existing sequence prompt into a shorter, more focused version. Keep the most essential visual and narrative elements: setting, mood, dramatic direction. Remove redundancy.",
  expand:
    "Expand the existing sequence prompt by adding useful visual and narrative details: environment texture, lighting setup, emotional arc, camera style, transitions between moments. Stay grounded in what the sequence is about.",
};

export function buildSequencePromptFromContextPrompt(
  input: BuildSequencePromptFromContextInput
): LLMPrompt {
  const mode = input.assistMode ?? "generate";

  if (mode === "generate") {
    const lines: string[] = [];
    lines.push(`Project: ${input.projectName}`);
    if (input.projectPitch?.trim()) lines.push(`Pitch: ${input.projectPitch}`);
    if (input.projectStory?.trim()) lines.push(`Story: ${input.projectStory.slice(0, 400)}`);
    lines.push(`Sequence: ${input.sequenceTitle}`);
    if (input.sequenceSummary?.trim()) lines.push(`Summary: ${input.sequenceSummary}`);
    if (input.sequenceDescription?.trim()) lines.push(`Description: ${input.sequenceDescription}`);
    if (input.sequenceMood?.trim()) lines.push(`Mood: ${input.sequenceMood}`);
    if (input.sequenceLocationHint?.trim()) lines.push(`Location: ${input.sequenceLocationHint}`);

    return {
      system: `You are an expert at writing visual and narrative direction prompts for film sequences.
Write a Sequence Prompt that describes the visual atmosphere, dramatic arc, camera approach, lighting, setting, and mood of the sequence.
Focus on: what is felt and seen across the sequence as a whole. Do not list individual shots.
Do not mention project names or sequence names explicitly in the prompt.
${NO_MARKUP}
${JSON_CONSTRAINT}`,
      user: `${lines.join("\n")}\n\nWrite a sequence prompt for this sequence.`,
    };
  }

  // Transform modes — minimal background context
  const ctxParts: string[] = [];
  if (input.sequenceMood?.trim()) ctxParts.push(`Mood: ${input.sequenceMood}`);
  if (input.sequenceLocationHint?.trim()) ctxParts.push(`Location: ${input.sequenceLocationHint}`);
  if (input.sequenceSummary?.trim()) ctxParts.push(`Summary: ${input.sequenceSummary}`);
  const contextBlock =
    ctxParts.length > 0 ? `\n\nSequence context (background only):\n${ctxParts.join("\n")}` : "";

  return {
    system: `You are an expert at writing visual and narrative direction prompts for film sequences.
${TRANSFORM_INSTRUCTIONS[mode]}
${NO_MARKUP}
${JSON_CONSTRAINT}`,
    user: `Current prompt:\n${input.currentSequencePrompt ?? ""}${contextBlock}\n\nTransform the prompt as instructed.`,
  };
}
