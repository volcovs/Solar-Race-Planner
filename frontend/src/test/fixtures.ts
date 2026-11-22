import type { RouteFile } from "../lib/route";

/** A tiny route file in the format DAT-01 exports: ~333 km along the equator, three stops. */
export const ROUTE_FILE: RouteFile = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { kind: "route", length_km: 333.6 },
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ],
      },
    },
    { type: "Feature", properties: { kind: "finish", name: "End (Park)", km: 333.6 }, geometry: { type: "Point", coordinates: [3, 0] } },
    { type: "Feature", properties: { kind: "start", name: "Start (Square)", km: 0 }, geometry: { type: "Point", coordinates: [0, 0] } },
    { type: "Feature", properties: { kind: "control_stop", name: "Middle", km: 150 }, geometry: { type: "Point", coordinates: [1.35, 0] } },
  ],
};
