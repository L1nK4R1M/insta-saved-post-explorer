// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  queryLibraryPosts: vi.fn(),
  getRandomLibraryPost: vi.fn(),
  getLibraryPost: vi.fn(),
}));
vi.mock("@/auth/config", () => ({ getConfiguredOwnerId: () => "owner-a" }));
vi.mock("@/server/library", () => ({
  queryLibraryPosts: mocks.queryLibraryPosts,
  getRandomLibraryPost: mocks.getRandomLibraryPost,
  getLibraryPost: mocks.getLibraryPost,
}));

import { GET } from "@/app/api/v1/posts/route";
import { GET as getPostById } from "@/app/api/v1/posts/[id]/route";

const TOKEN = "ipe_secret-token-value";
const HASH = createHash("sha256").update(TOKEN).digest("hex");

function request(url: string, authorization: string | null = `Bearer ${TOKEN}`): Request {
  return new Request(url, authorization ? { headers: { authorization } } : undefined);
}

describe("GET /api/v1/posts", () => {
  beforeEach(() => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    mocks.queryLibraryPosts.mockReset();
    mocks.getRandomLibraryPost.mockReset();
    mocks.getLibraryPost.mockReset();
  });

  it("rejects an unauthenticated request before touching the service", async () => {
    const response = await GET(request("http://localhost/api/v1/posts", null));
    expect(response.status).toBe(401);
    expect(mocks.queryLibraryPosts).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });

  it("passes the parsed query and configured owner, returns the page shape", async () => {
    mocks.queryLibraryPosts.mockResolvedValue({ items: [], nextCursor: null, total: 0, totalFiltered: 0, totalLibrary: 0 });
    const response = await GET(request("http://localhost/api/v1/posts?q=flan&sort=relevance&limit=20&tag=Pistache&tagMode=and"));
    expect(response.status).toBe(200);
    expect(mocks.queryLibraryPosts).toHaveBeenCalledTimes(1);
    const [query, owner] = mocks.queryLibraryPosts.mock.calls[0];
    expect(owner).toBe("owner-a");
    expect(query).toMatchObject({ search: "flan", sort: "relevance", limit: 20, tags: ["Pistache"], tagMode: "and" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses the random path when random=1", async () => {
    mocks.getRandomLibraryPost.mockResolvedValue({ id: "p1" });
    const response = await GET(request("http://localhost/api/v1/posts?random=1&author=Alice"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: { id: "p1" } });
    expect(mocks.getRandomLibraryPost).toHaveBeenCalledTimes(1);
    expect(mocks.queryLibraryPosts).not.toHaveBeenCalled();
  });

  it("maps invalid parameters to 400 BAD_REQUEST", async () => {
    const response = await GET(request("http://localhost/api/v1/posts?limit=9999"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
    expect(mocks.queryLibraryPosts).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/posts/:id", () => {
  beforeEach(() => {
    process.env.EXTERNAL_API_KEY_SHA256 = HASH;
    mocks.getLibraryPost.mockReset();
  });

  it("returns the post when found", async () => {
    mocks.getLibraryPost.mockResolvedValue({ id: "abc" });
    const response = await getPostById(request("http://localhost/api/v1/posts/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "abc" });
    expect(mocks.getLibraryPost).toHaveBeenCalledWith("abc", "owner-a");
  });

  it("returns 404 NOT_FOUND when the post is missing", async () => {
    mocks.getLibraryPost.mockResolvedValue(null);
    const response = await getPostById(request("http://localhost/api/v1/posts/missing"), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("rejects an unauthenticated detail request", async () => {
    const response = await getPostById(request("http://localhost/api/v1/posts/abc", null), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(401);
    expect(mocks.getLibraryPost).not.toHaveBeenCalled();
  });
});
