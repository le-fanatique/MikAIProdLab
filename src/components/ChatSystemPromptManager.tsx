"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getChatSystemPrompts,
  saveChatSystemPrompt,
  deleteChatSystemPrompt,
} from "@/actions/settings";
import type { ChatSystemPrompt } from "@/types/llm";

export default function ChatSystemPromptManager() {
  const [prompts, setPrompts] = useState<ChatSystemPrompt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New / edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getChatSystemPrompts();
      setPrompts(data);
      setError(null);
    } catch {
      setError("Failed to load prompts.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startCreate = () => {
    setEditingId(null);
    setIsCreating(true);
    setFormName("");
    setFormPrompt("");
    setSaveError(null);
  };

  const startEdit = (p: ChatSystemPrompt) => {
    setEditingId(p.id);
    setIsCreating(false);
    setFormName(p.name);
    setFormPrompt(p.prompt);
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormName("");
    setFormPrompt("");
    setSaveError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    const res = await saveChatSystemPrompt({
      id: editingId ?? undefined,
      name: formName,
      prompt: formPrompt,
    });

    if (res.ok) {
      await load();
      cancelEdit();
    } else {
      setSaveError(res.error);
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const res = await deleteChatSystemPrompt({ id });
    if (res.ok) {
      await load();
    }
  };

  if (!loaded) {
    return (
      <div className="text-[11px] text-[#4b5158] italic">Loading prompts...</div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 text-[11px] text-[#e0556a]">{error}</div>
      )}

      {/* Existing prompts list */}
      {prompts.length === 0 && editingId === null && !isCreating ? (
        <p className="text-[11px] text-[#4b5158] italic mb-3">
          No system prompts yet. These prompts can be selected from the sidebar LLM chat.
        </p>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {prompts.map((p) =>
            editingId === p.id ? null : (
              <div
                key={p.id}
                className="flex items-start justify-between gap-2 rounded border border-[#232629] bg-[#0d0e10] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-[#a4abb2] truncate">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-[#6e767d] truncate mt-0.5">
                    {p.prompt.slice(0, 100)}
                    {p.prompt.length > 100 ? "..." : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => startEdit(p)}
                    className="text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-[10px] text-[#6e767d] hover:text-[#e0556a] transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Create / Edit form */}
      {editingId !== null || isCreating ? (
        <form onSubmit={handleSave} className="border border-[#232629] rounded p-3 bg-[#0d0e10]">
          <div className="text-[10px] font-semibold text-[#a4abb2] mb-2">
            {editingId ? "Edit Prompt" : "Add Prompt"}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-[#4b5158] uppercase tracking-wider">
                Prompt Name
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Concise Assistant"
                className="bg-[#141618] border border-[#2c3035] rounded px-2 py-1 text-[11px] text-[#a4abb2] placeholder-[#4b5158] focus:outline-none focus:border-[#3a4046]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-[#4b5158] uppercase tracking-wider">
                System Prompt
              </label>
              <textarea
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
                rows={4}
                className="bg-[#141618] border border-[#2c3035] rounded px-2 py-1 text-[11px] text-[#a4abb2] placeholder-[#4b5158] resize-y focus:outline-none focus:border-[#3a4046]"
              />
              <span className="text-[9px] text-[#4b5158] text-right">
                {formPrompt.length}/8000
              </span>
            </div>

            {saveError && (
              <div className="text-[10px] text-[#e0556a]">{saveError}</div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving || !formName.trim() || !formPrompt.trim()}
                className="px-3 py-1 rounded bg-[#1a1d20] border border-[#232629] text-[10px] text-[#a4abb2] hover:bg-[#252830] hover:text-[#e0e4e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : editingId ? "Save Prompt" : "Add Prompt"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1 rounded text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          onClick={startCreate}
          className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
        >
          + Add Prompt
        </button>
      )}
    </div>
  );
}