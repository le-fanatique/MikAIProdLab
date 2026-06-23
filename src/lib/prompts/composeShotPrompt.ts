import type { CompiledPrompt } from "@/lib/prompts/compilePromptSegments";

export type ShotComposerShot = {
  shotCode: string | null;
  title: string;
  durationSeconds: number | null;
  description: string | null;
  actionPitch: string | null;
  cameraPitch: string | null;
  framing: string | null;
  cameraMovement: string | null;
};

export type ShotComposerSequence = {
  title: string;
  mood: string | null;
  locationHint: string | null;
};

export type ShotComposerProject = {
  name: string;
};

export type ShotComposerCastAsset = {
  name: string;
  type: string;
  description: string | null;
};

export type ShotComposerRefImage = {
  imageRole: string | null;
  label: string | null;
  sourceFilename: string | null;
};

export type ShotComposerAssetRefImage = {
  assetName: string;
  assetType: string;
  imageRole: string | null;
  label: string | null;
  sourceFilename: string | null;
};

export type ShotComposerInput = {
  project: ShotComposerProject;
  sequence: ShotComposerSequence;
  shot: ShotComposerShot;
  castAssets: ShotComposerCastAsset[];
  compiledPrompt: CompiledPrompt;
  shotRefImages: ShotComposerRefImage[];
  castAssetRefImages: ShotComposerAssetRefImage[];
};

export type ComposedShotPromptSection = {
  title: string;
  content: string;
};

export type ComposedShotPrompt = {
  sections: ComposedShotPromptSection[];
  text: string;
  hasContent: boolean;
  warnings: string[];
};

function notEmpty(s: string | null | undefined): string | null {
  const t = s?.trim() ?? "";
  return t.length > 0 ? t : null;
}

function imageLabel(
  label: string | null,
  sourceFilename: string | null,
  imageRole: string | null
): string | null {
  return notEmpty(label) ?? notEmpty(sourceFilename) ?? notEmpty(imageRole);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function composeShotPrompt(input: ShotComposerInput): ComposedShotPrompt {
  const sections: ComposedShotPromptSection[] = [];
  const warnings: string[] = [];

  // Context — always present
  const shotLabel = input.shot.shotCode
    ? `${input.shot.shotCode} — ${input.shot.title}`
    : input.shot.title;
  const durationSuffix =
    input.shot.durationSeconds != null ? ` (${input.shot.durationSeconds}s)` : "";
  sections.push({
    title: "Context",
    content: [
      `Project: ${input.project.name}`,
      `Sequence: ${input.sequence.title}`,
      `Shot: ${shotLabel}${durationSuffix}`,
    ].join("\n"),
  });

  // Shot Intent
  const intentLines: string[] = [];
  const desc = notEmpty(input.shot.description);
  const action = notEmpty(input.shot.actionPitch);
  const camIntent = notEmpty(input.shot.cameraPitch);
  if (desc) intentLines.push(`Description: ${desc}`);
  if (action) intentLines.push(`Action: ${action}`);
  if (camIntent) intentLines.push(`Camera Intent: ${camIntent}`);
  if (intentLines.length > 0) {
    sections.push({ title: "Shot Intent", content: intentLines.join("\n") });
  }

  // Visual Context
  const visualLines: string[] = [];
  const mood = notEmpty(input.sequence.mood);
  const location = notEmpty(input.sequence.locationHint);
  if (mood) visualLines.push(`Mood: ${mood}`);
  if (location) visualLines.push(`Location: ${location}`);
  if (visualLines.length > 0) {
    sections.push({ title: "Visual Context", content: visualLines.join("\n") });
  }

  // Camera
  const cameraLines: string[] = [];
  const framing = notEmpty(input.shot.framing);
  const movement = notEmpty(input.shot.cameraMovement);
  if (framing) cameraLines.push(`Framing: ${framing}`);
  if (movement) cameraLines.push(`Movement: ${movement}`);
  if (cameraLines.length > 0) {
    sections.push({ title: "Camera", content: cameraLines.join("\n") });
  }

  // Cast
  if (input.castAssets.length === 0) {
    warnings.push("No cast assigned to this shot.");
  } else {
    const castLines = input.castAssets.map((asset) => {
      const assetDesc = notEmpty(asset.description);
      return assetDesc
        ? `[${capitalize(asset.type)}] ${asset.name} — ${assetDesc}`
        : `[${capitalize(asset.type)}] ${asset.name}`;
    });
    sections.push({ title: "Cast", content: castLines.join("\n") });
  }

  // Timeline Prompt
  if (input.compiledPrompt.lines.length === 0) {
    warnings.push("No prompt segments — timeline section is missing.");
  } else {
    sections.push({ title: "Timeline Prompt", content: input.compiledPrompt.text });
  }

  // Shot Reference Images
  if (input.shotRefImages.length > 0) {
    const imgLines = input.shotRefImages
      .map((img) => {
        const lbl = imageLabel(img.label, img.sourceFilename, img.imageRole);
        if (!lbl) return null;
        const role = notEmpty(img.imageRole);
        return role ? `[${role}] ${lbl}` : lbl;
      })
      .filter((line): line is string => line !== null);
    if (imgLines.length > 0) {
      sections.push({ title: "Shot Reference Images", content: imgLines.join("\n") });
    }
  }

  // Cast Reference Images
  if (input.castAssetRefImages.length > 0) {
    const assetImgLines = input.castAssetRefImages
      .map((img) => {
        const lbl = imageLabel(img.label, img.sourceFilename, img.imageRole);
        if (!lbl) return null;
        const role = notEmpty(img.imageRole);
        const prefix = role
          ? `[${img.assetName} / ${img.assetType} / ${role}]`
          : `[${img.assetName} / ${img.assetType}]`;
        return `${prefix} ${lbl}`;
      })
      .filter((line): line is string => line !== null);
    if (assetImgLines.length > 0) {
      sections.push({ title: "Cast Reference Images", content: assetImgLines.join("\n") });
    }
  }

  const bodyParts = sections.map((s) => `${s.title}:\n${s.content}`);
  const text = `SHOT PROMPT DRAFT\n\n${bodyParts.join("\n\n")}`;

  return {
    sections,
    text,
    hasContent: sections.length > 0,
    warnings,
  };
}
