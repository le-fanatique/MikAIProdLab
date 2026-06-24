import type { LLMPrompt } from "@/types/llm";

export interface OutlineSection {
  title: string;
  body: string;
}

interface SequencesFromOutlineContext {
  name: string;
  pitch: string | null;
  story: string | null;
  outline: string | null;
  targetCount?: number | null;
  sectionCount?: number | null;
  outlineSections?: OutlineSection[];
}

const JSON_SCHEMA = `Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`;

export function buildSequencesFromOutlinePrompt(
  input: SequencesFromOutlineContext
): LLMPrompt {
  const hasOutline = !!input.outline?.trim();

  // ── PATH A: Outline present ───────────────────────────────────────────────
  if (hasOutline) {
    const countInstruction =
      input.targetCount != null
        ? `Produce exactly ${input.targetCount} sequences. When grouping sections: concatenate or lightly condense their bodies for \`summary\`. When splitting: use the relevant portion of the source body.`
        : input.sectionCount != null
        ? `The outline contains ${input.sectionCount} sections. Generate exactly ${input.sectionCount} sequences, one per "## " section. Do not merge or split sections.`
        : "Produce one sequence per ## section in the outline. Do not merge or split sections.";

    const bgParts: string[] = [];
    if (input.pitch?.trim()) bgParts.push(`Pitch: ${input.pitch}`);
    if (input.story?.trim()) bgParts.push(`Story (background only): ${input.story.slice(0, 400)}`);
    const bgBlock = bgParts.length > 0 ? `\n\nBackground context (do not override the outline):\n${bgParts.join("\n")}` : "";

    // When sections are parsed server-side, emit an explicit per-section breakdown
    // so the LLM has zero ambiguity about what maps to title and summary.
    const sectionsBlock =
      input.outlineSections && input.outlineSections.length > 0
        ? input.outlineSections
            .map(
              (s, i) =>
                `Section ${String(i + 1).padStart(2, "0")}\n` +
                `Title (copy verbatim into "title"): ${s.title}\n` +
                `Body (copy verbatim into "summary"): ${s.body || "(empty)"}`
            )
            .join("\n\n")
        : null;

    const userContent = sectionsBlock
      ? `Project: ${input.name}${bgBlock}\n\nOutline sections (primary source):\n\n${sectionsBlock}\n\nFor each section: set \`title\` = the Title above, set \`summary\` = the Body above verbatim. Infer \`description\`, \`narrative_purpose\`, \`mood\`, and \`location_hint\` from the section body. Do not paraphrase the summary.`
      : `Project: ${input.name}${bgBlock}\n\nProject Outline (primary source — map this into sequences):\n${input.outline}\n\nFor each "## " section: set \`title\` = the header text without "## ", set \`summary\` = the section body verbatim. Do not paraphrase the summary.`;

    return {
      system: `You are a professional film production designer and story structure expert.
Your task is to convert a Project Outline into a list of production sequences.

RULES:
- Each "## " section maps to exactly one sequence (unless targetCount requires grouping or splitting).
- \`title\` = the section header text, verbatim, without the "## " prefix.
- \`summary\` = the section body text, verbatim. Do not summarize, paraphrase, or shorten it.
- \`description\` = enriched production narrative, inferred from the section content.
- \`narrative_purpose\`, \`mood\`, \`location_hint\` = inferred from the section content.
- Do not invent characters, locations, or events not present in the outline.
- Do not use pitch or story to override outline content.
- ${countInstruction}

${JSON_SCHEMA}`,

      user: userContent,
    };
  }

  // ── PATH B: Outline absent — fallback to pitch/story ─────────────────────
  const countInstruction =
    input.targetCount != null
      ? `Produce exactly ${input.targetCount} sequences.`
      : "Choose a natural number of sequences based on the story structure (typically 4 to 8).";

  const contextLines: string[] = [`Project: ${input.name}`];
  if (input.pitch?.trim()) contextLines.push(`Pitch: ${input.pitch}`);
  if (input.story?.trim()) contextLines.push(`Story: ${input.story}`);

  return {
    system: `You are a professional film production designer and story structure expert.
The project outline is not yet available. Generate production sequences from the project pitch and story instead.
${countInstruction}

${JSON_SCHEMA}`,

    user: `${contextLines.join("\n")}

Break this project into production sequences.`,
  };
}
