import type { LLMPrompt } from "@/types/llm";

export type AssetDescriptionFromContextInput = {
  project: {
    name: string;
    pitch: string | null;
    story: string | null;
    outline: string | null;
  };
  asset: {
    name: string;
    type: string;
    description: string | null;
    notes: string | null;
  };
  sequenceContexts: Array<{
    title: string;
    summary: string | null;
    mood: string | null;
    locationHint: string | null;
    narrativePurpose: string | null;
  }>;
  shotContexts: Array<{
    shotCode: string | null;
    title: string;
    description: string | null;
    actionPitch: string | null;
    cameraPitch: string | null;
  }>;
  refImageMeta: Array<{
    label: string | null;
    imageRole: string | null;
    sourceFilename?: string | null;
  }>;
  /**
   * STYLE.1.F.CORE — active Project Style, World & Design Language plus
   * Asset-applicable approved rules only (never Visual Treatment, see
   * buildAssetBibleFromContextPrompt). Omit entirely, or pass both segments
   * as "", when there is no active Style: the prompt below must then be
   * byte-for-byte identical to its pre-Style output.
   */
  style?: { worldSegment: string; rulesSegment: string };
};

const JSON_CONSTRAINT = `Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>", "notes_draft": "<narrative role, usage context, design constraints>" }
No markdown. No explanation. Only the JSON object.`;

/**
 * Shared context-line builder — reused, byte-for-byte, by the combined
 * Description+Notes prompt (batch flow, unchanged) and the two independent
 * single-field prompts below (UX.PRODUCTIVITY.POLISH.1 — Lot C). Never
 * mentions description_draft/notes_draft itself; only the caller's system
 * message and JSON-schema constraint differ per target field.
 */
function buildContextLines(input: AssetDescriptionFromContextInput): string[] {
  const lines: string[] = [];

  lines.push(`Project: ${input.project.name}`);
  if (input.project.pitch?.trim()) {
    lines.push(`Pitch: ${input.project.pitch.trim().slice(0, 200)}`);
  }
  if (input.project.story?.trim()) {
    lines.push(`Story: ${input.project.story.trim().slice(0, 300)}`);
  }
  if (input.project.outline?.trim()) {
    lines.push(`Outline: ${input.project.outline.trim().slice(0, 300)}`);
  }

  lines.push(`\nAsset: ${input.asset.name}`);
  lines.push(`Type: ${input.asset.type}`);
  if (input.asset.description?.trim()) {
    lines.push(`Current description: ${input.asset.description.trim()}`);
  } else {
    lines.push(`Current description: (none)`);
  }
  if (input.asset.notes?.trim()) {
    lines.push(`Current notes: ${input.asset.notes.trim()}`);
  }

  const seqCtx = input.sequenceContexts.slice(0, 5);
  if (seqCtx.length > 0) {
    lines.push(`\nSequences this asset appears in:`);
    for (const s of seqCtx) {
      const parts: string[] = [`- ${s.title}`];
      if (s.mood) parts.push(`mood: ${s.mood}`);
      if (s.locationHint) parts.push(`location: ${s.locationHint}`);
      if (s.narrativePurpose) parts.push(`purpose: ${s.narrativePurpose}`);
      if (s.summary) parts.push(`summary: ${s.summary.slice(0, 120)}`);
      lines.push(parts.join(" | "));
    }
  }

  const shotCtx = input.shotContexts.slice(0, 10);
  if (shotCtx.length > 0) {
    lines.push(`\nShots this asset appears in:`);
    for (const s of shotCtx) {
      const label = s.shotCode ? `${s.shotCode} — ${s.title}` : s.title;
      const parts: string[] = [`- ${label}`];
      if (s.description) parts.push(s.description.slice(0, 100));
      if (s.actionPitch) parts.push(`action: ${s.actionPitch.slice(0, 80)}`);
      if (s.cameraPitch) parts.push(`camera: ${s.cameraPitch.slice(0, 80)}`);
      lines.push(parts.join(" | "));
    }
  }

  const refMeta = input.refImageMeta.slice(0, 5);
  if (refMeta.length > 0) {
    const refSummary = refMeta
      .map((r) => r.label ?? r.sourceFilename ?? r.imageRole ?? null)
      .filter((v): v is string => v !== null);
    if (refSummary.length > 0) {
      lines.push(`\nReference images: ${refSummary.join(", ")}`);
    }
  }

  // STYLE.1.F.CORE — appended only when at least one segment is non-empty,
  // so a no-Style call produces the exact same `lines` array as before this
  // ticket (byte-for-byte compatibility requirement).
  const worldSegment = input.style?.worldSegment ?? "";
  const rulesSegment = input.style?.rulesSegment ?? "";
  const styleParts = [worldSegment, rulesSegment].filter((part) => part.length > 0);
  if (styleParts.length > 0) {
    lines.push(`\nProject Style:\n${styleParts.join("\n\n")}`);
  }

  return lines;
}

