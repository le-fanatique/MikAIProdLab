import { describe, expect, it } from "vitest";
import {
  buildBatchRoleOverrideParamKey,
  parseBatchRoleOverridesParam,
  serializeBatchRoleOverridesParam,
  pruneBatchRoleOverrides,
  resolveOverriddenRole,
} from "@/lib/comfy/dynamicBatchRoleOverrides";

describe("buildBatchRoleOverrideParamKey", () => {
  it("builds the sibling param key from the batch node id", () => {
    expect(buildBatchRoleOverrideParamKey("42")).toBe("batchImageRoles_42");
  });
});

describe("parseBatchRoleOverridesParam", () => {
  it("parses a well-formed id:role,id:role param", () => {
    expect(parseBatchRoleOverridesParam("shot-1:character,asset-1-2:environment")).toEqual({
      "shot-1": "character",
      "asset-1-2": "environment",
    });
  });

  it("returns {} for null, undefined, or empty input — absent param behaves as before this ticket", () => {
    expect(parseBatchRoleOverridesParam(null)).toEqual({});
    expect(parseBatchRoleOverridesParam(undefined)).toEqual({});
    expect(parseBatchRoleOverridesParam("")).toEqual({});
  });

  it("drops malformed entries (no id, no role, no colon) rather than guessing", () => {
    expect(parseBatchRoleOverridesParam("shot-1:,:-,plainstring,shot-2:character")).toEqual({
      "shot-2": "character",
    });
  });
});

describe("serializeBatchRoleOverridesParam", () => {
  it("round-trips through parseBatchRoleOverridesParam", () => {
    const overrides = { "shot-1": "character", "asset-1-2": "environment" };
    const serialized = serializeBatchRoleOverridesParam(overrides);
    expect(parseBatchRoleOverridesParam(serialized)).toEqual(overrides);
  });

  it("serializes {} to an empty string", () => {
    expect(serializeBatchRoleOverridesParam({})).toBe("");
  });
});

describe("pruneBatchRoleOverrides — REFROLE.INTENT.1 filet mutation 3", () => {
  it("drops an override for an id no longer in the selection", () => {
    const overrides = { "shot-1": "character", "shot-2": "environment" };
    const pruned = pruneBatchRoleOverrides(overrides, ["shot-1"]);
    expect(pruned).toEqual({ "shot-1": "character" });
  });

  it("keeps every override whose id is still selected, and adds none", () => {
    const overrides = { "shot-1": "character" };
    const pruned = pruneBatchRoleOverrides(overrides, ["shot-1", "shot-2"]);
    expect(pruned).toEqual({ "shot-1": "character" });
  });

  it("returns {} when every overridden id was removed", () => {
    const overrides = { "shot-1": "character" };
    expect(pruneBatchRoleOverrides(overrides, [])).toEqual({});
  });
});

describe("resolveOverriddenRole — REFROLE.INTENT.1 filet mutation 2", () => {
  it("prefers the override over the library's stored role", () => {
    expect(resolveOverriddenRole("shot-1", "keyframe", { "shot-1": "character" })).toBe("character");
  });

  it("falls back to the library's stored role when no override exists for that id", () => {
    expect(resolveOverriddenRole("shot-1", "keyframe", { "shot-2": "character" })).toBe("keyframe");
  });

  it("falls back to the library's stored role when overrides is undefined — absent param behaves as before this ticket", () => {
    expect(resolveOverriddenRole("shot-1", "keyframe", undefined)).toBe("keyframe");
  });

  it("falls back to null when neither an override nor a stored role exists", () => {
    expect(resolveOverriddenRole("shot-1", null, undefined)).toBeNull();
  });
});
