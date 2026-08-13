import type { Block, VariableId } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// tests/llmWorkspace/helpers/assembleDescriptor.ts — LLMW.DESCRIPTOR.RENDER.1
//
// Test-only assembler: `blocks.filter(Boolean).join(separator)`, exactly as
// settled by `LLMW.RENDER.SPIKE.1` and frozen in §4.1 correction 4. Not
// wired into any production path — B2 (`LLMW.RUNNER.1`) is the runner that
// will own this logic for real. This copy exists solely so the eight
// equality tests can assemble `{system, user}` from a descriptor's blocks
// without inventing a production dependency this ticket does not authorize.
//
// Five dispatchers, one per `Block` variant (2026-08-13 widening: `variables`
// and `mode` added beside `variable` / `parameter`). Each is supplied per
// test: a small dispatcher over the render forms the test's own handcrafted
// input requires, matching the block's own shape. An unmatched pair throws,
// so a descriptor referencing a render form the test does not know about
// fails loudly instead of silently rendering `undefined`.
// ---------------------------------------------------------------------------

export type RenderVariable = (variableId: string, render: string) => string;
export type RenderVariables = (variableIds: VariableId[], render: string) => string;
export type RenderParameter = (parameterId: string, render: string) => string;
export type RenderMode = (render: string) => string;

function assembleBlocks(
  blocks: Block[],
  separator: string,
  renderVariable: RenderVariable,
  renderVariables: RenderVariables,
  renderParameter: RenderParameter,
  renderMode: RenderMode
): string {
  const parts = blocks.map((block) => {
    if ("text" in block) return block.text;
    if ("variables" in block) return renderVariables(block.variables, block.render);
    if ("variable" in block) return renderVariable(block.variable, block.render);
    if ("mode" in block) return renderMode(block.render);
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
  }
): { system: string; user: string } {
  return {
    system: assembleBlocks(
      descriptor.expertise.system.blocks,
      descriptor.expertise.system.separator,
      renderVariable,
      renderVariables,
      renderParameter,
      renderMode
    ),
    user: assembleBlocks(
      descriptor.template.blocks,
      descriptor.template.separator,
      renderVariable,
      renderVariables,
      renderParameter,
      renderMode
    ),
  };
}
