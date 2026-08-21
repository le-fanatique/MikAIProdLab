import { describe, expect, it } from "vitest";
import * as descriptorModule from "@/lib/llmWorkspace/descriptors";
import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// Every descriptor the module exports must also be in `DESCRIPTORS`.
//
// B19f shipped `camera.convertLegacy` exported but absent from that map, which
// is the only thing the bench reads. The operation existed, compiled, and had
// four passing tests of its own — and no screen could reach it. 1487 tests were
// green while it was unreachable.
//
// The same shape as the two interface bugs found in daily use this week: the
// mechanism was right, and nothing said the last step had not happened.
// ---------------------------------------------------------------------------

const map = DESCRIPTORS as unknown as Record<string, OperationDescriptor>;

function exportedDescriptors(): Array<[string, OperationDescriptor]> {
  const out: Array<[string, OperationDescriptor]> = [];
  for (const [name, value] of Object.entries(descriptorModule)) {
    if (!name.endsWith("Descriptor")) continue;
    if (typeof value !== "object" || value === null) continue;
    if (!("id" in value)) continue;
    out.push([name, value as OperationDescriptor]);
  }
  return out;
}

describe("DESCRIPTORS", () => {
  it("contains every descriptor the module exports, keyed by its own id", () => {
    const exported = exportedDescriptors();
    expect(exported.length).toBeGreaterThan(0);

    for (const [name, descriptor] of exported) {
      expect(map[descriptor.id], `${name} (${descriptor.id}) is missing from DESCRIPTORS`).toBe(
        descriptor
      );
    }
  });

  it("keys every entry by the descriptor's own id, never by a different name", () => {
    for (const [key, descriptor] of Object.entries(map)) {
      expect(descriptor.id).toBe(key);
    }
  });
});
