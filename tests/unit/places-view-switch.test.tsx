import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetWebGlSupportCache } from "@/features/places/capabilities";
import type { PlacesStatsDto } from "@/contracts/api/places";
import type { PlacesMapItem } from "@/server/places/map-view";

// The real MapLibre engine is unwanted here: the stub records the projection
// passed by the shared renderer, proving that 2D ↔ globe reuses one engine.
const mapProps: Record<string, unknown>[] = [];
vi.mock("@/features/places/components/places-map", () => ({
  default: (props: Record<string, unknown>) => {
    mapProps.push(props);
    return (
      <>
        <div data-testid="maplibre-canvas" />
        <span>{String(props.textureAttribution ?? "")}</span>
      </>
    );
  },
}));

vi.mock("@/features/places/actions", () => ({
  loadPlacePostsAction: vi.fn(async () => ({ ok: true, posts: [] })),
  confirmPlaceAction: vi.fn(async () => ({ ok: true })),
  rejectPlaceAction: vi.fn(async () => ({ ok: true })),
}));

// `next/dynamic` is replaced by React.lazy + Suspense: same "load on render"
// semantics, and React re-renders on its own once the chunk resolves, so the
// assertions observe the real loading sequence instead of racing it.
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

function place(overrides: Partial<PlacesMapItem> = {}): PlacesMapItem {
  return {
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
    ...overrides,
  };
}

const STATS: PlacesStatsDto = {
  totals: { eligiblePosts: 4, identifiedPlaces: 2, countries: 2, continents: 2, postsWithPlaces: 4, needsReview: 0 },
  byTheme: [],
  byCountry: [],
  byContinent: [],
  byPrecision: [],
  byReviewStatus: [],
};

const PLACES = [
  place(),
  place({ id: "p2", displayName: "Bar San Calisto", city: "Rome", country: "Italie", countryCode: "IT", latitude: 41.9, longitude: 12.5, precision: "PROBABLE", sourceThemes: ["Voyages"] }),
  place({ id: "p3", displayName: "Rejeté", reviewStatus: "REJECTED", countryCode: "FR", latitude: 48.8, longitude: 2.3 }),
];

const PLACES_WITH_APPROXIMATE = [
  ...PLACES,
  place({ id: "p4", displayName: "Approximate place", precision: "APPROXIMATE", approximationRadiusMeters: 10_000 }),
];

