// ---------------------------------------------------------------------------
// provider.ts — STYLE.1.C.CORE
//
// Dedicated server-only OpenRouter Research provider.
// Fixed endpoint, fixed model, native fetch, no retry, redacted errors.
// Never exposes raw provider body, prompt, headers or key in logs/errors.
// ---------------------------------------------------------------------------

import "server-only";
import {
  RESEARCH_LIMITS,
  RESEARCH_PROVIDER,
  type NormalizedEvidence,
  type SynthesisOutput,
} from "./contracts";
import {
  buildNormalizedEvidence,
  parseSearchAnnotations,
  parseSynthesisResponse,
  validateSynthesisSourceAliases,
} from "./validation";
import { getResearchEffectiveSnapshot } from "@/lib/settings";
import type { LLMProvider } from "@/types/llm";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// ---------------------------------------------------------------------------
// Error types — sanitized, never contain raw provider data
// ---------------------------------------------------------------------------

export type ResearchProviderError =
  | { kind: "missing-key" }
  | { kind: "timeout" }
  | { kind: "rate-limit" }
  | { kind: "auth" }
  | { kind: "server"; status: number }
  | { kind: "response-too-large" }
  | { kind: "parse"; message: string }
  | { kind: "network"; message: string };

/**
 * Centralized user-facing mapping for `ResearchProviderError`
 * (STYLE.1.C.SEARCH.FIX1 retake round 1, P2 finding #3) — the single place
 * a Server Action should turn a provider error into an English message
 * shown to the user. Every branch here returns either a fixed, hand-written
 * copy, or `error.message`/`error.status`, both of which are already
 * bounded/sanitized strings/numbers generated internally by this module
 * (never the raw provider response body, headers, prompt or key — see
 * `callOpenRouter` below, which never surfaces those on any error path).
 */
export function describeResearchProviderError(
  operation: "search" | "synthesis",
  error: ResearchProviderError
): string {
  switch (error.kind) {
    case "missing-key":
      return "No OpenRouter API key is configured. Set an API key in Settings > Language Model.";
    case "timeout":
      return operation === "search" ? "Search timed out. Try again." : "Synthesis timed out. Try again.";
    case "rate-limit":
      return "OpenRouter rate limit reached. Try again in a moment.";
    case "auth":
      return "OpenRouter rejected the API key. Check the key in Settings > Language Model.";
    case "server":
      return `OpenRouter server error (HTTP ${error.status}). Try again later.`;
    case "response-too-large":
      return "The OpenRouter response was too large to process.";
    case "parse":
      // The one case the ticket calls out by name: preserve the provider's
      // own explicit "no valid citations" diagnostic instead of collapsing
      // it to a generic "Search failed: parse".
      if (operation === "search" && error.message === "No valid citations found.") {
        return "Search returned no valid citations. Try another query or choose another OpenRouter model.";
      }
      return error.message;
    case "network":
      return error.message;
  }
}

export type SearchProviderResult =
  | { ok: true; candidates: NormalizedEvidence[] }
  | { ok: false; error: ResearchProviderError };

export type SynthesisProviderResult =
  | { ok: true; output: SynthesisOutput; canonicalInput: string }
  | { ok: false; error: ResearchProviderError };

// ---------------------------------------------------------------------------
// Runtime descriptor — one server-owned source of truth for the effective
// Research provider/model, shared by the read-model boundary (UI display)
// and independently re-enforced by every Server Action before lease
// acquisition, network access or persistence (STYLE.1.C.SEARCH.FIX1).
//
// STYLE.1.C.SEARCH.FIX1 retake round 1, P1 finding #1: provider, model AND
// key must all come from the SAME `app_settings` read. `getResearchEffectiveProfile`
// is the only function that resolves this triad — it wraps
// `settings.ts::getResearchEffectiveSnapshot()` (a single DB read) and is
// the sole entry point any caller must use to obtain a coherent Research
// profile. `getResearchRuntimeInfo` is a thin secret-free projection of it
// for the UI/read-model boundary — never contains a key.
// ---------------------------------------------------------------------------

export type ResearchEffectiveProfile = {
  useSeparate: boolean;
  configuredProvider: LLMProvider;
  effectiveProvider: LLMProvider;
  model: string;
  /** Present only on this internal-only profile — never on `ResearchRuntimeInfo`. */
  apiKey: string | null;
  webSearchSupported: boolean;
  configurationError: string | null;
};

