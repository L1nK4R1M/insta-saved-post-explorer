import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getLibraryCollections: vi.fn(),
  createCollection: vi.fn(),
}));

vi.mock("@/auth/config", () => ({ getConfiguredOwnerId: () => "owner-public" }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/session", () => ({ requireSession: mocks.requireSession, UnauthorizedError: class extends Error {} }));
vi.mock("@/server/library", () => ({ getLibraryCollections: mocks.getLibraryCollections }));
vi.mock("@/server/collections", () => ({ createCollection: mocks.createCollection }));

describe("API collections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expose publiquement les collections du owner configuré", async () => {
    mocks.getLibraryCollections.mockResolvedValue([{ id: "favorites", name: "Favoris", slug: "favoris", isSystem: true, count: 1 }]);
    const { GET } = await import("@/app/api/collections/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.getLibraryCollections).toHaveBeenCalledWith("owner-public");
  });

  it("utilise exclusivement le owner de session pour créer", async () => {
    mocks.requireSession.mockResolvedValue({ ownerId: "owner-admin", role: "admin" });
    mocks.createCollection.mockResolvedValue({ id: "c1", name: "Voyages", slug: "voyages", isSystem: false });
    const { POST } = await import("@/app/api/collections/route");
    const response = await POST(new Request("http://localhost/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Voyages" }) }));
    expect(response.status).toBe(201);
    expect(mocks.createCollection).toHaveBeenCalledWith("owner-admin", "Voyages");
  });
});
