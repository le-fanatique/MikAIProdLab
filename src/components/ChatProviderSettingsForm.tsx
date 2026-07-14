"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LLMProvider, ProviderSettings } from "@/types/llm";
import { saveChatProviderSettings } from "@/actions/settings";

type SaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

type Props = {
  initialUseSeparate: boolean;
  initialChatProvider: LLMProvider;
  providers: Record<LLMProvider, ProviderSettings>;
};

const PROVIDER_OPTIONS: { value: LLMProvider; label: string }[] = [
  { value: "ollama", label: "Ollama" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai-compatible", label: "OpenAI-compatible / vLLM" },
];

export default function ChatProviderSettingsForm({
  initialUseSeparate,
  initialChatProvider,
  providers,
}: Props) {
  const router = useRouter();
  const [useSeparate, setUseSeparate] = useState(initialUseSeparate);
  const [chatProvider, setChatProvider] = useState<LLMProvider>(initialChatProvider);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: "idle" });

  const chatProviderSettings = providers[chatProvider];
  const chatProviderHasModel = !!chatProviderSettings?.model?.trim();
  const chatProviderNeedsKey = chatProvider === "openrouter";
  const chatProviderHasKey = chatProviderSettings?.hasApiKey ?? false;
  const showKeyWarning = useSeparate && chatProviderNeedsKey && !chatProviderHasKey;
  const showModelWarning = useSeparate && !chatProviderHasModel;

  async function handleSave() {
    setSaveStatus({ status: "saving" });
    const result = await saveChatProviderSettings(useSeparate, chatProvider);
    if (result.ok) {
      setSaveStatus({ status: "saved" });
      router.refresh();
      setTimeout(() => setSaveStatus({ status: "idle" }), 2500);
    } else {
      setSaveStatus({ status: "error", message: result.error });
    }
  }

  const isBusy = saveStatus.status === "saving";

  return (
    <div className="flex flex-col gap-4">
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
          <div className="text-sm text-[#a4abb2]">Use a separate provider for Sidebar Chat</div>
          <div className="text-xs text-[#4b5158] mt-0.5">
            When disabled, Sidebar Chat uses the same provider as production LLM features.
          </div>
        </div>
      </label>

      {/* Provider selector — only when separate is ON */}
      {useSeparate && (
        <div className="flex flex-col gap-1.5 pl-7">
          <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
            Chat Provider
          </label>
          <select
            value={chatProvider}
            onChange={(e) => setChatProvider(e.target.value as LLMProvider)}
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
            Production features keep using the main LLM provider. Sidebar Chat will use this provider instead.
          </p>

          {/* Warnings — non-blocking */}
          {showModelWarning && (
            <p className="text-xs text-[#cda24f]">
              No model configured for {PROVIDER_OPTIONS.find((o) => o.value === chatProvider)?.label}. Configure it in the Language Model section above.
            </p>
          )}
          {showKeyWarning && (
            <p className="text-xs text-[#cda24f]">
              No API key saved for {PROVIDER_OPTIONS.find((o) => o.value === chatProvider)?.label}. Configure it in the Language Model section above.
            </p>
          )}
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
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
        <p className="text-xs text-[#6b9e72]">Chat provider settings saved.</p>
      )}
      {saveStatus.status === "error" && (
        <p className="text-xs text-[#cf7b6b]">{saveStatus.message}</p>
      )}
    </div>
  );
}
