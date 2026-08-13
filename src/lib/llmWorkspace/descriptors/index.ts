// ---------------------------------------------------------------------------
// descriptors/index.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1)
//
// The descriptor table, indexed by `id`. Three entries only — the three
// operations this ticket proves. The five remaining flat-JSON operations
// belong to the next ticket, per
// `docs/LLM_WORKSPACE_ARCHITECTURE.md` §10.1's settled migration order.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";
import { storyGenerateDescriptor } from "./story";
import { outlineGenerateDescriptor } from "./outline";
import { sequencePromptAssistDescriptor } from "./sequencePrompt";

export const DESCRIPTORS = {
  "story.generate": storyGenerateDescriptor,
  "outline.generate": outlineGenerateDescriptor,
  "sequencePrompt.assist": sequencePromptAssistDescriptor,
} as const satisfies Record<string, OperationDescriptor>;

export { storyGenerateDescriptor, outlineGenerateDescriptor, sequencePromptAssistDescriptor };
