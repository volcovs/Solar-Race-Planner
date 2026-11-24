import { describe, expect, it } from "vitest";
import { dayAt, sample, timeAt, valueAt, type PlanResponse } from "./plan";

const kms = [0, 0.5, 1, 1.5, 2.2];
const values = [10, 20, 30, 40, 50];

describe("valueAt", () => {
  it("interpolates between samples", () => {
    expect(valueAt(kms, values, 0.25)).toBeCloseTo(15);
    expect(valueAt(kms, values, 1.85)).toBeCloseTo(45);
  });

  it("holds the end values past either end", () => {
    expect(valueAt(kms, values, -3)).toBe(10);
    expect(valueAt(kms, values, 9)).toBe(50);
  });
});

describe("sample", () => {
  it("draws every km and keeps the last point", () => {
    expect(sample(kms, values, 1)).toEqual([
      [0, 10],
      [1, 30],
      [2, expect.closeTo(47.14, 2)],
      [2.2, 50],
    ]);
  });
});

describe("timeAt and dayAt", () => {
  const plan = {
    km: [0, 100, 200],
    time_utc: ["2025-08-24T00:00:00Z", "2025-08-24T01:00:00Z", "2025-08-24T23:00:00Z"],
    days: [
      { day: 1, start_km: 0, end_km: 150 },
      { day: 2, start_km: 150, end_km: 200 },
    ],
  } as PlanResponse;

  it("holds the last planned time, so a night stop isn't smeared across km", () => {
    expect(timeAt(plan, 150).toISOString()).toBe("2025-08-24T01:00:00.000Z");
  });

  it("finds the race day", () => {
    expect(dayAt(plan, 149)).toBe(1);
    expect(dayAt(plan, 150)).toBe(2);
    expect(dayAt(plan, 200)).toBe(2);
  });
});
