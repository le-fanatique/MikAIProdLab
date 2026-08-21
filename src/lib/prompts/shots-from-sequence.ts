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
  camera_pitch?: string | null;
  framing?: string | null;
  camera_movement?: string | null;
  continuity_out?: string | null;
  shot_prompt?: string | null;
};
