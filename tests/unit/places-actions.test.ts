// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A Server Action is a directly invocable endpoint, so these tests call the
// actions the way an attacker would: without going through /places and without a
// session. Session, owner and service layers are mocked; no database is needed.

const getSession = vi.fn();
const getPlacePosts = vi.fn();
const confirmPlace = vi.fn();
const rejectPlaceResult = vi.fn();

vi.mock("@/auth/session", () => ({ getSession }));
vi.mock("@/auth/config", () => ({ getConfiguredOwnerId: () => "owner-actions" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/places/queries", () => ({ getPlacePosts }));
vi.mock("@/server/places/review", () => {
  class PlaceReviewError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
      this.name = "PlaceReviewError";
    }
  }
  return { confirmPlace, rejectPlaceResult, PlaceReviewError };
});

const loadActions = async () => import("@/features/places/actions");

describe("Places server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadPlacePostsAction", () => {
    it("reads configured-owner posts for the public Places page without a session", async () => {
      getSession.mockResolvedValue(null);
      getPlacePosts.mockResolvedValue({ items: [{ postId: "p1" }], nextCursor: null });
      const actions = await loadActions();

      await expect(actions.loadPlacePostsAction("place-1")).resolves.toEqual({ ok: true, posts: [{ postId: "p1" }] });
      expect(getPlacePosts).toHaveBeenCalledWith("place-1", { limit: 24 }, "owner-actions");
      expect(getSession).not.toHaveBeenCalled();
    });

    it("reads owner-scoped posts for an authenticated session", async () => {
      getSession.mockResolvedValue({ ownerId: "owner-actions", role: "admin", bypass: false });
      getPlacePosts.mockResolvedValue({ items: [{ postId: "p1" }], nextCursor: null });
      const actions = await loadActions();

      await expect(actions.loadPlacePostsAction("place-1")).resolves.toEqual({ ok: true, posts: [{ postId: "p1" }] });
      // The owner is always passed to the query: the action never reads globally.
      expect(getPlacePosts).toHaveBeenCalledWith("place-1", { limit: 24 }, "owner-actions");
    });

    it("treats another owner's place as absent", async () => {
      getSession.mockResolvedValue({ ownerId: "owner-actions", role: "admin", bypass: false });
      getPlacePosts.mockResolvedValue(null); // owner-scoped query found nothing
      const actions = await loadActions();

      await expect(actions.loadPlacePostsAction("someone-elses-place")).resolves.toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
    });

    it("never leaks an internal message when the query fails", async () => {
      getSession.mockResolvedValue({ ownerId: "owner-actions", role: "admin", bypass: false });
      getPlacePosts.mockRejectedValue(new Error("Invalid `prisma.place.findFirst()` invocation: secret detail"));
      const actions = await loadActions();

      const result = await actions.loadPlacePostsAction("place-1");
      expect(result).toEqual({ ok: false, code: "PLACE_POSTS_FAILED" });
      expect(JSON.stringify(result)).not.toContain("prisma");
      expect(JSON.stringify(result)).not.toContain("secret detail");
    });
  });

  describe("review mutations", () => {
    it("still require the admin role, not merely a session", async () => {
      getSession.mockResolvedValue({ ownerId: "owner-actions", role: "viewer", bypass: false });
      const actions = await loadActions();

      await expect(actions.confirmPlaceAction("place-1")).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
      await expect(actions.rejectPlaceAction("place-1")).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
      expect(confirmPlace).not.toHaveBeenCalled();
      expect(rejectPlaceResult).not.toHaveBeenCalled();
    });

    it("refuse a mutation without any session", async () => {
      getSession.mockResolvedValue(null);
      const actions = await loadActions();

      await expect(actions.confirmPlaceAction("place-1")).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
      expect(confirmPlace).not.toHaveBeenCalled();
    });

    it("confirms with a bounded actor and reason for an admin", async () => {
      getSession.mockResolvedValue({ ownerId: "owner-actions", role: "admin", bypass: false });
      confirmPlace.mockResolvedValue({ id: "place-1" });
      const actions = await loadActions();

      await expect(actions.confirmPlaceAction("place-1")).resolves.toEqual({ ok: true });
      expect(confirmPlace).toHaveBeenCalledWith("owner-actions", "place-1", {
        actor: { type: "USER", id: "owner-actions" },
        reason: expect.any(String),
      });
    });

    it("surfaces only the stable review error code", async () => {
      getSession.mockResolvedValue({ ownerId: "owner-actions", role: "admin", bypass: false });
      const { PlaceReviewError } = await import("@/server/places/review");
      confirmPlace.mockRejectedValue(new PlaceReviewError("PLACE_REVIEW_AUDIT_CONTEXT_MISSING"));
      const actions = await loadActions();

      await expect(actions.confirmPlaceAction("place-1")).resolves.toEqual({
        ok: false,
        code: "PLACE_REVIEW_AUDIT_CONTEXT_MISSING",
      });
    });

    it("maps an unexpected failure to a generic code", async () => {
      getSession.mockResolvedValue({ ownerId: "owner-actions", role: "admin", bypass: false });
      rejectPlaceResult.mockRejectedValue(new Error("Prisma connection lost at 10.0.0.5"));
      const actions = await loadActions();

      const result = await actions.rejectPlaceAction("place-1");
      expect(result).toEqual({ ok: false, code: "PLACE_REVIEW_FAILED" });
      expect(JSON.stringify(result)).not.toContain("10.0.0.5");
    });
  });
});
