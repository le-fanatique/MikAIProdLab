import { describe, expect, it } from "vitest";
// Plain .mjs, no type declarations — see configTransportDefaultKeys.test.ts
// for the proof vitest can import scripts/config-transport.mjs structurally.
import { isLoopbackHost, findLoopbackAppSettings } from "../../scripts/config-transport.mjs";

// ---------------------------------------------------------------------------
// DEVOPS.CONFIG.LOOPBACK.1. The net for the pure detection function, written
// and proved before it is wired into importConfig's output (ticket §7). No
// value is ever rewritten or guessed, no network request is ever made — both
// are true here by construction: these functions take data in and return
// data out.
// ---------------------------------------------------------------------------

describe("isLoopbackHost", () => {
  it("is true for localhost, case-insensitively", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("LocalHost")).toBe(true);
  });

  it("is true for any 127.0.0.0/8 address, not only 127.0.0.1", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.0.0.2")).toBe(true);
    expect(isLoopbackHost("127.5.9.200")).toBe(true);
    expect(isLoopbackHost("127.255.255.255")).toBe(true);
  });

  it("is true for ::1, bracketed or not", () => {
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
  });

  it("is true for 0.0.0.0", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(true);
  });

  it("is false for an ordinary hostname", () => {
    expect(isLoopbackHost("example.com")).toBe(false);
  });

  it("is false for a hostname that merely contains the substring 'localhost'", () => {
    expect(isLoopbackHost("mycompany-localhost-proxy.example.com")).toBe(false);
  });

  it("is false for a public IPv4 address", () => {
    expect(isLoopbackHost("8.8.8.8")).toBe(false);
  });

  it("is false for private ranges (192.168.x, 10.x, 172.16-31.x)", () => {
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
    expect(isLoopbackHost("10.0.0.5")).toBe(false);
    expect(isLoopbackHost("172.16.0.1")).toBe(false);
    expect(isLoopbackHost("172.31.255.255")).toBe(false);
    expect(isLoopbackHost("172.32.0.1")).toBe(false); // just outside the 172.16-31 range
  });

  it("is false for a Tailscale address (100.64.0.0/10)", () => {
    expect(isLoopbackHost("100.118.47.125")).toBe(false);
    expect(isLoopbackHost("100.64.0.1")).toBe(false);
  });
});

describe("findLoopbackAppSettings", () => {
  it("flags a loopback http URL value, naming the key and the value as imported", () => {
    const rows = [{ key: "comfyui_base_url", value: "http://127.0.0.1:8188" }];
    expect(findLoopbackAppSettings(rows)).toEqual([{ key: "comfyui_base_url", value: "http://127.0.0.1:8188" }]);
  });

  it("flags an https localhost URL value too", () => {
    const rows = [{ key: "llm_ollama_base_url", value: "http://localhost:11434" }];
    expect(findLoopbackAppSettings(rows)).toEqual([{ key: "llm_ollama_base_url", value: "http://localhost:11434" }]);
  });

  it("does not flag a Tailscale address", () => {
    const rows = [{ key: "llm_base_url", value: "http://100.118.47.125:8000/v1" }];
    expect(findLoopbackAppSettings(rows)).toEqual([]);
  });

  it("does not flag a public https URL", () => {
    const rows = [{ key: "llm_openrouter_base_url", value: "https://openrouter.ai/api/v1" }];
    expect(findLoopbackAppSettings(rows)).toEqual([]);
  });

  it("silently ignores a value that does not parse as an absolute URL, without erroring", () => {
    const rows = [{ key: "some_non_url_setting", value: "not a url" }];
    expect(findLoopbackAppSettings(rows)).toEqual([]);
  });

  it("silently ignores a non-http(s) absolute URL (e.g. file:)", () => {
    const rows = [{ key: "weird_setting", value: "file:///127.0.0.1/etc" }];
    expect(findLoopbackAppSettings(rows)).toEqual([]);
  });

  it("is not restricted to a fixed set of keys — any key with a loopback URL value is examined", () => {
    const rows = [{ key: "some_future_service_url", value: "http://127.0.0.1:9999" }];
    expect(findLoopbackAppSettings(rows)).toEqual([{ key: "some_future_service_url", value: "http://127.0.0.1:9999" }]);
  });

  it("returns one entry per flagged row, preserving input order, over a mixed list", () => {
    const rows = [
      { key: "llm_base_url", value: "http://100.118.47.125:8000/v1" },
      { key: "llm_ollama_base_url", value: "http://localhost:11434" },
      { key: "llm_openrouter_base_url", value: "https://openrouter.ai/api/v1" },
      { key: "comfyui_base_url", value: "http://127.0.0.1:8188" },
    ];
    expect(findLoopbackAppSettings(rows)).toEqual([
      { key: "llm_ollama_base_url", value: "http://localhost:11434" },
      { key: "comfyui_base_url", value: "http://127.0.0.1:8188" },
    ]);
  });
});
