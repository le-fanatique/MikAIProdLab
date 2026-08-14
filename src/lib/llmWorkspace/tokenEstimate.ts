// ---------------------------------------------------------------------------
// tokenEstimate.ts — LLMW.BENCH.READ.1 (B6b), §6
//
// No tokenizer is a dependency of this repository, and this ticket
// authorizes none. `estimateTokens` is the crude approximation the bench
// displays next to the exact character count ("~1 240 tokens (est.)") — it
// must never be presented as a measurement.
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
