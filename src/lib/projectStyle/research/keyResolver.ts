// ---------------------------------------------------------------------------
// keyResolver.ts — STYLE.1.C.CORE
//
// Narrow server-only OpenRouter key resolver for the Research provider.
// Delegates to `src/lib/settings.ts::resolveOpenRouterApiKey` — the single
// source of truth for the existing OpenRouter key precedence
// (provider-specific DB key -> env var -> legacy DB key). This module must
// never re-derive that precedence locally; it exists only to give the
// Research provider its own narrow, explicitly-named import surface.
// ---------------------------------------------------------------------------

import "server-only";
import { resolveOpenRouterApiKey as resolveFromSettings } from "@/lib/settings";

/**
 * Resolves the OpenRouter API key using the exact same precedence as the
 * existing LLM settings. Returns null when no key is found. Never exposes
 * the raw key to any client, log, error, snapshot or DTO.
 */
export async function resolveOpenRouterApiKey(): Promise<string | null> {
  return resolveFromSettings();
}
