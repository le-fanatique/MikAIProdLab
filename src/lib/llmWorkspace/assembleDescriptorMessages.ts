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
// Six dispatchers, one per `Block` variant (`text`, `variable`, `variables`,
// `parameter`, `mode`, `freeText` — the last added by LLMW.INTENT.FREETEXT.1,
// B9a). Each caller supplies a small dispatcher over the render forms its
// own descriptor's blocks reference — an unmatched pair throws, so a
// descriptor referencing a render form the caller does not know about fails
// loudly instead of silently rendering `undefined`.
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

function assembleBlocks(
  blocks: Block[],
  separator: string,
  renderVariable: RenderVariable,
  renderVariables: RenderVariables,
  renderParameter: RenderParameter,
  renderMode: RenderMode,
  renderFreeText: RenderFreeText
): string {
  const parts = blocks.map((block) => {
    if ("text" in block) return block.text;
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
  renderFreeText: RenderFreeText = () => ""
): { system: string; user: string } {
  return {
    system: assembleBlocks(
      descriptor.expertise.system.blocks,
      descriptor.expertise.system.separator,
      renderVariable,
      renderVariables,
      renderParameter,
      renderMode,
      renderFreeText
    ),
    user: assembleBlocks(
      descriptor.template.blocks,
      descriptor.template.separator,
      renderVariable,
      renderVariables,
      renderParameter,
      renderMode,
      renderFreeText
    ),
  };
}
