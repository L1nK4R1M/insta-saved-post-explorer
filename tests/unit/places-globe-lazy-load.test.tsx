import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlacesStatsDto } from "@/contracts/api/places";
import type { WebGlState } from "@/features/places/capabilities";
import type { PlacesMapItem } from "@/server/places/map-view";

// FR-I-12 proof: the 3D engine chunk must never be requested on an unproven
// capability. The load is observed directly — the mock factory for the globe
// module only runs if something actually imports it, so `state.globeImported`
// answers "was the dynamic import invoked?" rather than "is a canvas visible?".
const state = vi.hoisted(() => ({ globeImported: false, webgl: "unknown" as WebGlState }));

vi.mock("@/features/places/components/places-globe", () => {
  state.globeImported = true;
  return { default: () => <div data-testid="globe-engine" /> };
});

vi.mock("@/features/places/components/places-map", () => ({
  default: () => <div data-testid="leaflet-canvas" />,
}));

// The capability is driven directly so the four states can be reproduced
// exactly, including "unknown", which is what the server render and the
// hydration pass see before the client has answered.
vi.mock("@/features/places/capabilities", () => ({
  useWebGlSupport: () => state.webgl,
  usePrefersReducedMotion: () => false,
  resetWebGlSupportCache: () => {},
}));

vi.mock("@/features/places/actions", () => ({
  loadPlacePostsAction: vi.fn(async () => ({ ok: true, posts: [] })),
  confirmPlaceAction: vi.fn(async () => ({ ok: true })),
  rejectPlaceAction: vi.fn(async () => ({ ok: true })),
}));

// next/dynamic → React.lazy: the loader runs when the component renders, which
// is exactly the moment the real chunk would be fetched.
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
      const Lazy = React.lazy(loader);
      return function Dynamic(props: Record<string, unknown>) {
        return (
          <React.Suspense fallback={null}>
            <Lazy {...props} />
          </React.Suspense>
        );
      };
    },
  };
});

const { PlacesExplorer } = await import("@/features/places/components/places-explorer");

const STATS: PlacesStatsDto = {
  totals: { eligiblePosts: 0, identifiedPlaces: 0, countries: 0, continents: 0, postsWithPlaces: 0, needsReview: 0 },
  byTheme: [],
  byCountry: [],
  byContinent: [],
  byPrecision: [],
  byReviewStatus: [],
};

const PLACES: PlacesMapItem[] = [
  {
    id: "p1",
    displayName: "Nobu Dubai",
    category: "catering.restaurant",
    categoryGroup: "restaurant",
    city: "Dubai",
    region: null,
    country: "Émirats arabes unis",
    countryCode: "AE",
    latitude: 25.1,
    longitude: 55.1,
    precision: "EXACT",
    confidence: 0.9,
    approximationRadiusMeters: null,
    reviewStatus: "UNREVIEWED",
    isUserConfirmed: false,
    postCount: 3,
    sourceThemes: ["Restaurant"],
    previewThumbnailUrl: null,
  },
];

function renderExplorer(view: "map" | "globe") {
  return render(
    <PlacesExplorer
      places={PLACES}
      stats={STATS}
      initialState={{
        q: "rome",
        themes: [],
        categories: [],
        precisions: [],
        reviews: [],
        countryCodes: [],
        placeId: "p1",
        view,
      }}
      truncated={false}
      isAdmin={false}
      tileUrl="https://tiles.example/{z}/{x}/{y}.png"
      tileAttribution="© tiles"
      tilesConfigured
      textureUrl="/places/earth-dark.png"
      textureAttribution="Fond de carte : Natural Earth (domaine public)"
    />,
  );
}

beforeEach(() => {
  state.globeImported = false;
  window.history.replaceState(null, "", "/places");
});

afterEach(cleanup);

describe("3D engine is never imported without a proven WebGL capability", () => {
  it.each([
    // The 2D view never depends on the probe, and must never pay for the globe.
    { name: "2D view, WebGL available", view: "map" as const, webgl: "supported" as WebGlState, expect2d: true },
    // Server render and hydration pass: nothing is known yet.
    { name: "globe requested, probe still unknown", view: "globe" as const, webgl: "unknown" as WebGlState, expect2d: false },
    { name: "globe requested, WebGL unsupported", view: "globe" as const, webgl: "unsupported" as WebGlState, expect2d: true },
    { name: "globe requested, probe failed", view: "globe" as const, webgl: "failed" as WebGlState, expect2d: true },
  ])("$name", async ({ view, webgl, expect2d }) => {
    state.webgl = webgl;
    renderExplorer(view);

    if (expect2d) {
      await waitFor(() => expect(screen.getByTestId("leaflet-canvas")).toBeDefined());
    } else {
      // Unknown shows a waiting state, not the 2D map: the deep link is still
      // legitimate and must not be downgraded before the answer arrives.
      await waitFor(() => expect(screen.getByTestId("places-globe-probing")).toBeDefined());
      expect(screen.queryByTestId("leaflet-canvas")).toBeNull();
      // …and the URL keeps view=globe rather than being rewritten prematurely.
      expect(window.location.search).toContain("view=globe");
    }

    expect(state.globeImported).toBe(false);
    expect(screen.queryByTestId("globe-engine")).toBeNull();
    // Whatever the state, the rest of the page stays usable.
    expect(screen.getByRole("searchbox", { name: "Rechercher un lieu" })).toBeDefined();
  });
});
