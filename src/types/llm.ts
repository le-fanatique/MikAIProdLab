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
  apiKey: string | null;
  timeoutMs: number;
  temperature?: number;
}

export interface ProviderSettings {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  hasApiKey: boolean;
}

// ---------------------------------------------------------------------------
// Prompt format — OpenAI Chat Completions compatible
// ---------------------------------------------------------------------------

export interface LLMPrompt {
  system: string;
  user: string;
}

// ---------------------------------------------------------------------------
// Chat message format — OpenAI Chat Completions compatible
// ---------------------------------------------------------------------------

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// ---------------------------------------------------------------------------
// System prompt library for sidebar chat
// ---------------------------------------------------------------------------

export type ChatSystemPrompt = {
  id: string;
  name: string;
  prompt: string;
  createdAt?: string;
  updatedAt?: string;
};

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

/** Single casting suggestion in "Suggest Asset Casting from Sequence" output */
export type GeneratedCastingSuggestion = {
  targetType: "sequence" | "shot";
  targetId: number;
  targetLabel: string;
  assetId: number;
  assetName: string;
  assetType: "character" | "environment" | "prop" | "vehicle" | "crowd" | "other";
  reason: string | null;
  confidence: "high" | "medium" | "low";
  alreadyAssigned: boolean;
};

/** Single asset candidate in "Extract Assets from Project" output */
export type GeneratedAssetCandidate = {
  name: string;
  assetType: "character" | "environment" | "prop" | "vehicle" | "crowd" | "other";
  description: string | null;
  notes: string | null;
  sourceLevel: "outline" | "sequence" | "shot" | "story";
  sourceExcerpt: string | null;
  duplicateWarning: string | null;
};

/** Draft output for "Enhance Asset Description" */
export type GeneratedAssetDescriptionDraft = {
  descriptionDraft: string;
  notesDraft: string;
};

// ---------------------------------------------------------------------------
// Preview state (used by Client Components in V0.4)
// ---------------------------------------------------------------------------

export type LLMPreviewState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: T }
  | { status: "error"; message: string };
