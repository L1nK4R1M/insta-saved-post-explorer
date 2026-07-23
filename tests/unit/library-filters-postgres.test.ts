// @vitest-environment node

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/auth/config", () => ({ getConfiguredOwnerId: () => "owner-a" }));

import type { PrismaClient } from "@prisma/client";

import { parseLibraryQuery } from "@/features/library/query-state";

// These regressions exercise the real PostgreSQL paths (Prisma where builders
// and raw relevance SQL). They are skipped without TEST_DATABASE_URL because
// the in-memory fallback already applies every filter and would hide the
// defects this suite guards against.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
// Values spread across [0, 1) so a wrongly scoped random offset would land on
// an out-of-filter row for at least one sample.
const RANDOM_SAMPLES = [0, 0.26, 0.51, 0.76, 0.99];

let library: typeof import("@/server/library");
let postsRoute: typeof import("@/app/api/posts/route");
let prisma: PrismaClient;
const previousDatabaseUrl = process.env.DATABASE_URL;

describeWithDatabase("library filters on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/server/db"));
    library = await import("@/server/library");
    postsRoute = await import("@/app/api/posts/route");
    await resetDatabase();
    await seedFixtures();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("relevance list and count", () => {
    it("both respect the author filter", async () => {
      const page = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", author: "Alice" }),
        OWNER_A,
      );
      expect(ids(page.items)).toEqual(["post-a1", "post-a3"]);
      expect(page.totalFiltered).toBe(2);
    });

    it("both respect the year filter", async () => {
      const page = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", year: 2024 }),
        OWNER_A,
      );
      expect(ids(page.items)).toEqual(["post-a2", "post-a3"]);
      expect(page.totalFiltered).toBe(2);
    });

    it("both respect the collection filter", async () => {
      const page = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", collection: "ete-2023" }),
        OWNER_A,
      );
      expect(ids(page.items)).toEqual(["post-a1", "post-a3"]);
      expect(page.totalFiltered).toBe(2);
    });

    it("both keep the favoris collection fallback through the favoris tag", async () => {
      const page = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", collection: "favoris" }),
        OWNER_A,
      );
      expect(ids(page.items)).toEqual(["post-a2", "post-a3"]);
      expect(page.totalFiltered).toBe(2);
    });

    it("paginate inside the filtered scope with a consistent total", async () => {
      const first = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", author: "Alice", limit: 1 }),
        OWNER_A,
      );
      expect(first.items).toHaveLength(1);
      expect(first.totalFiltered).toBe(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", author: "Alice", limit: 1, cursor: first.nextCursor }),
        OWNER_A,
      );
      expect(second.totalFiltered).toBe(2);
      expect(second.nextCursor).toBeNull();
      expect([...ids(first.items), ...ids(second.items)].sort()).toEqual(["post-a1", "post-a3"]);
    });
  });

  describe("normal random selection", () => {
    it("never escapes an active author filter", async () => {
      const query = parseLibraryQuery({ author: "Alice" });
      for (const sample of RANDOM_SAMPLES) {
        vi.spyOn(Math, "random").mockReturnValue(sample);
        const post = await library.getRandomLibraryPost(query, OWNER_A);
        expect(post?.authorUsername).toBe("Alice");
      }
    });

    it("never escapes an active year filter", async () => {
      const query = parseLibraryQuery({ year: 2024 });
      for (const sample of RANDOM_SAMPLES) {
        vi.spyOn(Math, "random").mockReturnValue(sample);
        const post = await library.getRandomLibraryPost(query, OWNER_A);
        expect(post?.publishedAt?.slice(0, 4)).toBe("2024");
      }
    });

    it("never escapes an active collection filter", async () => {
      const query = parseLibraryQuery({ collection: "ete-2023" });
      for (const sample of RANDOM_SAMPLES) {
        vi.spyOn(Math, "random").mockReturnValue(sample);
        const post = await library.getRandomLibraryPost(query, OWNER_A);
        expect(["post-a1", "post-a3"]).toContain(post?.id);
      }
    });
  });

  describe("relevance random selection", () => {
    it("never escapes active author, year, or collection filters", async () => {
      const scopes = [
        { query: parseLibraryQuery({ search: "plage", sort: "relevance", author: "Alice" }), expected: ["post-a1", "post-a3"] },
        { query: parseLibraryQuery({ search: "plage", sort: "relevance", year: 2024 }), expected: ["post-a2", "post-a3"] },
        { query: parseLibraryQuery({ search: "plage", sort: "relevance", collection: "ete-2023" }), expected: ["post-a1", "post-a3"] },
      ];
      for (const { query, expected } of scopes) {
        for (const sample of RANDOM_SAMPLES) {
          vi.spyOn(Math, "random").mockReturnValue(sample);
          const post = await library.getRandomLibraryPost(query, OWNER_A);
          expect(expected).toContain(post?.id);
        }
      }
    });

    it("honors combined author, year, and collection filters", async () => {
      const query = parseLibraryQuery({
        search: "plage",
        sort: "relevance",
        author: "Alice",
        year: 2024,
        collection: "ete-2023",
      });
      for (const sample of RANDOM_SAMPLES) {
        vi.spyOn(Math, "random").mockReturnValue(sample);
        const post = await library.getRandomLibraryPost(query, OWNER_A);
        expect(post?.id).toBe("post-a3");
      }
    });
  });

  describe("tag behavior", () => {
    it("keeps AND semantics on the normal and relevance paths", async () => {
      const normal = await library.queryLibraryPosts(
        parseLibraryQuery({ tags: ["Mer", "Sable"], tagMode: "and" }),
        OWNER_A,
      );
      expect(ids(normal.items)).toEqual(["post-a1"]);
      expect(normal.totalFiltered).toBe(1);
      const relevance = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", tags: ["Mer", "Sable"], tagMode: "and" }),
        OWNER_A,
      );
      expect(ids(relevance.items)).toEqual(["post-a1"]);
      expect(relevance.totalFiltered).toBe(1);
    });

    it("keeps OR semantics on the normal and relevance paths", async () => {
      const normal = await library.queryLibraryPosts(
        parseLibraryQuery({ tags: ["Mer", "Sable"], tagMode: "or" }),
        OWNER_A,
      );
      expect(ids(normal.items)).toEqual(["post-a1", "post-a2", "post-a3"]);
      expect(normal.totalFiltered).toBe(3);
      const relevance = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance", tags: ["Mer", "Sable"], tagMode: "or" }),
        OWNER_A,
      );
      expect(ids(relevance.items)).toEqual(["post-a1", "post-a2", "post-a3"]);
      expect(relevance.totalFiltered).toBe(3);
    });
  });

  describe("owner isolation", () => {
    it("scopes list, count, and relevance to the requested owner", async () => {
      const listA = await library.queryLibraryPosts(parseLibraryQuery({}), OWNER_A);
      expect(ids(listA.items)).toEqual(["post-a1", "post-a2", "post-a3"]);
      expect(listA.totalLibrary).toBe(3);
      const listB = await library.queryLibraryPosts(parseLibraryQuery({}), OWNER_B);
      expect(ids(listB.items)).toEqual(["post-b1"]);
      expect(listB.totalLibrary).toBe(1);
      const relevanceB = await library.queryLibraryPosts(
        parseLibraryQuery({ search: "plage", sort: "relevance" }),
        OWNER_B,
      );
      expect(ids(relevanceB.items)).toEqual(["post-b1"]);
      expect(relevanceB.totalFiltered).toBe(1);
    });

    it("scopes normal and relevance random to the requested owner", async () => {
      for (const sample of RANDOM_SAMPLES) {
        vi.spyOn(Math, "random").mockReturnValue(sample);
        const normal = await library.getRandomLibraryPost(parseLibraryQuery({}), OWNER_B);
        expect(normal?.id).toBe("post-b1");
        const relevance = await library.getRandomLibraryPost(
          parseLibraryQuery({ search: "plage", sort: "relevance" }),
          OWNER_B,
        );
        expect(relevance?.id).toBe("post-b1");
      }
    });
  });

  describe("/api/posts route", () => {
    it("returns the filtered page with a matching totalFiltered", async () => {
      const response = await postsRoute.GET(
        new Request("http://localhost/api/posts?search=plage&sort=relevance&author=Alice"),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(ids(body.items)).toEqual(["post-a1", "post-a3"]);
      expect(body.totalFiltered).toBe(2);
      expect(body.totalLibrary).toBe(3);
    });

    it("keeps random draws inside the active filters", async () => {
      for (const sample of RANDOM_SAMPLES) {
        vi.spyOn(Math, "random").mockReturnValue(sample);
        const response = await postsRoute.GET(
          new Request("http://localhost/api/posts?random=1&author=Alice&year=2023"),
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.item?.id).toBe("post-a1");
      }
    });
  });
});

