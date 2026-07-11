"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  insertShotInSequenceFromEditorialContext,
  generateInsertedShotBriefFromNeighbors,
} from "@/actions/editorialInsert";
import { deleteEditorialGap } from "@/actions/editorialTimeline";

// Kept in sync by hand with the server action's own default (a "use
// server" file may only export async functions, so the constant can't be
// shared directly).
const DEFAULT_INSERTED_SHOT_DURATION_SECONDS = 5;

type Props = {
  projectId: number;
  sequenceId: number;
  insertAfterShotId?: number | null;
  insertBeforeShotId?: number | null;
  /** "Insert Shot Here" between/after rows, "Insert New Shot" at the end of the list. */
  label?: string;
  /**
   * BASIC.EDITORIAL.3 "Replace with New Shot": when set, the gap with this
   * editorial item id is deleted right after the new shot is created
   * successfully — never before, and never if creation fails. Requires
   * `returnTo` (the gap deletion action redirects there).
   */
  replaceGapItemId?: number | null;
  returnTo?: string;
};

type FormState = "closed" | "open";

export default function InsertShotFromEditorialButton({
  projectId,
  sequenceId,
  insertAfterShotId = null,
  insertBeforeShotId = null,
  label = "Insert Shot Here",
  replaceGapItemId = null,
  returnTo,
}: Props) {
  const router = useRouter();
  const [, startGapDeleteTransition] = useTransition();
  const [formState, setFormState] = useState<FormState>("closed");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [targetDuration, setTargetDuration] = useState(String(DEFAULT_INSERTED_SHOT_DURATION_SECONDS));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [generatedNote, setGeneratedNote] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setNotes("");
    setTargetDuration(String(DEFAULT_INSERTED_SHOT_DURATION_SECONDS));
    setGeneratedNote(false);
    setResult(null);
  }

  async function handleGenerateBrief() {
    setIsGenerating(true);
    setResult(null);
    const res = await generateInsertedShotBriefFromNeighbors({
      projectId,
      sequenceId,
      insertAfterShotId,
      insertBeforeShotId,
    });
    setIsGenerating(false);
    if (res.ok) {
      setTitle(res.brief.title);
      setDescription(res.brief.description);
      if (res.brief.notes) setNotes(res.brief.notes);
      setGeneratedNote(true);
    } else {
      setResult({ ok: false, message: res.error });
    }
  }

  async function handleCreate() {
    const duration = parseFloat(targetDuration);
    if (!Number.isFinite(duration) || duration <= 0) {
      setResult({ ok: false, message: "Target duration must be greater than 0." });
      return;
    }
    if (
      !window.confirm("Create a new production shot at this editorial position?")
    ) {
      return;
    }

    setIsCreating(true);
    setResult(null);
    const res = await insertShotInSequenceFromEditorialContext({
      projectId,
      sequenceId,
      insertAfterShotId,
      insertBeforeShotId,
      targetDurationSeconds: duration,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setIsCreating(false);

    if (res.ok) {
      setResult({
        ok: true,
        message:
          res.outdatedResultsCount > 0
            ? "Shot created. Sequence results were marked outdated. Publish a new result when ready."
            : "Shot created.",
      });
      reset();
      setFormState("closed");

      // Replace-gap flow: only delete the gap after the new shot exists —
      // never before, and never on failure. This redirects, which reloads
      // the page and supersedes the router.refresh() below.
      if (replaceGapItemId != null) {
        const gapFd = new FormData();
        gapFd.set("projectId", String(projectId));
        gapFd.set("sequenceId", String(sequenceId));
        gapFd.set("itemId", String(replaceGapItemId));
        gapFd.set("returnTo", returnTo ?? `/projects/${projectId}/sequences/${sequenceId}/editorial`);
        startGapDeleteTransition(() => {
          deleteEditorialGap(gapFd);
        });
      }

      router.refresh();
    } else {
      setResult({ ok: false, message: res.error });
    }
  }

  if (formState === "closed") {
    return (
      <button
        type="button"
        onClick={() => setFormState("open")}
        className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded border border-[#2c3035] bg-[#141618] p-3 flex flex-col gap-2.5 my-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">Insert New Shot</p>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6e767d]">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Placeholder"
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-2 py-1.5 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6e767d]">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-2 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] resize-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6e767d]">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Why this shot is needed here"
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-2 py-1.5 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] resize-none"
        />
      </div>

      <div className="flex flex-col gap-1 w-32">
        <label className="text-xs text-[#6e767d]">Target Duration</label>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={targetDuration}
          onChange={(e) => setTargetDuration(e.target.value)}
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-2 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046]"
        />
      </div>

      {generatedNote && (
        <p className="text-xs text-[#6b9e72]">Generated — edit before creating.</p>
      )}
      {result && (
        <p className={`text-xs ${result.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>{result.message}</p>
      )}

      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreating || isGenerating}
          className="rounded bg-[#232629] text-[#e7e9ec] px-3 py-1.5 text-sm hover:bg-[#2c3035] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isCreating ? "Creating…" : "Create Shot"}
        </button>
        <button
          type="button"
          onClick={handleGenerateBrief}
          disabled={isGenerating || isCreating}
          className="text-xs text-[#a4abb2] hover:text-[#e7e9ec] transition-colors disabled:opacity-40"
        >
          {isGenerating ? "Generating…" : "Generate Shot Brief from Neighbors"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setFormState("closed");
          }}
          disabled={isCreating}
          className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
