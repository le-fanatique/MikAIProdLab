import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertComfyWorkflow, insertGenerationJob } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// `GEN.VRAM.1` and `LLM.VRAM.1` — the net, written 2026-08-21.
//
// Both tickets shipped in one commit (`c51ca06`, "Add local VRAM auto
// management") and were never marked delivered in the roadmap; the module has
// had no test since. This file records what it DOES, not what it should do:
// every expectation below was read off the implementation and then proven by
// breaking it.
//
// What makes this module worth a net despite being small: it unloads a model
// out of VRAM under two running engines, from seven call sites, and it never
// throws. A wrong decision here does not fail — it either purges a runtime
// mid-job, or silently stops purging and the author is back to juggling VRAM
// by hand with nothing in the logs to say why.
//
// Only the two network primitives are doubled. The settings read, the provider
// resolution and the active-job query all run for real against a disposable
// SQLite file, because those are exactly the parts that decide.
// ---------------------------------------------------------------------------

vi.mock("@/lib/comfy/comfyServerClient", () => ({
  freeComfyVRAM: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/llm/ollama", () => ({
  unloadOllamaModel: vi.fn(async () => ({ ok: true })),
}));

let ctx: TempDb;
let maybeUnloadOllamaBeforeComfy: typeof import("@/lib/vramManager").maybeUnloadOllamaBeforeComfy;
let maybePurgeComfyBeforeOllama: typeof import("@/lib/vramManager").maybePurgeComfyBeforeOllama;
let freeComfyVRAM: typeof import("@/lib/comfy/comfyServerClient").freeComfyVRAM;
let unloadOllamaModel: typeof import("@/lib/llm/ollama").unloadOllamaModel;

let workflowId: number;

/** The env fallbacks the module reads when no row is set. Neutralised so a
 *  developer machine's own environment cannot change what these tests prove. */
const ENV_KEYS = ["LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL"] as const;
const savedEnv: Record<string, string | undefined> = {};

async function setSettings(entries: Record<string, string>): Promise<void> {
  await ctx.db.delete(ctx.schema.appSettings);
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
  if (rows.length > 0) await ctx.db.insert(ctx.schema.appSettings).values(rows);
}

/** The setting both entry points are gated on, plus whatever else a case needs. */
function vramOn(extra: Record<string, string> = {}): Record<string, string> {
  return { local_vram_auto_management_enabled: "true", ...extra };
}

function comfyFree() {
  return freeComfyVRAM as unknown as ReturnType<typeof vi.fn>;
}
function ollamaUnload() {
  return unloadOllamaModel as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  ctx = await setupTempDb();
  ({ maybeUnloadOllamaBeforeComfy, maybePurgeComfyBeforeOllama } = await import("@/lib/vramManager"));
  ({ freeComfyVRAM } = await import("@/lib/comfy/comfyServerClient"));
  ({ unloadOllamaModel } = await import("@/lib/llm/ollama"));

  workflowId = await insertComfyWorkflow(ctx);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  ctx.cleanup();
});

beforeEach(() => {
  comfyFree().mockClear().mockResolvedValue({ ok: true });
  ollamaUnload().mockClear().mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await ctx.db.delete(ctx.schema.generationJobs);
});

// ---------------------------------------------------------------------------
// GEN.VRAM.1 — unload Ollama before queuing a ComfyUI prompt.
// ---------------------------------------------------------------------------

