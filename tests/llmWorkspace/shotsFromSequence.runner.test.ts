import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";

// ---------------------------------------------------------------------------
// Level-2 proof required by the ticket (§4, §8.3): `shots.fromSequence`
// through the real runner dispatch (`resolveOperationPrompt` /
// `runOperation`, `runner.ts`), not a hand-built dispatcher. This is
// precisely what `shotsFromSequence.render.test.ts` (level 1) could not
// prove, and precisely the gap that let B7c's `targetCount` defect through:
// that test built its own `{variables, render}` dispatcher and threaded
// `targetCount` into it directly, so a broken production dispatch (e.g. the
// pre-B7c-n4 `fn(...resolvedVariables, selectedMode)` convention, which had
// no channel for `intent.parameters` at all) would never have failed it.
//
// Mutation check for this exact test (§8.3 of the ticket, reported in
// `.agents/executor_report.md`): temporarily reverting
// `renderShotsFromSequenceSystemPathABody` / `...PathBBody` /
// `...templatePathA` / `...templatePathB` to read `targetCount` off
// `selectedMode`'s old positional slot (the B7c defect) makes the
// `targetCount: 12` assertions below fail — they observe 6, not 12.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ shots: [] })),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));

  projectId = await insertProject(ctx, "Neon Skyline");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here, several sentences long.",
      outline: "## Opening\nThe courier receives the package.",
    })
    .where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("shots.fromSequence — runner proof (LLMW.BLOCK.VARPARAM.1, B7c-n4)", () => {
  it("Path A (Approved Sequence Prompt present): targetCount: 12 asks for 12 shots, not 6", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    });

    const runnerResult = await resolveOperationPrompt(
      shotsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { targetCount: 12 } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = { system: `You are a professional cinematographer and storyboard supervisor.
Your task is to generate exactly 12 shots for the given sequence.
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
      "camera_pitch": "string or null — camera angle, lens, position",
      "framing": "string or null — CU / MCU / MS / WS / ECU / OTS / POV",
      "camera_movement": "string or null — static / pan / tilt / tracking / dolly / handheld",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly 12 shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`, user: `TASK
Generate exactly 12 shots for this sequence.

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

Generate exactly 12 shots. Every shot must follow the subject, location, visual style, and mood of the Approved Sequence Prompt. The shots must form a continuous causal progression from shot 1 to shot 12. Avoid resets, contradictions, or repeated starting points.` };

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("generate exactly 12 shots");
    expect(runnerResult.prompt.system).not.toContain("generate exactly 6 shots");
    expect(runnerResult.prompt.user).toContain("Generate exactly 12 shots");
  });

  it("Path A: targetCount absent falls back to 6 (the builder's own default, not an invented one)", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    });

    const runnerResult = await resolveOperationPrompt(shotsFromSequenceDescriptor, { projectId, sequenceId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = { system: `You are a professional cinematographer and storyboard supervisor.
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
      "camera_pitch": "string or null — camera angle, lens, position",
      "framing": "string or null — CU / MCU / MS / WS / ECU / OTS / POV",
      "camera_movement": "string or null — static / pan / tilt / tracking / dolly / handheld",
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

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("generate exactly 6 shots");
  });

  it("Path B (no Approved Sequence Prompt): targetCount: 12 asks for 12 shots, not 6", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Alley standoff",
      summary: null,
      description: null,
      mood: null,
      locationHint: null,
      narrativePurpose: null,
      sequencePrompt: null,
    });

    const runnerResult = await resolveOperationPrompt(
      shotsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { targetCount: 12 } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = { system: `You are a professional cinematographer and storyboard supervisor.
Your task is to break a production sequence into exactly 12 individual shots.
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
      "camera_pitch": "string or null — camera angle, lens, position",
      "framing": "string or null — CU / MCU / MS / WS / ECU / OTS / POV",
      "camera_movement": "string or null — static / pan / tilt / tracking / dolly / handheld",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly 12 shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here, several sentences long.
Project Outline Background: ## Opening
The courier receives the package.

Sequence: Alley standoff
Summary: Not provided
Description: Not provided
Narrative purpose: Not provided
Mood: Not provided
Location: Not provided

Break this sequence into exactly 12 individual shots. Fill all fields as precisely as possible. The shots must form a continuous causal progression from shot 1 to shot 12. Avoid resets, contradictions, or repeated starting points.` };

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("break a production sequence into exactly 12 individual shots");
    expect(runnerResult.prompt.system).not.toContain("break a production sequence into exactly 6 individual shots");
    expect(runnerResult.prompt.user).toContain("Break this sequence into exactly 12 individual shots");
  });

  it("Path B: targetCount absent falls back to 6", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Alley standoff",
      summary: null,
      description: null,
      mood: null,
      locationHint: null,
      narrativePurpose: null,
      sequencePrompt: null,
    });

    const runnerResult = await resolveOperationPrompt(shotsFromSequenceDescriptor, { projectId, sequenceId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expectedPrompt = { system: `You are a professional cinematographer and storyboard supervisor.
Your task is to break a production sequence into exactly 6 individual shots.
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
      "camera_pitch": "string or null — camera angle, lens, position",
      "framing": "string or null — CU / MCU / MS / WS / ECU / OTS / POV",
      "camera_movement": "string or null — static / pan / tilt / tracking / dolly / handheld",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly 6 shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here, several sentences long.
Project Outline Background: ## Opening
The courier receives the package.

Sequence: Alley standoff
Summary: Not provided
Description: Not provided
Narrative purpose: Not provided
Mood: Not provided
Location: Not provided

Break this sequence into exactly 6 individual shots. Fill all fields as precisely as possible. The shots must form a continuous causal progression from shot 1 to shot 6. Avoid resets, contradictions, or repeated starting points.` };

    expect(runnerResult.prompt.system).toBe(expectedPrompt.system);
    expect(runnerResult.prompt.user).toBe(expectedPrompt.user);
    expect(runnerResult.prompt.system).toContain("break a production sequence into exactly 6 individual shots");
  });

  it("runOperation: the model is actually called with the real, full-pipeline prompt (empty list is a valid — if unhelpful — response)", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Alley standoff",
      sequencePrompt: null,
    });

    const result = await runOperation(shotsFromSequenceDescriptor, { projectId, sequenceId }, { parameters: { targetCount: 12 } });
    expect(result).toEqual({ ok: false, error: "The model returned no valid shots. Try again." });
  });
});
