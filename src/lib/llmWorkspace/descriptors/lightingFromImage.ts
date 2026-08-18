// ---------------------------------------------------------------------------
// descriptors/lightingFromImage.ts — LLMW.LIGHTING.FROMIMAGE.1 (B16b)
//
// The first descriptor to declare `images` (LLMW.DESCRIPTOR.IMAGE.1, B16a):
// "from an image, by a vision model" — the second of §5.9's three ways to
// fill the lighting field (`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.9).
//
// Anchored on `asset`, and only `asset` — §5.9 names the Environment Asset
// "the level that earns the feature" (a lighting described once there
// already propagates to every Sequence reading it through `SEQ.LIGHTING`'s
// fallback, delivered by B15a/B15b), and the registry's only image source,
// `ASSET.REFERENCE_IMAGES`, itself anchors on `asset` — the runner throws if
// a descriptor's anchor and its declared image source's anchor ever diverge
// (`runner.ts`'s `resolveDeclaredImages`), so this is not a shortcut, it is
// the only anchor this descriptor could legally declare today. The plan- and
// sequence-level "director's note" adjustment (§5.9's third way) is B16c and
// needs no image at all.
//
// `output.kind: "text"` — prose, not a JSON object: the prompt asks what the
// image shows, not for a schema. This also sidesteps the one documented
// limitation of an image-bearing call (`docs/LLM_WORKSPACE_ARCHITECTURE.md`
// §4.1, "The image input", its own last paragraph): `callLLMChat` forces JSON
// on neither provider, so only `kind: "text"` is unaffected by it.
//
// `intent: {}` — deliberately no `freeText`. Describing what is visible in an
// image is not directing a rewrite; the director's note over an *existing*
// lighting value is §5.9's third way (B16c), a different operation entirely.
//
// Impact UC: none. Neither UC1, UC2 nor UC3 is touched, constrained, or
// brought closer — this fills one field via one of §5.9's three assistance
// levels, nothing UC-facing changes.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

// LLMW.LIGHTING.FROMIMAGE.1 (B16b) — the two bounds this ticket leaves to the
// executor's judgment, chosen against `REFERENCE_ANALYSIS_LIMITS`
// (`src/lib/projectStyle/referenceAnalysis/contracts.ts`), the only existing
// precedent for "how many stored images may one vision call attach, and how
// many raw bytes total": `maxReferences: 4` and `maxTotalRawBytes: 20 *
// 1024 * 1024`. This operation asks a strictly narrower question (lighting
// alone, not a full multi-domain style analysis feeding several observations
// and candidate rules per image), so there is no reason to declare a wider
// budget than the call this repository already runs in production for a
// harder version of the same "describe what several attached images show"
// shape — and no reason to invent a narrower one either, since a single
// Environment Asset can reasonably carry several reference angles/times of
// day whose lighting the user wants considered together.
const MAX_LIGHTING_REFERENCE_IMAGES = 4;
const MAX_LIGHTING_REFERENCE_TOTAL_BYTES = 20 * 1024 * 1024;

export const lightingFromImageDescriptor: OperationDescriptor = {
  id: "lighting.fromImage",
  name: "Describe Lighting From Reference Image",

  anchor: { kind: "entity", entity: "asset" },

  // No ingredient beyond the attached image(s) themselves — this operation
  // reads pixels, not database context.
  context: { variables: [] },

  images: {
    source: "ASSET.REFERENCE_IMAGES",
    minCount: 1,
    maxCount: MAX_LIGHTING_REFERENCE_IMAGES,
    maxTotalBytes: MAX_LIGHTING_REFERENCE_TOTAL_BYTES,
    keyPrefix: "R",
    messages: {
      noneSelected: "Select at least one reference image to describe its lighting.",
      tooMany: `Select at most ${MAX_LIGHTING_REFERENCE_IMAGES} reference images.`,
      unavailable: "The selected reference images could not be used.",
    },
  },

  expertise: {
    role: "lightingFromImageAnalyst",
    system: {
      blocks: [
        {
          // Same prudence `referenceAnalysis/prompt.ts` already imposes on
          // itself: pixels only, never an inference about origin, never an
          // attempt to identify a real person, a named character, or a
          // copyrighted work. Narrower than that prompt in what it asks for —
          // lighting only, not composition/colour/texture/framing/material/
          // silhouette — because this operation exists to fill exactly one
          // field.
          text: `You are a film lighting analyst. You are given one or more reference images, labeled and attached to this message in that exact order.

Look ONLY at the pixels — do not guess or assume anything about the image's source, author, or origin. Never attempt to identify a real person, a specific named character, or a specific copyrighted work.

Describe ONLY the lighting actually visible in the image(s): its direction, its hardness (hard, sharp-edged shadows versus soft, diffuse ones), its color, and its overall contrast. Do not describe the story, the visual style, the composition, the subject's identity, or anything that is not directly about lighting.

Respond in plain prose — a few short sentences. No JSON, no markdown, no bullet list, no code fences.`,
        },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      { text: "Describe the lighting visible in the attached reference image(s)." },
      { images: true, render: "images.attachedContextLines" },
    ],
    separator: "\n",
  },

  intent: {},

  // No adapter exists for this operation — it lives at the bench only (§3 of
  // the ticket), so there is no verbatim source text to carry for
  // `invalidRequest`, the same "an absent message is honest, an invented one
  // is not" rule `narrativePrompt.compose` already follows for the same
  // reason.
  messages: {
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: {
      project: "Project not found.",
      asset: "Asset not found.",
    },
  },

  output: {
    kind: "text",
    target: { entity: "asset" },
    field: "lighting",
    errors: {
      empty: "The model returned an empty lighting description. Try again.",
    },
  },

  commit: ["updateAssetLightingInline"],

  executor: "inProcess",
};
