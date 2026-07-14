// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLibraryAuthorsMock } = vi.hoisted(() => ({ getLibraryAuthorsMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/config", () => ({ getConfiguredOwnerId: () => "owner-a" }));
vi.mock("@/server/library", () => ({ getLibraryAuthors: getLibraryAuthorsMock }));

import { GET } from "@/app/api/authors/route";

describe("public authors API", () => {
  beforeEach(() => getLibraryAuthorsMock.mockReset());

  it("passes the configured owner, partial query and bounded limit", async () => {
    getLibraryAuthorsMock.mockResolvedValue([{ username: "CaféChef", postCount: 4 }]);
    const response = await GET(new Request("http://localhost/api/authors?q=caf%C3%A9&limit=8"));
    expect(response.status).toBe(200);
    expect(getLibraryAuthorsMock).toHaveBeenCalledWith("owner-a", "café", 8);
    await expect(response.json()).resolves.toEqual({ items: [{ username: "CaféChef", postCount: 4 }], query: "café", limit: 8 });
  });

  it("rejects limits above the public cap", async () => {
    const response = await GET(new Request("http://localhost/api/authors?limit=51"));
    expect(response.status).toBe(400);
    expect(getLibraryAuthorsMock).not.toHaveBeenCalled();
  });
});
