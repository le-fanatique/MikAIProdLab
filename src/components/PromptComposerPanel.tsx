"use client";

import { useState } from "react";
import { updateShotPrompt } from "@/actions/shots";
import type { ComposedShotPrompt } from "@/lib/prompts/composeShotPrompt";
import TextFieldTranslationButton from "@/components/TextFieldTranslationButton";

type Props = {
  composed: ComposedShotPrompt;
  projectId: number;
  sequenceId: number;
  shotId: number;
  returnTo: string;
  hasExistingShotPrompt: boolean;
  segmentCount: number;
  ingredients?: string[];
};

export default function PromptComposerPanel({
  composed,
  projectId,
  sequenceId,
  shotId,
  returnTo,
  hasExistingShotPrompt,
  segmentCount,
  ingredients,
}: Props) {
  const [text, setText] = useState(composed.proposalText);
  const isDirty = text !== composed.proposalText;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        A clean visual prompt built from shot context and casting. Edit before applying.
      </p>

      {!composed.hasContent ? (
        <div className="rounded border border-dashed border-[#2c3035] px-4 py-6 text-center">
          <p className="text-sm text-[#6e767d]">Not enough data to compose a draft.</p>
          <p className="text-xs text-[#4b5158] mt-1">
            Add a description, casting, or camera details to generate a prompt draft.
          </p>
        </div>
      ) : (
        <>
          {ingredients && ingredients.length > 0 && (
            <details className="mb-2" open>
              <summary className="cursor-pointer select-none text-[10px] font-medium uppercase tracking-wider text-[#4b5158] transition-colors hover:text-[#6e767d]">
                Sources used
              </summary>
              <div className="mt-1.5 flex flex-col gap-0.5 border-l border-[#1a1d20] pl-2">
                {ingredients.map((item, index) => (
                  <span key={index} className="text-[10px] text-[#4b5158]">
                    {item}
                  </span>
                ))}
              </div>
            </details>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                Draft
              </p>
              {isDirty && (
                <button
                  type="button"
                  onClick={() => setText(composed.proposalText)}
                  className="text-[10px] text-[#4b5158] hover:text-[#6e767d] transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] leading-relaxed resize-y focus:outline-none focus:border-[#3a4046] placeholder:text-[#4b5158]"
              placeholder="No draft generated."
            />
            <TextFieldTranslationButton
              getSourceText={() => text}
              onReplace={(t) => setText(t)}
              onAppend={(t) => setText(text.trim() ? `${text}\n\n${t}` : t)}
            />
          </div>

          {segmentCount > 0 && (
            <p className="text-[10px] text-[#4b5158]">
              Timed segments stay separate and will be combined automatically for video workflows.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1 border-t border-[#1e2124]">
            {hasExistingShotPrompt && (
              <p className="text-xs text-[#b89a5a]">
                Applying this draft will replace the current Shot Prompt.
              </p>
            )}
            <form action={updateShotPrompt}>
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="shotId" value={String(shotId)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="shotPrompt" value={text} />
              <button
                type="submit"
                className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Apply to Shot Prompt
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
