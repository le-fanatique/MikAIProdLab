// INVOKE.PUSH.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.2, ticket §1.4. Pure
// builder of the "Send to MikAI" InvokeAI workflow document: no network, no
// DB. Structure sourced from InvokeAI 6.14.0 installed at
// `F:\AI\Invoke\.venv\Lib\site-packages\invokeai`, not invented:
//   - `save_image` node shape/version (1.2.2) and its `board`/`metadata`/
//     `image` inputs: `app/invocations/image.py` (`SaveImageInvocation`,
//     `WithBoard`/`WithMetadata` mixins) and the `save_image` node instance
//     shipped in `default_workflows/Tiled Upscaling (Beta).json`.
//   - `canvas_output` node shape/version (1.0.0) and its single `image`
//     input: `app/invocations/canvas.py` (`CanvasOutputInvocation`).
//   - `Workflow`/`WorkflowWithoutID`/`WorkflowMeta` field names (`name`,
//     `author`, `meta.category`, `nodes`, `edges`, `form`, …):
//     `app/services/workflow_records/workflow_records_common.py`.
//   - the Form Builder's `container`/`node-field` element shape and the
//     `reactflow__edge-<source><sourceHandle>-<target><targetHandle>` edge
//     id convention: `default_workflows/CogView4_TextToImage.json` and
//     `Tiled Upscaling (Beta).json`.
//   - a literal input default is carried by a `value` key on the node's
//     input entry (seen on `cogview4_text_encoder.prompt` in
//     `CogView4_TextToImage.json`); this module extends that same shape to
//     `save_image.board`'s `BoardField` (`{ board_id: string }`, from
//     `app/invocations/fields.py`) by analogy — this specific field has not
//     been seen pre-filled in any shipped template, so it is NOT verified
//     against a running InvokeAI instance. See the executor report.
//
// None of the 25 workflows shipped with this InvokeAI install combines a
// `form` AND a `canvas_output` node — the "Run Workflow" canvas menu filter
// (docs/INVOKE_ROUNDTRIP_SPEC.md §3.3) could not be cross-checked against a
// real shipped example, only against the two invocations' own source.

const SAVE_IMAGE_NODE_ID = "mikai-send-to-mikai-save-image";
const CANVAS_OUTPUT_NODE_ID = "mikai-send-to-mikai-canvas-output";
const FORM_ROOT_ID = "mikai-send-to-mikai-form-root";
const FORM_HEADING_ID = "mikai-send-to-mikai-form-heading";
const FORM_IMAGE_FIELD_ID = "mikai-send-to-mikai-form-image-field";
const FORM_BOARD_FIELD_ID = "mikai-send-to-mikai-form-board-field";

export const SEND_TO_MIKAI_WORKFLOW_NAME = "Send to MikAI";

/** The shape `POST /api/v1/workflows/` and `PATCH /api/v1/workflows/i/{id}` expect under their `workflow` body key (InvokeAI's `WorkflowWithoutID` / `Workflow`). */
export interface InvokeWorkflowDocument {
  name: string;
  author: string;
  description: string;
  version: string;
  contact: string;
  tags: string;
  notes: string;
  exposedFields: { nodeId: string; fieldName: string }[];
  meta: { version: string; category: "user" };
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  form: Record<string, unknown>;
}

export interface InvokeWorkflowDocumentWithId extends InvokeWorkflowDocument {
  id: string;
}

/**
 * Builds the "Send to MikAI" workflow document, its `save_image.board`
 * default pre-filled with `boardId` — the board of the entity a push just
 * targeted (docs/INVOKE_ROUNDTRIP_SPEC.md §5.1 step 5). Deterministic: same
 * `boardId` in, byte-identical document out, so a push can always resend
 * the full canonical shape rather than patch a drifted one.
 *
 * `boardId` is null only when the workflow is installed at the first
 * successful Test Connection, before any entity has ever been pushed
 * (ticket §1.4) — the board input is then left without a literal default
 * (InvokeAI's own `BoardField` is optional), exactly as it ships unset in
 * every stock `save_image` node instance this module was modeled on.
 */
