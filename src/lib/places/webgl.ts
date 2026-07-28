// WebGL capability probe.
//
// The globe engine is heavy, so it must never be downloaded on a device that
// cannot render it (FR-I-12). This probe answers that question before the lazy
// chunk is requested, using a throwaway canvas and no engine import at all.
//
// Three outcomes are distinguished on purpose:
// - "supported"   a context was obtained; the globe can be offered;
// - "unsupported" the browser answered honestly that it has no WebGL;
// - "failed"      the probe itself threw (blocked canvas, hardened privacy
//                 setting, driver crash). It is treated exactly like
//                 "unsupported" by the UI, but kept distinct so the message and
//                 any future diagnostics can tell the two apart.

export type WebGlSupport = "supported" | "unsupported" | "failed";

export function isWebGlUsable(support: WebGlSupport): boolean {
  return support === "supported";
}

type ContextProvider = Pick<HTMLCanvasElement, "getContext">;

// The canvas factory is injectable so the probe is testable in a plain Node or
// jsdom environment, where no real WebGL implementation exists.
export function probeWebGl(createCanvas?: () => ContextProvider | null): WebGlSupport {
  try {
    // An injected factory is authoritative: if it returns null the answer is
    // "no canvas", not "go ask the real document".
    const canvas = createCanvas
      ? createCanvas()
      : typeof document === "undefined"
        ? null
        : (document.createElement("canvas") as ContextProvider);
    if (!canvas) return "unsupported";

    // `webgl2` first: it is what the engine actually wants. `webgl` and the
    // legacy experimental name keep older devices on the fast path instead of
    // dropping them to 2D unnecessarily.
    for (const contextName of ["webgl2", "webgl", "experimental-webgl"] as const) {
      const context = canvas.getContext(contextName);
      if (context) return "supported";
    }
    return "unsupported";
  } catch {
    // A throwing getContext is a refusal, not a crash to propagate: the caller
    // falls back to 2D and the page stays usable.
    return "failed";
  }
}

export const WEBGL_FALLBACK_MESSAGE =
  "Votre navigateur ne peut pas afficher le globe 3D (WebGL indisponible). La carte 2D, la liste et les filtres restent utilisables.";