function styleRuleFor(input: AssetDescriptionFromContextInput): string {
  const worldSegment = input.style?.worldSegment ?? "";
  const rulesSegment = input.style?.rulesSegment ?? "";
  const hasStyle = [worldSegment, rulesSegment].some((part) => part.length > 0);
  return hasStyle
    ? "\n- A Project Style is provided below. Respect its World & Design Language and any listed rules; never contradict them."
    : "";
}

export function buildAssetDescriptionFromContextPrompt(
  input: AssetDescriptionFromContextInput
): LLMPrompt {
  const lines = buildContextLines(input);
  const styleRule = styleRuleFor(input);

  return {
    system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the description and notes for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
- If the asset already has a description or notes, improve and complete them — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.${styleRule}
${JSON_CONSTRAINT}`,
    user: `${lines.join("\n")}\n\nWrite or enrich the description and notes for "${input.asset.name}".`,
  };
}

const DESCRIPTION_JSON_CONSTRAINT = `Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>" }
No markdown. No explanation. Only the JSON object.`;

/**
 * UX.PRODUCTIVITY.POLISH.1 — Lot C. Independent single-field prompt: asks
 * the model for Description only, never Notes. Shares the exact same
 * context lines as the combined prompt above (`buildContextLines`), so the
 * batch flow (still using `buildAssetDescriptionFromContextPrompt`) is
 * completely unaffected by this addition.
 */
export function buildAssetDescriptionOnlyPrompt(input: AssetDescriptionFromContextInput): LLMPrompt {
  const lines = buildContextLines(input);
  const styleRule = styleRuleFor(input);

  return {
    system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the visual/production description for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- If the asset already has a description, improve and complete it — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.
- Do not write narrative role, usage context or design constraints — that belongs to Notes, which is not requested here.${styleRule}
${DESCRIPTION_JSON_CONSTRAINT}`,
    user: `${lines.join("\n")}\n\nWrite or enrich only the description for "${input.asset.name}".`,
  };
}

const NOTES_JSON_CONSTRAINT = `Always respond with a valid JSON object matching exactly this schema:
{ "notes_draft": "<narrative role, usage context, design constraints>" }
No markdown. No explanation. Only the JSON object.`;

/**
 * UX.PRODUCTIVITY.POLISH.1 — Lot C. Independent single-field prompt: asks
 * the model for Notes only, never Description. Shares the exact same
 * context lines as the combined prompt above.
 */
export function buildAssetNotesOnlyPrompt(input: AssetDescriptionFromContextInput): LLMPrompt {
  const lines = buildContextLines(input);
  const styleRule = styleRuleFor(input);

  return {
    system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the notes for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
- If the asset already has notes, improve and complete them — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.
- Do not write a visual/production description — that belongs to Description, which is not requested here.${styleRule}
${NOTES_JSON_CONSTRAINT}`,
    user: `${lines.join("\n")}\n\nWrite or enrich only the notes for "${input.asset.name}".`,
  };
}
