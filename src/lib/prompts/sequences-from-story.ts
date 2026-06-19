import type { LLMPrompt } from "@/types/llm";

interface SequencesFromStoryContext {
  name: string;
  pitch: string | null;
  story: string | null;
  targetCount?: number;
}

/**
 * Builds the prompt for "Generate Sequences from Story".
 * Output must conform to GenerateSequencesResult: { sequences: GeneratedSequence[] }
 */
export function buildSequencesFromStoryPrompt(project: SequencesFromStoryContext): LLMPrompt {
  const count = project.targetCount ?? 5;

  return {
    system: `You are a professional film production designer and story structure expert.
Your task is to break a story synopsis into ${count} production sequences.
Each sequence represents a distinct narrative and spatial unit of the film.
Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string",
      "summary": "string or null",
      "description": "string or null",
      "narrative_purpose": "string or null",
      "mood": "string or null",
      "location_hint": "string or null",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Guidelines:
- "title": short, descriptive (3–6 words)
- "summary": one sentence capturing the action
- "narrative_purpose": role in the story arc (e.g. "Opening act", "Inciting incident", "Climax", "Resolution")
- "mood": emotional tone (e.g. "tense", "melancholic", "frenetic", "serene")
- "location_hint": spatial context useful for production (e.g. "Exterior rooftop / night")`,

    user: `Project title: ${project.name}
Pitch: ${project.pitch ?? "Not provided"}
Story: ${project.story ?? "Not provided"}

Break this story into ${count} production sequences.`,
  };
}
