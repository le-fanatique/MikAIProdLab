import { describe, expect, it } from "vitest";
import {
  normalizeInvokeBaseUrl,
  buildInvokeVersionUrl,
  buildInvokeRuntimeConfigUrl,
  buildInvokeBoardsListUrl,
  buildInvokeCreateBoardUrl,
  buildInvokeUploadUrl,
  buildInvokeImagesPageUrl,
  buildInvokeImageFullUrl,
  buildInvokeWorkflowsCreateUrl,
  buildInvokeWorkflowsUpdateUrl,
  parseInvokeAppVersion,
  parseInvokeRuntimeConfigMultiuser,
  parseInvokeBoardDto,
  parseInvokeBoardDtoList,
  parseInvokeImageDto,
  parseInvokeImagesPage,
  parseInvokeWorkflowRecordDto,
} from "@/lib/invoke/invokeServerClient";

describe("normalizeInvokeBaseUrl", () => {
  it("trims and drops trailing slashes", () => {
    expect(normalizeInvokeBaseUrl("  http://127.0.0.1:9090/  ")).toBe("http://127.0.0.1:9090");
  });

  it("defaults an empty value to 127.0.0.1:9090", () => {
    expect(normalizeInvokeBaseUrl("")).toBe("http://127.0.0.1:9090");
    expect(normalizeInvokeBaseUrl("   ")).toBe("http://127.0.0.1:9090");
  });

  it("throws on a value missing http(s)", () => {
    expect(() => normalizeInvokeBaseUrl("127.0.0.1:9090")).toThrow(/http:\/\/ or https:\/\//);
    expect(() => normalizeInvokeBaseUrl("ftp://host")).toThrow(/http:\/\/ or https:\/\//);
  });

  it("accepts https", () => {
    expect(normalizeInvokeBaseUrl("https://invoke.example.com/")).toBe("https://invoke.example.com");
  });
});

describe("Invoke request URL builders", () => {
  const base = "http://127.0.0.1:9090";

  it("builds the version URL", () => {
    expect(buildInvokeVersionUrl(base)).toBe("http://127.0.0.1:9090/api/v1/app/version");
  });

  it("builds the runtime config URL", () => {
    expect(buildInvokeRuntimeConfigUrl(base)).toBe("http://127.0.0.1:9090/api/v1/app/runtime_config");
  });

  it("builds the boards list URL with all=true", () => {
    expect(buildInvokeBoardsListUrl(base)).toBe("http://127.0.0.1:9090/api/v1/boards/?all=true");
  });

  it("builds the create-board URL with board_name as a query param", () => {
    const url = buildInvokeCreateBoardUrl(base, "MikAI · Shot 012 · Reveal");
    expect(url.startsWith("http://127.0.0.1:9090/api/v1/boards/?board_name=")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("board_name")).toBe("MikAI · Shot 012 · Reveal");
  });

  it("builds the upload URL with the fixed category/intermediate flags and the board id", () => {
    const url = buildInvokeUploadUrl(base, { boardId: "abc-123" });
    expect(url).toBe(
      "http://127.0.0.1:9090/api/v1/images/upload?image_category=user&is_intermediate=false&board_id=abc-123"
    );
  });

  it("builds the images count-only page URL with limit=0 and is_intermediate=false (ticket §1.2)", () => {
    const url = buildInvokeImagesPageUrl(base, { boardId: "b1", limit: 0 });
    expect(url).toBe(
      "http://127.0.0.1:9090/api/v1/images/?board_id=b1&is_intermediate=false&limit=0&offset=0"
    );
  });

  it("builds the images list page URL with the requested limit", () => {
    const url = buildInvokeImagesPageUrl(base, { boardId: "b1", limit: 1000 });
    expect(url).toBe(
      "http://127.0.0.1:9090/api/v1/images/?board_id=b1&is_intermediate=false&limit=1000&offset=0"
    );
  });

  it("builds the image full-file URL", () => {
    expect(buildInvokeImageFullUrl(base, "abc.png")).toBe("http://127.0.0.1:9090/api/v1/images/i/abc.png/full");
  });

  it("builds the workflows create URL", () => {
    expect(buildInvokeWorkflowsCreateUrl(base)).toBe("http://127.0.0.1:9090/api/v1/workflows/");
  });

  it("builds the workflows update URL with the workflow id in the path", () => {
    expect(buildInvokeWorkflowsUpdateUrl(base, "wf-42")).toBe("http://127.0.0.1:9090/api/v1/workflows/i/wf-42");
  });
});

describe("Invoke response parsers", () => {
  it("parses the app version response", () => {
    expect(parseInvokeAppVersion({ version: "6.14.0" })).toEqual({ version: "6.14.0" });
  });

  it("throws on a malformed app version response", () => {
    expect(() => parseInvokeAppVersion({})).toThrow(/version/);
    expect(() => parseInvokeAppVersion(null)).toThrow(/version/);
  });

  it("parses the runtime config multiuser flag", () => {
    expect(parseInvokeRuntimeConfigMultiuser({ config: { multiuser: false } })).toBe(false);
    expect(parseInvokeRuntimeConfigMultiuser({ config: { multiuser: true } })).toBe(true);
  });

  it("throws on a malformed runtime config response", () => {
    expect(() => parseInvokeRuntimeConfigMultiuser({})).toThrow(/multiuser/);
    expect(() => parseInvokeRuntimeConfigMultiuser({ config: {} })).toThrow(/multiuser/);
  });

  it("parses a board DTO", () => {
    expect(parseInvokeBoardDto({ board_id: "b1", board_name: "MikAI · Asset 1 · Guard" })).toEqual({
      boardId: "b1",
      boardName: "MikAI · Asset 1 · Guard",
    });
  });

  it("throws on a malformed board DTO", () => {
    expect(() => parseInvokeBoardDto({ board_id: "b1" })).toThrow(/board_id.*board_name/);
  });

  it("parses a board DTO list", () => {
    expect(parseInvokeBoardDtoList([{ board_id: "b1", board_name: "A" }])).toEqual([
      { boardId: "b1", boardName: "A" },
    ]);
  });

  it("throws when the board list response is not an array", () => {
    expect(() => parseInvokeBoardDtoList({})).toThrow(/array/);
  });

  it("parses an image DTO", () => {
    expect(parseInvokeImageDto({ image_name: "abc.png" })).toEqual({ imageName: "abc.png" });
  });

  it("throws on a malformed image DTO", () => {
    expect(() => parseInvokeImageDto({})).toThrow(/image_name/);
  });

  it("parses the images page response — count-only shape (no items)", () => {
    expect(parseInvokeImagesPage({ limit: 0, offset: 0, total: 3, items: [] })).toEqual({ total: 3, items: [] });
  });

  it("parses the images page response — full listing", () => {
    expect(
      parseInvokeImagesPage({
        limit: 1000,
        offset: 0,
        total: 2,
        items: [{ image_name: "a.png" }, { image_name: "b.png" }],
      })
    ).toEqual({ total: 2, items: [{ imageName: "a.png" }, { imageName: "b.png" }] });
  });

  it("throws on a malformed images page response", () => {
    expect(() => parseInvokeImagesPage({ items: [] })).toThrow(/total.*items/);
    expect(() => parseInvokeImagesPage({ total: 1 })).toThrow(/total.*items/);
  });

  it("parses a workflow record DTO", () => {
    expect(parseInvokeWorkflowRecordDto({ workflow_id: "wf-1" })).toEqual({ workflowId: "wf-1" });
  });

  it("throws on a malformed workflow record DTO", () => {
    expect(() => parseInvokeWorkflowRecordDto({})).toThrow(/workflow_id/);
  });
});
