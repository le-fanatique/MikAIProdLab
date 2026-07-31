// ---------------------------------------------------------------------------
// provider.ts — STYLE.1.B.ANALYSIS.CORE
//
// Confirmation-profile read model and the ONE call site into the existing
// multimodal chat router (`callLLMChat` / `getLLMConfig`, both reused
// verbatim — this file never re-implements provider dispatch, key
// resolution or retry logic). Server-only.
// ---------------------------------------------------------------------------

import "server-only";
import { getLLMConfig } from "@/lib/settings";
import { callLLMChat } from "@/lib/llm";
import type { ChatMessage, LLMConfig } from "@/types/llm";
import { computeProfileFingerprint } from "./validation";
import { REFERENCE_ANALYSIS_LIMITS } from "./contracts";
import type { PreparedReferenceImage } from "./imageInputs";

export type ReferenceAnalysisProfile = {
  provider: LLMConfig["provider"] | null;
  model: string;
  fingerprint: string;
  configurationError: string | null;
};

/**
 * Secret-free profile the caller must display and have the user confirm
 * before any file read, DB write, or network call
 * (`runReferenceAnalysisAction`'s gate). Backed by ONE `getLLMConfig()` read
 * — the SAME canonical Settings resolver every other MikAI LLM caller uses,
 * never a second copy. `provider` is `null` only when no model is
 * configured at all (the one case `getLLMConfig()` cannot disambiguate a
 * provider for — matching that function's existing contract, used
 * unchanged by every other caller in the codebase).
 */
export async function getReferenceAnalysisProfile(): Promise<ReferenceAnalysisProfile> {
  const config = await getLLMConfig();
  if (!config) {
    return {
      provider: null,
      model: "",
      fingerprint: computeProfileFingerprint("", ""),
      configurationError: "No Language Model is configured. Set a provider and model in Settings > Language Model.",
    };
  }
  const configurationError =
    config.provider !== "ollama" && !config.apiKey
      ? "No API key is configured for the active Language Model provider. Set an API key in Settings > Language Model."
      : null;
  return {
    provider: config.provider,
    model: config.model,
    fingerprint: computeProfileFingerprint(config.provider, config.model),
    configurationError,
  };
}

/**
 * Same single Settings read as `getReferenceAnalysisProfile`, but also
 * returns the full `LLMConfig` (including the API key) for the actual
 * provider call — so the profile the caller re-confirms immediately before
 * calling the provider is guaranteed to be the SAME read as the config
 * actually used, never two independent reads that could straddle a Settings
 * write.
 */
export async function getReferenceAnalysisEffectiveConfig(): Promise<{ profile: ReferenceAnalysisProfile; config: LLMConfig | null }> {
  const config = await getLLMConfig();
  if (!config) {
    return {
      profile: {
        provider: null,
        model: "",
        fingerprint: computeProfileFingerprint("", ""),
        configurationError: "No Language Model is configured. Set a provider and model in Settings > Language Model.",
      },
      config: null,
    };
  }
  const configurationError =
    config.provider !== "ollama" && !config.apiKey
      ? "No API key is configured for the active Language Model provider. Set an API key in Settings > Language Model."
      : null;
  return {
    profile: {
      provider: config.provider,
      model: config.model,
      fingerprint: computeProfileFingerprint(config.provider, config.model),
      configurationError,
    },
    config,
  };
}

// ---------------------------------------------------------------------------
// Multimodal message — ONE ChatMessage the existing router already knows how
// to translate per-provider: OpenAI-compatible/OpenRouter read the
// `content` array's `image_url` (data URL) parts; Ollama reads the same
// message's top-level `images` (raw base64, no prefix) and only the `text`
// content parts. Never a second per-provider payload builder.
// ---------------------------------------------------------------------------

