import type { LLMPrompt } from "@/types/llm";

type AssetType = "character" | "environment" | "prop" | "vehicle" | "crowd" | "other";

interface AssetsFromProjectInput {
  project: {
    name: string;
    pitch: string | null;
    story: string | null;
    outline: string | null;
  };
  sequences: Array<{
    title: string;
    summary: string | null;
    description: string | null;
    narrativePurpose: string | null;
    mood: string | null;
    locationHint: string | null;
  }>;
  shots?: Array<{
    title: string;
    description: string | null;
    actionPitch: string | null;
    continuityIn: string | null;
    continuityOut: string | null;
  }>;
  existingAssets: Array<{
    name: string;
    type: string;
  }>;
  includeShots: boolean;
  assetTypes: AssetType[];
}

const JSON_SCHEMA = `Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`;

export function buildAssetsFromProjectPrompt(input: AssetsFromProjectInput): LLMPrompt {
  const typesStr = input.assetTypes.join(", ");
  const hasOutline = !!input.project.outline?.trim();

  const system = `You are a production asset supervisor and art department coordinator for the project "${input.project.name}".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: ${typesStr}

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of ${typesStr}
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

${JSON_SCHEMA}`;

  // ── Build user message ──────────────────────────────────────────────────

  const parts: string[] = [];

  // Project background
  const bgLines: string[] = [`Project: ${input.project.name}`];
  if (input.project.pitch?.trim()) {
    bgLines.push(`Pitch: ${input.project.pitch.trim()}`);
  }
  if (!hasOutline && input.project.story?.trim()) {
    bgLines.push(`Story: ${input.project.story.trim().slice(0, 400)}`);
  }
  parts.push(bgLines.join("\n"));

  // Outline (primary source if present)
  if (hasOutline) {
    parts.push(`PROJECT OUTLINE (primary narrative source):\n${input.project.outline!.trim().slice(0, 1500)}`);
  } else if (input.project.story?.trim()) {
    parts.push(`PROJECT STORY (use as narrative background):\n${input.project.story.trim().slice(0, 400)}`);
  }

  // Sequences
  if (input.sequences.length > 0) {
    const seqLines: string[] = [];
    for (const seq of input.sequences) {
      const line: string[] = [`- ${seq.title}`];
      if (seq.summary) line.push(`Summary: ${seq.summary}`);
      if (seq.description) line.push(`Description: ${seq.description}`);
      if (seq.narrativePurpose) line.push(`Purpose: ${seq.narrativePurpose}`);
      if (seq.mood) line.push(`Mood: ${seq.mood}`);
      if (seq.locationHint) line.push(`Location: ${seq.locationHint}`);
      seqLines.push(line.join(" | "));
    }
    const seqBlock = `SEQUENCES:\n${seqLines.join("\n")}`;
    parts.push(seqBlock.slice(0, 2000));
  }

  // Shots (optional)
  if (input.includeShots && input.shots && input.shots.length > 0) {
    const shotLines: string[] = [];
    for (const shot of input.shots) {
      const line: string[] = [`- ${shot.title}`];
      if (shot.description) line.push(shot.description);
      if (shot.actionPitch) line.push(`Action: ${shot.actionPitch}`);
      if (shot.continuityIn) line.push(`In: ${shot.continuityIn}`);
      if (shot.continuityOut) line.push(`Out: ${shot.continuityOut}`);
      shotLines.push(line.join(" | "));
    }
    const shotBlock = `SHOTS:\n${shotLines.join("\n")}`;
    parts.push(shotBlock.slice(0, 1500));
  }

  // Existing assets (duplicate detection)
  if (input.existingAssets.length > 0) {
    const existingLines = input.existingAssets
      .map((a) => `- ${a.name} (${a.type})`)
      .join("\n");
    parts.push(`EXISTING ASSETS (for duplicate detection — do not re-create these unless significantly different):\n${existingLines}`);
  }

  const user =
    parts.join("\n\n") +
    `\n\nExtract up to 20 production assets from the above narrative material. Asset types to include: ${typesStr}.`;

  return { system, user };
}
