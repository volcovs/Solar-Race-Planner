import { describe, expect, it } from "vitest";
import { bounds, cumulativeKm, distanceKm, pointAtKm, sliceByKm, type LonLat } from "./geo";

// Along the equator one degree of longitude is 2πR/360 ≈ 111.195 km.
const DEGREE_KM = distanceKm([0, 0], [1, 0]);
const LINE: LonLat[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
];

describe("distances along a line", () => {
  it("measures great-circle distance", () => {
    expect(DEGREE_KM).toBeCloseTo(111.195, 3);
    expect(distanceKm([130.8, -12.5], [130.8, -12.5])).toBe(0);
  });

  it("accumulates km at each vertex", () => {
    const cum = cumulativeKm(LINE);
    expect(cum).toHaveLength(4);
    expect(cum[3]).toBeCloseTo(3 * DEGREE_KM, 2);
  });

  it("finds the point at a distance, clamped to the ends", () => {
    const cum = cumulativeKm(LINE);
    const [lon, lat] = pointAtKm(LINE, cum, 1.5 * DEGREE_KM);
    expect(lon).toBeCloseTo(1.5, 6);
    expect(lat).toBe(0);
    expect(pointAtKm(LINE, cum, -5)).toEqual([0, 0]);
    expect(pointAtKm(LINE, cum, 1e6)).toEqual([3, 0]);
  });
});

describe("sliceByKm", () => {
  const cum = cumulativeKm(LINE);
  const pieces = sliceByKm(LINE, cum, 100);

  it("covers the whole line in consecutive pieces", () => {
    expect(pieces).toHaveLength(Math.ceil((3 * DEGREE_KM) / 100));
    expect(pieces[0].kmStart).toBe(0);
    expect(pieces.at(-1)!.kmEnd).toBeCloseTo(3 * DEGREE_KM, 6);
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i].kmStart).toBe(pieces[i - 1].kmEnd);
      expect(pieces[i].coords[0]).toEqual(pieces[i - 1].coords.at(-1));
    }
  });

  it("keeps the line's own vertices inside the pieces", () => {
    const allCoords = pieces.flatMap((p) => p.coords);
    expect(allCoords).toContainEqual([1, 0]);
    expect(allCoords).toContainEqual([2, 0]);
    expect(pieces[0].coords[0]).toEqual([0, 0]);
    expect(pieces.at(-1)!.coords.at(-1)).toEqual([3, 0]);
  });
});

it("bounds are [[west, south], [east, north]]", () => {
  expect(
    bounds([
      [130, -12],
      [138, -35],
      [134, -20],
    ]),
  ).toEqual([
    [130, -35],
    [138, -12],
  ]);
});
