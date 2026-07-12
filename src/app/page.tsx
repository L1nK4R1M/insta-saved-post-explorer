import { getConfiguredOwnerId } from "@/auth/config";
import { getSession } from "@/auth/session";
import { LibraryExplorer, type LibraryInitialState } from "@/features/library/components/library-explorer";
import { parseLibraryQuery } from "@/features/library/query-state";
import type { SortMode, TagMode, ViewMode } from "@/features/library/types";
import { getLibraryMainThemes, getLibraryTags, queryLibraryPosts } from "@/server/library";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialState: LibraryInitialState = {
    query: valueOf(params.q),
    tags: valueOf(params.tags).split(",").map((tag) => tag.trim()).filter(Boolean),
    theme: valueOf(params.theme) || null,
    tagMode: oneOf(valueOf(params.tagMode), ["and", "or"], "and"),
    sort: oneOf(valueOf(params.sort), ["newest", "oldest", "author", "relevance", "likes"], "newest"),
    view: oneOf(valueOf(params.view), ["grid", "masonry"], "masonry"),
    postId: valueOf(params.post) || null,
  };

  const session = await getSession().catch(() => null);
  const ownerId = getConfiguredOwnerId();
  const [library, mainThemes, tagFacets] = await Promise.all([
    loadLibrary(initialState, ownerId),
    getLibraryMainThemes(ownerId).catch(() => []),
    getLibraryTags(ownerId).catch(() => []),
  ]);
  return (
    <LibraryExplorer
      posts={library.posts}
      initialNextCursor={library.nextCursor}
      initialState={initialState}
      initialMainThemes={mainThemes}
      initialTagFacets={tagFacets}
      initialError={library.error}
      isAdmin={session?.role === "admin"}
    />
  );
}

async function loadLibrary(initialState: LibraryInitialState, ownerId: string) {
  try {
    const page = await queryLibraryPosts(
      parseLibraryQuery({
        search: initialState.query,
        tags: initialState.tags,
        theme: initialState.theme,
        tagMode: initialState.tagMode,
        sort: initialState.sort,
        limit: 30,
      }),
      ownerId,
    );
    return { posts: page.items, nextCursor: page.nextCursor, error: undefined };
  } catch (error) {
    console.error("Unable to load the library", error);
    return {
      posts: [],
      nextCursor: null,
      error: "Vérifiez la connexion à la base de données, puis réessayez.",
    };
  }
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function oneOf<T extends TagMode | SortMode | ViewMode>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
