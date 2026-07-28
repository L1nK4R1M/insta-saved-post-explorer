import { foldForSearch } from "@/lib/import/normalize";

// Canonical themes whose posts are automatically eligible for the Places
// domain. Eligibility relies exclusively on Post.mainTheme: it never depends
// on collections, collection slugs, tags, or Instagram provenance (see
// docs/CODEX_PLACES_EXTENSION.md section 3). Do not widen this list with
// neighboring themes ("Voyage", "Restaurants", "Cuisine", ...) or heuristics.
export const PLACES_ELIGIBLE_THEMES = ["Voyages", "Restaurant"] as const;

// Comparison keys reuse the shared search normalization so matching stays
// case- and accent-insensitive, exactly like the existing search paths.
const PLACES_ELIGIBLE_THEME_KEYS = new Set<string>(
  PLACES_ELIGIBLE_THEMES.map((theme) => foldForSearch(theme)),
);

// Single predicate every entry point must reuse to decide automatic Places
// eligibility: services, jobs, statistics, UI actions, the worker handler,
// and MCP tools. Never re-copy the theme strings elsewhere.
//
// Theme changes: moving a post to an eligible theme makes it a candidate for
// an idempotent metadata-first analysis job; moving it away blocks future
// automatic analyses but must never silently delete confirmed places or
// existing post-place links. A null, empty, or unknown theme is not eligible.
export function isPlacesEligibleTheme(mainTheme: string | null | undefined): boolean {
  if (!mainTheme) return false;
  return PLACES_ELIGIBLE_THEME_KEYS.has(foldForSearch(mainTheme));
}

export type PlacesEligibleTheme = (typeof PLACES_ELIGIBLE_THEMES)[number];

// Map an eligible theme (in any case/accent form) back to its canonical value,
// or null when the theme is not eligible. Reuses the same normalization so the
// canonical Voyages/Restaurant strings are never re-copied into services.
export function canonicalPlacesTheme(
  mainTheme: string | null | undefined,
): PlacesEligibleTheme | null {
  if (!mainTheme) return null;
  const folded = foldForSearch(mainTheme);
  return PLACES_ELIGIBLE_THEMES.find((theme) => foldForSearch(theme) === folded) ?? null;
}