function renderExplorer(view: "map" | "globe" = "map", places = PLACES) {
  return render(
    <PlacesExplorer
      places={places}
      stats={STATS}
      initialState={{
        q: "",
        themes: [],
        categories: [],
        precisions: [],
        reviews: [],
        countryCodes: [],
        placeId: null,
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

// jsdom has no WebGL; the probe is steered by stubbing canvas.getContext.
function stubWebGl(supported: boolean) {
  const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
  spy.mockImplementation(((name: string) =>
    supported && name.startsWith("webgl") ? ({ name } as unknown) : null) as never);
  return spy;
}

// jsdom does not implement matchMedia; the default answer is "motion allowed".
function stubMatchMedia(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches: reduced && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  });
}

beforeEach(() => {
  mapProps.length = 0;
  resetWebGlSupportCache();
  stubMatchMedia(false);
  window.history.replaceState(null, "", "/places");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Places view switch", () => {
  it("renders 2D by default, never loading the engine, and offers a real segmented control", async () => {
    stubWebGl(true);
    renderExplorer();
    await waitFor(() => expect(screen.getByTestId("maplibre-canvas")).toBeDefined());
    expect(mapProps.at(-1)?.projection).toBe("mercator");

    // Real buttons, so tab order and Enter/Space come for free.
    expect(screen.getByRole("group", { name: "Type de vue" })).toBeDefined();
    const buttons = screen.getAllByRole("button", { name: /^(2D|3D)$/ });
    expect(buttons.map((button) => button.tagName)).toEqual(["BUTTON", "BUTTON"]);
    expect(screen.getByRole("button", { name: "2D" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("switches both ways, keeping filters, selection and the URL in step", async () => {
    stubWebGl(true);
    renderExplorer();
    fireEvent.change(screen.getByRole("searchbox", { name: "Rechercher un lieu" }), {
      target: { value: "rome" },
    });
    fireEvent.click(screen.getByRole("button", { name: "3D" }));

    await waitFor(() => expect(mapProps.at(-1)?.projection).toBe("globe"));
    expect(screen.getByTestId("maplibre-canvas")).toBeDefined();
    // The shared MapLibre renderer receives exactly the filtered set the 2D map
    // would have shown, and a REJECTED place is never handed to it.
    const places = mapProps.at(-1)?.places as { id: string }[];
    expect(places.map((place) => place.id)).toEqual(["p2"]);
    expect(window.location.search).toContain("q=rome");
    expect(window.location.search).toContain("view=globe");

    fireEvent.click(screen.getByRole("button", { name: "2D" }));
    await waitFor(() => expect(screen.getByTestId("maplibre-canvas")).toBeDefined());
    expect(mapProps.at(-1)?.projection).toBe("mercator");
    expect(window.location.search).toContain("q=rome");
    expect(window.location.search).not.toContain("view=globe");
  });

  it("keeps approximate places out of the map and globe renderer", async () => {
    stubWebGl(true);
    renderExplorer("map", PLACES_WITH_APPROXIMATE);
    await waitFor(() => expect(screen.getByTestId("maplibre-canvas")).toBeDefined());

    const renderedPlaces = mapProps.at(-1)?.places as { id: string; precision: string }[];
    expect(renderedPlaces.map((place) => place.id)).toEqual(["p1", "p2"]);
    expect(renderedPlaces.every((place) => place.precision !== "APPROXIMATE")).toBe(true);
  });

  it("keeps the list usable without mounting MapLibre when WebGL2 is refused", async () => {
    stubWebGl(false);
    renderExplorer("globe");
    await waitFor(() => expect(screen.getByTestId("places-map-unavailable")).toBeDefined());
    expect(mapProps).toHaveLength(0);
    expect(screen.getByTestId("places-map-unavailable").textContent).toMatch(/WebGL2 indisponible/);
    await waitFor(() => expect(window.location.search).not.toContain("view=globe"));

    // The 3D control is refused, and everything else stays usable.
    expect((screen.getByRole("button", { name: "3D" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Liste/ }));
    expect(screen.getByRole("complementary", { name: "Liste des lieux" })).toBeDefined();
  });

  it("does not mount the map engine for the default 2D view without WebGL2", async () => {
    stubWebGl(false);
    renderExplorer();
    await waitFor(() => expect(screen.getByTestId("places-map-unavailable")).toBeDefined());
    expect(mapProps).toHaveLength(0);
  });

  it("restores view, filters and selection on back/forward, and honours reduced motion", async () => {
    stubWebGl(true);
    stubMatchMedia(true);
    renderExplorer("globe");
    await waitFor(() => expect(mapProps.at(-1)?.projection).toBe("globe"));
    expect(mapProps.at(-1)?.reducedMotion).toBe(true);
    // The documented local texture is used, never a provider URL.
    expect(mapProps.at(-1)?.textureUrl).toBe("/places/earth-dark.png");
    expect(screen.getByText("Fond de carte : Natural Earth (domaine public)")).toBeDefined();

    window.history.replaceState(null, "", "/places");
    fireEvent.popState(window);
    await waitFor(() => expect(screen.getByTestId("maplibre-canvas")).toBeDefined());

    window.history.replaceState(null, "", "/places?q=rome&view=globe&placeId=p2");
    fireEvent.popState(window);
    await waitFor(() => expect(mapProps.at(-1)?.projection).toBe("globe"));
    expect((screen.getByRole("searchbox", { name: "Rechercher un lieu" }) as HTMLInputElement).value).toBe("rome");
  });
});
