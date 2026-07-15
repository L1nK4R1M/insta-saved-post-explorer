import type { LibraryPost, SortMode } from "@/features/library/types";
import {
  decodeLibraryCursor,
  encodeLibraryCursor,
  type LibraryQuery,
} from "@/features/library/query-state";
import { foldForSearch, tagSlug } from "@/lib/import/normalize";

export type LibraryPostPage = {
  items: LibraryPost[];
  nextCursor: string | null;
  /** @deprecated Use totalFiltered. Kept for API consumers from phase 0. */
  total: number;
  totalFiltered: number;
  totalLibrary: number;
};

export function filterAndPaginatePosts(
  posts: LibraryPost[],
  query: LibraryQuery,
): LibraryPostPage {
  const search = foldForSearch(query.search);
  const expectedTags = query.tags.map(tagSlug).filter(Boolean);
  const filtered = posts.filter((post) => {
    if (query.theme && post.mainTheme !== query.theme) return false;
    if (query.contentType && post.contentType !== query.contentType) return false;
    if (query.author && foldForSearch(post.authorUsername) !== foldForSearch(query.author)) return false;
    if (query.year && (!post.publishedAt || new Date(post.publishedAt).getUTCFullYear() !== query.year)) return false;
    if (query.collection && !post.collections.includes(query.collection)) return false;
    if (search && !postSearchText(post).includes(search)) return false;

    if (expectedTags.length > 0) {
      const postTags = new Set(post.tags.map(tagSlug));
      const matches = expectedTags.map((tag) => postTags.has(tag));
      if (query.tagMode === "and" ? !matches.every(Boolean) : !matches.some(Boolean)) {
        return false;
      }
    }

    return true;
  });

  filtered.sort((left, right) => comparePosts(left, right, query.sort, search));

  let startIndex = 0;
  if (query.cursor) {
    const cursor = decodeLibraryCursor(query.cursor, query.sort);
    const index = filtered.findIndex(
      (post) => post.id === cursor.id && cursorValue(post, query.sort, search) === cursor.value,
    );
    startIndex = index >= 0 ? index + 1 : filtered.length;
  }

  const items = filtered.slice(startIndex, startIndex + query.limit);
  const hasNextPage = startIndex + query.limit < filtered.length;
  const lastPost = items.at(-1);
  const nextCursor =
    hasNextPage && lastPost
      ? encodeLibraryCursor({
          version: 1,
          sort: query.sort,
          value: cursorValue(lastPost, query.sort, search),
          id: lastPost.id,
        })
      : null;

  return {
    items,
    nextCursor,
    total: filtered.length,
    totalFiltered: filtered.length,
    totalLibrary: posts.length,
  };
}

export function comparePosts(
  left: LibraryPost,
  right: LibraryPost,
  sort: SortMode,
  search = "",
): number {
  let comparison = 0;

  if (sort === "author") {
    comparison = foldForSearch(left.authorUsername).localeCompare(
      foldForSearch(right.authorUsername),
      "fr",
    );
  } else if (sort === "relevance") {
    comparison = relevanceScore(right, search) - relevanceScore(left, search);
    if (comparison === 0) comparison = compareNullableDates(effectiveLibraryDate(left), effectiveLibraryDate(right), "desc");
  } else if (sort === "oldest") {
    comparison = compareNullableDates(effectiveLibraryDate(left), effectiveLibraryDate(right));
  } else if (sort === "likes") {
    comparison = compareNullableNumbers(left.likesCount, right.likesCount);
  } else {
    comparison = compareNullableDates(effectiveLibraryDate(left), effectiveLibraryDate(right), "desc");
  }

  return comparison || left.id.localeCompare(right.id);
}

export function cursorValue(post: LibraryPost, sort: SortMode, search = ""): string | null {
  if (sort === "author") return foldForSearch(post.authorUsername);
  if (sort === "relevance") return String(relevanceScore(post, search));
  if (sort === "likes") return leftPadMetric(post.likesCount);
  return effectiveLibraryDate(post);
}

function effectiveLibraryDate(post: LibraryPost): string | null {
  return post.savedAt ?? post.createdAt ?? null;
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function leftPadMetric(value: number | null): string | null {
  return value === null ? null : String(value);
}

function postSearchText(post: LibraryPost): string {
  return foldForSearch(
    [post.authorUsername, post.caption, ...post.tags, post.mainTheme ?? ""].join(" "),
  );
}

function relevanceScore(post: LibraryPost, search: string): number {
  if (!search) return 0;
  const haystack = postSearchText(post);
  let score = 0;
  for (const token of search.split(" ").filter(Boolean)) {
    if (foldForSearch(post.authorUsername).includes(token)) score += 4;
    if (post.tags.some((tag) => foldForSearch(tag).includes(token))) score += 3;
    if (foldForSearch(post.mainTheme ?? "").includes(token)) score += 2;
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function compareNullableDates(
  left: string | null,
  right: string | null,
  direction: "asc" | "desc" = "asc",
): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
}
