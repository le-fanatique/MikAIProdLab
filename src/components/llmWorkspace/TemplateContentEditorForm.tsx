"use client";

// ---------------------------------------------------------------------------
// TemplateContentEditorForm.tsx — LLMW.EDITOR.SCREEN.1 (E1b)
//
// The editable surface `.agents/supervised_task.md` §2 names, built entirely
// on top of `templateEditor.ts` (E1a): every block-list operation (add,
// remove, move up/down) and every `context.variables` operation (add,
// remove, toggle `userAdjustable`) calls that module's exported functions
// directly — none is reimplemented here. This module owns no decision E1a
// does not already own; it only renders controls over that API and tracks
// the resulting draft in local state until Save.
//
// A control is never free text on a closed vocabulary (§3 of
// `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md`): a variable is chosen from
// `catalogues.variableIds` (`availableVariableIds()`), and a render form is
// chosen from the catalogue of the block type being edited — never another
// type's. `intent.mode`'s mode ids and `intent.parameters`' parameter ids are
// the one exception, and deliberately so: unlike variables, render forms and
// action ids, they are not members of any closed, cross-template registry —
// each operation declares its own, so there is nothing to choose from but
// free text. A `{parameter, render}` / `{variables, parameters, render}`
// block's own `parameter`/`parameters` field is the same case: it names one
// of *this* operation's own declared `intent.parameters` ids, not a global
// vocabulary member.
//
// One Save button, one complete patch (§5 of the ticket): `patchJson` is
// recomputed on every render from the whole draft and posted as the form's
// only field (`"patch"`) to `saveAction` (`updateLlmTemplateContent`, bound
// to `templateId` by the page) — no per-field submission, no auto-save.
//
// `.claude/rules/frontend.md` — "For failed mutations, preserve the user's
// local form values": `updateLlmTemplateContent` refuses by *redirecting*
// (`llmTemplates.ts`), which reloads this page and would otherwise discard
// every in-memory edit. The draft is therefore mirrored into
// `sessionStorage` on every change and restored on mount when the page
// reloads with an `error` query parameter — the one way to survive a real
// server redirect without touching that action's own contract.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import {
  addBlock,
  addContextVariable,
  describeBlock,
  moveBlockDown,
  moveBlockUp,
  removeBlockAt,
  removeContextVariable,
  toggleContextVariableAdjustable,
  type ContextVariableEntry,
  type EditableTemplatePatch,
} from "@/lib/llmWorkspace/templateEditor";
import type { Block, OperationDescriptor, VariableId } from "@/lib/llmWorkspace/types";
import FormStatusSubmitButton from "@/components/FormStatusSubmitButton";

export type TemplateEditorCatalogues = {
  variableIds: VariableId[];
  renderFormsByVariable: Record<string, string[]>;
  multiVariableForms: string[];
  parameterForms: string[];
  variableParameterForms: string[];
  modeForms: string[];
  freeTextForms: string[];
};

type IntentParameter = NonNullable<OperationDescriptor["intent"]["parameters"]>[number];

type Props = {
  templateId: number;
  descriptor: OperationDescriptor;
  catalogues: TemplateEditorCatalogues;
  saveAction: (formData: FormData) => void;
  hasError: boolean;
};

const inputClass =
  "w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors";
const smallFieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]";
const smallBtnClass =
  "text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors disabled:text-[#3a4046] disabled:cursor-not-allowed disabled:hover:text-[#3a4046]";
const removeBtnClass =
  "text-xs text-[#cf7b6b]/70 hover:text-[#cf7b6b] transition-colors disabled:text-[#3a4046] disabled:cursor-not-allowed";

type DraftState = {
  name: string;
  expertiseRole: string;
  expertiseSystemBlocks: Block[];
  templateBlocks: Block[];
  contextVariables: ContextVariableEntry[];
  modes: string[];
  defaultMode: string;
  parameters: IntentParameter[];
  freeTextEnabled: boolean;
  freeTextLabel: string;
};

function draftFromDescriptor(descriptor: OperationDescriptor): DraftState {
  return {
    name: descriptor.name,
    expertiseRole: descriptor.expertise.role,
    expertiseSystemBlocks: descriptor.expertise.system.blocks,
    templateBlocks: descriptor.template.blocks,
    contextVariables: descriptor.context.variables,
    modes: descriptor.intent.mode?.modes.map((m) => m.id) ?? [],
    defaultMode: descriptor.intent.mode?.defaultMode ?? "",
    parameters: descriptor.intent.parameters ?? [],
    freeTextEnabled: descriptor.intent.freeText != null,
    freeTextLabel: descriptor.intent.freeText?.label ?? "",
  };
}

