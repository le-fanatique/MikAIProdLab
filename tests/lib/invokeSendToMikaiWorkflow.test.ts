import { describe, expect, it } from "vitest";
import {
  buildSendToMikaiWorkflow,
  buildSendToMikaiWorkflowForUpdate,
  SEND_TO_MIKAI_WORKFLOW_NAME,
} from "@/lib/invoke/invokeSendToMikaiWorkflow";

type NodeInvocation = {
  id: string;
  type: string;
  data: { id: string; type: string; inputs: Record<string, unknown> };
};

describe("buildSendToMikaiWorkflow", () => {
  it("is deterministic for the same board id", () => {
    const a = buildSendToMikaiWorkflow("board-1");
    const b = buildSendToMikaiWorkflow("board-1");
    expect(a).toEqual(b);
  });

  it("names the workflow 'Send to MikAI'", () => {
    expect(buildSendToMikaiWorkflow("board-1").name).toBe(SEND_TO_MIKAI_WORKFLOW_NAME);
  });

  it("contains a save_image node and a canvas_output node", () => {
    const doc = buildSendToMikaiWorkflow("board-1");
    const types = (doc.nodes as NodeInvocation[]).map((n) => n.data.type);
    expect(types).toContain("save_image");
    expect(types).toContain("canvas_output");
  });

  it("connects save_image's image output to canvas_output's image input", () => {
    const doc = buildSendToMikaiWorkflow("board-1");
    const saveImage = (doc.nodes as NodeInvocation[]).find((n) => n.data.type === "save_image")!;
    const canvasOutput = (doc.nodes as NodeInvocation[]).find((n) => n.data.type === "canvas_output")!;
    expect(doc.edges).toHaveLength(1);
    const edge = doc.edges[0] as Record<string, unknown>;
    expect(edge.source).toBe(saveImage.id);
    expect(edge.target).toBe(canvasOutput.id);
    expect(edge.sourceHandle).toBe("image");
    expect(edge.targetHandle).toBe("image");
  });

  it("pre-fills save_image's board input with the given board id", () => {
    const doc = buildSendToMikaiWorkflow("board-abc");
    const saveImage = (doc.nodes as NodeInvocation[]).find((n) => n.data.type === "save_image")!;
    const board = saveImage.data.inputs.board as { value?: { board_id?: string } };
    expect(board.value?.board_id).toBe("board-abc");
  });

  it("produces a different board default for a different board id", () => {
    const a = buildSendToMikaiWorkflow("board-1");
    const b = buildSendToMikaiWorkflow("board-2");
    expect(a).not.toEqual(b);
  });

  it("exposes the image field and the board field of the save_image node in the form", () => {
    const doc = buildSendToMikaiWorkflow("board-1");
    const saveImage = (doc.nodes as NodeInvocation[]).find((n) => n.data.type === "save_image")!;
    const elements = (doc.form as { elements: Record<string, { data: Record<string, unknown> }> }).elements;
    const fieldIdentifiers = Object.values(elements)
      .map((el) => el.data.fieldIdentifier as { nodeId: string; fieldName: string } | undefined)
      .filter((id): id is { nodeId: string; fieldName: string } => !!id);
    expect(fieldIdentifiers).toContainEqual({ nodeId: saveImage.id, fieldName: "image" });
    expect(fieldIdentifiers).toContainEqual({ nodeId: saveImage.id, fieldName: "board" });
  });

  it("marks the workflow as a user-category workflow, not the default library", () => {
    expect(buildSendToMikaiWorkflow("board-1").meta.category).toBe("user");
  });

  it("attaches the given id for an update payload", () => {
    const doc = buildSendToMikaiWorkflowForUpdate("wf-42", "board-1");
    expect(doc.id).toBe("wf-42");
    expect(doc.name).toBe(SEND_TO_MIKAI_WORKFLOW_NAME);
  });

  it("leaves the board input without a default when boardId is null (first Test Connection, no entity pushed yet)", () => {
    const doc = buildSendToMikaiWorkflow(null);
    const saveImage = (doc.nodes as NodeInvocation[]).find((n) => n.data.type === "save_image")!;
    const board = saveImage.data.inputs.board as { value?: unknown };
    expect(board.value).toBeUndefined();
  });
});
