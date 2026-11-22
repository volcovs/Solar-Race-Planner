import { describe, expect, it } from "vitest";
import { ROUTE_FILE } from "../test/fixtures";
import { buildRoute, nextStop, placeName } from "./route";

const file = ROUTE_FILE;

describe("buildRoute", () => {
  const route = buildRoute(file, 50);

  it("orders stops by km", () => {
    expect(route.stops.map((s) => s.name)).toEqual(["Start (Square)", "Middle", "End (Park)"]);
    expect(route.stops[1]).toMatchObject({ kind: "control_stop", km: 150, position: [1.35, 0] });
  });

  it("cuts the line into numbered stretches", () => {
    expect(route.segments.length).toBe(Math.ceil(route.lengthKm / 50));
    expect(route.segments.map((s) => s.id)).toEqual(route.segments.map((_, i) => i));
    expect(route.segments[0]).toMatchObject({ kmStart: 0, kmEnd: 50 });
  });

  it("uses the file's length, so km match the data pipeline", () => {
    expect(route.lengthKm).toBeCloseTo(333.6, 9);
    expect(route.segments.at(-1)!.kmEnd).toBeCloseTo(333.6, 9);
  });

  it("rejects a file without a route line", () => {
    const noLine = { ...file, features: file.features.filter((f) => f.properties.kind !== "route") };
    expect(() => buildRoute(noLine)).toThrow("no route line");
  });
});

it("nextStop finds the first stop at or after a km", () => {
  const { stops } = buildRoute(file);
  expect(nextStop(stops, 10)?.name).toBe("Middle");
  expect(nextStop(stops, 150)?.name).toBe("Middle");
  expect(nextStop(stops, 400)).toBeUndefined();
});

it("placeName drops the venue in brackets", () => {
  expect(placeName("Darwin (State Square)")).toBe("Darwin");
  expect(placeName("Katherine")).toBe("Katherine");
});
