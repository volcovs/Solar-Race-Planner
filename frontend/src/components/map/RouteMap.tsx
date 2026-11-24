import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { FeatureCollection } from "geojson"; // types that come with maplibre-gl
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type IControl,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef } from "react";
import { bounds, nearestKm, pointAtKm } from "../../lib/geo";
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
const CURSOR = "cursor";
const ROUTE_LINE = "route-line";
const TAP_TOLERANCE_PX = 10; // the route line is thin; accept taps near it

interface Props {
  route: RouteData;
  selectedId: number | null;
  onSelect: (segmentId: number | null) => void;
  cursorKm: number | null; // shared with the timeline: drawn as a dot on the route
  onCursor: (km: number | null) => void;
}

/** MapLibre map of the route and its stops; a stretch of road can be hovered and selected. */
export function RouteMap({ route, selectedId, onSelect, cursorKm, onCursor }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const theme = useTheme();
  // The style.load handler re-adds layers after every style change and needs the latest props.
  const latest = useRef({ route, selectedId, onSelect, cursorKm, onCursor });
  latest.current = { route, selectedId, onSelect, cursorKm, onCursor };

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
    map.addControl(
      fitRouteControl(() => map.fitBounds(bounds(latest.current.route.line), { padding: fitPadding(container.current) })),
      "top-right",
    );
    map.on("style.load", () => addRouteLayers(map, latest.current));

    let hoveredId: number | null = null;
    const setHover = (id: number | null) => {
      if (hoveredId !== null) map.setFeatureState({ source: SEGMENTS, id: hoveredId }, { hover: false });
      if (id !== null) map.setFeatureState({ source: SEGMENTS, id }, { hover: true });
      hoveredId = id;
      map.getCanvas().style.cursor = id === null ? "" : "pointer";
    };
    // The stretch under the pointer, and the km of the nearest point on the route.
    const routeAt = (e: MapMouseEvent) => {
      const id = segmentAt(map, e.point.x, e.point.y);
      const { route } = latest.current;
      return { id, km: id === null ? null : nearestKm(route.line, route.cumKm, [e.lngLat.lng, e.lngLat.lat]).km };
    };
    map.on("mousemove", (e) => {
      const { id, km } = routeAt(e);
      setHover(id);
      latest.current.onCursor(km);
    });
    map.on("mouseout", () => {
      setHover(null);
      latest.current.onCursor(null);
    });
    // Phones have no hover: a tap both selects the stretch and shows the values there.
    map.on("click", (e) => {
      const { id, km } = routeAt(e);
      latest.current.onSelect(id);
      latest.current.onCursor(km);
    });

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

    // Picked from the timeline, the stretch may be off screen: bring it into view.
    const segment = selectedId === null ? undefined : route.segments[selectedId];
    const middle = segment?.coords[Math.floor(segment.coords.length / 2)];
    if (middle && !map.getBounds().contains(middle)) map.easeTo({ center: middle });
  }, [selectedId, route]);

  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>(CURSOR);
    source?.setData(cursorFeatures(route, cursorKm));
  }, [route, cursorKm]);

  // MapLibre's CSS makes its element `position: relative`, so the wrapper does the positioning.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="size-full" />
    </div>
  );
}

function addRouteLayers(
  map: MapLibreMap,
  { route, selectedId, cursorKm }: { route: RouteData; selectedId: number | null; cursorKm: number | null },
) {
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

  map.addSource(CURSOR, { type: "geojson", data: cursorFeatures(route, cursorKm) });
  map.addLayer({
    id: "cursor",
    type: "circle",
    source: CURSOR,
    paint: {
      "circle-radius": 6,
      "circle-color": readToken("--battery"),
      "circle-stroke-color": readToken("--surface"),
      "circle-stroke-width": 2,
    },
  });

  if (selectedId !== null) map.setFeatureState({ source: SEGMENTS, id: selectedId }, { selected: true });
}

/** The cursor as a point on the route, or nothing. */
function cursorFeatures(route: RouteData, km: number | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      km === null
        ? []
        : [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pointAtKm(route.line, route.cumKm, km) } }],
  };
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
  if (!map.getLayer(ROUTE_LINE)) return null; // between a theme's new style and its style.load
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

// Lucide "maximize-2", inline so the control needs no React rendering.
const FIT_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';

/** "Show the whole route" button, stacked under MapLibre's zoom buttons. */
function fitRouteControl(onFit: () => void): IControl {
  const group = document.createElement("div");
  group.className = "maplibregl-ctrl maplibregl-ctrl-group";
  const button = document.createElement("button");
  button.type = "button";
  button.title = "Show the whole route";
  button.setAttribute("aria-label", button.title);
  // Inline: MapLibre's unlayered CSS (`display: block`) would beat Tailwind's layered utilities.
  button.style.cssText = "display: grid; place-items: center; color: var(--ink)";
  button.innerHTML = FIT_ICON;
  button.addEventListener("click", onFit);
  group.append(button);
  return { onAdd: () => group, onRemove: () => group.remove() };
}