export function buildSendToMikaiWorkflow(boardId: string | null): InvokeWorkflowDocument {
  const saveImageNode = {
    id: SAVE_IMAGE_NODE_ID,
    type: "invocation",
    data: {
      id: SAVE_IMAGE_NODE_ID,
      version: "1.2.2",
      label: "",
      notes: "",
      type: "save_image",
      inputs: {
        board:
          boardId === null
            ? { name: "board", label: "" }
            : { name: "board", label: "", value: { board_id: boardId } },
        metadata: { name: "metadata", label: "" },
        image: { name: "image", label: "" },
      },
      isOpen: true,
      isIntermediate: false,
      useCache: false,
    },
    position: { x: 0, y: 0 },
  };

  const canvasOutputNode = {
    id: CANVAS_OUTPUT_NODE_ID,
    type: "invocation",
    data: {
      id: CANVAS_OUTPUT_NODE_ID,
      version: "1.0.0",
      label: "",
      notes: "",
      type: "canvas_output",
      inputs: {
        image: { name: "image", label: "" },
      },
      isOpen: true,
      isIntermediate: false,
      useCache: false,
    },
    position: { x: 400, y: 0 },
  };

  const edge = {
    id: `reactflow__edge-${SAVE_IMAGE_NODE_ID}image-${CANVAS_OUTPUT_NODE_ID}image`,
    type: "default",
    source: SAVE_IMAGE_NODE_ID,
    target: CANVAS_OUTPUT_NODE_ID,
    sourceHandle: "image",
    targetHandle: "image",
  };

  const form = {
    elements: {
      [FORM_ROOT_ID]: {
        id: FORM_ROOT_ID,
        type: "container",
        data: {
          layout: "column",
          children: [FORM_HEADING_ID, FORM_IMAGE_FIELD_ID, FORM_BOARD_FIELD_ID],
        },
      },
      [FORM_HEADING_ID]: {
        id: FORM_HEADING_ID,
        parentId: FORM_ROOT_ID,
        type: "heading",
        data: { content: SEND_TO_MIKAI_WORKFLOW_NAME },
      },
      [FORM_IMAGE_FIELD_ID]: {
        id: FORM_IMAGE_FIELD_ID,
        parentId: FORM_ROOT_ID,
        type: "node-field",
        data: {
          fieldIdentifier: { nodeId: SAVE_IMAGE_NODE_ID, fieldName: "image" },
          showDescription: false,
        },
      },
      [FORM_BOARD_FIELD_ID]: {
        id: FORM_BOARD_FIELD_ID,
        parentId: FORM_ROOT_ID,
        type: "node-field",
        data: {
          fieldIdentifier: { nodeId: SAVE_IMAGE_NODE_ID, fieldName: "board" },
          showDescription: false,
        },
      },
    },
    rootElementId: FORM_ROOT_ID,
  };

  return {
    name: SEND_TO_MIKAI_WORKFLOW_NAME,
    author: "MikAI",
    description:
      "Returns a retouched canvas layer to MikAI as a reference image of the entity it was pushed from.",
    version: "1.0.0",
    contact: "",
    tags: "mikai",
    notes:
      "Installed automatically by MikAI (INVOKE.PUSH.1). Do not rename — MikAI looks it up by the id stored in its own settings, not by name.",
    exposedFields: [],
    meta: { version: "3.0.0", category: "user" },
    nodes: [saveImageNode, canvasOutputNode],
    edges: [edge],
    form,
  };
}

/** Same document, with `id` attached for `PATCH /api/v1/workflows/i/{id}` — InvokeAI's `update_workflow` reads the target from the body's `workflow.id`, not from the URL path segment. */
export function buildSendToMikaiWorkflowForUpdate(id: string, boardId: string | null): InvokeWorkflowDocumentWithId {
  return { ...buildSendToMikaiWorkflow(boardId), id };
}
