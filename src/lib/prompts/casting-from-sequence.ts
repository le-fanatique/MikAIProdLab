import type { LLMPrompt } from "@/types/llm";

interface CastingFromSequenceInput {
  project: {
    name: string;
    pitch: string | null;
    story?: string | null;
    outline?: string | null;
  };
  sequence: {
    id: number;
    title: string;
    summary: string | null;
    description: string | null;
    narrativePurpose: string | null;
    mood: string | null;
    locationHint: string | null;
  };
  shots: Array<{
    id: number;
    shotCode: string | null;
    title: string;
    description: string | null;
    actionPitch: string | null;
    continuityIn: string | null;
    continuityOut: string | null;
  }>;
  assets: Array<{
    id: number;
    name: string;
    type: string;
    description: string | null;
    notes: string | null;
  }>;
  existingShotCastings: Array<{
    shotId: number;
    assetId: number;
  }>;
  existingSequenceCastings: Array<{
    assetId: number;
  }>;
  includeSequenceLevel: boolean;
}

const JSON_SCHEMA = (includeSeq: boolean) =>
  `Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "${includeSeq ? "shot | sequence" : "shot"}",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`;

export function buildCastingFromSequencePrompt(
  input: CastingFromSequenceInput
): LLMPrompt {
  const { includeSequenceLevel } = input;

  // ── System ────────────────────────────────────────────────────────────────
  const system = `You are a casting director and production supervisor for the project "${input.project.name}".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots${includeSequenceLevel ? " and optionally into the sequence itself" : ""}.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.${
    includeSequenceLevel
      ? "\n- Sequence-level casting: use targetType=\"sequence\" and targetId=" +
        input.sequence.id +
        " only for assets that are thematically relevant to the full sequence (e.g., the main character or primary location)."
      : ""
  }
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

${JSON_SCHEMA(includeSequenceLevel)}`;

  // ── User message ──────────────────────────────────────────────────────────
  const parts: string[] = [];

  // Project background
  const bgLines: string[] = [`Project: ${input.project.name}`];
  if (input.project.pitch?.trim()) bgLines.push(`Pitch: ${input.project.pitch.trim()}`);
  if (input.project.story?.trim()) {
    bgLines.push(`Story (background): ${input.project.story.trim().slice(0, 200)}`);
  }
  if (input.project.outline?.trim()) {
    bgLines.push(`Outline (background): ${input.project.outline.trim().slice(0, 200)}`);
  }
  parts.push(bgLines.join("\n"));

  // Sequence context
  const seqLines: string[] = [
    `SEQUENCE [ID: ${input.sequence.id}]: ${input.sequence.title}`,
  ];
  if (input.sequence.summary) seqLines.push(`Summary: ${input.sequence.summary}`);
  if (input.sequence.description) seqLines.push(`Description: ${input.sequence.description}`);
  if (input.sequence.narrativePurpose) seqLines.push(`Purpose: ${input.sequence.narrativePurpose}`);
  if (input.sequence.mood) seqLines.push(`Mood: ${input.sequence.mood}`);
  if (input.sequence.locationHint) seqLines.push(`Location: ${input.sequence.locationHint}`);
  parts.push(seqLines.join("\n"));

  // Asset library
  const assetLines = input.assets.slice(0, 30).map((a) => {
    const desc = a.description?.trim().slice(0, 150) ?? null;
    const notes = a.notes?.trim().slice(0, 80) ?? null;
    const detail = [desc, notes].filter(Boolean).join(" | ");
    return `[ASSET ID: ${a.id}] ${a.name} — ${a.type}${detail ? ` — ${detail}` : ""}`;
  });
  parts.push(`ASSET LIBRARY:\n${assetLines.join("\n")}`);

  // Shots
  const shotLines = input.shots.slice(0, 15).map((s) => {
    const label = s.shotCode ? `${s.shotCode} — ${s.title}` : s.title;
    const details: string[] = [];
    if (s.description) details.push(s.description.slice(0, 120));
    if (s.actionPitch) details.push(`Action: ${s.actionPitch.slice(0, 120)}`);
    if (s.continuityIn) details.push(`In: ${s.continuityIn.slice(0, 60)}`);
    if (s.continuityOut) details.push(`Out: ${s.continuityOut.slice(0, 60)}`);
    const detail = details.join(" | ");
    return `[SHOT ID: ${s.id}] ${label}${detail ? ` — ${detail}` : ""}`;
  });
  parts.push(`SHOTS:\n${shotLines.join("\n")}`);

  // Existing castings (anti-duplicate)
  const existingLines: string[] = [];
  for (const c of input.existingShotCastings) {
    existingLines.push(`Shot ${c.shotId} ← Asset ${c.assetId}`);
  }
  for (const c of input.existingSequenceCastings) {
    existingLines.push(`Sequence ${input.sequence.id} ← Asset ${c.assetId}`);
  }
  if (existingLines.length > 0) {
    parts.push(
      `ALREADY ASSIGNED (do not suggest these again):\n${existingLines.join("\n")}`
    );
  }

  const targetInstruction = includeSequenceLevel
    ? `Suggest which assets should be cast into each shot. You may also suggest sequence-level castings (targetType="sequence", targetId=${input.sequence.id}) for assets that are central to the whole sequence.`
    : "Suggest which assets should be cast into each shot.";

  const user =
    parts.join("\n\n") +
    `\n\n${targetInstruction} Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.`;

  return { system, user };
}
