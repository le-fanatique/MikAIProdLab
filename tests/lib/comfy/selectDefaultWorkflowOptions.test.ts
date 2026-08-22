import { describe, it, expect } from "vitest";
import {
  selectDefaultWorkflowOptions,
  type DefaultWorkflowOptionRow,
} from "@/lib/comfy/selectDefaultWorkflowOptions";

function row(overrides: Partial<DefaultWorkflowOptionRow> = {}): DefaultWorkflowOptionRow {
  return {
    id: 1,
    name: "Text to Image (Gemini)",
    kind: "image",
    status: "active",
    contexts: null,
    ...overrides,
  };
}

describe("selectDefaultWorkflowOptions", () => {
  it("excludes an archived workflow", () => {
    const options = selectDefaultWorkflowOptions([row({ status: "archived" })], "image", "asset", null);
    expect(options).toHaveLength(0);
  });

  it("keeps an archived workflow that is the currently registered default, marked", () => {
    const options = selectDefaultWorkflowOptions([row({ id: 7, status: "archived" })], "image", "asset", 7);
    expect(options).toEqual([{ id: 7, name: "Text to Image (Gemini)", archived: true }]);
  });

  it("does not mark an active workflow even when it is the registered default", () => {
    const options = selectDefaultWorkflowOptions([row({ id: 7 })], "image", "asset", 7);
    expect(options).toEqual([{ id: 7, name: "Text to Image (Gemini)", archived: false }]);
  });

  it("excludes a workflow restricted to another context", () => {
    const assetOnly = row({ contexts: JSON.stringify(["asset"]) });
    const options = selectDefaultWorkflowOptions([assetOnly], "image", "shot-keyframe", null);
    expect(options).toHaveLength(0);
  });

  it("includes a workflow restricted to the requested context", () => {
    const assetOnly = row({ contexts: JSON.stringify(["asset"]) });
    const options = selectDefaultWorkflowOptions([assetOnly], "image", "asset", null);
    expect(options).toHaveLength(1);
  });

  it("Camera Lab dropdowns (context: null) ignore contexts and filter on kind + status only", () => {
    const assetOnly = row({ contexts: JSON.stringify(["asset"]) });
    const options = selectDefaultWorkflowOptions([assetOnly], "image", null, null);
    expect(options).toHaveLength(1);
  });

  it("contexts = NULL appears in every menu its kind allows", () => {
    const unrestricted = row({ contexts: null });
    const asset = selectDefaultWorkflowOptions([unrestricted], "image", "asset", null);
    const shotKeyframe = selectDefaultWorkflowOptions([unrestricted], "image", "shot-keyframe", null);
    const cameraLab = selectDefaultWorkflowOptions([unrestricted], "image", null, null);
    expect(asset).toHaveLength(1);
    expect(shotKeyframe).toHaveLength(1);
    expect(cameraLab).toHaveLength(1);
  });

  it("excludes a workflow of the wrong kind", () => {
    const video = row({ kind: "video" });
    const options = selectDefaultWorkflowOptions([video], "image", "asset", null);
    expect(options).toHaveLength(0);
  });
});