function deriveConfigurationError(webSearchSupported: boolean, model: string, apiKey: string | null): string | null {
  if (!webSearchSupported) {
    return "Web Search requires OpenRouter. Select OpenRouter as the active Language Model provider, or enable \"Use a separate provider for Influence Research\" in Settings and choose OpenRouter there.";
  }
  if (!model.trim()) {
    return "No OpenRouter model is configured. Set a model in Settings > Language Model.";
  }
  if (!apiKey) {
    return "No OpenRouter API key is configured. Set an API key in Settings > Language Model.";
  }
  return null;
}

/**
 * Server Action entry point for a Research operation: resolves provider,
 * model AND key from ONE atomic Settings read. Callers that go on to call
 * `searchResearch`/`synthesizeResearch` MUST pass this same object's
 * `model`/`apiKey` — never re-resolve the key independently — so a
 * Settings write landing between "check config" and "call provider" can
 * never combine a stale provider with a fresher model or key.
 */
export async function getResearchEffectiveProfile(): Promise<ResearchEffectiveProfile> {
  const snapshot = await getResearchEffectiveSnapshot();
  const webSearchSupported = snapshot.effectiveProvider === RESEARCH_PROVIDER;
  const configurationError = deriveConfigurationError(webSearchSupported, snapshot.config.model, snapshot.config.apiKey);

  return {
    useSeparate: snapshot.useSeparate,
    configuredProvider: snapshot.configuredProvider,
    effectiveProvider: snapshot.effectiveProvider,
    model: snapshot.config.model,
    apiKey: snapshot.config.apiKey,
    webSearchSupported,
    configurationError,
  };
}

export type ResearchRuntimeInfo = Omit<ResearchEffectiveProfile, "apiKey">;

/** Secret-free variant of `getResearchEffectiveProfile` for the UI/read-model
 * boundary (`getResearchReadModel`) — never exposes `apiKey`. */
export async function getResearchRuntimeInfo(): Promise<ResearchRuntimeInfo> {
  const profile = await getResearchEffectiveProfile();
  return {
    useSeparate: profile.useSeparate,
    configuredProvider: profile.configuredProvider,
    effectiveProvider: profile.effectiveProvider,
    model: profile.model,
    webSearchSupported: profile.webSearchSupported,
    configurationError: profile.configurationError,
  };
}

// ---------------------------------------------------------------------------
// Search — Stage 1: web discovery
// ---------------------------------------------------------------------------

