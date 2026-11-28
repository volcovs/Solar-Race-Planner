import { cumulativeKm, sliceByKm, type LonLat, type Piece } from "./geo";

// Until the API serves the route (BE-04): the file exported by the route pipeline (DAT-01).
export const ROUTE_URL = `${import.meta.env.BASE_URL}sample/route.geojson`;

export type StopKind = "start" | "control_stop" | "finish";

export interface Stop {
  kind: StopKind;
  name: string;
  km: number; // official km from the start line
  position: LonLat;
}

/** A stretch of the route; the map highlights and describes one at a time. */
export interface Segment extends Piece {
  id: number;
}

export interface RouteData {
  line: LonLat[];
  cumKm: number[]; // km from the start at each vertex of `line`
  lengthKm: number;
  stops: Stop[];
  segments: Segment[];
}

/** The route file written by `python -m solar_race_planner.ingest.route --geojson` (DAT-01). */
export interface RouteFile {
  type: "FeatureCollection";
  attribution?: string;
  features: {
    type: "Feature";
    properties: { kind: "route" | StopKind; name?: string; km?: number; length_km?: number };
    geometry: { type: "LineString"; coordinates: LonLat[] } | { type: "Point"; coordinates: LonLat };
  }[];
}

/** Build the map's route model: the line, its stops in race order, and `stepKm` stretches. */
export function buildRoute(file: RouteFile, stepKm = 5): RouteData {
  const routeFeature = file.features.find((f) => f.properties.kind === "route");
  if (!routeFeature || routeFeature.geometry.type !== "LineString") {
    throw new Error("Route file has no route line.");
  }
  const line = routeFeature.geometry.coordinates;
  // The file's length is geodesic (ellipsoid); the spherical distances here run ~0.25% long at
  // these latitudes, so scale them to match. Then km on the map agree with the pipeline.
  const spherical = cumulativeKm(line);
  const scale = (routeFeature.properties.length_km ?? spherical.at(-1)!) / spherical.at(-1)!;
  const cum = spherical.map((km) => km * scale);

  const stops: Stop[] = file.features
    .filter((f) => f.properties.kind !== "route")
    .map((f) => ({
      kind: f.properties.kind as StopKind,
      name: f.properties.name ?? "",
      km: f.properties.km ?? 0,
      position: f.geometry.type === "Point" ? f.geometry.coordinates : f.geometry.coordinates[0],
    }))
    .sort((a, b) => a.km - b.km);

  const segments = sliceByKm(line, cum, stepKm).map((piece, id) => ({ id, ...piece }));

  return { line, cumKm: cum, lengthKm: cum[cum.length - 1], stops, segments };
}

/** "Darwin (State Square)" → "Darwin": the place, without the venue. */
export function placeName(name: string): string {
  return name.replace(/\s*\(.*\)$/, "");
}

/** The stretch that contains `km` (the last one for km at or past the finish). */
export function segmentAtKm(route: RouteData, km: number): Segment | undefined {
  return route.segments.find((s) => km < s.kmEnd) ?? route.segments.at(-1);
}

/** The first stop at or after `km`, if any. */
export function nextStop(stops: Stop[], km: number): Stop | undefined {
  return stops.find((stop) => stop.km >= km);
}

export async function loadRoute(url: string, signal?: AbortSignal): Promise<RouteData> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Route data: ${response.status}`);
  return buildRoute((await response.json()) as RouteFile);
}
