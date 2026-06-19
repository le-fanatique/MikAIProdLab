import type { LLMPrompt } from "@/types/llm";

interface ShotsFromSequenceContext {
  title: string;
  summary: string | null;
  description: string | null;
  narrativePurpose: string | null;
  mood: string | null;
  locationHint: string | null;
  targetCount?: number;
}

/**
 * Builds the prompt for "Generate Shots from Sequence".
 * Output must conform to GenerateShotsResult: { shots: GeneratedShot[] }
 */
export function buildShotsFromSequencePrompt(sequence: ShotsFromSequenceContext): LLMPrompt {
  const count = sequence.targetCount ?? 6;

  return {
    system: `You are a professional cinematographer and storyboard supervisor.
Your task is to break a production sequence into ${count} individual shots.
Each shot is a single uninterrupted camera take.
Always respond with a valid JSON object matching exactly this schema:
{
  "shots": [
    {
      "shot_code": "string or null",
      "title": "string",
      "description": "string or null",
      "duration_seconds": number or null,
      "action_pitch": "string or null",
      "camera_pitch": "string or null",
      "framing": "string or null",
      "camera_movement": "string or null",
      "continuity_in": "string or null",
      "continuity_out": "string or null",
      "continuity_notes": "string or null",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Guidelines:
- "shot_code": production code, e.g. "SQ01_SH010" (null if unknown)
- "title": brief label for the shot (e.g. "Hero enters frame")
- "action_pitch": what happens on screen during this shot
- "camera_pitch": camera angle, lens choice, position notes
- "framing": standard framing code — CU, MCU, MS, WS, ECU, OTS, POV, etc.
- "camera_movement": static / pan / tilt / tracking / dolly / handheld / crane / etc.
- "continuity_in": how this shot connects from the previous one
- "continuity_out": how this shot connects to the next one
- "duration_seconds": estimated duration in seconds (null if unknown)`,

    user: `Sequence title: ${sequence.title}
Summary: ${sequence.summary ?? "Not provided"}
Description: ${sequence.description ?? "Not provided"}
Narrative purpose: ${sequence.narrativePurpose ?? "Not provided"}
Mood: ${sequence.mood ?? "Not provided"}
Location: ${sequence.locationHint ?? "Not provided"}

Break this sequence into ${count} individual shots.`,
  };
}
