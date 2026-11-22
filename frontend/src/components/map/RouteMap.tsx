import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { bounds } from "../../lib/geo";
import { placeName, type RouteData } from "../../lib/route";
import { currentTheme, readToken, useTheme, type Theme } from "../../lib/theme";

// MapLibre looks for its worker next to its own file, which bundlers move; say where it is.
setWorkerUrl(workerUrl);

// Free OpenStreetMap base maps, no key needed (https://openfreemap.org).
const STYLE_URL: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const ROUTE_CREDIT =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Route © OpenStreetMap contributors</a>';
const LABEL_FONT = ["Noto Sans Regular"]; // available in both base map styles

const SEGMENTS = "segments";
const STOPS = "stops";
const ROUTE_LINE = "route-line";
const TAP_TOLERANCE_PX = 10; // the route line is thin; accept taps near it

export interface RouteMapHandle {
  fitRoute: () => void;
}

interface Props {
  route: RouteData;
  selectedId: number | null;
  onSelect: (segmentId: number | null) => void;
}

/** MapLibre map of the route and its stops; a stretch of road can be hovered and selected. */
export const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap({ route, selectedId, onSelect }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const theme = useTheme();
  // The style.load handler re-adds layers after every style change and needs the latest props.
  const latest = useRef({ route, selectedId, onSelect });
  latest.current = { route, selectedId, onSelect };

  useImperativeHandle(ref, () => ({
    fitRoute: () => mapRef.current?.fitBounds(bounds(route.line), { padding: fitPadding(container.current) }),
  }));

  // Create the map once.
  useEffect(() => {
    const map = new MapLibreMap({
      container: container.current!,
      style: STYLE_URL[currentTheme()],
      bounds: bounds(latest.current.route.line),
      fitBoundsOptions: { padding: fitPadding(container.current) },
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("style.load", () => addRouteLayers(map, latest.current));

    let hoveredId: number | null = null;
    const setHover = (id: number | null) => {
      if (hoveredId !== null) map.setFeatureState({ source: SEGMENTS, id: hoveredId }, { hover: false });
      if (id !== null) map.setFeatureState({ source: SEGMENTS, id }, { hover: true });
      hoveredId = id;
      map.getCanvas().style.cursor = id === null ? "" : "pointer";
    };
    map.on("mousemove", (e) => setHover(segmentAt(map, e.point.x, e.point.y)));
    map.on("mouseout", () => setHover(null));
    map.on("click", (e) => latest.current.onSelect(segmentAt(map, e.point.x, e.point.y)));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // New base map when the theme changes; style.load then re-adds the route in the new colours.
  const shownTheme = useRef(theme);
  useEffect(() => {
    if (theme === shownTheme.current) return;
    shownTheme.current = theme;
    mapRef.current?.setStyle(STYLE_URL[theme], { diff: false });
  }, [theme]);

  const shownSelection = useRef<number | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(SEGMENTS)) return;
    if (shownSelection.current !== null) {
      map.setFeatureState({ source: SEGMENTS, id: shownSelection.current }, { selected: false });
    }
    if (selectedId !== null) map.setFeatureState({ source: SEGMENTS, id: selectedId }, { selected: true });
    shownSelection.current = selectedId;
  }, [selectedId]);

  // MapLibre's CSS makes its element `position: relative`, so the wrapper does the positioning.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="size-full" />
    </div>
  );
});

function addRouteLayers(map: MapLibreMap, { route, selectedId }: { route: RouteData; selectedId: number | null }) {
  map.addSource(SEGMENTS, {
    type: "geojson",
    attribution: ROUTE_CREDIT,
    data: {
      type: "FeatureCollection",
      features: route.segments.map(({ id, coords }) => ({
        type: "Feature",
        id,
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      })),
    },
  });
  map.addSource(STOPS, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: route.stops.map(({ kind, name, position }) => ({
        type: "Feature",
        properties: { kind, name: placeName(name) },
        geometry: { type: "Point", coordinates: position },
      })),
    },
  });

  const round = { "line-join": "round", "line-cap": "round" } as const;
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: SEGMENTS,
    layout: round,
    paint: { "line-color": readToken("--map-casing"), "line-width": lineWidth(2.5) },
  });
  map.addLayer({
    id: ROUTE_LINE,
    type: "line",
    source: SEGMENTS,
    layout: round,
    paint: { "line-color": readToken("--route"), "line-width": lineWidth(0) },
  });
  map.addLayer({
    id: "stops-circle",
    type: "circle",
    source: STOPS,
    paint: {
      "circle-radius": ["match", ["get", "kind"], "control_stop", 5, 7],
      "circle-color": ["match", ["get", "kind"], "control_stop", readToken("--surface"), readToken("--sun")],
      "circle-stroke-color": readToken("--ink"),
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "stops-label",
    type: "symbol",
    source: STOPS,
    layout: {
      "text-field": ["get", "name"],
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-offset": [0, 1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": readToken("--ink"), "text-halo-color": readToken("--surface"), "text-halo-width": 1.5 },
  });

  if (selectedId !== null) map.setFeatureState({ source: SEGMENTS, id: selectedId }, { selected: true });
}

/** Width by zoom, thicker for the hovered and selected stretch. `extra` widens the casing. */
function lineWidth(extra: number): ExpressionSpecification {
  const width = (base: number): ExpressionSpecification => [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    base * 1.9 + extra,
    ["boolean", ["feature-state", "hover"], false],
    base * 1.5 + extra,
    base + extra,
  ];
  return ["interpolate", ["linear"], ["zoom"], 3, width(3), 8, width(5), 12, width(8)];
}

function segmentAt(map: MapLibreMap, x: number, y: number): number | null {
  const t = TAP_TOLERANCE_PX;
  const [hit] = map.queryRenderedFeatures(
    [
      [x - t, y - t],
      [x + t, y + t],
    ],
    { layers: [ROUTE_LINE] },
  );
  return typeof hit?.id === "number" ? hit.id : null;
}

/** Keep the route clear of the floating panel: it sits on the left on wide screens, on top on phones. */
function fitPadding(el: HTMLElement | null) {
  const wide = (el?.clientWidth ?? 0) >= 768;
  return wide ? { top: 56, right: 72, bottom: 56, left: 420 } : { top: 150, right: 32, bottom: 32, left: 32 };
}
