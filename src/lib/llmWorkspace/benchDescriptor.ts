// ---------------------------------------------------------------------------
// benchDescriptor.ts — LLMW.BENCH.RUN.1 (B6c1), §4.1
//
// Extracts the descriptor-resolution logic
// `src/app/settings/llm-workflows/[templateId]/page.tsx` inlined in B6b
// (`LLMW.BENCH.READ.1`) into one function, shared by the page and both
// bench Server Actions (`src/actions/llmWorkspace/bench.ts`) — the guarantee
// that Approve writes according to the exact descriptor the screen showed,
// not a second, independently re-resolved one.
//
// This module touches the database (`@/db`, to read a stored `llm_templates`
// row): it is therefore *not* subject to the module-scope `@/db` import ban
// that `runner.ts` and `variables/registry.ts` carry (§4.1 of this ticket).
// It must not, in turn, be imported by either of those two, nor by
// `bench.ts` (the pure B6b module), nor by any client component.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { llmTemplates } from "@/db/schema";
import { DESCRIPTORS } from "./descriptors";
import { validateLlmTemplateJson } from "./templateStorage";
import { parseTemplateRef } from "./bench";
import type { OperationDescriptor } from "./types";

export type BenchDescriptorResult =
  | { status: "ok"; descriptor: OperationDescriptor; source: "builtin" | "stored" }
  | { status: "notFound" }
  | { status: "invalid"; storedName: string; storedId: number; reason: string };

export async function loadBenchDescriptor(segment: string): Promise<BenchDescriptorResult> {
  const ref = parseTemplateRef(segment);

  if (ref.kind === "builtin") {
    const found = (DESCRIPTORS as Record<string, OperationDescriptor>)[ref.id];
    if (!found) return { status: "notFound" };
    return { status: "ok", descriptor: found, source: "builtin" };
  }

  const [row] = await db.select().from(llmTemplates).where(eq(llmTemplates.id, ref.id));
  if (!row) return { status: "notFound" };

  const validated = validateLlmTemplateJson(row.templateJson);
  if (!validated.ok) {
    return { status: "invalid", storedName: row.name, storedId: row.id, reason: validated.reason };
  }

  return { status: "ok", descriptor: validated.descriptor, source: "stored" };
}
