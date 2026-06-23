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
  summary: string | null;
  narrativePurpose: string | null;
};

export type ShotComposerProject = {
  name: string;
  pitch: string | null;
};

export type ShotComposerCastAsset = {
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
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
  shotRefImages: ShotComposerRefImage[];
  castAssetRefImages: ShotComposerAssetRefImage[];
};

export type ComposedShotPrompt = {
  proposalText: string;
  hasContent: boolean;
};

function notEmpty(s: string | null | undefined): string | null {
  const t = s?.trim() ?? "";
  return t.length > 0 ? t : null;
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function low(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function buildCastDetails(asset: ShotComposerCastAsset): string {
  const desc = notEmpty(asset.description);
  const notes = notEmpty(asset.notes);
  const details = [desc, notes].filter((x): x is string => x !== null);
  if (details.length === 0) return asset.name;
  return `${asset.name} (${details.join("; ")})`;
}

export function composeShotPrompt(input: ShotComposerInput): ComposedShotPrompt {
  const sentences: string[] = [];

  const desc = notEmpty(input.shot.description);
  const action = notEmpty(input.shot.actionPitch);
  const camPitch = notEmpty(input.shot.cameraPitch);
  const framing = notEmpty(input.shot.framing);
  const movement = notEmpty(input.shot.cameraMovement);
  const location = notEmpty(input.sequence.locationHint);
  const mood = notEmpty(input.sequence.mood);
  const summary = notEmpty(input.sequence.summary);
  const pitch = notEmpty(input.project.pitch);

  const hasCast = input.castAssets.length > 0;

  // Sentence 1: main subject + action + location
  if (hasCast) {
    const castStr = input.castAssets.map(buildCastDetails).join(", ");
    const subjectParts: string[] = [];

    if (framing) {
      subjectParts.push(`${cap(framing)} of ${castStr}`);
    } else {
      subjectParts.push(castStr);
    }

    const primaryAction = action ?? desc;
    if (primaryAction) subjectParts.push(low(primaryAction));
    if (location) subjectParts.push(`in ${location}`);

    sentences.push(subjectParts.join(", ") + ".");
  } else {
    const subject = desc ?? action;
    if (subject) {
      const parts: string[] = [cap(subject)];
      if (desc && action) parts.push(low(action));
      if (location) parts.push(`in ${location}`);
      sentences.push(parts.join(", ") + ".");
    } else if (location) {
      sentences.push(`Shot in ${location}.`);
    }
  }

  // Sentence 2: mood / atmosphere context
  if (mood) {
    sentences.push(cap(mood) + ".");
  } else if (summary && summary.length < 100) {
    sentences.push(cap(low(summary)) + ".");
  } else if (pitch && pitch.length < 80) {
    sentences.push(cap(low(pitch)) + ".");
  }

  // Sentence 3: camera
  if (camPitch) {
    sentences.push(cap(camPitch) + ".");
  } else {
    const camParts: string[] = [];
    if (movement) camParts.push(movement);
    // Include framing in camera sentence only when cast didn't already use it
    if (framing && !hasCast) camParts.push(framing);
    if (camParts.length > 0) {
      sentences.push(cap(camParts.join(", ")) + ".");
    }
  }

  const proposalText = sentences.join(" ").trim();

  return {
    proposalText,
    hasContent: proposalText.length > 0,
  };
}
