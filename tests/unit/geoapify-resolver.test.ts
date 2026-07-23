// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PlaceCandidate } from "@/lib/places/candidates";
import {
  GeoapifyPlaceResolver,
  GeoapifyResolverError,
  getConfiguredPlaceResolver,
  PlacesResolverConfigError,
} from "@/server/places/resolvers";
import type { PlaceResolutionInput } from "@/server/places/resolvers/types";

const SECRET_KEY = "super-secret-geoapify-key";

function restaurantCandidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    name: "Nobu Dubai",
    city: "Dubai",
    region: null,
    country: "United Arab Emirates",
    category: "restaurant",
    confidence: 0.9,
    evidence: [{ type: "CAPTION", excerpt: "Dinner at Nobu Dubai, amazing" }],
    ...overrides,
  };
}

function resolutionInput(overrides: Partial<PlaceCandidate> = {}): PlaceResolutionInput {
  return { candidate: restaurantCandidate(overrides), sourceTheme: "Restaurant" };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function validGeoapifyBody() {
  return {
    results: [
      {
        place_id: "geo-abc",
        name: "Nobu Dubai",
        formatted: "Nobu, Atlantis The Palm, Dubai, United Arab Emirates",
        city: "Dubai",
        state: null,
        country: "United Arab Emirates",
        country_code: "ae",
        lat: 25.13,
        lon: 55.11,
        result_type: "amenity",
        rank: { confidence: 0.95 },
        category: "catering.restaurant",
      },
    ],
  };
}

function resolver(fetchImpl: typeof fetch) {
  return new GeoapifyPlaceResolver({
    apiKey: SECRET_KEY,
    baseUrl: "https://api.geoapify.com",
    fetchImpl,
    timeoutMs: 50,
    maxResults: 5,
    retryDelayMs: 0,
  });
}

describe("GeoapifyPlaceResolver", () => {
  it("builds a structured request without leaking the key or caption", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validGeoapifyBody()));
    await resolver(fetchMock).resolve(resolutionInput());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/geocode/search?");
    expect(url).toContain("name=Nobu+Dubai");
    expect(url).toContain("city=Dubai");
    expect(url).toContain("country=United+Arab+Emirates");
    expect(url).not.toContain("caption");
    expect(url).not.toContain("Dinner at Nobu");
  });

  it("normalizes a valid response into resolved candidates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validGeoapifyBody()));
    const [first] = await resolver(fetchMock).resolve(resolutionInput());
    expect(first).toMatchObject({
      provider: "geoapify",
      providerPlaceId: "geo-abc",
      displayName: "Nobu Dubai",
      city: "Dubai",
      country: "United Arab Emirates",
      countryCode: "AE",
      latitude: 25.13,
      longitude: 55.11,
      providerResultType: "amenity",
      providerRank: 0.95,
    });
    expect(first.attribution).toBeTruthy();
  });

  it("returns an empty array when the provider has no results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    await expect(resolver(fetchMock).resolve(resolutionInput())).resolves.toEqual([]);
  });

  it("caps the number of returned results to maxResults", async () => {
    const many = { results: Array.from({ length: 9 }, (_, i) => ({ ...validGeoapifyBody().results[0], place_id: `geo-${i}` })) };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(many));
    const results = await resolver(fetchMock).resolve(resolutionInput());
    expect(results).toHaveLength(5);
  });

  it("throws GEOAPIFY_INVALID_RESPONSE on a malformed payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));
    await expect(resolver(fetchMock).resolve(resolutionInput())).rejects.toMatchObject({
      code: "GEOAPIFY_INVALID_RESPONSE",
    });
  });

  it("throws GEOAPIFY_INVALID_RESPONSE when a result has a non-numeric coordinate", async () => {
    const bad = { results: [{ ...validGeoapifyBody().results[0], lat: "not-a-number" }] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(bad));
    await expect(resolver(fetchMock).resolve(resolutionInput())).rejects.toMatchObject({
      code: "GEOAPIFY_INVALID_RESPONSE",
    });
  });

  it("does not retry a non-retryable 400 and throws GEOAPIFY_HTTP_ERROR", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad request" }, 400));
    await expect(resolver(fetchMock).resolve(resolutionInput())).rejects.toMatchObject({
      code: "GEOAPIFY_HTTP_ERROR",
      status: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on 429 and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse(validGeoapifyBody()));
    const results = await resolver(fetchMock).resolve(resolutionInput());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
  });

  it("throws GEOAPIFY_UNAVAILABLE after a retried 503 keeps failing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "unavailable" }, 503));
    await expect(resolver(fetchMock).resolve(resolutionInput())).rejects.toMatchObject({
      code: "GEOAPIFY_UNAVAILABLE",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws GEOAPIFY_TIMEOUT when the request is aborted", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    ) as unknown as typeof fetch;
    await expect(resolver(fetchMock).resolve(resolutionInput())).rejects.toMatchObject({
      code: "GEOAPIFY_TIMEOUT",
    });
  });

  it("never includes the API key or caption in thrown errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "forbidden" }, 403));
    try {
      await resolver(fetchMock).resolve(resolutionInput());
      throw new Error("expected the resolver to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GeoapifyResolverError);
      const serialized = `${(error as Error).message} ${(error as Error).stack ?? ""}`;
      expect(serialized).not.toContain(SECRET_KEY);
      expect(serialized).not.toContain("Dinner at Nobu");
    }
  });
});

describe("getConfiguredPlaceResolver", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.GEOAPIFY_API_KEY;
    delete process.env.PLACES_RESOLVER_PROVIDER;
    delete process.env.GEOAPIFY_API_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("throws PLACES_RESOLVER_NOT_CONFIGURED when the API key is absent", () => {
    expect(() => getConfiguredPlaceResolver()).toThrow(PlacesResolverConfigError);
    try {
      getConfiguredPlaceResolver();
    } catch (error) {
      expect((error as PlacesResolverConfigError).code).toBe("PLACES_RESOLVER_NOT_CONFIGURED");
    }
  });

  it("rejects an unsupported provider", () => {
    process.env.GEOAPIFY_API_KEY = SECRET_KEY;
    process.env.PLACES_RESOLVER_PROVIDER = "somethingelse";
    try {
      getConfiguredPlaceResolver();
      throw new Error("expected a config error");
    } catch (error) {
      expect((error as PlacesResolverConfigError).code).toBe("UNSUPPORTED_PLACES_RESOLVER");
    }
  });

  it("builds a resolver when the key is present", () => {
    process.env.GEOAPIFY_API_KEY = SECRET_KEY;
    expect(getConfiguredPlaceResolver()).toBeInstanceOf(GeoapifyPlaceResolver);
  });
});
