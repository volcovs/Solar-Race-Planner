import { describe, expect, it } from "vitest";
import { buildRoute } from "../lib/route";
import { ROUTE_FILE } from "../test/fixtures";
import { simulate } from "./api";

describe("mock /plan and /forecast", () => {
  const { plan, forecast } = simulate(buildRoute(ROUTE_FILE));
  const n = plan.km.length;

  it("covers the route in order, with one value per km in every column", () => {
    expect(plan.km[0]).toBe(0);
    expect(plan.km[n - 1]).toBeCloseTo(333.6, 1);
    expect(plan.km.every((km, i) => i === 0 || km > plan.km[i - 1])).toBe(true);
    for (const column of [plan.time_utc, plan.speed_kmh, plan.soc, plan.soc_p10, plan.soc_p90]) {
      expect(column).toHaveLength(n);
    }
    expect(forecast.ghi_w_m2).toHaveLength(forecast.km.length);
    expect(forecast.headwind_ms).toHaveLength(forecast.km.length);
  });

  it("keeps time moving forward and the battery band around the plan", () => {
    const times = plan.time_utc.map(Date.parse);
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
    plan.soc.forEach((soc, i) => {
      expect(soc).toBeGreaterThan(0);
      expect(soc).toBeLessThanOrEqual(1);
      expect(plan.soc_p10[i]).toBeLessThanOrEqual(soc);
      expect(plan.soc_p90[i]).toBeGreaterThanOrEqual(soc);
    });
  });

  it("splits the route into back-to-back days", () => {
    expect(plan.days[0].start_km).toBe(0);
    expect(plan.days.at(-1)!.end_km).toBeCloseTo(333.6, 1);
    plan.days.slice(1).forEach((day, i) => expect(day.start_km).toBe(plan.days[i].end_km));
  });
});
