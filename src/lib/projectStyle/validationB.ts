// ---------------------------------------------------------------------------
// validationB.ts — STYLE.1.B.CORE
//
// Runtime validators for Project Style Reference Images and Creative
// Influence dossiers. Same rationale as validation.ts (STYLE.1.A): every
// Server Action here is a real network boundary a forged request can hit
// with any JSON body, and Drizzle's `text(..., { enum: [...] })` column type
// emits no SQL CHECK constraint — an unvalidated write can silently persist
// an out-of-enum value. Every mutating action in projectStyleReferences.ts /
// projectStyleInfluences.ts must run these checks BEFORE any DB or
// filesystem work and refuse (English error, zero mutation) on failure.
// ---------------------------------------------------------------------------

export const REFERENCE_CONSUMERS = ["asset", "storyboard", "image", "video", "shot"] as const;
export type ReferenceConsumer = (typeof REFERENCE_CONSUMERS)[number];

export const INFLUENCE_SUBJECT_TYPES = ["person", "studio", "work", "movement"] as const;
export type InfluenceSubjectType = (typeof INFLUENCE_SUBJECT_TYPES)[number];

export const INFLUENCE_DOMAIN_WEIGHTS = ["primary", "supporting", "accent"] as const;
export type InfluenceDomainWeight = (typeof INFLUENCE_DOMAIN_WEIGHTS)[number];

export const INFLUENCE_STATUSES = ["draft", "approved"] as const;
export type InfluenceStatus = (typeof INFLUENCE_STATUSES)[number];

const MAX_ID = 2_147_483_647;
const MAX_SHORT_TEXT = 500;
const MAX_LONG_TEXT = 20_000;
const MAX_DOMAIN_TEXT = 200;
const MAX_URL_LENGTH = 2048;

export function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_ID;
}

export function isValidConsumer(value: unknown): value is ReferenceConsumer {
  return typeof value === "string" && (REFERENCE_CONSUMERS as readonly string[]).includes(value);
}

export function isValidSubjectType(value: unknown): value is InfluenceSubjectType {
  return typeof value === "string" && (INFLUENCE_SUBJECT_TYPES as readonly string[]).includes(value);
}

export function isValidDomainWeight(value: unknown): value is InfluenceDomainWeight {
  return typeof value === "string" && (INFLUENCE_DOMAIN_WEIGHTS as readonly string[]).includes(value);
}

export function isValidInfluenceStatus(value: unknown): value is InfluenceStatus {
  return typeof value === "string" && (INFLUENCE_STATUSES as readonly string[]).includes(value);
}

/** A required short free-text field (label, subject name, ...): a real string, non-empty after trim, bounded length. */
export function isValidRequiredShortText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_SHORT_TEXT;
}

/** An optional short free-text field: null, or a string within the length bound (may be empty — the caller normalizes empty-after-trim to null). */
export function isValidOptionalShortText(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= MAX_SHORT_TEXT);
}

/** An optional long free-text field (What interests me / What to avoid / research notes / provenance notes). */
export function isValidOptionalLongText(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= MAX_LONG_TEXT);
}

/** An optional manual source URL. Only http(s) accepted — never a free scheme (file:, javascript:, data:, ...). Rejects malformed URLs outright rather than storing them as opaque text. */
export function isValidOptionalUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normalizes a domain string: trim, collapse internal whitespace to a single space. Returns null for an empty/whitespace-only value — the caller must reject a null domain in a context that requires one. */
export function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0 || collapsed.length > MAX_DOMAIN_TEXT) return null;
  return collapsed;
}

/** Normalizes an optional free-text field: trim, empty-after-trim becomes null. */
export function normalizeOptionalText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Case-insensitive duplicate check across a list of domain strings — "Lighting" and "lighting" collide even though the DB unique index is case-sensitive on the stored (already-normalized-casing) value. */
export function hasCaseInsensitiveDuplicates(domains: string[]): boolean {
  const seen = new Set<string>();
  for (const d of domains) {
    const key = d.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export type ReferenceDomainInput = { domain: string };
export type ReferenceConsumerInput = { consumer: ReferenceConsumer };
export type InfluenceDomainInput = { domain: string; weight: InfluenceDomainWeight };

/** Validates and normalizes a raw domain-list payload. Returns null if any entry is malformed or the set contains a case-insensitive duplicate. */
export function validateDomainList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const normalized: string[] = [];
  for (const entry of raw) {
    const domain = normalizeDomain(entry);
    if (!domain) return null;
    normalized.push(domain);
  }
  if (hasCaseInsensitiveDuplicates(normalized)) return null;
  return normalized;
}

/** Validates and normalizes a raw consumer-list payload. Returns null if any entry is not a recognized consumer or the set contains a duplicate. */
export function validateConsumerList(raw: unknown): ReferenceConsumer[] | null {
  if (!Array.isArray(raw)) return null;
  const normalized: ReferenceConsumer[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isValidConsumer(entry) || seen.has(entry)) return null;
    seen.add(entry);
    normalized.push(entry);
  }
  return normalized;
}

/** Validates and normalizes a raw weighted-domain-list payload (Creative Influence domains). Returns null if any entry is malformed or the domain set has a case-insensitive duplicate. */
export function validateInfluenceDomainList(
  raw: unknown
): { domain: string; weight: InfluenceDomainWeight }[] | null {
  if (!Array.isArray(raw)) return null;
  const normalized: { domain: string; weight: InfluenceDomainWeight }[] = [];
  const domainKeys: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { domain: rawDomain, weight } = entry as { domain?: unknown; weight?: unknown };
    const domain = normalizeDomain(rawDomain);
    if (!domain || !isValidDomainWeight(weight)) return null;
    normalized.push({ domain, weight });
    domainKeys.push(domain);
  }
  if (hasCaseInsensitiveDuplicates(domainKeys)) return null;
  return normalized;
}

/** Validates a raw reference-id list (e.g. supporting references for an influence). Returns null if any entry is not a valid id or the set contains a duplicate. */
export function validateIdList(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const normalized: number[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    if (!isValidId(entry) || seen.has(entry)) return null;
    seen.add(entry);
    normalized.push(entry);
  }
  return normalized;
}
