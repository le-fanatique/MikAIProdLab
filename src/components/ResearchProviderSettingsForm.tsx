"use client";

// ---------------------------------------------------------------------------
// ResearchProviderSettingsForm.tsx — STYLE.1.C.SEARCH.FIX1
//
// Settings card letting the user decouple Influence Research from the main
// Language Model provider, mirroring ChatProviderSettingsForm.tsx. Unlike
// Chat, Research's Web Search Server Tool only exists for OpenRouter (see
// docs/PROJECT_STYLE_RESEARCH_ARCHITECTURE.md) — this form additionally
// warns when the effective provider (separate-or-not) is not OpenRouter,
// since that blocks Search/Synthesis server-side regardless of what this
// form shows.
// ---------------------------------------------------------------------------

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { LLMProvider, ProviderSettings } from "@/types/llm";
import { saveResearchProviderSettings } from "@/actions/settings";

type SaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

type Props = {
  initialUseSeparate: boolean;
  initialResearchProvider: LLMProvider;
  activeProvider: LLMProvider;
  providers: Record<LLMProvider, ProviderSettings>;
};

const PROVIDER_OPTIONS: { value: LLMProvider; label: string }[] = [
  { value: "ollama", label: "Ollama" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai-compatible", label: "OpenAI-compatible / vLLM" },
];

const WEB_SEARCH_PROVIDER: LLMProvider = "openrouter";

export default function ResearchProviderSettingsForm({
  initialUseSeparate,
  initialResearchProvider,
  activeProvider,
  providers,
}: Props) {
  const router = useRouter();
  const providerSelectId = useId();
  const [useSeparate, setUseSeparate] = useState(initialUseSeparate);
  const [researchProvider, setResearchProvider] = useState<LLMProvider>(initialResearchProvider);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: "idle" });

  const effectiveProvider = useSeparate ? researchProvider : activeProvider;
  const effectiveProviderSettings = providers[effectiveProvider];
  const effectiveProviderHasModel = !!effectiveProviderSettings?.model?.trim();
  const effectiveProviderNeedsKey = effectiveProvider === "openrouter";
  const effectiveProviderHasKey = effectiveProviderSettings?.hasApiKey ?? false;
  const effectiveProviderLabel = PROVIDER_OPTIONS.find((o) => o.value === effectiveProvider)?.label ?? effectiveProvider;

  const webSearchUnsupported = effectiveProvider !== WEB_SEARCH_PROVIDER;
  const showKeyWarning = !webSearchUnsupported && effectiveProviderNeedsKey && !effectiveProviderHasKey;
  const showModelWarning = !webSearchUnsupported && !effectiveProviderHasModel;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus({ status: "saving" });
    // A thrown transport error (e.g. a dropped connection to the Server
    // Action) must never leave the form stuck on "Saving..." — every path
    // through this handler resolves `saveStatus` to a terminal, non-busy
    // state, and the user's in-progress choices (`useSeparate`,
    // `researchProvider`) are never reset on failure
    // (STYLE.1.C.SEARCH.FIX1 retake round 1, P2 finding #4).
    try {
      const result = await saveResearchProviderSettings(useSeparate, researchProvider);
      if (result.ok) {
        setSaveStatus({ status: "saved" });
        router.refresh();
        setTimeout(() => setSaveStatus({ status: "idle" }), 2500);
      } else {
        setSaveStatus({ status: "error", message: result.error });
      }
    } catch {
      setSaveStatus({
        status: "error",
        message: "Unexpected error while saving Influence Research provider settings. Please try again.",
      });
    }
  }

  const isBusy = saveStatus.status === "saving";

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      {/* Toggle */}
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={useSeparate}
          onChange={(e) => setUseSeparate(e.target.checked)}
          disabled={isBusy}
          className="mt-0.5 accent-[#5b93d6]"
        />
        <div>
          <div className="text-sm text-[#a4abb2]">Use a separate provider for Influence Research</div>
          <div className="text-xs text-[#4b5158] mt-0.5">
            When disabled, Influence Research uses the same provider and model saved in Language Model above.
          </div>
        </div>
      </label>

      {/* Provider selector — only when separate is ON */}
      {useSeparate && (
        <div className="flex flex-col gap-1.5 pl-7">
          <label
            htmlFor={providerSelectId}
            className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]"
          >
            Influence Research Provider
          </label>
          <select
            id={providerSelectId}
            value={researchProvider}
            onChange={(e) => setResearchProvider(e.target.value as LLMProvider)}
            disabled={isBusy}
            className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] transition-colors cursor-pointer"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[#4b5158]">
            Production features and Sidebar Chat are unaffected. Influence Research (Discover / Search web and
            Synthesis) will use this provider instead.
          </p>
        </div>
      )}

      {/* Effective summary */}
      <p className="text-xs text-[#4b5158] pl-7">
        Effective Research provider: <span className="text-[#a4abb2]">{effectiveProviderLabel}</span>
        {effectiveProviderHasModel ? (
          <>
            {" "}
            · Model: <span className="text-[#a4abb2]">{effectiveProviderSettings.model}</span>
          </>
        ) : null}
      </p>

      {/* Warnings — non-blocking display, matches server-side enforcement */}
      {webSearchUnsupported && (
        <p className="text-xs text-[#cf7b6b] pl-7">
          Web Search requires OpenRouter. {effectiveProviderLabel} does not support Influence Research — Search and
          Synthesis will be unavailable until OpenRouter is selected (either as the main Language Model provider, or
          here as a separate Influence Research provider).
        </p>
      )}
      {showModelWarning && (
        <p className="text-xs text-[#cda24f] pl-7">
          No model configured for {effectiveProviderLabel}. Configure it in the Language Model section above.
        </p>
      )}
      {showKeyWarning && (
        <p className="text-xs text-[#cda24f] pl-7">
          No API key saved for {effectiveProviderLabel}. Configure it in the Language Model section above.
        </p>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isBusy}
          className={
            isBusy
              ? "rounded bg-[#1a1d20] text-[#4b5158] px-4 py-2 text-sm cursor-not-allowed"
              : "rounded border border-[#2c3035] bg-[#2c3035] text-[#e7e9ec] px-4 py-2 text-sm font-medium hover:bg-[#3a4046] hover:border-[#3a4046] transition-colors"
          }
        >
          {saveStatus.status === "saving" ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {saveStatus.status === "saved" && (
        <p className="text-xs text-[#6b9e72]">Influence Research provider settings saved.</p>
      )}
      {saveStatus.status === "error" && (
        <p className="text-xs text-[#cf7b6b]" role="alert">{saveStatus.message}</p>
      )}
    </form>
  );
}
