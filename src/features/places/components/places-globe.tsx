"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import {
  buildGlobeScene,
  toGlobeZones,
  type GlobeCluster,
  type GlobePoint,
  type GlobeZone,
} from "@/lib/places/globe-projection";
import type { PlacesRendererProps } from "@/features/places/renderer-contract";
import type { PlacesMapItem } from "@/server/places/map-view";

// The one and only file that knows about the 3D engine.
//
// Everything else in the feature talks to it through `PlacesRendererProps`, so
// removing the globe means deleting this file plus its branch in
// `places-renderer.tsx` (NFR-I-06, NFR-I-08). The scene itself is computed by the
// pure `globe-projection` module — this component only binds that data to the
// engine, forwards interaction, and cleans up after itself.
//
// Visual language: Concept 2 (sober) with the restrained Concept 1 elements the
// owner approved — a dark premium globe, a light atmospheric halo, luminous
// points and a smooth centring animation. No auto-rotation and no permanent
// animated arcs: a continuously animating canvas is exactly what D2 excludes, and
// it would also burn frames for no information.

export type PlacesGlobeProps = PlacesRendererProps & {
  textureUrl: string;
  attribution: string;
  reducedMotion: boolean;
};

// Precision reads at a glance and stays distinguishable: EXACT is the brightest
// and tallest, PROBABLE is visibly dimmer, shorter and cooler. They are never the
// same mark (FR-I-10).
const POINT_STYLE = {
  EXACT: { color: "#5eead4", altitude: 0.05, radius: 0.28 },
  PROBABLE: { color: "#fbbf24", altitude: 0.03, radius: 0.2 },
  APPROXIMATE: { color: "#60a5fa", altitude: 0.012, radius: 0.16 },
} as const;

const SELECTED_COLOR = "#ffffff";
const CLUSTER_COLOR = "#93c5fd";
const ZONE_CAP_COLOR = "rgba(96, 165, 250, 0.16)";
const ZONE_STROKE_COLOR = "#60a5fa";
const ZONE_SELECTED_CAP_COLOR = "rgba(255, 255, 255, 0.28)";

const WORLD_ALTITUDE = 2.2;
const FOCUS_ALTITUDE = 0.45;
const CLUSTER_FOCUS_ALTITUDE = 0.9;
const FLY_MS = 900;
// Rendering above this device pixel ratio costs quadratically more fill rate and
// adds nothing on a smooth sphere; see the Phase I performance measurements.
const MAX_PIXEL_RATIO = 1.5;

type PointDatum = GlobePoint & { kind: "place" };
type ClusterDatum = GlobeCluster & { kind: "cluster" };
type ZoneDatum = GlobeZone & {
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
};

