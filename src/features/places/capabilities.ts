"use client";

import { useCallback, useSyncExternalStore } from "react";

import { probeWebGl, type WebGlSupport } from "@/lib/places/webgl";

// Client capabilities the Places shell needs before it can offer the 3D view.
//
// Both are read through `useSyncExternalStore` rather than an effect writing
// state: the server render must not claim a capability it cannot observe, and
// the client must not trigger a cascading render just to learn something the
// platform can answer synchronously.

/** Not yet known — the value the server render must use. */
export type WebGlState = WebGlSupport | "unknown";

let cachedSupport: WebGlSupport | null = null;

// The probe result cannot change during a session, so it is computed once and
// then returned by identity, which is what getSnapshot requires.
function webGlSnapshot(): WebGlState {
  cachedSupport ??= probeWebGl();
  return cachedSupport;
}

function webGlServerSnapshot(): WebGlState {
  return "unknown";
}

const noopSubscribe = () => () => {};

export function useWebGlSupport(): WebGlState {
  return useSyncExternalStore(noopSubscribe, webGlSnapshot, webGlServerSnapshot);
}

/** Test seam: forget the memoized probe result. */
export function resetWebGlSupportCache(): void {
  cachedSupport = null;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function matchMediaOrNull(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = matchMediaOrNull();
    if (!query) return () => {};
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => matchMediaOrNull()?.matches ?? false,
    // Assume motion is allowed on the server: the client corrects it on hydration
    // and no animation has run by then.
    () => false,
  );
}
