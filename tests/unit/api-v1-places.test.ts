// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createHash } from "node:crypto";

import { PlacesCursorError } from "@/lib/places/cursor";

const mocks = vi.hoisted(() => ({
  queryPlaces: vi.fn(),
  getPlaceDetail: vi.fn(),
  getPlacePosts: vi.fn(),
  queryEligiblePosts: vi.fn(),
  queryUnresolvedPlaceJobs: vi.fn(),
  getPlaceAnalysisJob: vi.fn(),
  getPlacesStats: vi.fn(),
}));
vi.mock("@/auth/config", () => ({ getConfiguredOwnerId: () => "owner-a" }));
vi.mock("@/server/places/queries", () => ({
  queryPlaces: mocks.queryPlaces,
  getPlaceDetail: mocks.getPlaceDetail,
  getPlacePosts: mocks.getPlacePosts,
  queryEligiblePosts: mocks.queryEligiblePosts,
  queryUnresolvedPlaceJobs: mocks.queryUnresolvedPlaceJobs,
  getPlaceAnalysisJob: mocks.getPlaceAnalysisJob,
}));
vi.mock("@/server/places/stats", () => ({ getPlacesStats: mocks.getPlacesStats }));

import * as listRoute from "@/app/api/v1/places/route";
import { GET as getDetail } from "@/app/api/v1/places/[id]/route";
import { GET as getPlacePostsRoute } from "@/app/api/v1/places/[id]/posts/route";
import { GET as getStats } from "@/app/api/v1/places/stats/route";
import { GET as getEligible } from "@/app/api/v1/places/eligible-posts/route";
import { GET as getUnresolved } from "@/app/api/v1/places/unresolved/route";
import { GET as getJob } from "@/app/api/v1/places/analysis-jobs/[id]/route";

const TOKEN = "ipe_secret-token-value";
const HASH = createHash("sha256").update(TOKEN).digest("hex");

function request(url: string, authorization: string | null = `Bearer ${TOKEN}`): Request {
  return new Request(url, authorization ? { headers: { authorization } } : undefined);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/v1/places routes", () => {
  beforeEach(() => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("exposes only a GET handler (no public mutation)", () => {
    expect(typeof listRoute.GET).toBe("function");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((listRoute as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it("rejects a missing key before touching the service", async () => {
    const response = await listRoute.GET(request("http://localhost/api/v1/places", null));
    expect(response.status).toBe(401);
    expect(mocks.queryPlaces).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects an invalid key", async () => {
    const response = await listRoute.GET(request("http://localhost/api/v1/places", "Bearer wrong"));
    expect(response.status).toBe(401);
    expect(mocks.queryPlaces).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the API is not configured", async () => {
    delete process.env.EXTERNAL_API_KEY_SHA256;
    const response = await listRoute.GET(request("http://localhost/api/v1/places"));
    expect(response.status).toBe(503);
    expect(mocks.queryPlaces).not.toHaveBeenCalled();
  });

  it("parses filters and forwards the configured owner", async () => {
    mocks.queryPlaces.mockResolvedValue({ items: [], nextCursor: null });
    const response = await listRoute.GET(
      request("http://localhost/api/v1/places?country_code=fr&precision=EXACT&review_status=CONFIRMED&limit=10&q=louvre"),
    );
    expect(response.status).toBe(200);
    const [input, owner] = mocks.queryPlaces.mock.calls[0];
    expect(owner).toBe("owner-a");
    expect(input).toMatchObject({ countryCode: "FR", precision: "EXACT", reviewStatus: "CONFIRMED", limit: 10, q: "louvre" });
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });

  it("maps an invalid cursor to a 400 BAD_REQUEST", async () => {
    mocks.queryPlaces.mockRejectedValue(new PlacesCursorError());
    const response = await listRoute.GET(request("http://localhost/api/v1/places?cursor=not-a-cursor"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
  });

  it("returns 404 when a place is absent for the owner", async () => {
    mocks.getPlaceDetail.mockResolvedValue(null);
    const response = await getDetail(request("http://localhost/api/v1/places/other"), params("other"));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns a place detail on success", async () => {
    mocks.getPlaceDetail.mockResolvedValue({ id: "p1", displayName: "Nobu" });
    const response = await getDetail(request("http://localhost/api/v1/places/p1"), params("p1"));
    expect(response.status).toBe(200);
    expect(mocks.getPlaceDetail).toHaveBeenCalledWith("p1", "owner-a");
  });

  it("returns 404 for a place's posts when the place is absent", async () => {
    mocks.getPlacePosts.mockResolvedValue(null);
    const response = await getPlacePostsRoute(request("http://localhost/api/v1/places/x/posts"), params("x"));
    expect(response.status).toBe(404);
  });

  it("returns stats on success", async () => {
    mocks.getPlacesStats.mockResolvedValue({ totals: {} });
    const response = await getStats(request("http://localhost/api/v1/places/stats?country_code=FR"));
    expect(response.status).toBe(200);
    expect(mocks.getPlacesStats).toHaveBeenCalledWith({ countryCode: "FR" }, "owner-a");
  });

  it("canonicalizes a source_theme filter and forwards it", async () => {
    mocks.getPlacesStats.mockResolvedValue({ totals: {} });
    const response = await getStats(request("http://localhost/api/v1/places/stats?source_theme=voyages"));
    expect(response.status).toBe(200);
    expect(mocks.getPlacesStats).toHaveBeenCalledWith({ sourceTheme: "Voyages" }, "owner-a");
  });

  it.each(["Cuisine", "Voyage", "Restaurants", "Lieux", ""]) (
    "rejects an ineligible source_theme %s with 400",
    async (theme) => {
      const response = await getStats(request(`http://localhost/api/v1/places/stats?source_theme=${encodeURIComponent(theme)}`));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("BAD_REQUEST");
      expect(mocks.getPlacesStats).not.toHaveBeenCalled();
    },
  );

  it("serves eligible-posts and unresolved with authentication first", async () => {
    const unauth = await getEligible(request("http://localhost/api/v1/places/eligible-posts", null));
    expect(unauth.status).toBe(401);
    expect(mocks.queryEligiblePosts).not.toHaveBeenCalled();

    mocks.queryEligiblePosts.mockResolvedValue({ items: [], nextCursor: null });
    expect((await getEligible(request("http://localhost/api/v1/places/eligible-posts"))).status).toBe(200);

    mocks.queryUnresolvedPlaceJobs.mockResolvedValue({ items: [], nextCursor: null });
    expect((await getUnresolved(request("http://localhost/api/v1/places/unresolved"))).status).toBe(200);
  });

  it("returns 404 for an absent analysis job", async () => {
    mocks.getPlaceAnalysisJob.mockResolvedValue(null);
    const response = await getJob(request("http://localhost/api/v1/places/analysis-jobs/none"), params("none"));
    expect(response.status).toBe(404);
  });
});
