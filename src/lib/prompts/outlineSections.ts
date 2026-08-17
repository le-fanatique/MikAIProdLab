import type { OutlineSection } from "./sequences-from-outline";

// ---------------------------------------------------------------------------
// outlineSections.ts — LLMW.POSTRESPONSE.1 (B7g)
//
// `parseOutlineSections`, extracted verbatim — character for character —
// from `src/actions/llm/sequenceGeneration.ts`'s own local function of the
// same name. Two callers now import this single implementation instead of
// each keeping their own copy: `sequenceGeneration.ts` (unchanged
// behaviour) and `src/lib/llmWorkspace/variables/registry.ts`'s
// `PROJECT.OUTLINE_SECTIONS` resolver, which needs the same parsed sections
// both to reproduce `buildSequencesFromOutlinePrompt`'s Path A branches and
// to feed `sequences.fromOutline`'s post-response form.
// ---------------------------------------------------------------------------

export function parseOutlineSections(outline: string): OutlineSection[] {
  const sections: OutlineSection[] = [];
  const lines = outline.split("\n");
  let currentTitle: string | null = null;
  const currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle !== null) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
        currentBody.length = 0;
      }
      currentTitle = line.slice(3).trim();
    } else if (currentTitle !== null) {
      currentBody.push(line);
    }
  }
  if (currentTitle !== null) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }
  return sections;
}