function ids(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id).sort();
}

async function resetDatabase(): Promise<void> {
  const owners = { ownerId: { in: [OWNER_A, OWNER_B] } };
  await prisma.post.deleteMany({ where: owners });
  await prisma.tag.deleteMany({ where: owners });
  await prisma.collection.deleteMany({ where: owners });
}

async function seedFixtures(): Promise<void> {
  const tags = {
    mer: { id: "tag-a-mer", ownerId: OWNER_A, name: "Mer", slug: "mer" },
    sable: { id: "tag-a-sable", ownerId: OWNER_A, name: "Sable", slug: "sable" },
    favoris: { id: "tag-a-favoris", ownerId: OWNER_A, name: "Favoris", slug: "favoris" },
    merB: { id: "tag-b-mer", ownerId: OWNER_B, name: "Mer", slug: "mer" },
  };
  await prisma.tag.createMany({ data: Object.values(tags) });

  await prisma.collection.createMany({
    data: [
      { id: "col-a-ete", ownerId: OWNER_A, name: "Été 2023", slug: "ete-2023", isPublic: true },
      { id: "col-a-favoris", ownerId: OWNER_A, name: "Favoris", slug: "favoris", isSystem: true, isPublic: true },
      { id: "col-b-ete", ownerId: OWNER_B, name: "Été 2023", slug: "ete-2023", isPublic: true },
    ],
  });

  await prisma.post.createMany({
    data: [
      {
        id: "post-a1",
        ownerId: OWNER_A,
        postUrl: "https://instagram.com/p/a1",
        thumbnailUrl: "https://example.com/a1.jpg",
        authorUsername: "Alice",
        authorSortKey: "alice",
        caption: "Plage au soleil",
        searchText: "plage soleil vacances",
        contentType: "IMAGE",
        mainTheme: "Voyages",
        publishedAt: new Date("2023-06-15T12:00:00.000Z"),
        savedAt: new Date("2023-06-16T12:00:00.000Z"),
      },
      {
        id: "post-a2",
        ownerId: OWNER_A,
        postUrl: "https://instagram.com/p/a2",
        thumbnailUrl: "https://example.com/a2.jpg",
        authorUsername: "Bob",
        authorSortKey: "bob",
        caption: "Plage en hiver",
        searchText: "plage soleil hiver",
        contentType: "REEL",
        mainTheme: "Voyages",
        publishedAt: new Date("2024-03-10T12:00:00.000Z"),
        savedAt: new Date("2024-03-11T12:00:00.000Z"),
      },
      {
        id: "post-a3",
        ownerId: OWNER_A,
        postUrl: "https://instagram.com/p/a3",
        thumbnailUrl: "https://example.com/a3.jpg",
        authorUsername: "Alice",
        authorSortKey: "alice",
        caption: "Restaurant sur la plage",
        searchText: "plage restaurant terrasse",
        contentType: "IMAGE",
        mainTheme: "Restaurant",
        publishedAt: new Date("2024-08-01T12:00:00.000Z"),
        savedAt: new Date("2024-08-02T12:00:00.000Z"),
      },
      {
        id: "post-b1",
        ownerId: OWNER_B,
        postUrl: "https://instagram.com/p/b1",
        thumbnailUrl: "https://example.com/b1.jpg",
        authorUsername: "Alice",
        authorSortKey: "alice",
        caption: "Plage d'un autre propriétaire",
        searchText: "plage soleil vacances",
        contentType: "IMAGE",
        mainTheme: "Voyages",
        publishedAt: new Date("2023-05-05T12:00:00.000Z"),
        savedAt: new Date("2023-05-06T12:00:00.000Z"),
      },
    ],
  });

  await prisma.postTag.createMany({
    data: [
      { postId: "post-a1", tagId: "tag-a-mer" },
      { postId: "post-a1", tagId: "tag-a-sable" },
      { postId: "post-a2", tagId: "tag-a-mer" },
      { postId: "post-a2", tagId: "tag-a-favoris" },
      { postId: "post-a3", tagId: "tag-a-sable" },
      { postId: "post-b1", tagId: "tag-b-mer" },
    ],
  });

  await prisma.collectionPost.createMany({
    data: [
      { collectionId: "col-a-ete", postId: "post-a1" },
      { collectionId: "col-a-ete", postId: "post-a3" },
      { collectionId: "col-a-favoris", postId: "post-a3" },
      { collectionId: "col-b-ete", postId: "post-b1" },
    ],
  });
}
