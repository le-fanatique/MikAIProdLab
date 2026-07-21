// COMFY.PROVIDER.1 — the ComfyUI runtime provider a job/setting refers to.
// Pure: no I/O, no imports. Kept separate from src/lib/settings.ts so both
// that module and generation_jobs consumers share one canonical type/parser
// without a circular import (settings.ts imports this type; this file never
// imports settings.ts).

export type RuntimeProvider = "local" | "cloud";

export function isRuntimeProvider(value: unknown): value is RuntimeProvider {
  return value === "local" || value === "cloud";
}

/** Strict: anything other than the literal string "cloud" is "local" — the safe, existing-behavior default. */
export function normalizeRuntimeProvider(value: string | null | undefined): RuntimeProvider {
  return value === "cloud" ? "cloud" : "local";
}
