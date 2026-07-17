// ---------------------------------------------------------------------------
// validateImageProvenance.ts — SEQGEN.VIDEO.1 (REVISE, provenance hardening)
//
// Pure function, kept out of sequenceVideoGeneration.ts ("use server", every
// export must be async) so it can be unit-tested in isolation.
//
// History of rejected weaker approaches, kept here so the final design's
// reasoning isn't lost:
//   - Reconstructing provenance from `prepared.uploadedImages` (round 1):
//     rejected — that list only records `inputs.image` values recognized as
//     a LOCAL app path, so an override pointing at an already-uploaded
//     ComfyUI-native filename was invisible to it entirely.
//   - Comparing image `(Input)` nodes plus only their DIRECT consumers,
//     via whole-node equality (round 2): rejected on TWO counts — (a) a
//     redirection further down the chain (LoadImage -> Resize -> Video,
//     with only the Resize -> Video link changed) kept the image node and
//     its immediate consumer both intact, so the check missed it entirely;
//     (b) once fixed to walk the full transitive chain, comparing each
//     chain node's WHOLE object broke legitimate overrides of that same
//     node's UNRELATED fields (e.g. overriding the
//     video-generation node's `duration`/`seed` — which sits directly on
//     the node that also consumes the image — incorrectly refused a
//     harmless edit that never touched the image connection at all).
//
// This version follows the CANONICAL graph's full transitive consumer
// chain, but distinguishes what it compares by role:
//   - The image `(Input)` ROOT nodes themselves (the board's / casting
//     references' own LoadImage-equivalent nodes) are compared WHOLE —
//     these nodes exist only to hold an image, so their entire content is
//     provenance-relevant.
//   - Every DOWNSTREAM node in the chain (found by walking "who has a link
//     pointing at a node already in the chain", at any depth, through any
//     number of intermediate nodes and any branching factor) is compared
//     ONLY on the specific link field(s) that connect it to its upstream
//     chain neighbor — its other fields (resize dimensions, seed, duration,
//     prompt, ...) remain freely override-able, exactly as the ticket
//     requires for overrides unrelated to images.
// A defensive second pass recomputes the same reachable-node-id set from
// the FINAL graph and requires it to be identical to the canonical one,
// catching a node spliced into or removed from the chain even in the rare
// case every individually-compared link still matched.
//
// No override at all (`patchedJsonOverride` absent) is always a no-op:
// `finalPatchedJson` is then the exact same object as `builtPatchedJson`,
// so every check below trivially passes.
// ---------------------------------------------------------------------------

export type ImageProvenanceValidation = { ok: true } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural deep-equal — NEVER JSON.stringify comparison, which is sensitive to key insertion order and would false-positive on a harmless override that happens to rewrite keys in a different order with identical values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Every `{key, link}` where `inputs[key]` is a ComfyUI link
 * `[nodeId, outputIndex]` pointing directly at `targetNodeId` — sorted by
 * key so comparison is never order-sensitive. `link` keeps the FULL tuple
 * (including `outputIndex`, and anything beyond it), never just the node
 * id: a workflow can legitimately have a multi-output node, where
 * `["6", 0]` and `["6", 1]` are two DIFFERENT images — comparing node ids
 * alone would treat an override that silently swaps which output feeds the
 * chain as unchanged.
 */
function linksPointingAt(node: unknown, targetNodeId: string): { key: string; link: unknown }[] {
  if (!isRecord(node)) return [];
  const inputs = node["inputs"];
  if (!isRecord(inputs)) return [];
  const links: { key: string; link: unknown }[] = [];
  for (const [key, value] of Object.entries(inputs)) {
    if (Array.isArray(value) && value.length >= 1 && value[0] === targetNodeId) {
      links.push({ key, link: value });
    }
  }
  return links.sort((a, b) => a.key.localeCompare(b.key));
}

