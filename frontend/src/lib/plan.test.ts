import { describe, expect, it } from "vitest";
import {
  compareStops,
  dayAt,
  daySummaries,
  lowestSocFrom,
  plannedAt,
  raceClock,
  raceTimeToUtc,
  sample,
  stages,
  timeAt,
  valueAt,
  zoneLabel,
  type PlanResponse,
} from "./plan";

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
    expect(dayAt(plan, 150)).toBe(1);
    expect(dayAt(plan, 151)).toBe(2);
    expect(dayAt(plan, 200)).toBe(2);
  });

  it("puts the car where the plan has it at a given instant", () => {
    const at = (iso: string) => plannedAt({ ...plan, soc: [1, 0.8, 0.5] }, new Date(iso));
    expect(at("2025-08-23T23:00:00Z")).toEqual({ phase: "before", start: new Date("2025-08-24T00:00:00Z") });
    expect(at("2025-08-24T00:30:00Z")).toEqual({ phase: "racing", km: 0, day: 1, soc: 1 });
    expect(at("2025-08-24T12:00:00Z")).toEqual({ phase: "racing", km: 100, day: 1, soc: 0.8 }); // overnight: held
    expect(at("2025-08-24T23:00:00Z")).toEqual({ phase: "finished", finish: new Date("2025-08-24T23:00:00Z") });
  });
});

describe("stages, day summaries and the race clock", () => {
  // Start → 100 km at 50 km/h → stop → 100 km at 100 km/h → finish; the second day dips below the floor.
  const plan = {
    timezone: "Australia/Darwin",
    min_soc: 0.1,
    stops: [
      { kind: "start", name: "Start (Square)", km: 0 },
      { kind: "control_stop", name: "Middle", km: 100 },
      { kind: "finish", name: "End (Park)", km: 200 },
    ],
    days: [
      { day: 1, start_km: 0, end_km: 100 },
      { day: 2, start_km: 100, end_km: 200 },
    ],
    km: [0, 50, 100, 150, 200],
    time_utc: ["2025-08-23T23:00:00Z", "2025-08-24T00:00:00Z", "2025-08-24T01:00:00Z", "2025-08-25T00:00:00Z", "2025-08-25T00:30:00Z"],
    speed_kmh: [50, 50, 100, 100, 100],
    soc: [1, 0.8, 0.6, 0.4, 0.3],
    soc_p10: [0.9, 0.7, 0.5, 0.2, 0.05],
    soc_p90: [1, 0.9, 0.7, 0.6, 0.5],
  } as PlanResponse;

  it("gives each stage its average speed, arrival and battery", () => {
    const [first, second] = stages(plan);

    expect(first).toMatchObject({ from: "Start (Square)", to: "Middle", speedKmh: 50, arrivalDay: 1, arrivalSoc: 0.6 });
    expect(first.arrival.toISOString()).toBe("2025-08-24T01:00:00.000Z");
    expect(second).toMatchObject({ to: "End (Park)", speedKmh: 100, arrivalSoc: 0.3 });
  });

  it("averages speed by time, not by sample", () => {
    const mixed = { ...plan, speed_kmh: [50, 100, 100, 100, 100] };
    expect(stages(mixed)[0].speedKmh).toBeCloseTo(100 / (50 / 50 + 50 / 100)); // 66.7, not 75
  });

  it("summarises each day and flags one where the pessimistic battery goes under the minimum", () => {
    expect(daySummaries(plan)).toMatchObject([
      { day: 1, endKm: 100, minSoc: 0.6, minP10: 0.5, safe: true },
      { day: 2, endKm: 200, minSoc: 0.3, minP10: 0.05, safe: false },
    ]);
  });

  it("turns a race day and local clock time into an instant", () => {
    // Day 1 is 24 August in Darwin (the plan starts 08:30 local, 23:00 UTC the day before).
    expect(raceTimeToUtc(plan, 1, "08:30").toISOString()).toBe("2025-08-23T23:00:00.000Z");
    expect(raceTimeToUtc(plan, 2, "10:00").toISOString()).toBe("2025-08-25T00:30:00.000Z");
  });

  it("compares a re-plan with the previous plan, stop by stop", () => {
    // The car re-plans at km 150 with less battery, and reaches the finish an hour later.
    const after = {
      ...plan,
      stops: [{ kind: "start", name: "Re-plan point", km: 150 }, plan.stops[2]],
      km: [150, 200],
      time_utc: ["2025-08-25T00:00:00Z", "2025-08-25T01:30:00Z"],
      speed_kmh: [50, 50],
      soc: [0.3, 0.15],
    } as PlanResponse;

    const [finish] = compareStops(plan, after);
    expect(finish).toMatchObject({ name: "End (Park)", km: 200, soc: { before: 0.3, after: 0.15 }, speedKmh: { before: 100, after: 50 } });
    expect(finish.arrival.after.getTime() - finish.arrival.before.getTime()).toBe(3_600_000);
    expect(lowestSocFrom(plan, 150)).toBe(0.3);
    expect(lowestSocFrom(after, 150)).toBe(0.15);
  });

  it("writes the time zone out and shows clock times in it", () => {
    expect(zoneLabel(plan)).toBe("Australia/Darwin (UTC+9:30)");
    expect(raceClock(plan).format(new Date("2025-08-23T23:00:00Z"))).toBe("08:30");
  });
});
