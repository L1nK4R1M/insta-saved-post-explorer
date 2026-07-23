import "server-only";

import { GeoapifyPlaceResolver } from "@/server/places/resolvers/geoapify";
import type { PlaceResolver } from "@/server/places/resolvers/types";

// Configured resolver selection. Reads server-only environment variables and
// fails closed with a stable code when Places resolution is requested without a
// key or with an unsupported provider. Never prints the key.

export type PlacesResolverConfigCode =
  | "UNSUPPORTED_PLACES_RESOLVER"
  | "PLACES_RESOLVER_NOT_CONFIGURED"
  | "PLACES_RESOLVER_INSECURE_BASE_URL";

export class PlacesResolverConfigError extends Error {
  readonly code: PlacesResolverConfigCode;
  constructor(code: PlacesResolverConfigCode) {
    super(code);
    this.code = code;
    this.name = "PlacesResolverConfigError";
  }
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function getConfiguredPlaceResolver(): PlaceResolver {
  const provider = process.env.PLACES_RESOLVER_PROVIDER?.trim() || "geoapify";
  if (provider !== "geoapify") {
    throw new PlacesResolverConfigError("UNSUPPORTED_PLACES_RESOLVER");
  }

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new PlacesResolverConfigError("PLACES_RESOLVER_NOT_CONFIGURED");
  }

  const baseUrl = process.env.GEOAPIFY_API_BASE_URL?.trim() || "https://api.geoapify.com";
  // Reject a plaintext base URL outside tests so production never geocodes over HTTP.
  if (!baseUrl.startsWith("https://") && process.env.NODE_ENV !== "test") {
    throw new PlacesResolverConfigError("PLACES_RESOLVER_INSECURE_BASE_URL");
  }

  return new GeoapifyPlaceResolver({
    apiKey,
    baseUrl,
    timeoutMs: parseBoundedInt(process.env.PLACES_RESOLVER_TIMEOUT_MS, 8_000, 1_000, 30_000),
    maxResults: parseBoundedInt(process.env.PLACES_RESOLVER_MAX_RESULTS, 5, 1, 5),
  });
}

export { GeoapifyPlaceResolver, GeoapifyResolverError } from "@/server/places/resolvers/geoapify";
export type { GeoapifyResolverConfig, GeoapifyResolverErrorCode } from "@/server/places/resolvers/geoapify";
export type { PlaceResolutionInput, PlaceResolver, ResolvedPlaceCandidate } from "@/server/places/resolvers/types";