/** Every node id that has a ComfyUI link `[targetNodeId, outputIndex]` in ANY of its `inputs` values, pointing directly at `targetNodeId`. Scans every input key generically — never assumes the link lives under a key literally named "image". */
function findDirectConsumers(json: Record<string, unknown>, targetNodeId: string): string[] {
  const consumers: string[] = [];
  for (const [nodeId, node] of Object.entries(json)) {
    if (!isRecord(node)) continue;
    const inputs = node["inputs"];
    if (!isRecord(inputs)) continue;
    for (const value of Object.values(inputs)) {
      if (Array.isArray(value) && value.length >= 1 && value[0] === targetNodeId) {
        consumers.push(nodeId);
        break;
      }
    }
  }
  return consumers;
}

/** BFS over the "who consumes me, directly or transitively" relation, starting from `startNodeIds` — the full downstream chain an image `(Input)` node's value can reach, at any depth, through any number of intermediate nodes and any branching factor. */
function transitiveConsumerChain(json: Record<string, unknown>, startNodeIds: string[]): Set<string> {
  const visited = new Set<string>(startNodeIds);
  const queue = [...startNodeIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const consumer of findDirectConsumers(json, current)) {
      if (!visited.has(consumer)) {
        visited.add(consumer);
        queue.push(consumer);
      }
    }
  }
  return visited;
}

/**
 * Validates that the ENTIRE downstream connection chain from every
 * image-relevant root node is unchanged between the canonically-built
 * payload and the final payload actually being queued — at any depth,
 * through any number of intermediate nodes, on any branch. Root nodes are
 * compared whole; downstream chain nodes are compared only on their link
 * to the upstream neighbor, leaving unrelated fields (duration, seed,
 * resize params, ...) freely override-able. `imageRelevantNodeIds` should
 * include every declared image `(Input)` node id plus, when Dynamic Batch
 * is active, every expanded clone id — comparing more roots than strictly
 * necessary is always safe (only ever produces an extra, still-correct
 * refusal), never unsafe.
 */
export function validateImageProvenanceUnchanged(
  builtPatchedJson: Record<string, unknown>,
  finalPatchedJson: Record<string, unknown>,
  imageRelevantNodeIds: string[]
): ImageProvenanceValidation {
  // 1. Root image nodes: whole-node equality — these nodes exist only to
  // hold an image, so their entire content is provenance-relevant.
  for (const nodeId of imageRelevantNodeIds) {
    if (!deepEqual(builtPatchedJson[nodeId], finalPatchedJson[nodeId])) {
      return {
        ok: false,
        error: `Image input node "${nodeId}" was changed by the override — the Sequence Storyboard board and casting references must reach the workflow exactly as computed. Remove this change, or generate again without an override.`,
      };
    }
  }

  // 2. Walk the canonical (built) graph's transitive consumer chain
  // hop-by-hop. At each hop, only the specific link field(s) connecting a
  // consumer to its upstream chain neighbor must match — the consumer's
  // other fields remain free to differ.
  const visited = new Set<string>(imageRelevantNodeIds);
  const queue = [...imageRelevantNodeIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const consumerId of findDirectConsumers(builtPatchedJson, current)) {
      const builtLinks = linksPointingAt(builtPatchedJson[consumerId], current);
      const finalLinks = linksPointingAt(finalPatchedJson[consumerId], current);
      if (!deepEqual(builtLinks, finalLinks)) {
        return {
          ok: false,
          error: `Node "${consumerId}"'s connection to the Sequence Storyboard board's/casting references' chain (via node "${current}") was changed by the override — refusing to queue an ambiguous image routing. Remove this change, or generate again without an override.`,
        };
      }
      if (!visited.has(consumerId)) {
        visited.add(consumerId);
        queue.push(consumerId);
      }
    }
  }

  // 3. Defensive second pass: recompute the same reachable node-id set
  // from the FINAL graph. A node spliced into or removed from the chain is
  // caught here even in the rare case every individually-compared link
  // above still matched.
  const finalChain = transitiveConsumerChain(finalPatchedJson, imageRelevantNodeIds);
  if (!setsEqual(visited, finalChain)) {
    return {
      ok: false,
      error: `The connection chain from the Sequence Storyboard board or a casting reference changed shape after the override — refusing to queue an ambiguous image routing. Remove this change, or generate again without an override.`,
    };
  }

  return { ok: true };
}
