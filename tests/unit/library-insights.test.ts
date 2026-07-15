// @vitest-environment node

import { describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { LibraryPost } from "@/features/library/types";
import { calculateDetailedFallbackStats, calculateFallbackAuthors, calculateLibraryYears } from "@/server/library-insights";

const post = (overrides: Partial<LibraryPost>): LibraryPost => ({
  id: "1", externalId: null, postUrl: "https://instagram.com/p/1", thumbnailUrl: "", mediaUrl: null,
  media: [{ id: "m1", type: "image", url: null, sourcePath: null, thumbnailUrl: null, position: 0 }],
  authorUsername: "CaféChef", caption: "", tags: ["Favoris", "Dessert"], savedAt: null,
  publishedAt: "2025-03-01T00:00:00.000Z", contentType: "image", mainTheme: "Cuisine",
  likesCount: 10, commentsCount: 2, metadata: {}, collections: [], ...overrides,
});

describe("library insights fallback", () => {
  const posts = [post({}), post({ id: "2", authorUsername: "cafechef", contentType: "reel", likesCount: null, commentsCount: 4, tags: ["Sport"], collections: ["favoris"] })];

  it("matches authors partially, accent- and case-insensitively, and aggregates counts", () => {
    expect(calculateFallbackAuthors(posts, "cafe", 10)).toEqual([{ username: "CaféChef", postCount: 2 }]);
  });

  it("computes additive distributions, favorites, totals and rated-post averages", () => {
    const stats = calculateDetailedFallbackStats(posts);
    expect(stats).toMatchObject({ posts: 2, authors: 1, favorites: 2, totalLikes: 10, totalComments: 6 });
    expect(stats.averages).toMatchObject({ likesPerRatedPost: 10, commentsPerRatedPost: 3, mediaPerPost: 1, tagsPerPost: 1.5 });
    expect(stats.distributions.mediaTypes).toContainEqual({ type: "reel", count: 1 });
    expect(stats.distributions.years).toEqual([{ year: 2025, count: 2 }]);
  });

  it("lists every publication year with global counts in descending order", () => {
    expect(calculateLibraryYears([
      ...posts,
      post({ id: "3", publishedAt: "2023-12-31T23:00:00.000Z" }),
      post({ id: "4", publishedAt: null }),
    ])).toEqual([
      { year: 2025, count: 2 },
      { year: 2023, count: 1 },
    ]);
  });
});