export function buildAnalysisChatMessages(promptText: string, images: PreparedReferenceImage[]): ChatMessage[] {
  return [
    {
      role: "user",
      content: [
        { type: "text", text: promptText },
        ...images.map((img) => ({
          type: "image_url" as const,
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
      ],
      images: images.map((img) => img.base64),
    },
  ];
}

// ---------------------------------------------------------------------------
// Sanitized provider call — never surfaces a raw provider response body,
// header or key, NOT EVEN IN SERVER-SIDE LOGS. `callOpenAICompatibleChat`/
// `callOllamaChat` (reused as-is via `callLLMChat`) already throw a plain
// `Error` for most failure modes, but ONE of their branches
// (`src/lib/llm/openaiCompatible.ts::callOpenAICompatibleCore` non-2xx path)
// includes up to 200 raw response-body characters in that message — this
// wrapper never forwards `err.message` verbatim for anything outside a
// short allow-list of known-safe, hand-written prefixes; every other error
// collapses to one fixed, generic sanitized message, and the log line
// itself is a FIXED string with no interpolated content whatsoever (Round 1
// P1 finding — a previous version logged the raw `err.message`, which could
// still contain the embedded response body even though the RETURNED message
// never did).
// ---------------------------------------------------------------------------

export type ReferenceAnalysisProviderResult =
  | { ok: true; text: string }
  | { ok: false; errorCode: "timeout" | "network" | "provider_error"; errorMessage: string };

/** The only two `Error.message` prefixes this module ever forwards a derived (never verbatim) message for — both are fixed, hand-written strings thrown by `src/lib/llm/*` with no provider body/key interpolated. Every other message (including the one branch that embeds up to 200 raw response-body characters) falls through to the generic `provider_error` bucket below. */
const SAFE_MESSAGE_PREFIXES = { timeout: "Request timed out", network: "Cannot connect" } as const;

type ProviderErrorCode = "timeout" | "network" | "provider_error";

function sanitizeProviderErrorMessage(raw: unknown): { errorCode: ProviderErrorCode; errorMessage: string } {
  const message = raw instanceof Error ? raw.message : String(raw);
  if (message.startsWith(SAFE_MESSAGE_PREFIXES.timeout)) {
    return { errorCode: "timeout", errorMessage: "The Language Model provider timed out. Try again." };
  }
  if (message.startsWith(SAFE_MESSAGE_PREFIXES.network)) {
    return { errorCode: "network", errorMessage: "Could not reach the configured Language Model provider. Check Settings." };
  }
  // Every other branch (including the one that may embed a raw response
  // body) collapses to a fixed, generic message. The log line below is a
  // FIXED STRING — `message` is deliberately never interpolated into it, so
  // no provider body/key/URL can ever reach any log sink from this branch.
  console.error("Reference analysis provider call failed (sanitized — see errorCode for the caller-facing reason).");
  return { errorCode: "provider_error", errorMessage: "The Language Model provider returned an error. Try again or check your Settings." };
}

export async function callReferenceAnalysisProvider(
  messages: ChatMessage[],
  config: LLMConfig
): Promise<ReferenceAnalysisProviderResult> {
  try {
    const response = await callLLMChat(messages, config, { temperature: 0 });
    if (typeof response.text !== "string" || response.text.trim().length === 0) {
      return { ok: false, errorCode: "provider_error", errorMessage: "The Language Model provider returned an empty response." };
    }
    // Round 1 P1 finding — `maxResponseBytes` had no caller: an oversized
    // response could reach the parser/persistence layer despite the
    // documented contract. `callLLMChat` fully buffers the body upstream
    // (see `src/lib/llm/openaiCompatible.ts`/`ollama.ts`, both outside this
    // ticket's editable scope) — this is a post-receipt gate, not a
    // streaming cap, but it is the enforcement point available without
    // touching those files, and it does refuse before the parser ever sees
    // the text.
    if (Buffer.byteLength(response.text, "utf8") > REFERENCE_ANALYSIS_LIMITS.maxResponseBytes) {
      return { ok: false, errorCode: "provider_error", errorMessage: "The Language Model provider response was too large to process." };
    }
    return { ok: true, text: response.text };
  } catch (err) {
    const sanitized = sanitizeProviderErrorMessage(err);
    return { ok: false, errorCode: sanitized.errorCode, errorMessage: sanitized.errorMessage };
  }
}
