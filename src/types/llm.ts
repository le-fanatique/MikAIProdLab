/**
 * LLM contract types for MikAI Production Lab.
 *
 * JSON output contracts use snake_case to match the raw JSON the LLM produces.
 * Internal Drizzle/TypeScript objects use camelCase.
 * The mapping between snake_case contracts and camelCase DB values will be added in V0.4.
 */

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export type LLMProvider = "ollama" | "openrouter" | "openai-compatible";

export interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  apiKey: string | null; // null for Ollama (no auth required)
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Prompt format — OpenAI Chat Completions compatible
// ---------------------------------------------------------------------------

export interface LLMPrompt {
  system: string;
  user: string;
}

// ---------------------------------------------------------------------------
// JSON output contracts (snake_case — matches raw LLM JSON output)
// ---------------------------------------------------------------------------

/** Output contract for "Generate Story from Pitch" */
export interface GenerateStoryResult {
  story: string;
}

/** Output contract for "Generate Outline from Story" */
export interface GenerateOutlineResult {
  outline: string;
}

/** Single sequence entry in "Generate Sequences from Story" output */
export interface GeneratedSequence {
  title: string;
  summary: string | null;
  description: string | null;
  narrative_purpose: string | null;
  mood: string | null;
  location_hint: string | null;
  order_index: number;
}

/** Output contract for "Generate Sequences from Story" */
export interface GenerateSequencesResult {
  sequences: GeneratedSequence[];
}

/** Single shot entry in "Generate Shots from Sequence" output */
export interface GeneratedShot {
  shot_code: string | null;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  action_pitch: string | null;
  camera_pitch: string | null;
  framing: string | null;
  camera_movement: string | null;
  continuity_in: string | null;
  continuity_out: string | null;
  continuity_notes: string | null;
  order_index: number;
}

/** Output contract for "Generate Shots from Sequence" */
export interface GenerateShotsResult {
  shots: GeneratedShot[];
}

// ---------------------------------------------------------------------------
// Preview state (used by Client Components in V0.4)
// ---------------------------------------------------------------------------

export type LLMPreviewState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: T }
  | { status: "error"; message: string };
