import type { LLMPrompt } from "@/types/llm";

interface OutlineFromStoryContext {
  name: string;
  pitch: string | null;
  story: string | null;
  targetSections?: number | null;
}

export function buildOutlineFromStoryPrompt(input: OutlineFromStoryContext): LLMPrompt {
  const sectionInstruction =
    input.targetSections != null
      ? `Write exactly ${input.targetSections} sections.`
      : "Choose a natural number of sections based on the story structure (typically 4 to 8).";

  const contextLines: string[] = [];
  contextLines.push(`Project title: ${input.name}`);
  if (input.pitch?.trim()) contextLines.push(`Pitch: ${input.pitch}`);
  if (input.story?.trim()) contextLines.push(`Story: ${input.story}`);

  return {
    system: `You are a professional film production supervisor and narrative consultant.
Your task is to write a Project Outline: a structured narrative blueprint for a short film or video project.

FORMAT RULES — follow exactly:
- Each section must start with "## " followed by a short title (e.g. "## Opening — The Arrival").
- Under each section header, write 2 to 4 sentences describing: narrative content, mood, setting or location, dramatic function, and production relevance where useful.
- Do not use any other markdown syntax (no bold, no lists, no sub-headers).
- Sections should map naturally to future production sequences (distinct locations, narrative phases, or dramatic beats).
- ${sectionInstruction}

OUTPUT RULES:
Always respond with a valid JSON object matching exactly this schema:
{ "outline": "<full outline as a single markdown string with ## headers and paragraph text>" }
No markdown outside the JSON string. No explanation. No text before or after. Only the JSON object.`,

    user: `${contextLines.join("\n")}

Write a Project Outline for this project. Each section should clearly define its narrative role and production context.`,
  };
}
