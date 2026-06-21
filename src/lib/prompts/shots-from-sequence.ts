import type { LLMPrompt } from "@/types/llm";

export type GeneratedSequenceShot = {
  title: string;
  shot_code?: string | null;
  description?: string | null;
  duration_seconds?: number | null;
  continuity_in?: string | null;
  action_pitch?: string | null;
  camera_pitch?: string | null;
  framing?: string | null;
  camera_movement?: string | null;
  continuity_out?: string | null;
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
    sequencePrompt?: string | null;
  };
  targetCount?: number;
}

const JSON_SCHEMA = (count: number) => `Always respond with a valid JSON object matching exactly this schema:
{
  "shots": [
    {
      "title": "string — brief label for the shot",
      "shot_code": "string or null — production code e.g. SH010, SH020",
      "description": "string or null — narrative description of the shot",
      "duration_seconds": number or null — estimated duration 3-8s typical,
      "continuity_in": "string — state at the start of this shot, inherited from the previous shot's continuity_out",
      "action_pitch": "string or null — what happens on screen",
      "camera_pitch": "string or null — camera angle, lens, position",
      "framing": "string or null — CU / MCU / MS / WS / ECU / OTS / POV",
      "camera_movement": "string or null — static / pan / tilt / tracking / dolly / handheld",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly ${count} shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`;

const CONTINUITY_RULES = `CONTINUITY RULES:
- Generate the shots as a continuous causal action chain, not as disconnected moments.
- Each shot must begin from the previous shot's continuity_out state.
- Do not reset character positions, locations, emotional states, injuries, transformations, held objects, lost objects, or action outcomes between shots.
- If a character is killed, wounded, trapped, transformed, leaves the scene, loses an object, gains an object, or changes emotional state, every later shot must respect that new state.
- Every shot must include both continuity_in and continuity_out fields.
- Shot 1 continuity_in establishes the initial state of the sequence.
- Shot N continuity_out becomes the starting state of Shot N+1.
- Last shot continuity_out describes the final state reached by the end of the sequence.
- Before writing each shot, silently track: character positions, alive/dead/injured/transformed state, objects held/lost/destroyed, location, emotional state, and consequences of previous action. Do not output this reasoning. Only output the JSON.`;

export function buildShotsFromSequencePrompt(input: BuildShotsFromSequenceInput): LLMPrompt {
  const count = input.targetCount ?? 6;
  const approvedPrompt = input.sequence.sequencePrompt?.trim() ?? "";
  const hasSequencePrompt = approvedPrompt.length > 0;

  // ── PATH A: Approved Sequence Prompt present ──────────────────────────────
  if (hasSequencePrompt) {
    const seqContext = [
      `Title: ${input.sequence.title}`,
      input.sequence.summary ? `Summary: ${input.sequence.summary}` : null,
      input.sequence.description ? `Description: ${input.sequence.description}` : null,
      input.sequence.mood ? `Mood: ${input.sequence.mood}` : null,
      input.sequence.locationHint ? `Location: ${input.sequence.locationHint}` : null,
    ].filter(Boolean).join("\n");

    const projectBg = [
      input.project.pitch?.trim() ? `Pitch: ${input.project.pitch}` : null,
      input.project.story?.trim() ? `Story: ${input.project.story.slice(0, 300)}` : null,
    ].filter(Boolean).join("\n");

    return {
      system: `You are a professional cinematographer and storyboard supervisor.
Your task is to generate exactly ${count} shots for the given sequence.
Each shot is a single uninterrupted camera take.

AUTHORITY RULES:
- The Approved Sequence Prompt is the authoritative creative direction for every shot.
- The Project Story is background context only. It must never override the Approved Sequence Prompt.
- Before generating any shot, identify the main subject, location, and visual style from the Approved Sequence Prompt. Every shot must follow them.
- If the Approved Sequence Prompt introduces a character or subject not present in the Project Story, use that character or subject.
- If there is any conflict between the Project Story and the Approved Sequence Prompt, always follow the Approved Sequence Prompt.
- Never substitute a character or location from the Project Story in place of one from the Approved Sequence Prompt.

${CONTINUITY_RULES}

${JSON_SCHEMA(count)}`,

      user: `TASK
Generate exactly ${count} shots for this sequence.

APPROVED SEQUENCE PROMPT — primary creative direction, overrides all other context:
${approvedPrompt.slice(0, 1200)}

SEQUENCE CONTEXT
${seqContext}${
  projectBg
    ? `\n\nPROJECT BACKGROUND — background continuity only, do not use to override the Approved Sequence Prompt:\n${projectBg}`
    : ""
}

Generate exactly ${count} shots. Every shot must follow the subject, location, visual style, and mood of the Approved Sequence Prompt. The shots must form a continuous causal progression from shot 1 to shot ${count}. Avoid resets, contradictions, or repeated starting points.`,
    };
  }

  // ── PATH B: No Sequence Prompt — original behavior ────────────────────────
  const projectLines: string[] = [];
  projectLines.push(`Project: ${input.project.name}`);
  if (input.project.pitch?.trim()) projectLines.push(`Pitch: ${input.project.pitch}`);
  if (input.project.story?.trim()) projectLines.push(`Story: ${input.project.story.slice(0, 400)}`);

  return {
    system: `You are a professional cinematographer and storyboard supervisor.
Your task is to break a production sequence into exactly ${count} individual shots.
Each shot is a single uninterrupted camera take.
Respect the narrative arc of the sequence. Do not invent characters or locations not mentioned in the story or sequence context.

${CONTINUITY_RULES}

${JSON_SCHEMA(count)}`,

    user: `${projectLines.join("\n")}

Sequence: ${input.sequence.title}
Summary: ${input.sequence.summary ?? "Not provided"}
Description: ${input.sequence.description ?? "Not provided"}
Narrative purpose: ${input.sequence.narrativePurpose ?? "Not provided"}
Mood: ${input.sequence.mood ?? "Not provided"}
Location: ${input.sequence.locationHint ?? "Not provided"}

Break this sequence into exactly ${count} individual shots. Fill all fields as precisely as possible. The shots must form a continuous causal progression from shot 1 to shot ${count}. Avoid resets, contradictions, or repeated starting points.`,
  };
}
