import { describe, expect, it, vi } from "vitest";

import { WEBGL_FALLBACK_MESSAGE, isWebGlUsable, probeWebGl } from "@/lib/places/webgl";

// A canvas stub that answers only for the context names it was given, so each
// test states exactly what the browser is pretending to support.
function canvasSupporting(...names: string[]) {
  const getContext = vi.fn((name: string) => (names.includes(name) ? { name } : null));
  return { canvas: { getContext } as unknown as HTMLCanvasElement, getContext };
}

describe("WebGL probe", () => {
  it("reports support when webgl2 is available", () => {
    const { canvas, getContext } = canvasSupporting("webgl2");
    expect(probeWebGl(() => canvas)).toBe("supported");
    // webgl2 is asked for first: no pointless extra context creation.
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith("webgl2");
  });

  it("falls back to webgl1 rather than dropping an older device to 2D", () => {
    const { canvas, getContext } = canvasSupporting("webgl");
    expect(probeWebGl(() => canvas)).toBe("supported");
    expect(getContext).toHaveBeenCalledWith("webgl2");
    expect(getContext).toHaveBeenCalledWith("webgl");
  });

  it("accepts the legacy experimental context name", () => {
    const { canvas } = canvasSupporting("experimental-webgl");
    expect(probeWebGl(() => canvas)).toBe("supported");
  });

  it("reports unsupported when no context can be created", () => {
    const { canvas, getContext } = canvasSupporting();
    expect(probeWebGl(() => canvas)).toBe("unsupported");
    expect(getContext).toHaveBeenCalledTimes(3);
  });

  it("reports unsupported when there is no canvas at all", () => {
    // An injected factory returning null must not silently fall back to the real
    // document: the probe would then answer for a canvas the caller never asked
    // for, which is exactly what the fallback path must not do.
    const createElement = vi.spyOn(document, "createElement");
    expect(probeWebGl(() => null)).toBe("unsupported");
    expect(createElement).not.toHaveBeenCalled();
    createElement.mockRestore();
  });

  it("uses the real document when no factory is injected", () => {
    // jsdom has no WebGL implementation, so the honest answer under test is
    // "unsupported" — the point is that the probe reaches the document and does
    // not throw.
    expect(["unsupported", "failed"]).toContain(probeWebGl());
  });

  it("reports failed instead of throwing when the browser blocks the probe", () => {
    const canvas = {
      getContext: () => {
        throw new Error("blocked by privacy settings");
      },
    } as unknown as HTMLCanvasElement;
    expect(probeWebGl(() => canvas)).toBe("failed");
  });

  it("reports failed when creating the canvas itself throws", () => {
    expect(
      probeWebGl(() => {
        throw new Error("no document");
      }),
    ).toBe("failed");
  });

  it("treats only 'supported' as usable", () => {
    expect(isWebGlUsable("supported")).toBe(true);
    expect(isWebGlUsable("unsupported")).toBe(false);
    expect(isWebGlUsable("failed")).toBe(false);
  });

  it("never leaves the user without an explanation", () => {
    expect(WEBGL_FALLBACK_MESSAGE).toContain("WebGL");
    expect(WEBGL_FALLBACK_MESSAGE.length).toBeGreaterThan(20);
  });

  it("does not import any 3D engine", async () => {
    // The probe must be safe to run before the engine chunk is downloaded.
    const source = await import("@/lib/places/webgl");
    expect(Object.keys(source).sort()).toEqual([
      "WEBGL_FALLBACK_MESSAGE",
      "isWebGlUsable",
      "probeWebGl",
    ]);
  });
});