export async function searchResearch(
  query: string,
  influenceContext: string,
  model: string,
  apiKey: string | null
): Promise<SearchProviderResult> {
  // `apiKey` MUST come from the same `getResearchEffectiveProfile()` call
  // that produced `model` — never re-resolved here — so the two can never
  // drift apart from a Settings write in between (STYLE.1.C.SEARCH.FIX1
  // retake round 1, P1 finding #1).
  if (!apiKey) return { ok: false, error: { kind: "missing-key" } };

  const prompt = buildSearchPrompt(query, influenceContext);

  const body = {
    model,
    messages: [{ role: "user" as const, content: prompt }],
    tools: [{ type: "openrouter:web_search", parameters: { max_results: 5 } }],
    max_tool_calls: 1,
    max_tokens: 2_000,
    temperature: 0.2,
  };

  const result = await callOpenRouter(apiKey, body, RESEARCH_LIMITS.searchTimeoutMs, RESEARCH_LIMITS.maxSearchResponseBytes);
  if (!result.ok) return result;

  // Parse annotations from the response
  const choices = result.data?.choices as unknown[] | undefined;
  const firstChoice = choices?.[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const annotations = message?.annotations as unknown[] | undefined;

  const parsed = parseSearchAnnotations(annotations);
  if (!parsed.ok) {
    return { ok: false, error: { kind: "parse", message: "No valid citations found." } };
  }

  // Build NormalizedEvidence for each candidate (defaults for MVP)
  const candidates: NormalizedEvidence[] = [];
  for (const c of parsed.candidates) {
    const evidence = buildNormalizedEvidence(
      c.url,
      c.title,
      c.content,
      "other",       // sourceType: default for auto-discovered
      "unknown",     // sourceTier: unknown until user reviews
      "unknown",     // confidence: unknown until user reviews
      null,          // authorOrPublisher
      null,          // relevanceSummary
      null,          // usefulnessRationale
      null           // uncertainty
    );
    if (evidence.ok) {
      candidates.push(evidence.evidence);
    }
  }

  // A structurally valid parse can still yield zero candidates if every one
  // individually failed evidence-building (e.g. an oversized title) — this
  // must fail too, never persist an empty Run (STYLE.1.C.SEARCH.FIX1).
  if (candidates.length === 0) {
    return { ok: false, error: { kind: "parse", message: "No valid citations found." } };
  }

  return { ok: true, candidates };
}

// ---------------------------------------------------------------------------
// Synthesis — Stage 2: structured synthesis from saved excerpts
// ---------------------------------------------------------------------------

export type SynthesisSource = {
  sourceId: number;
  revision: number;
  title: string;
  boundedExcerpt: string;
  normalizedUrl: string;
};

export async function synthesizeResearch(
  influenceContext: string,
  sources: SynthesisSource[],
  model: string,
  apiKey: string | null
): Promise<SynthesisProviderResult> {
  // Same coherent-profile contract as `searchResearch` above.
  if (!apiKey) return { ok: false, error: { kind: "missing-key" } };

  if (sources.length < RESEARCH_LIMITS.minSourcesPerSynthesis) {
    return { ok: false, error: { kind: "parse", message: `Need at least ${RESEARCH_LIMITS.minSourcesPerSynthesis} sources.` } };
  }
  if (sources.length > RESEARCH_LIMITS.maxSourcesPerSynthesis) {
    return { ok: false, error: { kind: "parse", message: `Exceeds ${RESEARCH_LIMITS.maxSourcesPerSynthesis} sources.` } };
  }

  const { prompt, aliases } = buildSynthesisPrompt(influenceContext, sources);

  const body = {
    model,
    messages: [{ role: "user" as const, content: prompt }],
    max_tokens: 4_000,
    temperature: 0.2,
  };

  const result = await callOpenRouter(apiKey, body, RESEARCH_LIMITS.synthesisTimeoutMs, RESEARCH_LIMITS.maxSynthesisResponseBytes);
  if (!result.ok) return result;

  const choices = result.data?.choices as unknown[] | undefined;
  const firstChoice = choices?.[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return { ok: false, error: { kind: "parse", message: "Empty synthesis response." } };
  }

  // Extract JSON from content (may be wrapped in markdown code block)
  const jsonStr = extractJsonFromContent(content);
  const parsed = parseSynthesisResponse(jsonStr);
  if (!parsed.ok) {
    return { ok: false, error: { kind: "parse", message: parsed.error } };
  }

  // Validate all source aliases resolve to real selected sources
  const aliasError = validateSynthesisSourceAliases(parsed.output, aliases);
  if (aliasError) {
    return { ok: false, error: { kind: "parse", message: aliasError } };
  }

  // `prompt` IS the exact bounded canonical input actually sent to the
  // provider (architecture §8: "persist the exact bounded text sent to the
  // provider") — returned here so the caller can persist/hash this precise
  // string rather than reconstructing (and potentially diverging from) it.
  return { ok: true, output: parsed.output, canonicalInput: prompt };
}

// ---------------------------------------------------------------------------
// Internal: call OpenRouter
// ---------------------------------------------------------------------------

type RawCallResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: ResearchProviderError };

/**
 * Reads `response.body` as a size-bounded UTF-8 text stream instead of
 * `response.text()` (which buffers the ENTIRE body in memory before any
 * size check can run). Aborts and cancels the stream the moment `maxBytes`
 * is exceeded — the response is never fully materialized when it is too
 * large. Falls back to a bounded `response.text()` re-check only if the
 * runtime does not expose a readable-stream body (defense in depth; every
 * supported deployment target does).
 */
async function readBoundedBody(
  response: Response,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false; error: "too-large" }> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, error: "too-large" };
    return { ok: true, text };
  }

  const decoder = new TextDecoder();
  let received = 0;
  let result = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, error: "too-large" };
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return { ok: true, text: result };
}

