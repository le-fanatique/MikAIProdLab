// ---------------------------------------------------------------------------
// `buildShotsFromSequencePrompt`, its `JSON_SCHEMA`/`CONTINUITY_RULES`
// constants and `BuildShotsFromSequenceInput` were removed (B19d) — dead
// code, no caller left. The live prompt for `shots.fromSequence` is
// `variables/registry.ts`'s `renderShotsFromSequenceSystemPathABody` /
// `...PathBBody` / `renderShotsFromSequenceJsonSchemaBlock` /
// `renderShotsFromSequenceTemplatePathA` / `...PathB`, assembled by
// `descriptors/shotsFromSequence.ts` — the migration LLMW.MIGRATE.LIST.1
// (B7e) completed, this file's own generation path just never followed.
//
// `GeneratedSequenceShot` below stays: it is imported by
// `src/actions/llm/sequenceShots.ts` (`normalizeShot`'s return type) and
// `src/components/prompts/SequenceShotsLLMAssistPanel.tsx` (`toShot`'s
// return type), both live and outside this ticket's scope. See
// `.agents/executor_report.md` for what that leaves unrepaired: this type
// still carries `camera_pitch`/`framing`, not the five-field camera
// vocabulary `shots.fromSequence`'s own descriptor now asks the model for.
// ---------------------------------------------------------------------------

export type GeneratedSequenceShot = {
  title: string;
  shot_code?: string | null;
  description?: string | null;
  duration_seconds?: number | null;
  continuity_in?: string | null;
  action_pitch?: string | null;
  // B19h — the model's own JSON keys. `camera_pitch` is gone with its column.
  // `framing` became `shot_size` in B19d, when the instruction was rewritten
  // to ask for it under that name — but this type and `normalizeShot` were
  // left reading `framing`, so Generate Shots silently stored no shot size at
  // all. Found by a round-trip test that had recorded the gap as expected.
  shot_size?: string | null;
  camera_position?: string | null;
  camera_movement?: string | null;
  movement_speed?: string | null;
  camera_subject?: string | null;
  camera_lens?: string | null;
  // SHOTGEN.INSTRUCTION.1 — the shot's own lighting event, distinct from the
  // ambient rig `shots.lighting`'s sibling columns (`sequences.lighting`,
  // an environment Asset's `lighting`) already carry by precedence.
  lighting?: string | null;
  continuity_out?: string | null;
  shot_prompt?: string | null;
};
