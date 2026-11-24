// Draft shapes of GET /plan and GET /forecast (BE-04); see docs/data-contracts.md.
// One array per quantity, all the same length and ordered by km.

/** GET /plan: the latest race plan. */
export interface PlanResponse {
  plan_id: string;
  created_at: string; // ISO 8601, UTC
  timezone: string; // IANA zone the race runs on, for showing local clock times
  min_soc: number; // the car's battery floor, 0–1 (its profile's min_soc)
  days: { day: number; start_km: number; end_km: number }[];
  km: number[];
  time_utc: string[]; // planned time at each km, ISO 8601
  speed_kmh: number[]; // target speed
  soc: number[]; // planned state of charge, 0–1
  soc_p10: number[]; // pessimistic SoC (P10 of the forecast)
  soc_p90: number[]; // optimistic SoC (P90)
}

/** GET /forecast: the weather along the route at the planned arrival times (WX-06). */
export interface ForecastResponse {
  model: string;
  issue_time_utc: string;
  km: number[];
  ghi_w_m2: number[]; // global horizontal irradiance
  headwind_ms: number[]; // wind along the route: + against the car, − behind it
}

/** Index of the last km at or before `km` (0 when `km` is before the first). */
function indexAt(kms: number[], km: number): number {
  let lo = 0;
  let hi = kms.length - 1;
  if (km <= kms[0]) return 0;
  if (km >= kms[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kms[mid] <= km) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Value at `km`, linear between the nearest samples and held flat past either end. */
export function valueAt(kms: number[], values: number[], km: number): number {
  const i = indexAt(kms, km);
  if (i === kms.length - 1 || km <= kms[0]) return values[i];
  const t = (km - kms[i]) / (kms[i + 1] - kms[i]);
  return values[i] + t * (values[i + 1] - values[i]);
}

/** Planned time at the last sample at or before `km`; not interpolated, so night stops stay put. */
export function timeAt(plan: PlanResponse, km: number): Date {
  return new Date(plan.time_utc[indexAt(plan.km, km)]);
}

/** The race day `km` falls in. */
export function dayAt(plan: PlanResponse, km: number): number {
  return (plan.days.find((d) => km < d.end_km) ?? plan.days.at(-1))?.day ?? 1;
}

/** `[km, value]` every `stepKm`, for drawing. */
export function sample(kms: number[], values: number[], stepKm = 1): [number, number][] {
  const first = kms[0];
  const last = kms[kms.length - 1];
  const points: [number, number][] = [];
  for (let km = first; km < last; km += stepKm) points.push([km, valueAt(kms, values, km)]);
  points.push([last, values[values.length - 1]]);
  return points;
}