async function callOpenRouter(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  maxResponseBytes: number
): Promise<RawCallResult> {
  const controller = new AbortController();
  // The timer — and the AbortController it drives — stays live for the
  // ENTIRE request lifecycle (headers AND full body read/parse), cleared
  // only in the `finally` below. A response whose headers arrive promptly
  // but whose body then stalls is no longer unbounded: the same signal
  // that would abort `fetch()` also aborts the in-progress body read.
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: { kind: "timeout" } };
      }
      return { ok: false, error: { kind: "network", message: "Request failed." } };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: { kind: "auth" } };
    }
    if (response.status === 429) {
      return { ok: false, error: { kind: "rate-limit" } };
    }
    if (response.status >= 500) {
      return { ok: false, error: { kind: "server", status: response.status } };
    }
    if (!response.ok) {
      return { ok: false, error: { kind: "network", message: `HTTP ${response.status}` } };
    }

    let bounded: Awaited<ReturnType<typeof readBoundedBody>>;
    try {
      bounded = await readBoundedBody(response, maxResponseBytes);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: { kind: "timeout" } };
      }
      return { ok: false, error: { kind: "network", message: "Request failed." } };
    }
    if (!bounded.ok) {
      return { ok: false, error: { kind: "response-too-large" } };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(bounded.text);
    } catch {
      return { ok: false, error: { kind: "parse", message: "Invalid JSON from provider." } };
    }

    return { ok: true, data };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSearchPrompt(query: string, influenceContext: string): string {
  const boundedQuery = query.slice(0, RESEARCH_LIMITS.maxQueryLength);
  const boundedContext = influenceContext.slice(0, RESEARCH_LIMITS.maxInfluenceContextSearch);
  return [
    `Research the following creative influence for a film/art production style guide.`,
    `Influence context: ${boundedContext}`,
    `Search query: ${boundedQuery}`,
    `Return your findings as url_citation annotations. Focus on reliable, authoritative sources.`,
  ].join("\n\n");
}

function buildSynthesisPrompt(
  influenceContext: string,
  sources: SynthesisSource[]
): { prompt: string; aliases: Set<string> } {
  const boundedContext = influenceContext.slice(0, RESEARCH_LIMITS.maxInfluenceContextSynthesis);
  const aliases = new Set<string>();
  const sourceBlocks: string[] = [];

  for (const src of sources) {
    const alias = `source-${src.sourceId}`;
    aliases.add(alias);
    const boundedExcerpt = src.boundedExcerpt.slice(0, RESEARCH_LIMITS.maxExcerptLength);
    sourceBlocks.push(
      `[${alias}] Title: ${src.title}\nURL: ${src.normalizedUrl}\nExcerpt: ${boundedExcerpt}`
    );
  }

  const prompt = [
    `You are a film/art style research analyst.`,
    `Influence context: ${boundedContext}`,
    `Below are saved research sources. Analyze them and produce a structured synthesis.`,
    `Sources:`,
    ...sourceBlocks,
    ``,
    `Respond with a JSON object matching this exact schema:`,
    `{`,
    `  "schemaVersion": 1,`,
    `  "summary": "string",`,
    `  "claims": [`,
    `    {`,
    `      "key": "claim-1",`,
    `      "kind": "shared_trait|limited_observation|disagreement|uncertainty|project_principle",`,
    `      "text": "string",`,
    `      "confidence": "high|medium|low",`,
    `      "uncertainty": null,`,
    `      "sourceAliases": ["source-12"]`,
    `    }`,
    `  ],`,
    `  "candidateRules": [`,
    `    {`,
    `      "instruction": "string",`,
    `      "pillar": "visual" or "world" or null,`,
    `      "section": null,`,
    `      "category": null,`,
    `      "strength": "Preferred" or "Required" or "Avoid" or null,`,
    `      "applicability": null,`,
    `      "rationale": "string",`,
    `      "confidence": "medium",`,
    `      "uncertainty": null,`,
    `      "sourceAliases": ["source-12"]`,
    `    }`,
    `  ]`,
    `}`,
    `Every claim and candidate rule must cite at least one source alias from the provided sources.`,
    `Do not fabricate source aliases. Use only the aliases provided above.`,
    `Return ONLY the JSON object, no markdown fences.`,
  ].join("\n");

  return { prompt, aliases };
}

function extractJsonFromContent(content: string): string {
  // Try to extract JSON from markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find raw JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return content.trim();
}