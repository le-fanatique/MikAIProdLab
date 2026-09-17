import { describe, it, expect } from "vitest";
import { invokeImageContentType } from "@/lib/invoke/invokeImageContentType";

// INVOKE.PUSH.1-FIX2 — Invoke returns 415 "Not an image" for any part whose
// content type does not start with "image", so the only behaviour that
// matters here is that every returned value does.
describe("invokeImageContentType", () => {
  it("maps the extensions MikAI actually stores", () => {
    expect(invokeImageContentType("shot.png")).toBe("image/png");
    expect(invokeImageContentType("shot.jpg")).toBe("image/jpeg");
    expect(invokeImageContentType("shot.jpeg")).toBe("image/jpeg");
    expect(invokeImageContentType("shot.webp")).toBe("image/webp");
  });

  it("is case-insensitive on the extension", () => {
    expect(invokeImageContentType("SHOT.PNG")).toBe("image/png");
    expect(invokeImageContentType("SHOT.JPG")).toBe("image/jpeg");
  });

  it("never returns a non-image type, whatever the name", () => {
    for (const name of ["noextension", "archive.zip", "weird.name.xyz", ".hidden", ""]) {
      expect(invokeImageContentType(name).startsWith("image/")).toBe(true);
    }
  });
});
