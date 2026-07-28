// ---------------------------------------------------------------------------
// structuralPrimitives.ts — STYLE.1.F.CORE (Retake Round 1)
//
// Shared by validateProposal.ts (the LLM proposal boundary) and
// applyValidation.ts (the public Apply Server Action boundary) — both are
// untrusted-JSON structural parsers over the same five-field shape, and
// Codex Round 1 flagged that Apply had no equivalent of the proposal
// parser's exact-key/prototype guards. Factored out once instead of
// duplicated a second time.
// ---------------------------------------------------------------------------

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return actual.every((k) => keys.includes(k));
}

export function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

export function isNonEmptyBoundedString(value: unknown, maxLength: number): value is string {
  return isBoundedString(value, maxLength) && value.trim().length > 0;
}
