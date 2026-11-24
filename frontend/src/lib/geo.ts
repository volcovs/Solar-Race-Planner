// Distances along a (lon, lat) polyline. Spherical (haversine), which is within ~0.3% of
// the ellipsoid; good enough for placing markers and labelling km on the map.

export type LonLat = [number, number];

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from the start of the line to each vertex; same length as `line`. */
export function cumulativeKm(line: LonLat[]): number[] {
  const result = [0];
  for (let i = 1; i < line.length; i++) result.push(result[i - 1] + distanceKm(line[i - 1], line[i]));
  return result;
}

/** Point at a distance along the line, clamped to its ends. `cum` comes from cumulativeKm(line). */
export function pointAtKm(line: LonLat[], cum: number[], km: number): LonLat {
  if (km <= 0) return line[0];
  if (km >= cum[cum.length - 1]) return line[line.length - 1];
  // Binary search for the segment [i, i + 1] that contains km.
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= km) lo = mid;
    else hi = mid;
  }
  const t = (km - cum[lo]) / (cum[hi] - cum[lo] || 1);
  const [[x1, y1], [x2, y2]] = [line[lo], line[hi]];
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

export interface Piece {
  kmStart: number;
  kmEnd: number;
  coords: LonLat[];
}

/** Cut the line into consecutive pieces of `stepKm` (the last may be shorter). Pieces share end points. */
export function sliceByKm(line: LonLat[], cum: number[], stepKm: number): Piece[] {
  const total = cum[cum.length - 1];
  const pieces: Piece[] = [];
  let vertex = 1; // first vertex not yet used
  for (let n = 0; n * stepKm < total; n++) {
    const kmStart = n * stepKm;
    const kmEnd = Math.min((n + 1) * stepKm, total);
    const coords: LonLat[] = [pointAtKm(line, cum, kmStart)];
    while (vertex < line.length && cum[vertex] <= kmStart) vertex++;
    while (vertex < line.length && cum[vertex] < kmEnd) coords.push(line[vertex++]);
    coords.push(pointAtKm(line, cum, kmEnd));
    pieces.push({ kmStart, kmEnd, coords });
  }
  return pieces;
}

/**
 * The km of the point on the line nearest to `p`, and how far `p` is from it. Flat-earth around
 * `p`, which is exact enough within a few km of the route. `cum` comes from cumulativeKm(line).
 */
export function nearestKm(line: LonLat[], cum: number[], [lon, lat]: LonLat): { km: number; offKm: number } {
  const kmPerDeg = (Math.PI / 180) * EARTH_RADIUS_KM;
  const cosLat = Math.cos(toRad(lat));
  let best = { km: 0, offKm: Infinity };
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = (bx - ax) * cosLat;
    const dy = by - ay;
    const px = (lon - ax) * cosLat;
    const py = lat - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
    const offKm = Math.hypot(px - t * dx, py - t * dy) * kmPerDeg;
    if (offKm < best.offKm) best = { km: cum[i - 1] + t * (cum[i] - cum[i - 1]), offKm };
  }
  return best;
}

/** [[west, south], [east, north]] of the line. */
export function bounds(line: LonLat[]): [LonLat, LonLat] {
  const lons = line.map(([lon]) => lon);
  const lats = line.map(([, lat]) => lat);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}
