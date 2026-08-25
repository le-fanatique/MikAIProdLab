"use client";

import { useEffect, useState } from "react";
import { updateAssetDetailsInline } from "@/actions/assets";
import TextFieldTranslationButton from "@/components/TextFieldTranslationButton";

type Props = {
  projectId: number;
  assetId: number;
  description: string | null;
  notes: string | null;
  // Asset Bible (ASSET.BIBLE.1) — optional guidance fields for the future
  // Prompt Compiler, independent of description/notes.
  visualIdentity: string | null;
  usageRules: string | null;
  forbiddenVariations: string | null;
  // ASSET.LIGHTING.PLACE.1 — the manual way, of the three §5.9 describes, to
  // fill this Asset-level field (LLMW.LIGHTING.1's own column). Independent
  // of the Asset Bible fields above, same as description/notes.
  lighting: string | null;
  // ASSET.PROMPTCARD.1 — the short, approved form of the Bible (3-5 anchors)
  // `buildSubject` (composition/storyboardShot.ts) prefers over
  // visualIdentity/description when present. No assist writes this yet — the
  // author fills it by hand here, same as `lighting` above.
  promptCard: string | null;
  returnTo: string;
};

export default function AssetInlineDetailsForm({
  projectId,
  assetId,
  description: initialDescription,
  notes: initialNotes,
  visualIdentity: initialVisualIdentity,
  usageRules: initialUsageRules,
  forbiddenVariations: initialForbiddenVariations,
  lighting: initialLighting,
  promptCard: initialPromptCard,
  returnTo,
}: Props) {
  const [description, setDescription] = useState(initialDescription ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [visualIdentity, setVisualIdentity] = useState(initialVisualIdentity ?? "");
  const [usageRules, setUsageRules] = useState(initialUsageRules ?? "");
  const [forbiddenVariations, setForbiddenVariations] = useState(initialForbiddenVariations ?? "");
  const [lighting, setLighting] = useState(initialLighting ?? "");
  const [promptCard, setPromptCard] = useState(initialPromptCard ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Retake 2 (LLMW.PROPOSAL.COMPONENT.1) — `useState(initial... ?? "")` only
  // seeds this component's state at mount. Asset Bible and Description/Notes
  // now commit via `router.refresh()` instead of a full page reload
  // (`ProposalPanel`'s Decision 2), which re-renders this already-mounted
  // component with fresh props but does not itself update state React
  // already owns — the exact stale-value defect that arbitration existed to
  // fix. Same pattern as `OutlineEditorForm.tsx`/`StoryFoundationEditor.tsx`:
  // resync each field from its prop whenever the prop changes. An unsaved
  // edit in one of these five fields is overwritten by the server value on
  // the next refresh — the same trade-off already accepted for Outline and
  // Story Foundation, not a new one invented here.
  useEffect(() => { setDescription(initialDescription ?? ""); }, [initialDescription]);
  useEffect(() => { setNotes(initialNotes ?? ""); }, [initialNotes]);
  useEffect(() => { setVisualIdentity(initialVisualIdentity ?? ""); }, [initialVisualIdentity]);
  useEffect(() => { setUsageRules(initialUsageRules ?? ""); }, [initialUsageRules]);
  useEffect(() => { setForbiddenVariations(initialForbiddenVariations ?? ""); }, [initialForbiddenVariations]);
  useEffect(() => { setLighting(initialLighting ?? ""); }, [initialLighting]);
  useEffect(() => { setPromptCard(initialPromptCard ?? ""); }, [initialPromptCard]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateAssetDetailsInline({
        assetId,
        projectId,
        description,
        notes,
        visualIdentity,
        usageRules,
        forbiddenVariations,
        lighting,
        promptCard,
      });
      if (result.ok) {
        // Construct returnTo with detailsUpdated param
        const sep = returnTo.includes("?") ? "&" : "?";
        window.location.href = `${returnTo}${sep}detailsUpdated=1`;
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-3 py-2">
          <p className="text-xs text-[#cf7b6b]">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="description" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
          placeholder="Describe this asset..."
        />
        <TextFieldTranslationButton
          getSourceText={() => description}
          disabled={isSaving}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
          placeholder="Add any additional notes..."
        />
        <TextFieldTranslationButton
          getSourceText={() => notes}
          disabled={isSaving}
        />
      </div>

      <p className="text-xs text-[#4b5158]">
        Description and notes are used as the text prompt for asset image generation.
      </p>

      {/* Asset Bible (ASSET.BIBLE.1) — optional guidance fields for the
          future Prompt Compiler. Independent of description/notes above. */}
      <div className="flex flex-col gap-4 border-t border-[#1e2124] pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
          Asset Bible
        </p>

        {/* ASSET.PROMPTCARD.1 — the short, curated form (3-5 anchors) the
            storyboard composition prefers over Visual Identity + Description
            when filled. No assist writes it yet (ASSET.PROMPTCARD.2); the
            author drafts it here by hand. */}
        <div className="flex flex-col gap-2">
          <label htmlFor="promptCard" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Prompt Card
          </label>
          <textarea
            id="promptCard"
            value={promptCard}
            onChange={(e) => setPromptCard(e.target.value)}
            rows={3}
            className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            placeholder="3 to 5 geometric anchors an engine can hold onto, e.g. 'Anthropomorphic female macaque, weathered fur, calloused hands, scuffed utilitarian flight jacket over a faded undersuit'..."
          />
          <p className="text-xs text-[#4b5158]">
            When filled, this replaces Visual Identity and Description in the storyboard prompt&apos;s Subject block.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="visualIdentity" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Visual Identity
          </label>
          <textarea
            id="visualIdentity"
            value={visualIdentity}
            onChange={(e) => setVisualIdentity(e.target.value)}
            rows={3}
            className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            placeholder="Defining silhouette, colors, materials, proportions..."
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="usageRules" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Usage / Performance Rules
          </label>
          <textarea
            id="usageRules"
            value={usageRules}
            onChange={(e) => setUsageRules(e.target.value)}
            rows={3}
            className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            placeholder="How this asset should behave or be framed across shots..."
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="forbiddenVariations" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Forbidden Variations
          </label>
          <textarea
            id="forbiddenVariations"
            value={forbiddenVariations}
            onChange={(e) => setForbiddenVariations(e.target.value)}
            rows={3}
            className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
            placeholder="Colors, props, poses or traits that must never appear..."
          />
        </div>

        <p className="text-xs text-[#4b5158]">
          Optional guidance for consistent generation — used by the upcoming Prompt Compiler.
        </p>
      </div>

      {/* ASSET.LIGHTING.PLACE.1 — the manual way to fill this field, next to
          the other in-line Details fields above. Independent of the Asset
          Bible block. */}
      <div className="flex flex-col gap-2 border-t border-[#1e2124] pt-4">
        <label htmlFor="lighting" className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Lighting
        </label>
        <textarea
          id="lighting"
          value={lighting}
          onChange={(e) => setLighting(e.target.value)}
          rows={3}
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
          placeholder="Direction, hardness, color and contrast of the light in this environment..."
        />
      </div>

      <div className="flex items-center gap-2 border-t border-[#1e2124] pt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={
            isSaving
              ? "rounded border border-[#1e2124] text-[#4b5158] px-3 py-1.5 text-sm cursor-not-allowed"
              : "rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          }
        >
          Save Details
        </button>
      </div>
    </div>
  );
}
