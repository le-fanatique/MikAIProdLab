import { describe, expect, it } from "vitest";
import { lightingFromImageDescriptor } from "@/lib/llmWorkspace/descriptors/lightingFromImage";
import { renderAttachedImagesContextLines } from "@/lib/llmWorkspace/images/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// LLMW.LIGHTING.FROMIMAGE.1 (B16b) — render proof for `lighting.fromImage`,
// on the model of `narrativePromptCompose.render.test.ts` (the closest
// sibling: another `kind: "text"` descriptor with no flat-JSON oracle to
// reproduce byte-for-byte). The proof here is:
//   1. the descriptor's own shape — asset anchor, `images` bounds mirroring
//      the source's own anchor, `intent: {}`, `output.kind: "text"` over
//      `assets.lighting`, `commit: ["updateAssetLightingInline"]`;
//   2. the system message's prudence line (same discipline
//      `referenceAnalysis/prompt.ts` already applies) and its narrow scope
//      (lighting only — direction, hardness, color, contrast — never style,
//      story, or identity);
//   3. the assembled user prompt actually carries the attached images'
//      per-run keys and metadata, in the order the caller supplied them,
//      via the real `images.attachedContextLines` render form (B16a) — not a
//      stand-in.
// ---------------------------------------------------------------------------

function assemble(images: Array<{ key: string; metadata: Record<string, string | null> }>) {
  return assembleDescriptorMessages(
    lightingFromImageDescriptor,
    () => {
      throw new Error("lighting.fromImage declares no {variable} block.");
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    (render) => {
      if (render !== "images.attachedContextLines") {
        throw new Error(`unexpected images render form ${render}`);
      }
      return renderAttachedImagesContextLines(images);
    }
  );
}

describe("lighting.fromImage descriptor — shape", () => {
  it("anchors on asset alone — the level §5.9 names as the one that earns the feature, and the only anchor its image source allows", () => {
    expect(lightingFromImageDescriptor.anchor).toEqual({ kind: "entity", entity: "asset" });
  });

  it("declares no context variables — only the attached image(s) feed this operation", () => {
    expect(lightingFromImageDescriptor.context).toEqual({ variables: [] });
  });

  it("declares images from ASSET.REFERENCE_IMAGES, anchored the same way as the descriptor itself", () => {
    expect(lightingFromImageDescriptor.images).toMatchObject({
      source: "ASSET.REFERENCE_IMAGES",
      minCount: 1,
      keyPrefix: "R",
    });
    expect(lightingFromImageDescriptor.images!.maxCount).toBeGreaterThanOrEqual(
      lightingFromImageDescriptor.images!.minCount
    );
    expect(lightingFromImageDescriptor.images!.maxTotalBytes).toBeGreaterThan(0);
  });

  it("declares intent: {} — no freeText, describing what is visible is not directing a rewrite", () => {
    expect(lightingFromImageDescriptor.intent).toEqual({});
  });

  it("output declares kind: \"text\", target asset, field \"lighting\", and commits through updateAssetLightingInline alone", () => {
    expect(lightingFromImageDescriptor.output).toMatchObject({
      kind: "text",
      target: { entity: "asset" },
      field: "lighting",
    });
    expect(lightingFromImageDescriptor.commit).toEqual(["updateAssetLightingInline"]);
  });

  it("the template declares an {images} block using the real B16a render form", () => {
    expect(lightingFromImageDescriptor.template.blocks).toContainEqual({
      images: true,
      render: "images.attachedContextLines",
    });
  });
});

describe("lighting.fromImage descriptor — assembled prompt", () => {
  it("the system message stays within pixels-only prudence and asks for lighting alone, never style, story, or identity", () => {
    const assembled = assemble([]);
    expect(assembled.system).toMatch(/Look ONLY at the pixels/);
    expect(assembled.system).toMatch(/Never attempt to identify a real person/);
    expect(assembled.system).toMatch(/direction/i);
    expect(assembled.system).toMatch(/hardness/i);
    expect(assembled.system).toMatch(/color/i);
    expect(assembled.system).toMatch(/contrast/i);
    expect(assembled.system).toMatch(/Do not describe the story, the visual style/);
    expect(assembled.system).not.toContain("```");
  });

  it("the user prompt carries the attached images' keys and metadata, in the caller's own order — never a path, never a byte", () => {
    const assembled = assemble([
      { key: "R1", metadata: { label: "Interior, screens only", imageRole: null, notes: null } },
      { key: "R2", metadata: { label: "Rooftop at dusk", imageRole: "lighting", notes: null } },
    ]);
    expect(assembled.user).toContain("Describe the lighting visible in the attached reference image(s).");
    expect(assembled.user).toContain("[R1]\nLabel: Interior, screens only");
    expect(assembled.user).toContain("[R2]\nLabel: Rooftop at dusk\nImage role: lighting");
    expect(assembled.user.indexOf("[R1]")).toBeLessThan(assembled.user.indexOf("[R2]"));
    expect(assembled.user).not.toContain("uploads/");
  });

  it("renders with no attached image at all without throwing (the {images} block simply drops)", () => {
    const assembled = assemble([]);
    expect(assembled.user).toBe("Describe the lighting visible in the attached reference image(s).");
  });
});
