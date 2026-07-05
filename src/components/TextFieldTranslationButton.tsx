"use client";

import { useState } from "react";
import { translateTextField } from "@/actions/llm/translation";
import TextTranslationPreviewPanel from "@/components/TextTranslationPreviewPanel";

type Props = {
  getSourceText: () => string;
  onReplace: (translation: string) => void;
  onAppend: (translation: string) => void;
  disabled?: boolean;
  sourceLanguage?: string;
};

const TARGET_LANGUAGES = [
  { label: "Translate to English", value: "English" },
  { label: "Translate to French", value: "French" },
] as const;

export default function TextFieldTranslationButton({
  getSourceText,
  onReplace,
  onAppend,
  disabled,
  sourceLanguage,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingLanguage, setLoadingLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isLoading = loadingLanguage !== null;

  function reset() {
    setTranslation(null);
    setError(null);
    setCopied(false);
    setMenuOpen(false);
  }

  async function handleTranslate(targetLanguage: string) {
    const sourceText = getSourceText().trim();
    if (!sourceText) {
      setError("Nothing to translate.");
      return;
    }

    setError(null);
    setTranslation(null);
    setCopied(false);
    setLoadingLanguage(targetLanguage);

    const result = await translateTextField({
      sourceText,
      targetLanguage,
      sourceLanguage,
    });

    setLoadingLanguage(null);

    if (result.ok) {
      setTranslation(result.translation);
      setMenuOpen(false);
    } else {
      setError(result.error);
    }
  }

  async function handleCopy() {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
    } catch {
      setError("Clipboard is not available in this browser.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {!menuOpen ? (
          <button
            type="button"
            onClick={() => { setMenuOpen(true); setError(null); }}
            disabled={disabled || isLoading}
            className="text-[10px] text-[#4b5158] hover:text-[#8fbbe8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Translate
          </button>
        ) : (
          <>
            {TARGET_LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                type="button"
                onClick={() => handleTranslate(lang.value)}
                disabled={disabled || isLoading}
                className="rounded border border-[#2c3035] text-[10px] text-[#a4abb2] px-2 py-0.5 hover:border-[#3a4046] hover:text-[#e7e9ec] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loadingLanguage === lang.value ? "Translating..." : lang.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setError(null); }}
              disabled={isLoading}
              className="text-[10px] text-[#4b5158] hover:text-[#6e767d] transition-colors"
              aria-label="Close translate menu"
            >
              ×
            </button>
          </>
        )}
      </div>

      {error && <p className="text-[10px] text-[#cf7b6b]">{error}</p>}

      {translation !== null && (
        <TextTranslationPreviewPanel
          translation={translation}
          copied={copied}
          onReplace={() => { onReplace(translation); reset(); }}
          onAppend={() => { onAppend(translation); reset(); }}
          onCopy={handleCopy}
          onCancel={reset}
        />
      )}
    </div>
  );
}
