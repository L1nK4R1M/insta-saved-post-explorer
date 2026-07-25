"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";

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

export type PlacesRendererShellProps = PlacesRendererProps & {
  view: PlacesViewMode;
  tileUrl: string;
  tileAttribution: string;
  tilesConfigured: boolean;
};

export function PlacesRenderer({
  view,
  tileUrl,
  tileAttribution,
  tilesConfigured,
  ...rendererProps
}: PlacesRendererShellProps) {
  if (view === "map") {
    if (!tilesConfigured) return <MapNotConfigured />;
    return <PlacesMap {...rendererProps} tileUrl={tileUrl} tileAttribution={tileAttribution} />;
  }
  // The globe branch arrives in T5; until then the view is unreachable because
  // the toggle does not exist yet, and an unknown value already parses to "map".
  return <MapNotConfigured />;
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