describe("maybeUnloadOllamaBeforeComfy — GEN.VRAM.1", () => {
  it("does nothing at all when the setting was never enabled", async () => {
    // The default. `local_vram_auto_management_enabled` is read as a string
    // equality against "true", so an absent row means off — never on.
    await setSettings({ llm_provider: "ollama", llm_ollama_model: "llama3" });

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).not.toHaveBeenCalled();
  });

  it("does nothing when the setting holds any value other than the string \"true\"", async () => {
    await setSettings({
      local_vram_auto_management_enabled: "1",
      llm_provider: "ollama",
      llm_ollama_model: "llama3",
    });

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).not.toHaveBeenCalled();
  });

  it("unloads the configured model when Ollama is the production provider", async () => {
    await setSettings(
      vramOn({
        llm_provider: "ollama",
        llm_ollama_base_url: "http://127.0.0.1:11434",
        llm_ollama_model: "llama3",
      })
    );

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).toHaveBeenCalledTimes(1);
    expect(ollamaUnload()).toHaveBeenCalledWith("http://127.0.0.1:11434", "llama3");
  });

  it("leaves a remote provider alone — there is no local VRAM to reclaim", async () => {
    await setSettings(
      vramOn({
        llm_provider: "openrouter",
        llm_ollama_base_url: "http://127.0.0.1:11434",
        llm_ollama_model: "llama3",
      })
    );

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).not.toHaveBeenCalled();
  });

  it("still unloads when Ollama is only the SEPARATE chat provider", async () => {
    // The case that would regress silently: production runs on OpenRouter, so
    // a naive "is the production provider ollama?" check says no — while a
    // local chat model is sitting in VRAM, which is the whole problem the
    // ticket exists to solve.
    await setSettings(
      vramOn({
        llm_provider: "openrouter",
        llm_chat_use_separate_provider: "true",
        llm_chat_provider: "ollama",
        llm_ollama_base_url: "http://127.0.0.1:11434",
        llm_ollama_model: "chat-model",
      })
    );

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).toHaveBeenCalledTimes(1);
    expect(ollamaUnload()).toHaveBeenCalledWith("http://127.0.0.1:11434", "chat-model");
  });

  it("ignores a separate chat provider that is not itself Ollama", async () => {
    await setSettings(
      vramOn({
        llm_provider: "openrouter",
        llm_chat_use_separate_provider: "true",
        llm_chat_provider: "vllm",
        llm_ollama_model: "llama3",
      })
    );

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).not.toHaveBeenCalled();
  });

  it("skips rather than guessing when no model is configured", async () => {
    // No `llm_provider` row and no env: the module's own default is "ollama",
    // so it reaches the unload decision with an empty model name. It refuses
    // instead of calling the endpoint with "".
    await setSettings(vramOn({ llm_ollama_base_url: "http://127.0.0.1:11434" }));

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).not.toHaveBeenCalled();
  });

  it("prefers the Ollama-specific rows over the generic ones", async () => {
    // Both pairs are set; the specific ones win. This is the precedence a
    // migration or a settings rewrite would be most likely to invert.
    await setSettings(
      vramOn({
        llm_provider: "ollama",
        llm_ollama_base_url: "http://specific:11434",
        llm_base_url: "http://generic:11434",
        llm_ollama_model: "specific-model",
        llm_model: "generic-model",
      })
    );

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).toHaveBeenCalledWith("http://specific:11434", "specific-model");
  });

  it("falls back to the generic rows when the Ollama-specific ones are absent", async () => {
    await setSettings(
      vramOn({
        llm_provider: "ollama",
        llm_base_url: "http://generic:11434",
        llm_model: "generic-model",
      })
    );

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).toHaveBeenCalledWith("http://generic:11434", "generic-model");
  });

  it("defaults the base URL to localhost when nothing names one", async () => {
    await setSettings(vramOn({ llm_provider: "ollama", llm_ollama_model: "llama3" }));

    await maybeUnloadOllamaBeforeComfy();

    expect(ollamaUnload()).toHaveBeenCalledWith("http://localhost:11434", "llama3");
  });

  it("never throws when the unload fails, so the generation still queues", async () => {
    // The contract every one of the seven call sites depends on: this is
    // awaited immediately before queuing a prompt. A rejection here would
    // abort a generation over a VRAM optimisation.
    ollamaUnload().mockResolvedValue({ ok: false, error: "connection refused" });
    await setSettings(vramOn({ llm_provider: "ollama", llm_ollama_model: "llama3" }));

    await expect(maybeUnloadOllamaBeforeComfy()).resolves.toBeUndefined();
    expect(ollamaUnload()).toHaveBeenCalledTimes(1);
  });

  it("never throws when the unload rejects outright", async () => {
    ollamaUnload().mockRejectedValue(new Error("socket hang up"));
    await setSettings(vramOn({ llm_provider: "ollama", llm_ollama_model: "llama3" }));

    await expect(maybeUnloadOllamaBeforeComfy()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LLM.VRAM.1 — purge ComfyUI before routing a request to Ollama.
// ---------------------------------------------------------------------------

describe("maybePurgeComfyBeforeOllama — LLM.VRAM.1", () => {
  it("does nothing at all when the setting was never enabled", async () => {
    await setSettings({});

    await maybePurgeComfyBeforeOllama();

    expect(comfyFree()).not.toHaveBeenCalled();
  });

  it("purges when the setting is on and no job is in flight", async () => {
    await setSettings(vramOn());

    await maybePurgeComfyBeforeOllama();

    expect(comfyFree()).toHaveBeenCalledTimes(1);
  });

  // The decision this module exists to get right: pulling models out of VRAM
  // under a running generation. "Active" is defined in the source by
  // enumeration, so all seven statuses of the enum are pinned here — four that
  // must block, three that must not.
  for (const status of ["pending", "uploading", "queued", "running"] as const) {
    it(`refuses to purge while a job is "${status}"`, async () => {
      await setSettings(vramOn());
      await insertGenerationJob(ctx, workflowId, { status });

      await maybePurgeComfyBeforeOllama();

      expect(comfyFree()).not.toHaveBeenCalled();
    });
  }

  for (const status of ["done", "failed", "timeout"] as const) {
    it(`purges anyway when the only job is "${status}"`, async () => {
      await setSettings(vramOn());
      await insertGenerationJob(ctx, workflowId, { status });

      await maybePurgeComfyBeforeOllama();

      expect(comfyFree()).toHaveBeenCalledTimes(1);
    });
  }

  it("blocks on a single active job among finished ones", async () => {
    await setSettings(vramOn());
    await insertGenerationJob(ctx, workflowId, { status: "done" });
    await insertGenerationJob(ctx, workflowId, { status: "failed" });
    await insertGenerationJob(ctx, workflowId, { status: "running" });

    await maybePurgeComfyBeforeOllama();

    expect(comfyFree()).not.toHaveBeenCalled();
  });

  it("counts a job on any target, not only a Shot", async () => {
    // The query filters on status alone. A Sequence, an Asset or a Look job
    // holds the same VRAM, and each of those columns is nullable — so a job
    // with no Shot must still block.
    await setSettings(vramOn());
    await insertGenerationJob(ctx, workflowId, { status: "running", shotId: null });

    await maybePurgeComfyBeforeOllama();

    expect(comfyFree()).not.toHaveBeenCalled();
  });

  it("never throws when the purge fails, so the LLM call still proceeds", async () => {
    comfyFree().mockResolvedValue({ ok: false, error: "ComfyUI /free responded 404" });
    await setSettings(vramOn());

    await expect(maybePurgeComfyBeforeOllama()).resolves.toBeUndefined();
    expect(comfyFree()).toHaveBeenCalledTimes(1);
  });

  it("never throws when the purge rejects outright", async () => {
    comfyFree().mockRejectedValue(new Error("ECONNREFUSED"));
    await setSettings(vramOn());

    await expect(maybePurgeComfyBeforeOllama()).resolves.toBeUndefined();
  });
});
