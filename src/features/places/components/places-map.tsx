"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup, Marker } from "leaflet";

import { PLACE_CATEGORY_GROUPS } from "@/lib/places/categories";
import type { PlacesMapItem } from "@/server/places/map-view";

// Leaflet is loaded lazily on the client only: it touches `window` at import
// time and must never run during SSR. Everything Leaflet-specific stays inside
// this component — the rest of the feature talks to it through these props, so
// swapping the engine later means rewriting this file alone.

export type PlacesMapProps = {
  places: readonly PlacesMapItem[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onHover: (place: PlacesMapItem | null, point: { x: number; y: number } | null) => void;
  tileUrl: string;
  tileAttribution: string;
};

const PRECISION_COLOR: Record<string, string> = {
  EXACT: "#16794b",
  PROBABLE: "#b7791f",
  APPROXIMATE: "#2563eb",
};

function iconFor(place: PlacesMapItem): string {
  const group = PLACE_CATEGORY_GROUPS.find((candidate) => candidate.key === place.categoryGroup);
  return group?.icon ?? "📍";
}

export function PlacesMap({ places, selectedId, onSelect, onHover, tileUrl, tileAttribution }: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const zoneLayerRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const readyRef = useRef(false);
  // Keep the latest callbacks without re-creating markers on every render. The
  // ref is written in an effect, never during render.
  const handlersRef = useRef({ onSelect, onHover });
  useEffect(() => {
    handlersRef.current = { onSelect, onHover };
  }, [onSelect, onHover]);

  // Build markers for the current set. Kept in a ref-driven effect so filtering
  // re-renders do not tear the map down.
  const render = useCallback(async () => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const zoneLayer = zoneLayerRef.current;
    if (!map || !markerLayer || !zoneLayer) return;

    const L = (await import("leaflet")).default;
    await import("leaflet.markercluster");

    markerLayer.clearLayers();
    zoneLayer.clearLayers();
    markersRef.current.clear();

    // A cluster group keeps thousands of pins responsive without one DOM node per
    // point at low zoom.
    const cluster = (L as unknown as { markerClusterGroup: (options: object) => LayerGroup }).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
    });

    for (const place of places) {
      const color = PRECISION_COLOR[place.precision] ?? "#6f6878";
      const selected = place.id === selectedId;
      const marker = L.marker([place.latitude, place.longitude], {
        keyboard: true,
        title: place.displayName,
        alt: place.displayName,
        icon: L.divIcon({
          className: "places-pin-wrapper",
          html: `<span class="places-pin${selected ? " is-selected" : ""}" style="--pin-color:${color}"><span>${iconFor(place)}</span></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
      });

      marker.on("click", () => handlersRef.current.onSelect(place.id));
      marker.on("keypress", () => handlersRef.current.onSelect(place.id));
      marker.on("mouseover", (event) => {
        const point = map.latLngToContainerPoint(event.target.getLatLng());
        handlersRef.current.onHover(place, { x: point.x, y: point.y });
      });
      marker.on("mouseout", () => handlersRef.current.onHover(null, null));

      markersRef.current.set(place.id, marker);
      cluster.addLayer(marker);

      // APPROXIMATE never renders as an exact pin: draw its uncertainty area.
      if (place.precision === "APPROXIMATE" && place.approximationRadiusMeters) {
        zoneLayer.addLayer(
          L.circle([place.latitude, place.longitude], {
            radius: place.approximationRadiusMeters,
            color: PRECISION_COLOR.APPROXIMATE,
            weight: 2,
            dashArray: "6 5",
            fillOpacity: 0.12,
            interactive: false,
          }),
        );
      }
    }

    markerLayer.addLayer(cluster);
  }, [places, selectedId]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mapRef.current || !containerRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [30, 10],
        zoom: 2,
        worldCopyJump: true,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(map);

      mapRef.current = map;
      zoneLayerRef.current = L.layerGroup().addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      readyRef.current = true;
      await render();
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      zoneLayerRef.current = null;
      readyRef.current = false;
    };
    // The map instance is created once; tiles come from immutable config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever the visible set or the selection changes.
  useEffect(() => {
    if (!readyRef.current) return;
    void render();
  }, [render]);

  // Fit the map to the current results, or fly to the selected place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || places.length === 0) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      const reduceMotion =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const selected = selectedId ? places.find((place) => place.id === selectedId) : null;
      if (selected) {
        map.setView([selected.latitude, selected.longitude], Math.max(map.getZoom(), 12), {
          animate: !reduceMotion,
        });
        return;
      }
      const bounds = L.latLngBounds(places.map((place) => [place.latitude, place.longitude]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [56, 56], maxZoom: 13, animate: !reduceMotion });
    })();
    return () => {
      cancelled = true;
    };
  }, [places, selectedId]);

  return <div ref={containerRef} className="places-map-canvas" role="application" aria-label="Carte des lieux" />;
}

export default PlacesMap;
