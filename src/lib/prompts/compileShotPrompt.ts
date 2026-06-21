export type ShotPromptCompileKind = "image" | "video";

export type CompileShotPromptInput = {
  kind: ShotPromptCompileKind;
  shotPrompt?: string | null;
  compiledPromptSegments?: string | null;
  hasPromptSegments?: boolean;
};

export type CompiledShotPrompt = {
  text: string;
  hasShotPrompt: boolean;
  hasPromptSegments: boolean;
  usedTimeline: boolean;
  warnings: string[];
};

export function compileShotPrompt(input: CompileShotPromptInput): CompiledShotPrompt {
  const shotPrompt = input.shotPrompt?.trim() ?? "";
  const compiledPromptSegments = input.compiledPromptSegments?.trim() ?? "";
  const hasPromptSegments = Boolean(input.hasPromptSegments);
  const warnings: string[] = [];

  if (!shotPrompt) {
    warnings.push("Shot Prompt is empty.");
  }

  const shouldUseTimeline =
    input.kind === "video" && hasPromptSegments && Boolean(compiledPromptSegments);

  if (shouldUseTimeline) {
    const text = [shotPrompt, `Timeline:\n${compiledPromptSegments}`]
      .filter(Boolean)
      .join("\n\n");

    return {
      text,
      hasShotPrompt: Boolean(shotPrompt),
      hasPromptSegments: true,
      usedTimeline: true,
      warnings,
    };
  }

  return {
    text: shotPrompt,
    hasShotPrompt: Boolean(shotPrompt),
    hasPromptSegments,
    usedTimeline: false,
    warnings,
  };
}
