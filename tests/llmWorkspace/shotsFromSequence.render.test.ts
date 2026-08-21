import { describe, expect, it } from "vitest";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";
import {
  renderShotsFromSequenceJsonSchemaBlock,
  renderShotsFromSequenceSystemPathABody,
  renderShotsFromSequenceSystemPathBBody,
  renderShotsFromSequenceTemplatePathA,
  renderShotsFromSequenceTemplatePathB,
  type ProjectIdentityData,
  type SeqContextData,
  type SeqCurrentPromptData,
  type VariableParameterRenderInput,
} from "@/lib/llmWorkspace/variables/registry";
import type { VariableId } from "@/lib/llmWorkspace/types";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket (§3): assembling {system, user} from
// `shotsFromSequenceDescriptor`'s blocks must equal, byte-for-byte, what
// `buildShotsFromSequencePrompt` produces for the same input.
//
// The dispatcher below builds the same `VariableParameterRenderInput` object
// the real `runner.ts` dispatch (`buildVariableParameterDispatcher`) builds
// — subsetting the resolved variables and parameters down to what each block
// actually declares — so this level-1 proof exercises the render forms'
// real (post-B7c-n4) calling convention, not a hand-threaded stand-in.
// `tests/llmWorkspace/shotsFromSequence.runner.test.ts` is the level-2 proof
// that the real runner dispatch produces the same result end to end.
// ---------------------------------------------------------------------------

function assemble(
  project: ProjectIdentityData,
  seq: SeqContextData,
  currentPrompt: SeqCurrentPromptData,
  targetCount: number | undefined
) {
  const allVariables: Partial<Record<VariableId, unknown>> = {
    "PROJECT.IDENTITY": project,
    "SEQ.CONTEXT": seq,
    "SEQ.CURRENT_PROMPT": currentPrompt,
  };
  const allParameters: Record<string, number | string | undefined> = { targetCount };

  return assembleDescriptorMessages(
    shotsFromSequenceDescriptor,
    (variableId, render) => {
      throw new Error(`unexpected single-variable block ${variableId}::${render}`);
    },
    (parameterId, render) => {
      if (parameterId === "targetCount" && render === "shotsFromSequence.jsonSchemaBlock") {
        return renderShotsFromSequenceJsonSchemaBlock(targetCount);
      }
      throw new Error(`unexpected parameter block ${parameterId}::${render}`);
    },
    undefined,
    (variableIds, render) => {
      throw new Error(`unexpected multi-variable block ${variableIds.join(",")}::${render}`);
    },
    undefined,
    (variableIds, parameterIds, render) => {
      const variables: Partial<Record<VariableId, unknown>> = {};
      for (const id of variableIds) variables[id] = allVariables[id];
      const parameters: Record<string, number | string | undefined> = {};
      for (const id of parameterIds) parameters[id] = allParameters[id];
      const input: VariableParameterRenderInput = { variables, parameters, mode: undefined };

      if (render === "shotsFromSequence.systemPathABody") return renderShotsFromSequenceSystemPathABody(input);
      if (render === "shotsFromSequence.systemPathBBody") return renderShotsFromSequenceSystemPathBBody(input);
      if (render === "shotsFromSequence.templatePathA") return renderShotsFromSequenceTemplatePathA(input);
      if (render === "shotsFromSequence.templatePathB") return renderShotsFromSequenceTemplatePathB(input);
      throw new Error(`unexpected variables-parameters block ${variableIds.join(",")}/${parameterIds.join(",")}::${render}`);
    }
  );
}

