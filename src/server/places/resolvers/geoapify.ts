import "server-only";

import { z } from "zod";

import type { PlaceCandidate } from "@/lib/places/candidates";
import type { PlaceResolutionInput, PlaceResolver, ResolvedPlaceCandidate } from "@/server/places/resolvers/types";

// Geoapify geographic resolver behind the replaceable PlaceResolver interface.
// It turns a textual candidate into provider-verified coordinates and a provider
// identity. It never logs the API key, the request URL, or the caption, and its
// thrown errors carry only a stable code and an optional HTTP status.

const GEOAPIFY_ATTRIBUTION = "Powered by Geoapify";
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export type GeoapifyResolverErrorCode =
  | "GEOAPIFY_HTTP_ERROR"
  | "GEOAPIFY_INVALID_RESPONSE"
  | "GEOAPIFY_TIMEOUT"
  | "GEOAPIFY_UNAVAILABLE";

export class GeoapifyResolverError extends Error {
  readonly code: GeoapifyResolverErrorCode;
  readonly status?: number;
  constructor(code: GeoapifyResolverErrorCode, status?: number) {
    // The message is the stable code only: never interpolate the URL, key, or body.
    super(code);
    this.code = code;
    this.status = status;
    this.name = "GeoapifyResolverError";
  }
}

export type GeoapifyResolverConfig = {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResults?: number;
  retryDelayMs?: number;
};

// Only the bounded fields we normalize are declared; unknown provider fields are
// discarded after parsing. A non-numeric coordinate fails validation.
const geoapifyResultSchema = z
  .object({
    place_id: z.string().min(1),
    name: z.string().nullish(),
    formatted: z.string().nullish(),
    address_line1: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
    country_code: z.string().nullish(),
    lat: z.number(),
    lon: z.number(),
    result_type: z.string().nullish(),
    rank: z.object({ confidence: z.number() }).partial().nullish(),
    category: z.string().nullish(),
  })
  .passthrough();

const geoapifyResponseSchema = z.object({ results: z.array(geoapifyResultSchema) });

function clampMaxResults(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 5;
  return Math.min(5, Math.max(1, Math.trunc(value)));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeoapifyPlaceResolver implements PlaceResolver {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResults: number;
  private readonly retryDelayMs: number;

  constructor(config: GeoapifyResolverConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.maxResults = clampMaxResults(config.maxResults);
    this.retryDelayMs = config.retryDelayMs ?? 250;
  }

  async resolve(input: PlaceResolutionInput): Promise<ResolvedPlaceCandidate[]> {
    const url = this.buildUrl(input.candidate);

    let response = await this.fetchOnce(url);
    if (!response.ok && RETRYABLE_STATUSES.has(response.status)) {
      await delay(this.retryDelayMs);
      response = await this.fetchOnce(url);
    }

    if (!response.ok) {
      if (RETRYABLE_STATUSES.has(response.status)) {
        throw new GeoapifyResolverError("GEOAPIFY_UNAVAILABLE", response.status);
      }
      throw new GeoapifyResolverError("GEOAPIFY_HTTP_ERROR", response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GeoapifyResolverError("GEOAPIFY_INVALID_RESPONSE");
    }

    const parsed = geoapifyResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new GeoapifyResolverError("GEOAPIFY_INVALID_RESPONSE");
    }

    return parsed.data.results.slice(0, this.maxResults).map((result) => normalizeResult(result));
  }

  private async fetchOnce(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    } catch (error) {
      if (isAbortError(error)) throw new GeoapifyResolverError("GEOAPIFY_TIMEOUT");
      throw new GeoapifyResolverError("GEOAPIFY_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  // Structured geocoding request. The API key travels in the query string to
  // Geoapify but is never logged. Caption text is never included.
  private buildUrl(candidate: PlaceCandidate): string {
    const params = new URLSearchParams();
    if (candidate.name) params.set("name", candidate.name);
    if (candidate.city) params.set("city", candidate.city);
    if (candidate.region) params.set("state", candidate.region);
    if (candidate.country) params.set("country", candidate.country);
    params.set("limit", String(this.maxResults));
    params.set("format", "json");
    params.set("apiKey", this.apiKey);
    return `${this.baseUrl}/v1/geocode/search?${params.toString()}`;
  }
}

function normalizeResult(result: z.infer<typeof geoapifyResultSchema>): ResolvedPlaceCandidate {
  return {
    provider: "geoapify",
    providerPlaceId: result.place_id,
    displayName: result.name ?? result.formatted ?? result.address_line1 ?? result.place_id,
    category: result.category ?? null,
    address: result.formatted ?? null,
    city: result.city ?? null,
    region: result.state ?? null,
    country: result.country ?? null,
    countryCode: result.country_code ? result.country_code.trim().toUpperCase() : null,
    latitude: result.lat,
    longitude: result.lon,
    providerResultType: result.result_type ?? null,
    providerRank: result.rank?.confidence ?? null,
    attribution: GEOAPIFY_ATTRIBUTION,
  };
}
