import { describe, expect, it } from "vitest";

import type { LibraryPost } from "@/features/library/types";
import { filterAndPaginatePosts } from "@/features/library/filter-posts";
import { parseLibraryQuery } from "@/features/library/query-state";

const posts: LibraryPost[] = [
  makePost("a", "2026-07-03T00:00:00.000Z", "Élodie", ["Pâtisserie", "Chocolat"], "Sucré"),
  makePost("b", "2026-07-03T00:00:00.000Z", "Alice", ["Fitness", "Chocolat"], "Sport"),
  makePost("c", "2026-07-02T00:00:00.000Z", "Zoé", ["Pâtisserie", "Fruits"], "Sucré"),
  makePost("d", null, "Basile", ["Voyage"], "Europe"),
];

describe("filterAndPaginatePosts", () => {
  it("recherche sans distinction de casse ni d'accents", () => {
    const page = filterAndPaginatePosts(posts, parseLibraryQuery({ search: "ELODIE" }));
    expect(page.items.map((post) => post.id)).toEqual(["a"]);
  });

  it("applique les tags en modes ET et OU", () => {
    const andPage = filterAndPaginatePosts(
      posts,
      parseLibraryQuery({ tags: ["patisserie", "chocolat"], tagMode: "and" }),
    );
    const orPage = filterAndPaginatePosts(
      posts,
      parseLibraryQuery({ tags: ["fitness", "fruits"], tagMode: "or" }),
    );

    expect(andPage.items.map((post) => post.id)).toEqual(["a"]);
    expect(orPage.items.map((post) => post.id)).toEqual(["b", "c"]);
  });

  it("ne traite pas mainTheme comme un tag", () => {
    const page = filterAndPaginatePosts(posts, parseLibraryQuery({ tags: ["Sucré"] }));
    expect(page.items).toHaveLength(0);
  });

  it("filtre explicitement par thème principal", () => {
    const page = filterAndPaginatePosts(posts, parseLibraryQuery({ theme: "Sucré" }));
    expect(page.items.map((post) => post.id)).toEqual(["a", "c"]);
  });

  it("combine le type de contenu avec les autres filtres", () => {
    const typedPosts = posts.map((post, index) => ({
      ...post,
      contentType: index === 1 ? "reel" as const : index === 2 ? "carousel" as const : post.contentType,
    }));

    const carousel = filterAndPaginatePosts(typedPosts, parseLibraryQuery({
      contentType: "carousel",
      theme: "Sucré",
      tags: ["Fruits"],
    }));
    const videos = filterAndPaginatePosts(typedPosts, parseLibraryQuery({ contentType: "reel" }));

    expect(carousel.items.map((post) => post.id)).toEqual(["c"]);
    expect(videos.items.map((post) => post.id)).toEqual(["b"]);
  });

  it("trie par likes décroissants", () => {
    posts[0].likesCount = 20;
    posts[1].likesCount = 100;
    expect(filterAndPaginatePosts(posts, parseLibraryQuery({ sort: "likes" })).items.map((post) => post.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("pagine avec un curseur composite stable sans doublon", () => {
    const first = filterAndPaginatePosts(posts, parseLibraryQuery({ limit: 2, sort: "newest" }));
    const second = filterAndPaginatePosts(
      posts,
      parseLibraryQuery({ limit: 2, sort: "newest", cursor: first.nextCursor }),
    );

    expect(first.items.map((post) => post.id)).toEqual(["a", "b"]);
    expect(second.items.map((post) => post.id)).toEqual(["c", "d"]);
    expect(new Set([...first.items, ...second.items].map((post) => post.id)).size).toBe(4);
    expect(second.nextCursor).toBeNull();
  });

  it("place les dates absentes en dernier pour les tris temporels", () => {
    const oldest = filterAndPaginatePosts(posts, parseLibraryQuery({ sort: "oldest" }));
    expect(oldest.items.map((post) => post.id)).toEqual(["c", "a", "b", "d"]);
  });
});

function makePost(
  id: string,
  savedAt: string | null,
  authorUsername: string,
  tags: string[],
  mainTheme: string,
): LibraryPost {
  return {
    id,
    externalId: null,
    postUrl: `https://www.instagram.com/p/${id}`,
    thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
    mediaUrl: null,
    media: [],
    authorUsername,
    caption: `${authorUsername} prépare une recette`,
    tags,
    savedAt,
    publishedAt: null,
    contentType: "image",
    mainTheme,
    likesCount: null,
    commentsCount: null,
    metadata: {},
  };
}