describe("shots.fromSequence descriptor — strict prompt equality", () => {
  it("matches buildShotsFromSequencePrompt (Approved Sequence Prompt present, targetCount provided)", () => {
    const project: ProjectIdentityData = {
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here, several sentences long.",
      description: "Internal production notes.",
      outline: "## Opening\nThe courier receives the package.",
    };
    const seq: SeqContextData = {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
    };
    const currentPrompt: SeqCurrentPromptData = {
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    };
    const targetCount = 8;

    const expected = { system: `You are a professional cinematographer and storyboard supervisor.
Your task is to generate exactly 8 shots for the given sequence.
Each shot is a single uninterrupted camera take.

AUTHORITY RULES:
- The Approved Sequence Prompt is the authoritative creative direction for every shot.
- The Project Story is background context only. It must never override the Approved Sequence Prompt.
- Before generating any shot, identify the main subject, location, and visual style from the Approved Sequence Prompt. Every shot must follow them.
- If the Approved Sequence Prompt introduces a character or subject not present in the Project Story, use that character or subject.
- If there is any conflict between the Project Story and the Approved Sequence Prompt, always follow the Approved Sequence Prompt.
- Never substitute a character or location from the Project Story in place of one from the Approved Sequence Prompt.

CONTINUITY RULES:
- Generate the shots as a continuous causal action chain, not as disconnected moments.
- Each shot must begin from the previous shot's continuity_out state.
- Do not reset character positions, locations, emotional states, injuries, transformations, held objects, lost objects, or action outcomes between shots.
- If a character is killed, wounded, trapped, transformed, leaves the scene, loses an object, gains an object, or changes emotional state, every later shot must respect that new state.
- Every shot must include both continuity_in and continuity_out fields.
- Shot 1 continuity_in establishes the initial state of the sequence.
- Shot N continuity_out becomes the starting state of Shot N+1.
- Last shot continuity_out describes the final state reached by the end of the sequence.
- Before writing each shot, silently track: character positions, alive/dead/injured/transformed state, objects held/lost/destroyed, location, emotional state, and consequences of previous action. Do not output this reasoning. Only output the JSON.

CAMERA FIELDS:
- shot_size is exactly one value from this set: EWS, WS, FS, MWS, MS, MCU, CU, ECU. It may also be a start-to-end interval, such as "MS to WS", when the framing itself changes over the course of the shot.
- camera_position is exactly one value from this set: Eye Level, High Angle, Low Angle, Bird's-Eye / Overhead, Worm's-Eye, Dutch / Canted (tilt); Ground Level, Low, Chest Level, Eye Level, Overhead (height); POV, Over-the-Shoulder (OTS), Two-Shot, Single, Reverse Shot, Establishing Shot, Profile, Front View, Rear View (role).
- camera_movement is exactly one value from this set: Static / Locked-off, Dolly, Dolly In, Dolly Out, Tracking, Truck Left, Truck Right, Pan, Tilt, Pedestal Up, Pedestal Down, Roll, Zoom, Arc, Crane, Handheld, Rack Focus. One movement only — never two combined (e.g. "pan + tilt").
- movement_speed is exactly one value from this set: Slow, Smooth, Stable, Gradual, Gentle, Rapid.
- None of the four fields above takes prose or a combination of values — shot_size's interval is the one named exception. If the shot's camera behavior changes in a way these fields cannot state, describe it in camera_subject instead of forcing it into one of them.
- camera_subject is prose, not a palette value: who or what the camera follows, and where the move starts and ends — movement + subject + start + direction + arrival. Do not use only a term detached from its subject.
- A value outside these lists is accepted as written. Choose from the list when it fits; never invent one to force a fit.

Always respond with a valid JSON object matching exactly this schema:
{
  "shots": [
    {
      "title": "string — brief label for the shot",
      "shot_code": "string or null — production code e.g. SH010, SH020",
      "description": "string or null — narrative description of the shot",
      "duration_seconds": number or null — estimated duration 3-8s typical,
      "continuity_in": "string — state at the start of this shot, inherited from the previous shot's continuity_out",
      "action_pitch": "string or null — what happens on screen",
      "shot_size": "string or null — EWS, WS, FS, MWS, MS, MCU, CU, ECU, or a start-to-end interval such as "MS to WS"",
      "camera_position": "string or null — Eye Level, High Angle, Low Angle, Bird's-Eye / Overhead, Worm's-Eye, Dutch / Canted (tilt); Ground Level, Low, Chest Level, Eye Level, Overhead (height); POV, Over-the-Shoulder (OTS), Two-Shot, Single, Reverse Shot, Establishing Shot, Profile, Front View, Rear View (role)",
      "camera_movement": "string or null — Static / Locked-off, Dolly, Dolly In, Dolly Out, Tracking, Truck Left, Truck Right, Pan, Tilt, Pedestal Up, Pedestal Down, Roll, Zoom, Arc, Crane, Handheld, Rack Focus. One value only.",
      "movement_speed": "string or null — Slow, Smooth, Stable, Gradual, Gentle, Rapid",
      "camera_subject": "string or null — prose: movement + subject it follows + start + direction + arrival",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly 8 shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`, user: `TASK
Generate exactly 8 shots for this sequence.

APPROVED SEQUENCE PROMPT — primary creative direction, overrides all other context:
Neon-lit rooftops, rain, a courier sprinting under chase.

SEQUENCE CONTEXT
Title: Rooftop chase
Summary: The courier is chased across the rooftops.
Description: A tense pursuit at night.
Mood: Tense, kinetic
Location: Rain-soaked rooftops, neon skyline

PROJECT BACKGROUND — background continuity only, do not use to override the Approved Sequence Prompt:
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here, several sentences long.
Project Outline Background: ## Opening
The courier receives the package.

Generate exactly 8 shots. Every shot must follow the subject, location, visual style, and mood of the Approved Sequence Prompt. The shots must form a continuous causal progression from shot 1 to shot 8. Avoid resets, contradictions, or repeated starting points.` };
    const assembled = assemble(project, seq, currentPrompt, targetCount);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotsFromSequencePrompt (Approved Sequence Prompt present, no targetCount)", () => {
    const project: ProjectIdentityData = {
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here, several sentences long.",
      description: "Internal production notes.",
      outline: "## Opening\nThe courier receives the package.",
    };
    const seq: SeqContextData = {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
    };
    const currentPrompt: SeqCurrentPromptData = {
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    };

    const expected = { system: `You are a professional cinematographer and storyboard supervisor.
Your task is to generate exactly 6 shots for the given sequence.
Each shot is a single uninterrupted camera take.

AUTHORITY RULES:
- The Approved Sequence Prompt is the authoritative creative direction for every shot.
- The Project Story is background context only. It must never override the Approved Sequence Prompt.
- Before generating any shot, identify the main subject, location, and visual style from the Approved Sequence Prompt. Every shot must follow them.
- If the Approved Sequence Prompt introduces a character or subject not present in the Project Story, use that character or subject.
- If there is any conflict between the Project Story and the Approved Sequence Prompt, always follow the Approved Sequence Prompt.
- Never substitute a character or location from the Project Story in place of one from the Approved Sequence Prompt.

CONTINUITY RULES:
- Generate the shots as a continuous causal action chain, not as disconnected moments.
- Each shot must begin from the previous shot's continuity_out state.
- Do not reset character positions, locations, emotional states, injuries, transformations, held objects, lost objects, or action outcomes between shots.
- If a character is killed, wounded, trapped, transformed, leaves the scene, loses an object, gains an object, or changes emotional state, every later shot must respect that new state.
- Every shot must include both continuity_in and continuity_out fields.
- Shot 1 continuity_in establishes the initial state of the sequence.
- Shot N continuity_out becomes the starting state of Shot N+1.
- Last shot continuity_out describes the final state reached by the end of the sequence.
- Before writing each shot, silently track: character positions, alive/dead/injured/transformed state, objects held/lost/destroyed, location, emotional state, and consequences of previous action. Do not output this reasoning. Only output the JSON.

CAMERA FIELDS:
- shot_size is exactly one value from this set: EWS, WS, FS, MWS, MS, MCU, CU, ECU. It may also be a start-to-end interval, such as "MS to WS", when the framing itself changes over the course of the shot.
- camera_position is exactly one value from this set: Eye Level, High Angle, Low Angle, Bird's-Eye / Overhead, Worm's-Eye, Dutch / Canted (tilt); Ground Level, Low, Chest Level, Eye Level, Overhead (height); POV, Over-the-Shoulder (OTS), Two-Shot, Single, Reverse Shot, Establishing Shot, Profile, Front View, Rear View (role).
- camera_movement is exactly one value from this set: Static / Locked-off, Dolly, Dolly In, Dolly Out, Tracking, Truck Left, Truck Right, Pan, Tilt, Pedestal Up, Pedestal Down, Roll, Zoom, Arc, Crane, Handheld, Rack Focus. One movement only — never two combined (e.g. "pan + tilt").
- movement_speed is exactly one value from this set: Slow, Smooth, Stable, Gradual, Gentle, Rapid.
- None of the four fields above takes prose or a combination of values — shot_size's interval is the one named exception. If the shot's camera behavior changes in a way these fields cannot state, describe it in camera_subject instead of forcing it into one of them.
- camera_subject is prose, not a palette value: who or what the camera follows, and where the move starts and ends — movement + subject + start + direction + arrival. Do not use only a term detached from its subject.
- A value outside these lists is accepted as written. Choose from the list when it fits; never invent one to force a fit.

Always respond with a valid JSON object matching exactly this schema:
{
  "shots": [
    {
      "title": "string — brief label for the shot",
      "shot_code": "string or null — production code e.g. SH010, SH020",
      "description": "string or null — narrative description of the shot",
      "duration_seconds": number or null — estimated duration 3-8s typical,
      "continuity_in": "string — state at the start of this shot, inherited from the previous shot's continuity_out",
      "action_pitch": "string or null — what happens on screen",
      "shot_size": "string or null — EWS, WS, FS, MWS, MS, MCU, CU, ECU, or a start-to-end interval such as "MS to WS"",
      "camera_position": "string or null — Eye Level, High Angle, Low Angle, Bird's-Eye / Overhead, Worm's-Eye, Dutch / Canted (tilt); Ground Level, Low, Chest Level, Eye Level, Overhead (height); POV, Over-the-Shoulder (OTS), Two-Shot, Single, Reverse Shot, Establishing Shot, Profile, Front View, Rear View (role)",
      "camera_movement": "string or null — Static / Locked-off, Dolly, Dolly In, Dolly Out, Tracking, Truck Left, Truck Right, Pan, Tilt, Pedestal Up, Pedestal Down, Roll, Zoom, Arc, Crane, Handheld, Rack Focus. One value only.",
      "movement_speed": "string or null — Slow, Smooth, Stable, Gradual, Gentle, Rapid",
      "camera_subject": "string or null — prose: movement + subject it follows + start + direction + arrival",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly 6 shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`, user: `TASK
Generate exactly 6 shots for this sequence.

APPROVED SEQUENCE PROMPT — primary creative direction, overrides all other context:
Neon-lit rooftops, rain, a courier sprinting under chase.

SEQUENCE CONTEXT
Title: Rooftop chase
Summary: The courier is chased across the rooftops.
Description: A tense pursuit at night.
Mood: Tense, kinetic
Location: Rain-soaked rooftops, neon skyline

PROJECT BACKGROUND — background continuity only, do not use to override the Approved Sequence Prompt:
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here, several sentences long.
Project Outline Background: ## Opening
The courier receives the package.

Generate exactly 6 shots. Every shot must follow the subject, location, visual style, and mood of the Approved Sequence Prompt. The shots must form a continuous causal progression from shot 1 to shot 6. Avoid resets, contradictions, or repeated starting points.` };
    const assembled = assemble(project, seq, currentPrompt, undefined);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotsFromSequencePrompt (minimal sequence, no Approved Sequence Prompt, minimal project)", () => {
    const project: ProjectIdentityData = {
      name: "Untitled Project",
      pitch: null,
      story: null,
      description: null,
      outline: null,
    };
    const seq: SeqContextData = {
      title: "Sequence",
      summary: null,
      description: null,
      mood: null,
      locationHint: null,
      narrativePurpose: null,
    };
    const currentPrompt: SeqCurrentPromptData = { sequencePrompt: null };
    const targetCount = 4;

    const expected = { system: `You are a professional cinematographer and storyboard supervisor.
Your task is to break a production sequence into exactly 4 individual shots.
Each shot is a single uninterrupted camera take.
Respect the narrative arc of the sequence. Do not invent characters or locations not mentioned in the story or sequence context.

CONTINUITY RULES:
- Generate the shots as a continuous causal action chain, not as disconnected moments.
- Each shot must begin from the previous shot's continuity_out state.
- Do not reset character positions, locations, emotional states, injuries, transformations, held objects, lost objects, or action outcomes between shots.
- If a character is killed, wounded, trapped, transformed, leaves the scene, loses an object, gains an object, or changes emotional state, every later shot must respect that new state.
- Every shot must include both continuity_in and continuity_out fields.
- Shot 1 continuity_in establishes the initial state of the sequence.
- Shot N continuity_out becomes the starting state of Shot N+1.
- Last shot continuity_out describes the final state reached by the end of the sequence.
- Before writing each shot, silently track: character positions, alive/dead/injured/transformed state, objects held/lost/destroyed, location, emotional state, and consequences of previous action. Do not output this reasoning. Only output the JSON.

CAMERA FIELDS:
- shot_size is exactly one value from this set: EWS, WS, FS, MWS, MS, MCU, CU, ECU. It may also be a start-to-end interval, such as "MS to WS", when the framing itself changes over the course of the shot.
- camera_position is exactly one value from this set: Eye Level, High Angle, Low Angle, Bird's-Eye / Overhead, Worm's-Eye, Dutch / Canted (tilt); Ground Level, Low, Chest Level, Eye Level, Overhead (height); POV, Over-the-Shoulder (OTS), Two-Shot, Single, Reverse Shot, Establishing Shot, Profile, Front View, Rear View (role).
- camera_movement is exactly one value from this set: Static / Locked-off, Dolly, Dolly In, Dolly Out, Tracking, Truck Left, Truck Right, Pan, Tilt, Pedestal Up, Pedestal Down, Roll, Zoom, Arc, Crane, Handheld, Rack Focus. One movement only — never two combined (e.g. "pan + tilt").
- movement_speed is exactly one value from this set: Slow, Smooth, Stable, Gradual, Gentle, Rapid.
- None of the four fields above takes prose or a combination of values — shot_size's interval is the one named exception. If the shot's camera behavior changes in a way these fields cannot state, describe it in camera_subject instead of forcing it into one of them.
- camera_subject is prose, not a palette value: who or what the camera follows, and where the move starts and ends — movement + subject + start + direction + arrival. Do not use only a term detached from its subject.
- A value outside these lists is accepted as written. Choose from the list when it fits; never invent one to force a fit.

Always respond with a valid JSON object matching exactly this schema:
{
  "shots": [
    {
      "title": "string — brief label for the shot",
      "shot_code": "string or null — production code e.g. SH010, SH020",
      "description": "string or null — narrative description of the shot",
      "duration_seconds": number or null — estimated duration 3-8s typical,
      "continuity_in": "string — state at the start of this shot, inherited from the previous shot's continuity_out",
      "action_pitch": "string or null — what happens on screen",
      "shot_size": "string or null — EWS, WS, FS, MWS, MS, MCU, CU, ECU, or a start-to-end interval such as "MS to WS"",
      "camera_position": "string or null — Eye Level, High Angle, Low Angle, Bird's-Eye / Overhead, Worm's-Eye, Dutch / Canted (tilt); Ground Level, Low, Chest Level, Eye Level, Overhead (height); POV, Over-the-Shoulder (OTS), Two-Shot, Single, Reverse Shot, Establishing Shot, Profile, Front View, Rear View (role)",
      "camera_movement": "string or null — Static / Locked-off, Dolly, Dolly In, Dolly Out, Tracking, Truck Left, Truck Right, Pan, Tilt, Pedestal Up, Pedestal Down, Roll, Zoom, Arc, Crane, Handheld, Rack Focus. One value only.",
      "movement_speed": "string or null — Slow, Smooth, Stable, Gradual, Gentle, Rapid",
      "camera_subject": "string or null — prose: movement + subject it follows + start + direction + arrival",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly 4 shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`, user: `Project: Untitled Project

Sequence: Sequence
Summary: Not provided
Description: Not provided
Narrative purpose: Not provided
Mood: Not provided
Location: Not provided

Break this sequence into exactly 4 individual shots. Fill all fields as precisely as possible. The shots must form a continuous causal progression from shot 1 to shot 4. Avoid resets, contradictions, or repeated starting points.` };
    const assembled = assemble(project, seq, currentPrompt, targetCount);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
