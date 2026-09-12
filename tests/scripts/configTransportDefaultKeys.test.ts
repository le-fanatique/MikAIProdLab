import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS } from "@/lib/workflowDefaults";
// Plain .mjs, no type declarations, imported anyway — the import itself is
// the thing under test (DEVOPS.CONFIG.EXPORT.1 §11: prove vitest can import
// a scripts/*.mjs module the way tests/scripts/playwrightHarness.test.ts
// already does for scripts/playwright-harness.mjs).
import { DEFAULT_WORKFLOW_KEYS } from "../../scripts/config-transport.mjs";

// ---------------------------------------------------------------------------
// DEVOPS.CONFIG.EXPORT.1 §11 — the duplication the scripts/ -> src/ import
// wall imposes (scripts/config-transport.mjs cannot import
// src/lib/workflowDefaults.ts) is only safe if the two copies of the six
// default_workflow_* key names are proven solidary. This is that proof: it
// fails the moment either list is edited without the other.
// ---------------------------------------------------------------------------

describe("DEFAULT_WORKFLOW_KEYS (scripts/config-transport.mjs) vs DEFAULT_KEYS (src/lib/workflowDefaults.ts)", () => {
  it("are the exact same six keys, in the same order", () => {
    expect(DEFAULT_WORKFLOW_KEYS).toEqual([...DEFAULT_KEYS]);
  });
});