function draftStorageKey(templateId: number): string {
  return `llmw-template-editor-draft-${templateId}`;
}

// ---------------------------------------------------------------------------
// Block list editor — shared by the two block lists (`expertise.system.blocks`
// and `template.blocks`). Reorder/remove call `templateEditor.ts` directly;
// "add" builds one `Block` literal from the controls' current selection,
// still only ever choosing among the catalogues the page computed from
// `templateEditor.ts`'s own exports.
// ---------------------------------------------------------------------------

type BlockDraftKind = "text" | "variable" | "variables" | "variablesParameters" | "parameter" | "mode" | "freeText";

function BlockListEditor({
  blocks,
  onChange,
  catalogues,
}: {
  blocks: Block[];
  onChange: (next: Block[]) => void;
  catalogues: TemplateEditorCatalogues;
}) {
  const [draftKind, setDraftKind] = useState<BlockDraftKind>("text");
  const [draftText, setDraftText] = useState("");
  const [draftVariable, setDraftVariable] = useState<VariableId | "">("");
  const [draftVariables, setDraftVariables] = useState<VariableId[]>([]);
  const [draftParameters, setDraftParameters] = useState("");
  const [draftParameter, setDraftParameter] = useState("");
  const [draftRender, setDraftRender] = useState("");

  const renderOptions: string[] =
    draftKind === "variable"
      ? (draftVariable ? (catalogues.renderFormsByVariable[draftVariable] ?? []) : [])
      : draftKind === "variables"
        ? catalogues.multiVariableForms
        : draftKind === "variablesParameters"
          ? catalogues.variableParameterForms
          : draftKind === "parameter"
            ? catalogues.parameterForms
            : draftKind === "mode"
              ? catalogues.modeForms
              : draftKind === "freeText"
                ? catalogues.freeTextForms
                : [];

  function resetDraft() {
    setDraftText("");
    setDraftVariable("");
    setDraftVariables([]);
    setDraftParameters("");
    setDraftParameter("");
    setDraftRender("");
  }

  function handleAdd() {
    let block: Block | null = null;
    if (draftKind === "text") {
      if (!draftText.trim()) return;
      block = { text: draftText };
    } else if (draftKind === "variable") {
      if (!draftVariable || !draftRender) return;
      block = { variable: draftVariable, render: draftRender };
    } else if (draftKind === "variables") {
      if (draftVariables.length === 0 || !draftRender) return;
      block = { variables: draftVariables, render: draftRender };
    } else if (draftKind === "variablesParameters") {
      const params = draftParameters.split(",").map((p) => p.trim()).filter(Boolean);
      if (draftVariables.length === 0 || params.length === 0 || !draftRender) return;
      block = { variables: draftVariables, parameters: params, render: draftRender };
    } else if (draftKind === "parameter") {
      if (!draftParameter.trim() || !draftRender) return;
      block = { parameter: draftParameter.trim(), render: draftRender };
    } else if (draftKind === "mode") {
      if (!draftRender) return;
      block = { mode: true, render: draftRender };
    } else if (draftKind === "freeText") {
      if (!draftRender) return;
      block = { freeText: true, render: draftRender };
    }
    if (!block) return;
    onChange(addBlock(blocks, block));
    resetDraft();
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 ? (
        <p className="text-xs text-[#4b5158]">No blocks yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {blocks.map((b, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded border border-[#2c3035] bg-[#141618] px-2 py-1.5"
            >
              <span className="font-mono text-xs text-[#a4abb2] truncate">{describeBlock(b)}</span>
              <span className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => onChange(moveBlockUp(blocks, i))} disabled={i === 0} className={smallBtnClass}>
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => onChange(moveBlockDown(blocks, i))}
                  disabled={i === blocks.length - 1}
                  className={smallBtnClass}
                >
                  Down
                </button>
                <button type="button" onClick={() => onChange(removeBlockAt(blocks, i))} className={removeBtnClass}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded border border-[#2c3035] bg-[#0d0e10] p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Add block</label>
          <select
            value={draftKind}
            onChange={(e) => {
              setDraftKind(e.target.value as BlockDraftKind);
              resetDraft();
            }}
            className={smallFieldClass}
          >
            <option value="text">text</option>
            <option value="variable">variable</option>
            <option value="variables">variables (multi)</option>
            <option value="variablesParameters">variables + parameters</option>
            <option value="parameter">parameter</option>
            <option value="mode">mode</option>
            <option value="freeText">freeText</option>
          </select>
        </div>

        {draftKind === "text" && (
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={2}
            placeholder="Static text"
            className={inputClass}
          />
        )}

        {draftKind === "variable" && (
          <select
            value={draftVariable}
            onChange={(e) => {
              setDraftVariable(e.target.value as VariableId);
              setDraftRender("");
            }}
            className={smallFieldClass}
          >
            <option value="">Select a variable…</option>
            {catalogues.variableIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}

        {(draftKind === "variables" || draftKind === "variablesParameters") && (
          <div className="flex flex-wrap gap-3">
            {catalogues.variableIds.map((id) => (
              <label key={id} className="flex items-center gap-1 text-xs text-[#a4abb2]">
                <input
                  type="checkbox"
                  checked={draftVariables.includes(id)}
                  onChange={(e) =>
                    setDraftVariables(e.target.checked ? [...draftVariables, id] : draftVariables.filter((v) => v !== id))
                  }
                />
                {id}
              </label>
            ))}
          </div>
        )}

        {draftKind === "variablesParameters" && (
          <input
            type="text"
            value={draftParameters}
            onChange={(e) => setDraftParameters(e.target.value)}
            placeholder="This operation's own intent.parameters ids, comma-separated"
            className={inputClass}
          />
        )}

        {draftKind === "parameter" && (
          <input
            type="text"
            value={draftParameter}
            onChange={(e) => setDraftParameter(e.target.value)}
            placeholder="This operation's own intent.parameters id"
            className={inputClass}
          />
        )}

        {draftKind !== "text" && (
          <select
            value={draftRender}
            onChange={(e) => setDraftRender(e.target.value)}
            className={smallFieldClass}
            disabled={renderOptions.length === 0}
          >
            <option value="">Select a render form…</option>
            {renderOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}

        <button type="button" onClick={handleAdd} className={smallBtnClass + " self-start"}>
          Add block
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context variables — add / remove / toggle, straight off `templateEditor.ts`.
// ---------------------------------------------------------------------------

function ContextVariablesEditor({
  variables,
  variableIds,
  onChange,
}: {
  variables: ContextVariableEntry[];
  variableIds: VariableId[];
  onChange: (next: ContextVariableEntry[]) => void;
}) {
  const [selected, setSelected] = useState<VariableId | "">("");
  const [adjustable, setAdjustable] = useState(false);
  const available = variableIds.filter((id) => !variables.some((v) => v.id === id));

  return (
    <div className="flex flex-col gap-3">
      {variables.length === 0 ? (
        <p className="text-xs text-[#4b5158]">No context variables declared.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {variables.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 rounded border border-[#2c3035] bg-[#141618] px-2 py-1.5"
            >
              <span className="font-mono text-xs text-[#a4abb2]">{v.id}</span>
              <span className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#6e767d]">
                  <input
                    type="checkbox"
                    checked={v.userAdjustable}
                    onChange={() => onChange(toggleContextVariableAdjustable(variables, v.id))}
                  />
                  User-adjustable
                </label>
                <button type="button" onClick={() => onChange(removeContextVariable(variables, v.id))} className={removeBtnClass}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <select value={selected} onChange={(e) => setSelected(e.target.value as VariableId)} className={smallFieldClass}>
          <option value="">Select a variable…</option>
          {available.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#6e767d]">
          <input type="checkbox" checked={adjustable} onChange={(e) => setAdjustable(e.target.checked)} />
          User-adjustable
        </label>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            onChange(addContextVariable(variables, selected, adjustable));
            setSelected("");
            setAdjustable(false);
          }}
          className={smallBtnClass}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// intent.mode — the operation's own mode ids, not a closed registry (see the
// header comment): free text to declare an id, a dropdown to pick the
// default among the ids already declared.
// ---------------------------------------------------------------------------

function ModeEditor({
  modes,
  defaultMode,
  onChange,
}: {
  modes: string[];
  defaultMode: string;
  onChange: (modes: string[], defaultMode: string) => void;
}) {
  const [draftId, setDraftId] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {modes.length === 0 ? (
        <p className="text-xs text-[#4b5158]">No mode declared — this operation is not mode-driven.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {modes.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1.5 rounded border border-[#2c3035] bg-[#141618] px-2 py-1 text-xs text-[#a4abb2]"
            >
              <span className="font-mono">{id}</span>
              <button
                type="button"
                onClick={() => {
                  const next = modes.filter((m) => m !== id);
                  onChange(next, defaultMode === id ? (next[0] ?? "") : defaultMode);
                }}
                className="text-[#cf7b6b]/70 hover:text-[#cf7b6b]"
                aria-label={`Remove mode ${id}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draftId}
          onChange={(e) => setDraftId(e.target.value)}
          placeholder="New mode id"
          className={smallFieldClass}
        />
        <button
          type="button"
          disabled={!draftId.trim() || modes.includes(draftId.trim())}
          onClick={() => {
            const id = draftId.trim();
            const next = [...modes, id];
            onChange(next, defaultMode || id);
            setDraftId("");
          }}
          className={smallBtnClass}
        >
          Add mode
        </button>
      </div>
      {modes.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Default mode</label>
          <select value={defaultMode} onChange={(e) => onChange(modes, e.target.value)} className={smallFieldClass}>
            {modes.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// intent.parameters — each row's `id` names one of this operation's own
// declared parameters (free text, same reasoning as `ModeEditor`'s mode ids).
// `type` IS a closed set — the four literals `types.ts` declares — so it is a
// dropdown, never free text.
// ---------------------------------------------------------------------------

const PARAMETER_TYPES: IntentParameter["type"][] = ["integer", "string", "boolean", "multiEnum"];

function ParametersEditor({
  parameters,
  onChange,
}: {
  parameters: IntentParameter[];
  onChange: (next: IntentParameter[]) => void;
}) {
  function updateAt(i: number, patch: Partial<IntentParameter>) {
    onChange(parameters.map((p, idx) => (idx === i ? ({ ...p, ...patch } as IntentParameter) : p)));
  }
  function removeAt(i: number) {
    onChange(parameters.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-3">
      {parameters.length === 0 ? (
        <p className="text-xs text-[#4b5158]">No intent parameters declared.</p>
      ) : (
        parameters.map((p, i) => (
          <div key={i} className="rounded border border-[#2c3035] bg-[#141618] p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={p.id}
                onChange={(e) => updateAt(i, { id: e.target.value })}
                placeholder="Parameter id"
                className={inputClass}
              />
              <select
                value={p.type}
                onChange={(e) => updateAt(i, { type: e.target.value as IntentParameter["type"], default: undefined })}
                className={smallFieldClass}
              >
                {PARAMETER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeAt(i)} className={removeBtnClass}>
                Remove
              </button>
            </div>
            <input
              type="text"
              value={p.label}
              onChange={(e) => updateAt(i, { label: e.target.value })}
              placeholder="Label shown to the author"
              className={inputClass}
            />
            {p.type === "integer" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={p.min ?? ""}
                  onChange={(e) => updateAt(i, { min: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="min"
                  className={smallFieldClass}
                />
                <input
                  type="number"
                  value={p.max ?? ""}
                  onChange={(e) => updateAt(i, { max: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="max"
                  className={smallFieldClass}
                />
                <input
                  type="number"
                  value={typeof p.default === "number" ? p.default : ""}
                  onChange={(e) => updateAt(i, { default: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="default"
                  className={smallFieldClass}
                />
              </div>
            )}
            {p.type === "string" && (
              <input
                type="text"
                value={typeof p.default === "string" ? p.default : ""}
                onChange={(e) => updateAt(i, { default: e.target.value || undefined })}
                placeholder="Default value"
                className={inputClass}
              />
            )}
            {p.type === "boolean" && (
              <label className="flex items-center gap-1 text-xs text-[#a4abb2]">
                <input type="checkbox" checked={Boolean(p.default)} onChange={(e) => updateAt(i, { default: e.target.checked })} />
                Default checked
              </label>
            )}
            {p.type === "multiEnum" && (
              <>
                <input
                  type="text"
                  value={(p.values ?? []).join(", ")}
                  onChange={(e) =>
                    updateAt(i, { values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
                  }
                  placeholder="Allowed values, comma-separated"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={Array.isArray(p.default) ? p.default.join(", ") : ""}
                  onChange={(e) =>
                    updateAt(i, { default: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
                  }
                  placeholder="Default values, comma-separated"
                  className={inputClass}
                />
              </>
            )}
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => onChange([...parameters, { id: "", type: "string", label: "" }])}
        className={smallBtnClass + " self-start"}
      >
        Add parameter
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The screen.
// ---------------------------------------------------------------------------

export default function TemplateContentEditorForm({ templateId, descriptor, catalogues, saveAction, hasError }: Props) {
  const [draft, setDraft] = useState<DraftState>(() => draftFromDescriptor(descriptor));
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

  // Mount-only: restore a draft saved before a failed save (see the header
  // comment), or discard a stale one from an earlier failed attempt once the
  // user reaches this screen through a clean navigation.
  useEffect(() => {
    const key = draftStorageKey(templateId);
    if (hasError) {
      const saved = window.sessionStorage.getItem(key);
      if (saved) {
        try {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sessionStorage hydration on mount (empty deps, no reactive loop); sessionStorage cannot be read during render (ThemeModeToggle.tsx applies the same rule for the same reason).
          setDraft(JSON.parse(saved) as DraftState);
          setRestoredFromDraft(true);
        } catch {
          // Malformed draft: keep the descriptor-derived state already set.
        }
      }
    } else {
      window.sessionStorage.removeItem(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(draftStorageKey(templateId), JSON.stringify(draft));
  }, [draft, templateId]);

  const patchJson = useMemo(() => {
    const patch: EditableTemplatePatch = {
      name: draft.name,
      expertiseRole: draft.expertiseRole,
      expertiseSystemBlocks: draft.expertiseSystemBlocks,
      templateBlocks: draft.templateBlocks,
      contextVariables: draft.contextVariables,
      intentMode:
        draft.modes.length > 0
          ? { modes: draft.modes.map((id) => ({ id })), defaultMode: draft.defaultMode || draft.modes[0] }
          : null,
      intentParameters: draft.parameters.length > 0 ? draft.parameters : null,
      intentFreeText: draft.freeTextEnabled ? { label: draft.freeTextLabel } : null,
    };
    return JSON.stringify(patch);
  }, [draft]);

  return (
    <form action={saveAction} className="flex flex-col gap-6">
      <input type="hidden" name="patch" value={patchJson} />

      {restoredFromDraft && (
        <p className="text-xs text-[#cda24f]">
          Restored your unsaved changes from before the last failed save attempt.
        </p>
      )}

      <div className="bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">Identity</div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">Name</label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">Expertise role</label>
            <textarea
              value={draft.expertiseRole}
              onChange={(e) => setDraft((prev) => ({ ...prev, expertiseRole: e.target.value }))}
              rows={2}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">
          System message blocks
        </div>
        <BlockListEditor
          blocks={draft.expertiseSystemBlocks}
          onChange={(next) => setDraft((prev) => ({ ...prev, expertiseSystemBlocks: next }))}
          catalogues={catalogues}
        />
      </div>

      <div className="bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">
          Template (user) message blocks
        </div>
        <BlockListEditor
          blocks={draft.templateBlocks}
          onChange={(next) => setDraft((prev) => ({ ...prev, templateBlocks: next }))}
          catalogues={catalogues}
        />
      </div>

      <div className="bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">
          Context variables
        </div>
        <ContextVariablesEditor
          variables={draft.contextVariables}
          variableIds={catalogues.variableIds}
          onChange={(next) => setDraft((prev) => ({ ...prev, contextVariables: next }))}
        />
      </div>

      <div className="bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">Intent — mode</div>
        <ModeEditor
          modes={draft.modes}
          defaultMode={draft.defaultMode}
          onChange={(modes, defaultMode) => setDraft((prev) => ({ ...prev, modes, defaultMode }))}
        />
      </div>

      <div className="bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">
          Intent — parameters
        </div>
        <ParametersEditor
          parameters={draft.parameters}
          onChange={(next) => setDraft((prev) => ({ ...prev, parameters: next }))}
        />
      </div>

      <div className="bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">
          Intent — free text
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-[#a4abb2]">
            <input
              type="checkbox"
              checked={draft.freeTextEnabled}
              onChange={(e) => setDraft((prev) => ({ ...prev, freeTextEnabled: e.target.checked }))}
            />
            This operation reads a free-text director&apos;s note
          </label>
          {draft.freeTextEnabled && (
            <input
              type="text"
              value={draft.freeTextLabel}
              onChange={(e) => setDraft((prev) => ({ ...prev, freeTextLabel: e.target.value }))}
              placeholder="Label shown above the free-text field"
              className={inputClass}
            />
          )}
        </div>
      </div>

      <div>
        <FormStatusSubmitButton
          pendingLabel="Saving…"
          className="rounded border border-[#5b93d6]/40 bg-[#1a2535] text-[#5b93d6] px-4 py-2 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] transition-colors disabled:opacity-60"
        >
          Save
        </FormStatusSubmitButton>
      </div>
    </form>
  );
}
