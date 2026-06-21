import type { LLMPrompt } from "@/types/llm";

export type GeneratedSequenceShot = {
  title: string;
  shot_code?: string | null;
  description?: string | null;
  duration_seconds?: number | null;
  action_pitch?: string | null;
  camera_pitch?: string | null;
  framing?: string | null;
  camera_movement?: string | null;
  shot_prompt?: string | null;
};

interface BuildShotsFromSequenceInput {
  project: {
    name: string;
    pitch?: string | null;
    story?: string | null;
  };
  sequence: {
    title: string;
    summary?: string | null;
    description?: string | null;
    narrativePurpose?: string | null;
    mood?: string | null;
    locationHint?: string | null;
  };
  targetCount?: number;
}

export function buildShotsFromSequencePrompt(input: BuildShotsFromSequenceInput): LLMPrompt {
  const count = input.targetCount ?? 6;

  const projectLines: string[] = [];
  projectLines.push(`Project: ${input.project.name}`);
  if (input.project.pitch?.trim()) projectLines.push(`Pitch: ${input.project.pitch}`);
  if (input.project.story?.trim()) projectLines.push(`Story: ${input.project.story.slice(0, 400)}`);

  return {
    system: `You are a professional cinematographer and storyboard supervisor.
Your task is to break a production sequence into exactly ${count} individual shots.
Each shot is a single uninterrupted camera take.
Always respond with a valid JSON object matching exactly this schema:
{
  "shots": [
    {
      "title": "string — brief label for the shot",
      "shot_code": "string or null — production code e.g. SH010, SH020",
      "description": "string or null — narrative description of the shot",
      "duration_seconds": number or null — estimated duration 3-8s typical,
      "action_pitch": "string or null — what happens on screen",
      "camera_pitch": "string or null — camera angle, lens, position",
      "framing": "string or null — CU / MCU / MS / WS / ECU / OTS / POV",
      "camera_movement": "string or null — static / pan / tilt / tracking / dolly / handheld",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly ${count} shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no scene references — only visual content.
Respect the narrative arc of the sequence. Do not invent characters not mentioned in the story.`,

    user: `${projectLines.join("\n")}

Sequence: ${input.sequence.title}
Summary: ${input.sequence.summary ?? "Not provided"}
Description: ${input.sequence.description ?? "Not provided"}
Narrative purpose: ${input.sequence.narrativePurpose ?? "Not provided"}
Mood: ${input.sequence.mood ?? "Not provided"}
Location: ${input.sequence.locationHint ?? "Not provided"}

Break this sequence into exactly ${count} individual shots. Fill all fields as precisely as possible.`,
  };
}