export function PlacesGlobe({
  places,
  selectedId,
  onSelect,
  onHover,
  textureUrl,
  attribution,
  reducedMotion,
}: PlacesGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [altitude, setAltitude] = useState(WORLD_ALTITUDE);
  const [ready, setReady] = useState(false);

  // Latest callbacks without rebuilding the scene on every parent render.
  const handlersRef = useRef({ onSelect, onHover });
  useEffect(() => {
    handlersRef.current = { onSelect, onHover };
  }, [onSelect, onHover]);

  const byId = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places],
  );

  // The container is fluid, so the engine is told its pixel size as it changes.
  // Measurement is best-effort: where ResizeObserver is missing the globe still
  // renders and falls back to the engine's own default sizing rather than
  // showing an empty canvas.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = (width: number, height: number) => {
      if (width > 0 && height > 0)
        setSize({ width: Math.round(width), height: Math.round(height) });
    };
    const rect = element.getBoundingClientRect();
    measure(rect.width, rect.height);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width, entry.contentRect.height),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scene = useMemo(
    () => buildGlobeScene(places, { altitude, selectedId }),
    [places, altitude, selectedId],
  );

  const pointsData = useMemo<(PointDatum | ClusterDatum)[]>(
    () =>
      scene.level === "place"
        ? scene.points.map((point) => ({ ...point, kind: "place" as const }))
        : scene.clusters.map((cluster) => ({
            ...cluster,
            kind: "cluster" as const,
          })),
    [scene],
  );

  // Zones follow the individual places: aggregated at world scale, an
  // uncertainty ring would be smaller than the bubble that contains it.
  const zonesData = useMemo<ZoneDatum[]>(
    () =>
      scene.level !== "place"
        ? []
        : toGlobeZones(places, selectedId).map((zone) => ({
            ...zone,
            geometry: { type: "Polygon" as const, coordinates: [zone.ring] },
          })),
    [scene.level, places, selectedId],
  );

  // Moving the camera is a command to the engine, not a state update: the
  // resulting altitude comes back through `onZoom`, which keeps the camera the
  // single source of truth for the level of detail.
  const flyTo = useCallback(
    (lat: number, lng: number, target: number) => {
      // Reduced motion means an instant cut, never a shortened animation that
      // still moves the camera across the screen (FR-I-13).
      globeRef.current?.pointOfView(
        { lat, lng, altitude: target },
        reducedMotion ? 0 : FLY_MS,
      );
    },
    [reducedMotion],
  );

  const handleZoom = useCallback((pov: { altitude: number }) => {
    setAltitude((current) =>
      Math.abs(current - pov.altitude) < 1e-3 ? current : pov.altitude,
    );
  }, []);

  // Centre on the shared selection whenever it changes — including right after
  // switching in from the 2D map (FR-I-06).
  useEffect(() => {
    if (!ready || !selectedId) return;
    const place = byId.get(selectedId);
    if (!place) return;
    flyTo(place.latitude, place.longitude, FOCUS_ALTITUDE);
  }, [ready, selectedId, byId, flyTo]);

  const handleReady = useCallback(() => {
    // globe.gl fires this while it is still committing, before React considers
    // this component mounted, so the state update is deferred by a microtask.
    // Setting it synchronously warns and would be a render-phase update.
    queueMicrotask(() => setReady(true));
    const globe = globeRef.current;
    const controls = globe?.controls();
    if (controls) {
      // Sober by decision: no auto-rotation at all, so nothing animates while
      // the user is reading.
      controls.autoRotate = false;
      controls.enableDamping = !reducedMotion;
      controls.minDistance = 120;
    }
    try {
      // Cap the render resolution. A full-screen globe is fill-rate bound, and a
      // modern phone at devicePixelRatio 3 would rasterize nine times the pixels
      // of a logical one for no visible gain on a sphere with no fine detail.
      // Measured effect is recorded in the Phase I change record.
      globe?.renderer().setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    } catch {
      // A renderer that refuses the hint still renders; this is an optimization,
      // never a requirement.
    }
  }, [reducedMotion]);

  // Release the WebGL context explicitly. Browsers cap the number of live
  // contexts, so leaking one per view switch would eventually blank the globe.
  useEffect(
    () => () => {
      const globe = globeRef.current;
      if (!globe) return;
      try {
        globe.pauseAnimation();
        const renderer = globe.renderer();
        renderer.dispose();
        renderer.forceContextLoss();
      } catch {
        // Teardown races with React unmount in some browsers; a failure here
        // must never break navigation away from the page.
      }
    },
    [],
  );

  const pointPlace = useCallback(
    (point: PointDatum): PlacesMapItem | null => byId.get(point.id) ?? null,
    [byId],
  );

  const emitHover = useCallback(
    (datum: object | null) => {
      const globe = globeRef.current;
      const point = datum as PointDatum | ClusterDatum | null;
      if (!globe || !point || point.kind !== "place") {
        handlersRef.current.onHover(null, null);
        return;
      }
      // Gap G2: the globe projects its own screen coordinates instead of reusing
      // the 2D container maths.
      const screen = globe.getScreenCoords(
        point.lat,
        point.lng,
        POINT_STYLE[point.precision].altitude,
      );
      handlersRef.current.onHover(
        pointPlace(point),
        screen ? { x: screen.x, y: screen.y } : null,
      );
    },
    [pointPlace],
  );

  const handleClick = useCallback(
    (datum: object) => {
      const entry = datum as PointDatum | ClusterDatum;
      if (entry.kind === "place") {
        handlersRef.current.onHover(null, null);
        handlersRef.current.onSelect(entry.id);
        return;
      }
      // A cluster is a drill-down affordance, not a selection: zoom into it and
      // let the level of detail resolve to the individual places (FR-I-11).
      flyTo(entry.lat, entry.lng, CLUSTER_FOCUS_ALTITUDE);
    },
    [flyTo],
  );

  return (
    <div
      ref={containerRef}
      className="places-globe-canvas"
      data-testid="places-globe"
    >
      <Globe
        ref={globeRef}
        {...(size ? { width: size.width, height: size.height } : {})}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={textureUrl}
        showAtmosphere
        atmosphereColor="#7dd3fc"
        atmosphereAltitude={0.16}
        onGlobeReady={handleReady}
        onZoom={handleZoom}
        animateIn={!reducedMotion}
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lng"
        pointsMerge={false}
        pointResolution={6}
        pointAltitude={(datum: object) => {
          const entry = datum as PointDatum | ClusterDatum;
          if (entry.kind === "cluster") return 0.08;
          return POINT_STYLE[entry.precision].altitude;
        }}
        pointRadius={(datum: object) => {
          const entry = datum as PointDatum | ClusterDatum;
          if (entry.kind === "cluster") {
            // Area, not radius, tracks the count: a 10× cluster must not be a
            // 10×-wide blob covering its own continent.
            return Math.min(1.6, 0.34 + Math.sqrt(entry.count) * 0.12);
          }
          return entry.selected
            ? POINT_STYLE[entry.precision].radius * 1.6
            : POINT_STYLE[entry.precision].radius;
        }}
        pointColor={(datum: object) => {
          const entry = datum as PointDatum | ClusterDatum;
          if (entry.kind === "cluster") return CLUSTER_COLOR;
          return entry.selected
            ? SELECTED_COLOR
            : POINT_STYLE[entry.precision].color;
        }}
        pointLabel={(datum: object) => {
          const entry = datum as PointDatum | ClusterDatum;
          if (entry.kind === "cluster")
            return `${entry.label} · ${entry.count}`;
          return pointPlace(entry)?.displayName ?? "";
        }}
        pointsTransitionDuration={reducedMotion ? 0 : 250}
        onPointClick={handleClick}
        onPointHover={emitHover}
        polygonsData={zonesData}
        polygonGeoJsonGeometry="geometry"
        polygonAltitude={0.006}
        polygonCapColor={(datum: object) =>
          (datum as ZoneDatum).selected
            ? ZONE_SELECTED_CAP_COLOR
            : ZONE_CAP_COLOR
        }
        polygonSideColor={() => "rgba(0,0,0,0)"}
        polygonStrokeColor={() => ZONE_STROKE_COLOR}
        polygonsTransitionDuration={0}
      />
      <p className="places-globe-attribution">{attribution}</p>
    </div>
  );
}

export default PlacesGlobe;
