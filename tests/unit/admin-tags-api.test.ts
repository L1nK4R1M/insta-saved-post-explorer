// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSessionMock, getAdminTagsMock } = vi.hoisted(() => ({ requireSessionMock: vi.fn(), getAdminTagsMock: vi.fn() }));
vi.mock("@/auth/session", () => ({ requireSession: requireSessionMock, UnauthorizedError: class UnauthorizedError extends Error {} }));
vi.mock("@/server/admin-insights", () => ({ getAdminTags: getAdminTagsMock }));
vi.mock("@/server/admin-http", () => ({ adminApiErrorResponse: () => Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) }));

import { GET } from "@/app/api/admin/tags/route";

describe("admin tags API", () => {
  beforeEach(() => { requireSessionMock.mockReset(); getAdminTagsMock.mockReset(); });

  it("scopes reads to the authenticated owner", async () => {
    requireSessionMock.mockResolvedValue({ ownerId: "owner-a", role: "admin" });
    getAdminTagsMock.mockResolvedValue({ items: [], variants: [] });
    const response = await GET(new Request("http://localhost/api/admin/tags?q=cafe"));
    expect(response.status).toBe(200);
    expect(getAdminTagsMock).toHaveBeenCalledWith("owner-a", "cafe");
  });

  it("rejects reads without a session", async () => {
    requireSessionMock.mockRejectedValue(new Error("UNAUTHORIZED"));
    const response = await GET(new Request("http://localhost/api/admin/tags"));
    expect(response.status).toBe(401);
    expect(getAdminTagsMock).not.toHaveBeenCalled();
  });
});
