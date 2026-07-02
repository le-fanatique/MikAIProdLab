/**
 * Nomenclature — code generation helpers for sequences and shots.
 *
 * Template syntax: prefix + numeric seed + X group
 *   "Sq_1XXX" → prefix="Sq_", seed=1, xCount=3, step=1000, firstNumber=1000
 *   "Sh_1XX"  → prefix="Sh_", seed=1, xCount=2, step=100,  firstNumber=100
 *
 * Scoping:
 *   - Sequence codes are scoped to a project.
 *   - Shot codes are scoped to a sequence.
 */

export const DEFAULT_SEQUENCE_TEMPLATE = "Sq_1XXX";
export const DEFAULT_SHOT_TEMPLATE = "Sh_1XX";

export interface ParsedTemplate {
  prefix: string;
  seedStr: string;
  seedValue: number;
  xCount: number;
  step: number;
  firstNumber: number;
  numberWidth: number;
}

/**
 * Parses a template string into its components.
 * Returns null if the template is invalid (no X group, or no numeric seed before X).
 */
export function parseTemplate(template: string): ParsedTemplate | null {
  // Match: anything (prefix), then digits (seed), then one or more X's — must end there
  const m = template.match(/^([\s\S]*?)(\d+)(X+)$/);
  if (!m) return null;

  const prefix = m[1];
  const seedStr = m[2];
  const xStr = m[3];
  const seedValue = parseInt(seedStr, 10);
  if (!Number.isFinite(seedValue) || seedValue <= 0) return null;

  const xCount = xStr.length;
  const step = seedValue * Math.pow(10, xCount);
  const numberWidth = seedStr.length + xCount;

  return {
    prefix,
    seedStr,
    seedValue,
    xCount,
    step,
    firstNumber: step,
    numberWidth,
  };
}

/**
 * Validates a template string. Returns an error message or null if valid.
 */
export function validateTemplate(template: string): string | null {
  const t = template.trim();
  if (!t) return "Template is required.";
  if (!/X/.test(t)) return "Template must contain at least one X.";
  const parsed = parseTemplate(t);
  if (!parsed) return "Template must have a numeric seed followed by X's (e.g. Sq_1XXX or Sh_1XX).";
  return null;
}

function formatCode(parsed: ParsedTemplate, num: number): string {
  return parsed.prefix + String(num).padStart(parsed.numberWidth, "0");
}

/**
 * Extracts the numeric value from a code that matches the template prefix.
 * Returns null if the code doesn't match or can't be parsed.
 */
function extractNumber(parsed: ParsedTemplate, code: string): number | null {
  if (!code.startsWith(parsed.prefix)) return null;
  const rest = code.slice(parsed.prefix.length);
  const n = parseInt(rest, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Generates the next code for the given template, based on existing codes in scope.
 * - Reads existing codes that match the template prefix.
 * - Takes the max + step.
 * - If that exact code already exists (collision), keeps incrementing by step.
 * - Codes that don't match the prefix are still checked for exact collision.
 */
export function generateNextCode(template: string, existingCodes: (string | null | undefined)[]): string {
  const parsed = parseTemplate(template);
  if (!parsed) return template; // invalid template, return as-is

  const { step, firstNumber } = parsed;

  const cleanCodes = existingCodes.filter((c): c is string => typeof c === "string" && c.trim() !== "");
  const existingSet = new Set(cleanCodes);

  // Extract numbers from codes matching this prefix
  const nums = cleanCodes
    .map((c) => extractNumber(parsed, c))
    .filter((n): n is number => n !== null);

  let nextNum = nums.length > 0 ? Math.max(...nums) + step : firstNumber;

  // Collision safety: increment until we find a free slot
  let safety = 0;
  while (existingSet.has(formatCode(parsed, nextNum)) && safety < 1000) {
    nextNum += step;
    safety++;
  }

  return formatCode(parsed, nextNum);
}

/**
 * Generates `count` sequential codes for the given template, based on existing codes.
 * Each generated code is added to the working set before computing the next,
 * so codes within the batch don't collide with each other.
 */
export function generateSequentialCodes(
  template: string,
  existingCodes: (string | null | undefined)[],
  count: number
): string[] {
  const working = [...existingCodes];
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    const next = generateNextCode(template, working);
    result.push(next);
    working.push(next);
  }

  return result;
}
