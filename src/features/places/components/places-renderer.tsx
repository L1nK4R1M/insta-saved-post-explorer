"use client";

import dynamic from "next/dynamic";
import { Globe2, MapPin } from "lucide-react";

import type { PlacesRendererProps } from "@/features/places/renderer-contract";
import type { PlacesViewMode } from "@/features/places/query-state";

// The renderer seam. The shell keeps every piece of state — filters, search,
// selection, panels, statistics, list and detail — and delegates only the canvas
// to whichever renderer the current view asks for. Both renderers are lazy and
// client-only, so a session that never opens the globe never downloads the 3D
// engine (NFR-I-01), and removing a view means deleting one branch here plus its
// component file (NFR-I-06).

const PlacesMap = dynamic(() => import("@/features/places/components/places-map"), {
  ssr: false,
  loading: () => <div className="places-map-canvas places-map-loading" aria-hidden="true" />,
});

// The 3D engine lives in its own chunk, requested only when this branch renders.
const PlacesGlobe = dynamic(() => import("@/features/places/components/places-globe"), {
  ssr: false,
  loading: () => (
    <div className="places-globe-canvas places-globe-loading" role="status">
      <Globe2 aria-hidden="true" />
      <span>Chargement du globe…</span>
    </div>
  ),
});

export type PlacesRendererShellProps = PlacesRendererProps & {
  view: PlacesViewMode;
  tileUrl: string;
  tileAttribution: string;
  tilesConfigured: boolean;
  textureUrl: string;
  textureAttribution: string;
  reducedMotion: boolean;
};

export function PlacesRenderer({
  view,
  tileUrl,
  tileAttribution,
  tilesConfigured,
  textureUrl,
  textureAttribution,
  reducedMotion,
  ...rendererProps
}: PlacesRendererShellProps) {
  if (view === "globe") {
    return (
      <PlacesGlobe
        {...rendererProps}
        textureUrl={textureUrl}
        attribution={textureAttribution}
        reducedMotion={reducedMotion}
      />
    );
  }
  if (!tilesConfigured) return <MapNotConfigured />;
  return <PlacesMap {...rendererProps} tileUrl={tileUrl} tileAttribution={tileAttribution} />;
}

function MapNotConfigured() {
  return (
    <div className="places-map-canvas places-map-missing">
      <MapPin aria-hidden="true" />
      <p>
        La carte n’est pas configurée. Renseignez <code>NEXT_PUBLIC_PLACES_TILE_URL</code> pour afficher le fond de
        carte ; la liste et les filtres restent utilisables.
      </p>
    </div>
  );
}
