import type { LLMPrompt } from "@/types/llm";

interface StoryFromPitchContext {
  name: string;
  pitch: string | null;
  description: string | null;
}

/**
 * Builds the prompt for "Generate Story from Pitch".
 * Output must conform to GenerateStoryResult: { story: string }
 */
export function buildStoryFromPitchPrompt(project: StoryFromPitchContext): LLMPrompt {
  return {
    system: `You are a professional screenwriter and narrative consultant.
Your task is to write a concise story synopsis from a project pitch.
The story should be 200 to 400 words, written in a cinematic style suitable for production use.
Always respond with a valid JSON object matching exactly this schema:
{ "story": "<narrative text>" }
No markdown. No explanation. Only the JSON object.`,

    user: `Project title: ${project.name}
Pitch: ${project.pitch ?? "Not provided"}
Additional notes: ${project.description ?? "None"}

Write a story synopsis for this project.`,
  };
}
