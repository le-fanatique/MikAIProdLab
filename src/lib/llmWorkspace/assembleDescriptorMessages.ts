import type { Block, VariableId } from "./types";

// ---------------------------------------------------------------------------
// assembleDescriptorMessages.ts — LLMW.RUNNER.1a (B2a)
//
// `blocks.filter(Boolean).join(separator)`, exactly as settled by
// `LLMW.RENDER.SPIKE.1` and frozen in §4.1 correction 4
// (`docs/LLM_WORKSPACE_ARCHITECTURE.md`). Moved here from
// `tests/llmWorkspace/helpers/assembleDescriptor.ts`
// (`LLMW.DESCRIPTOR.RENDER.1`, B1c) — that file was a test-only stand-in
// for the runner's own block assembly, explicitly deferred to this ticket
// ("This copy exists solely so the eight equality tests can assemble
// {system, user}... B2 is the runner that will own this logic for real").
// The eight render tests under `tests/llmWorkspace/` now import this module
// directly; the test-only copy is deleted, so there is exactly one
// implementation.
//
// Seven dispatchers, one per `Block` variant (`text`, `variable`,
// `variables`, `parameter`, `mode`, `freeText` — the last added by
// LLMW.INTENT.FREETEXT.1, B9a — and `variables + parameters`, added by
// LLMW.BLOCK.VARPARAM.1, B7c-n4). Each caller supplies a small dispatcher
// over the render forms its own descriptor's blocks reference — an unmatched
// pair throws, so a descriptor referencing a render form the caller does not
// know about fails loudly instead of silently rendering `undefined`.
//
// The `variables + parameters` variant also carries a `variables` key, so
// its dispatch check must run before the plain `{variables, render}` check
// below — discriminated on the presence of `parameters`, the one key unique
// to the seventh variant (§2.1 of the ticket: the two shapes were checked for
// type-level ambiguity and found distinguishable by the compiler through
// excess-property checking on object literals; this runtime order is the
// dispatcher-side counterpart of that same distinction).
//
// `renderFreeText`'s default is the one exception to that discipline: unlike
// the other four, `intent.freeText` is *always* optional and its own render
// contract (§4.1 of the ticket) already defines "absent -> empty string" —
// an absent dispatcher is therefore equivalent to an absent consigne, not an
// unknown one, and defaults to producing the empty string rather than
// throwing. This lets every existing caller that predates the `freeText`
// block shape (the render-equality tests in particular, which hand-build
// their own dispatcher set) keep working unmodified: a descriptor's
// `freeText` block, resolved against no consigne, renders empty and is
// dropped before the join either way.
// ---------------------------------------------------------------------------

export type RenderVariable = (variableId: string, render: string) => string;
export type RenderVariables = (variableIds: VariableId[], render: string) => string;
export type RenderParameter = (parameterId: string, render: string) => string;
export type RenderMode = (render: string) => string;
export type RenderFreeText = (render: string) => string;
export type RenderVariablesParameters = (variableIds: VariableId[], parameterIds: string[], render: string) => string;

function assembleBlocks(
  blocks: Block[],
  separator: string,
  renderVariable: RenderVariable,
  renderVariables: RenderVariables,
  renderParameter: RenderParameter,
  renderMode: RenderMode,
  renderFreeText: RenderFreeText,
  renderVariablesParameters: RenderVariablesParameters
): string {
  const parts = blocks.map((block) => {
    if ("text" in block) return block.text;
    if ("parameters" in block) return renderVariablesParameters(block.variables, block.parameters, block.render);
    if ("variables" in block) return renderVariables(block.variables, block.render);
    if ("variable" in block) return renderVariable(block.variable, block.render);
    if ("mode" in block) return renderMode(block.render);
    if ("freeText" in block) return renderFreeText(block.render);
    return renderParameter(block.parameter, block.render);
  });
  return parts.filter((part) => part.length > 0).join(separator);
}

export function assembleDescriptorMessages(
  descriptor: {
    expertise: { system: { blocks: Block[]; separator: string } };
    template: { blocks: Block[]; separator: string };
  },
  renderVariable: RenderVariable,
  renderParameter: RenderParameter = () => {
    throw new Error("assembleDescriptorMessages: no renderParameter dispatcher supplied.");
  },
  renderMode: RenderMode = () => {
    throw new Error("assembleDescriptorMessages: no renderMode dispatcher supplied.");
  },
  renderVariables: RenderVariables = () => {
    throw new Error("assembleDescriptorMessages: no renderVariables dispatcher supplied.");
  },
  renderFreeText: RenderFreeText = () => "",
  renderVariablesParameters: RenderVariablesParameters = () => {
    throw new Error("assembleDescriptorMessages: no renderVariablesParameters dispatcher supplied.");
  }
): { system: string; user: string } {
  return {
    system: assembleBlocks(
      descriptor.expertise.system.blocks,
      descriptor.expertise.system.separator,
      renderVariable,
      renderVariables,
      renderParameter,
      renderMode,
      renderFreeText,
      renderVariablesParameters
    ),
    user: assembleBlocks(
      descriptor.template.blocks,
      descriptor.template.separator,
      renderVariable,
      renderVariables,
      renderParameter,
      renderMode,
      renderFreeText,
      renderVariablesParameters
    ),
  };
}
