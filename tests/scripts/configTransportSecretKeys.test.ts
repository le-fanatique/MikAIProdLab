import { describe, expect, it } from "vitest";
import { PROVIDER_PREFIXES } from "@/lib/settings";
// Plain .mjs, no type declarations, imported anyway — see
// configTransportDefaultKeys.test.ts for the proof vitest can import it.
import { PROVIDER_PREFIXES as SCRIPT_PROVIDER_PREFIXES, SECRET_APP_SETTINGS_KEYS } from "../../scripts/config-transport.mjs";

// ---------------------------------------------------------------------------
// Supervisor correction, DEVOPS.CONFIG.EXPORT.1 (see
// .agents/supervisor_review.md). The secret-key filter's basis is "what the
// code can ever write" (every LLMProvider's `${prefix}api_key`), never "what
// one database happened to have filled in". This is the proof: it fails the
// moment a provider is added to PROVIDER_PREFIXES without its derived secret
// key being added to SECRET_APP_SETTINGS_KEYS.
// ---------------------------------------------------------------------------

describe("PROVIDER_PREFIXES (scripts/config-transport.mjs) vs PROVIDER_PREFIXES (src/lib/settings.ts)", () => {
  it("are the exact same provider -> prefix map", () => {
    expect(SCRIPT_PROVIDER_PREFIXES).toEqual(PROVIDER_PREFIXES);
  });
});

describe("SECRET_APP_SETTINGS_KEYS derives every provider's api_key", () => {
  it("contains `${prefix}api_key` for every entry in PROVIDER_PREFIXES", () => {
    for (const prefix of Object.values(PROVIDER_PREFIXES)) {
      expect(SECRET_APP_SETTINGS_KEYS).toContain(`${prefix}api_key`);
    }
  });

  it("still contains the two non-provider-shaped secrets", () => {
    expect(SECRET_APP_SETTINGS_KEYS).toContain("comfyui_api_key");
    expect(SECRET_APP_SETTINGS_KEYS).toContain("comfyui_cloud_api_key");
    expect(SECRET_APP_SETTINGS_KEYS).toContain("llm_api_key");
  });
});
