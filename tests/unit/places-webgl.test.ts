import { describe, expect, it, vi } from "vitest";

import { WEBGL_FALLBACK_MESSAGE, isWebGlUsable, probeWebGl } from "@/lib/places/webgl";

// The probe decides whether a 1.86 MiB engine is downloaded, so what matters is
// that it answers honestly in every branch and never throws.

function canvasSupporting(...names: string[]) {
  const getContext = vi.fn((name: string) => (names.includes(name) ? { name } : null));
  return { canvas: { getContext } as unknown as HTMLCanvasElement, getContext };
}

describe("WebGL probe", () => {
  it("accepts webgl2 first, then the older context names", () => {
    const preferred = canvasSupporting("webgl2");
    expect(probeWebGl(() => preferred.canvas)).toBe("supported");
    // webgl2 is asked for first: no pointless extra context creation.
    expect(preferred.getContext).toHaveBeenCalledTimes(1);
    expect(preferred.getContext).toHaveBeenCalledWith("webgl2");

    // Older devices are not dropped to 2D unnecessarily.
    for (const name of ["webgl", "experimental-webgl"]) {
      expect(probeWebGl(() => canvasSupporting(name).canvas), name).toBe("supported");
    }
  });

  it("reports unsupported without ever falling back to the real document", () => {
    const none = canvasSupporting();
    expect(probeWebGl(() => none.canvas)).toBe("unsupported");
    expect(none.getContext).toHaveBeenCalledTimes(3);

    // An injected factory returning null is authoritative: probing the real
    // document would answer for a canvas the caller never asked for.
    const createElement = vi.spyOn(document, "createElement");
    expect(probeWebGl(() => null)).toBe("unsupported");
    expect(createElement).not.toHaveBeenCalled();
    createElement.mockRestore();

    // jsdom has no WebGL, so the honest answer through the real document is a
    // refusal — the point is that it reaches the document and does not throw.
    expect(["unsupported", "failed"]).toContain(probeWebGl());
  });

  it("treats a blocked or throwing probe as a refusal, never a crash", () => {
    const throwing = { getContext: () => { throw new Error("blocked by privacy settings"); } } as unknown as HTMLCanvasElement;
    expect(probeWebGl(() => throwing)).toBe("failed");
    expect(probeWebGl(() => { throw new Error("no document"); })).toBe("failed");

    // Only a proven "supported" may unlock the globe.
    expect(isWebGlUsable("supported")).toBe(true);
    expect(isWebGlUsable("unsupported")).toBe(false);
    expect(isWebGlUsable("failed")).toBe(false);
    expect(WEBGL_FALLBACK_MESSAGE).toContain("WebGL");
  });
});
