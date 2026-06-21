export function buildDefaultShotPromptProposal(input: {
  description?: string | null;
  actionPitch?: string | null;
  cameraPitch?: string | null;
}): string {
  return [input.description, input.actionPitch, input.cameraPitch]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function resolveShotPromptWithDefault(input: {
  shotPrompt?: string | null;
  description?: string | null;
  actionPitch?: string | null;
  cameraPitch?: string | null;
}): string | null {
  const existing = input.shotPrompt?.trim();
  if (existing) return existing;
  const proposal = buildDefaultShotPromptProposal({
    description: input.description,
    actionPitch: input.actionPitch,
    cameraPitch: input.cameraPitch,
  });
  return proposal || null;
}
