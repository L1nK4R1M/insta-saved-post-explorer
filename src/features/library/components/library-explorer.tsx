"use client";

import { Grid2X2, LayoutGrid, LogIn, LogOut, Search, SlidersHorizontal, Sparkles, Upload, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ThemeMenu } from "@/components/theme-menu";
import { Brand } from "@/components/brand";
import { FilterContent, MobileFilterDrawer, type TagFacet } from "@/features/library/components/filter-panel";
import { ImportDialog } from "@/features/library/components/import-dialog";
import { EmptyLibrary, LibraryError, NoResults } from "@/features/library/components/library-states";
import { LibraryStatsDialog } from "@/features/library/components/library-stats-dialog";
import { PostCard } from "@/features/library/components/post-card";
import { PostDetailDialog } from "@/features/library/components/post-detail-dialog";
import { useDebouncedValue } from "@/features/library/hooks/use-debounced-value";
import type { LibraryPost, SortMode, TagMode, ViewMode } from "@/features/library/types";
import { cn } from "@/lib/utils";

export type LibraryInitialState = {
  query: string;
  tags: string[];
  theme: string | null;
  tagMode: TagMode;
  sort: SortMode;
  view: ViewMode;
  postId: string | null;
};

export function LibraryExplorer({
  posts: initialPosts,
  initialNextCursor,
  initialState,
  initialMainThemes,
  initialTagFacets,
  initialError,
  isAdmin,
}: {
  posts: LibraryPost[];
  initialNextCursor: string | null;
  initialState: LibraryInitialState;
  initialMainThemes: string[];
  initialTagFacets: TagFacet[];
  initialError?: string;
  isAdmin: boolean;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialState.query);
  const [selectedTags, setSelectedTags] = useState(initialState.tags);
  const [selectedTheme, setSelectedTheme] = useState(initialState.theme);
  const [tagMode, setTagMode] = useState<TagMode>(initialState.tagMode);
  const [sort, setSort] = useState<SortMode>(initialState.sort);
  const [view, setView] = useState<ViewMode>(initialState.view);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialState.postId);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const initialRequest = useRef(true);
  const debouncedQuery = useDebouncedValue(query, 250);

  const facets = initialTagFacets.filter((facet) => facet.name !== "Favoris");
  const regularSelectedTags = selectedTags.filter((tag) => tag !== "Favoris");

  const mainThemes = initialMainThemes;

  const filteredPosts = useMemo(() => {
    const normalizedQuery = normalize(debouncedQuery);
    const filtered = posts.filter((post) => {
      const matchesQuery = !normalizedQuery || normalize(`${post.caption} ${post.authorUsername} ${post.tags.join(" ")}`).includes(normalizedQuery);
      const matchesTags = selectedTags.length === 0 || (tagMode === "and"
        ? selectedTags.every((tag) => post.tags.includes(tag))
        : selectedTags.some((tag) => post.tags.includes(tag)));
      return matchesQuery && matchesTags && (!selectedTheme || post.mainTheme === selectedTheme);
    });
    return filtered.sort((a, b) => comparePosts(a, b, sort));
  }, [debouncedQuery, posts, selectedTags, selectedTheme, sort, tagMode]);

  const selectedIndex = filteredPosts.findIndex((post) => post.id === selectedPostId);
  const selectedPost = selectedIndex >= 0 ? filteredPosts[selectedIndex] : null;

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedTags.length) params.set("tags", selectedTags.join(","));
    if (selectedTheme) params.set("theme", selectedTheme);
    if (tagMode !== "and") params.set("tagMode", tagMode);
    if (sort !== "newest") params.set("sort", sort);
    if (view !== "masonry") params.set("view", view);
    if (selectedPostId) params.set("post", selectedPostId);
    const nextUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [debouncedQuery, selectedPostId, selectedTags, selectedTheme, sort, tagMode, view]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }

    const controller = new AbortController();
    const refresh = async () => {
      setRequestError(null);
      setIsFiltering(true);
      try {
        const response = await fetch(`/api/posts?${librarySearchParams({
          query: debouncedQuery,
          selectedTags,
          selectedTheme,
          tagMode,
          sort,
        })}`, { signal: controller.signal });
        if (!response.ok) throw new Error("REQUEST_FAILED");
        const page = (await response.json()) as { items: LibraryPost[]; nextCursor: string | null };
        setPosts(page.items);
        setNextCursor(page.nextCursor);
        setSelectedPostId(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRequestError("Impossible d’actualiser les résultats.");
      } finally {
        if (!controller.signal.aborted) setIsFiltering(false);
      }
    };
    void refresh();
    return () => controller.abort();
  }, [debouncedQuery, selectedTags, selectedTheme, sort, tagMode]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setRequestError(null);
    try {
      const response = await fetch(`/api/posts?${librarySearchParams({
        query: debouncedQuery,
        selectedTags,
        selectedTheme,
        tagMode,
        sort,
        cursor: nextCursor,
      })}`);
      if (!response.ok) throw new Error("REQUEST_FAILED");
      const page = (await response.json()) as { items: LibraryPost[]; nextCursor: string | null };
      setPosts((current) => {
        const byId = new Map(current.map((post) => [post.id, post]));
        for (const post of page.items) byId.set(post.id, post);
        return [...byId.values()];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setRequestError("Impossible de charger la suite des résultats.");
    } finally {
      setLoadingMore(false);
    }
  }, [debouncedQuery, loadingMore, nextCursor, selectedTags, selectedTheme, sort, tagMode]);

  const toggleTag = useCallback((tag: string) => {
    setIsFiltering(true);
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }, []);

  const toggleFavorite = useCallback(async (post: LibraryPost) => {
    const favorite = post.tags.includes("Favoris");
    setPosts((current) => current.map((item) => item.id === post.id
      ? { ...item, tags: favorite ? item.tags.filter((tag) => tag !== "Favoris") : [...item.tags, "Favoris"] }
      : item));
    setRequestError(null);
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/tags`, {
        method: favorite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: "Favoris" }),
      });
      if (!response.ok) throw new Error("FAVORITE_FAILED");
      const payload = (await response.json()) as { tags: string[] };
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, tags: payload.tags } : item));
    } catch {
      setPosts((current) => current.map((item) => item.id === post.id ? post : item));
      setRequestError("Impossible de modifier les favoris.");
    }
  }, []);

  const resetFilters = useCallback(() => {
    setQuery("");
    setSelectedTags([]);
    setSelectedTheme(null);
    setTagMode("and");
    setSort("newest");
  }, []);

  const discoverPost = useCallback(() => {
    if (!filteredPosts.length) return;
    const candidates = filteredPosts.length > 1 && selectedPostId
      ? filteredPosts.filter((post) => post.id !== selectedPostId)
      : filteredPosts;
    setSelectedPostId(candidates[Math.floor(Math.random() * candidates.length)].id);
  }, [filteredPosts, selectedPostId]);

  const showPrevious = useCallback(() => {
    if (!filteredPosts.length) return;
    const nextIndex = selectedIndex <= 0 ? filteredPosts.length - 1 : selectedIndex - 1;
    setSelectedPostId(filteredPosts[nextIndex].id);
  }, [filteredPosts, selectedIndex]);

  const showNext = useCallback(() => {
    if (!filteredPosts.length) return;
    const nextIndex = selectedIndex < 0 || selectedIndex === filteredPosts.length - 1 ? 0 : selectedIndex + 1;
    setSelectedPostId(filteredPosts[nextIndex].id);
  }, [filteredPosts, selectedIndex]);

  const filterProps = { facets, selectedTags, tagMode, onTagModeChange: setTagMode, onToggleTag: toggleTag, onReset: resetFilters };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="Insta Post Explorer, accueil"><Brand compact /></Link>
        <label className="global-search">
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only">Rechercher dans la bibliothèque</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Rechercher parmi ${posts.length.toLocaleString("fr-FR")} souvenirs`}
          />
          <kbd>⌘ K</kbd>
        </label>
        <nav className="header-actions" aria-label="Actions principales">
          <button
            className="header-tab desktop-only"
            type="button"
            onClick={discoverPost}
          >
            <Sparkles aria-hidden="true" className="size-4" /> Découverte
          </button>
          <div className="view-switch desktop-only" aria-label="Mode d’affichage">
            <button type="button" aria-pressed={view === "grid"} className={cn(view === "grid" && "is-active")} onClick={() => setView("grid")}>
              <Grid2X2 aria-hidden="true" className="size-4" /> Grille
            </button>
            <button type="button" aria-pressed={view === "masonry"} className={cn(view === "masonry" && "is-active")} onClick={() => setView("masonry")}>
              <LayoutGrid aria-hidden="true" className="size-4" /> Masonry
            </button>
          </div>
          {isAdmin ? (
            <button
              className="button import-button"
              type="button"
              aria-label="Importer JSON"
              onClick={() => setImportOpen(true)}
            >
              <Upload aria-hidden="true" className="size-4" /><span className="desktop-only">Importer JSON</span>
            </button>
          ) : null}
          <LibraryStatsDialog />
          <ThemeMenu />
          {isAdmin ? (
            <form action="/api/auth/logout" method="post">
              <button className="button" type="submit" aria-label="Se déconnecter du mode administrateur">
                <LogOut aria-hidden="true" className="size-4" />
                <span className="desktop-only">Quitter admin</span>
              </button>
            </form>
          ) : (
            <Link className="button" href="/login" aria-label="Ouvrir la connexion administrateur">
              <LogIn aria-hidden="true" className="size-4" />
              <span className="desktop-only">Admin</span>
            </Link>
          )}
        </nav>
      </header>

      <section className="control-ribbon" aria-label="Filtres et tri">
        <button className="button desktop-only" type="button" aria-expanded={filtersVisible} onClick={() => setFiltersVisible((value) => !value)}>
          <SlidersHorizontal aria-hidden="true" className="size-4 text-accent" /> Filtres avancés
        </button>
        <button className="button mobile-only mobile-filter-trigger" type="button" onClick={() => setMobileFiltersOpen(true)}>
          <SlidersHorizontal aria-hidden="true" className="size-4 text-accent" /> Filtres
          {selectedTags.length ? <span className="count-badge">{selectedTags.length}</span> : null}
        </button>

        <div className="main-theme-filters" aria-label="Filtrer par thème principal">
          {mainThemes.map((theme) => (
            <button
              key={theme}
              type="button"
              className={cn(selectedTheme === theme && "is-active")}
              aria-pressed={selectedTheme === theme}
              onClick={() => {
                setIsFiltering(true);
                setSelectedTheme((current) => current === theme ? null : theme);
              }}
            >
              {themeLabel(theme)}
            </button>
          ))}
          <button
            type="button"
            className={cn(selectedTags.includes("Favoris") && "is-active")}
            aria-pressed={selectedTags.includes("Favoris")}
            onClick={() => toggleTag("Favoris")}
          >
            Favoris
          </button>
        </div>

        <div className="active-tags" aria-label="Tags actifs">
          {regularSelectedTags.length ? regularSelectedTags.map((tag) => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)} aria-label={`Retirer le tag ${tag}`}>
              {tag}<X aria-hidden="true" className="size-3" />
            </button>
          )) : null}
          {regularSelectedTags.length ? <span className="mode-pill">Mode {tagMode.toLocaleUpperCase("fr-FR")}</span> : null}
        </div>

        <div className="ribbon-end">
          <strong className="results-count tabular-nums">
            {filteredPosts.length.toLocaleString("fr-FR")}{nextCursor ? "+" : ""} <span>résultats</span>
          </strong>
          <select aria-label="Trier les résultats" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            <option value="newest">Plus récents</option>
            <option value="oldest">Plus anciens</option>
            <option value="author">Auteur</option>
            <option value="relevance">Pertinence</option>
            <option value="likes">Plus likés</option>
          </select>
          {(query || selectedTags.length || selectedTheme) ? <button className="text-button desktop-only" type="button" onClick={resetFilters}>Effacer les filtres</button> : null}
          <div className="view-switch mobile-only" aria-label="Mode d’affichage">
            <button type="button" aria-label="Grille régulière" aria-pressed={view === "grid"} className={cn(view === "grid" && "is-active")} onClick={() => setView("grid")}><Grid2X2 aria-hidden="true" className="size-4" /></button>
            <button type="button" aria-label="Grille masonry" aria-pressed={view === "masonry"} className={cn(view === "masonry" && "is-active")} onClick={() => setView("masonry")}><LayoutGrid aria-hidden="true" className="size-4" /></button>
          </div>
        </div>
      </section>

      <main className={cn("library-layout", filtersVisible && "has-filters")}>
        {filtersVisible ? <aside className="desktop-filter-panel desktop-only"><FilterContent {...filterProps} /></aside> : null}
        <section className="library-content" aria-label="Publications sauvegardées" aria-live="polite" aria-busy={isFiltering}>
          {requestError ? <p className="request-error" role="alert">{requestError}</p> : null}
          {isFiltering ? (
            <div className="filter-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Chargement des résultats…</div>
          ) : initialError ? <LibraryError message={initialError} /> : posts.length === 0 ? <EmptyLibrary onImport={isAdmin ? () => setImportOpen(true) : undefined} /> : filteredPosts.length === 0 ? <NoResults onReset={resetFilters} /> : (
            <>
              <div className={cn("posts-grid", view === "masonry" ? "posts-masonry" : "posts-regular")}>
                {filteredPosts.map((post) => <PostCard key={post.id} post={post} view={view} onOpen={() => setSelectedPostId(post.id)} isAdmin={isAdmin} onToggleFavorite={() => void toggleFavorite(post)} />)}
              </div>
              {nextCursor ? (
                <div className="load-more-row">
                  <button className="button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? "Chargement…" : "Charger plus"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>

      <MobileFilterDrawer open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen} {...filterProps} />
      {isAdmin ? (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => window.location.reload()}
        />
      ) : null}
      <PostDetailDialog
        post={selectedPost}
        position={selectedIndex}
        total={filteredPosts.length}
        onClose={() => setSelectedPostId(null)}
        onPrevious={showPrevious}
        onNext={showNext}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function themeLabel(theme: string) {
  return ["cuisne", "cusine"].includes(normalize(theme)) ? "Cuisine" : theme;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
}

function comparePosts(a: LibraryPost, b: LibraryPost, sort: SortMode) {
  if (sort === "author") return a.authorUsername.localeCompare(b.authorUsername, "fr-FR");
  if (sort === "relevance") return 0;
  if (sort === "likes") return (b.likesCount ?? -1) - (a.likesCount ?? -1);
  const aDate = Date.parse(a.savedAt || a.publishedAt || "1970-01-01");
  const bDate = Date.parse(b.savedAt || b.publishedAt || "1970-01-01");
  return sort === "oldest" ? aDate - bDate : bDate - aDate;
}

function librarySearchParams(input: {
  query: string;
  selectedTags: string[];
  selectedTheme: string | null;
  tagMode: TagMode;
  sort: SortMode;
  cursor?: string;
}) {
  const params = new URLSearchParams({
    limit: "30",
    tagMode: input.tagMode,
    sort: input.sort,
  });
  if (input.query) params.set("q", input.query);
  if (input.selectedTags.length) params.set("tags", input.selectedTags.join(","));
  if (input.selectedTheme) params.set("theme", input.selectedTheme);
  if (input.cursor) params.set("cursor", input.cursor);
  return params.toString();
}
