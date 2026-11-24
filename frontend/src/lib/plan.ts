// Draft shapes of GET /plan and GET /forecast (BE-04); see docs/data-contracts.md.
// One array per quantity, all the same length and ordered by km.

/** GET /plan: the latest race plan. */
export interface PlanResponse {
  plan_id: string;
  created_at: string; // ISO 8601, UTC
  timezone: string; // IANA zone the race runs on, for showing local clock times
  min_soc: number; // the car's battery floor, 0–1 (its profile's min_soc)
  stops: { kind: "start" | "control_stop" | "finish"; name: string; km: number }[]; // in race order
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

/** The race day `km` is reached on; a day's last km belongs to it, not to the next morning. */
export function dayAt(plan: PlanResponse, km: number): number {
  return (plan.days.find((d) => km <= d.end_km) ?? plan.days.at(-1))?.day ?? 1;
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

/** Clock time in the race's own zone, e.g. "14:05". */
export function raceClock(plan: PlanResponse): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", { timeZone: plan.timezone, hour: "2-digit", minute: "2-digit" });
}

/** The race's zone as people read it, e.g. "Australia/Darwin (UTC+9:30)". */
export function zoneLabel(plan: PlanResponse): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: plan.timezone, timeZoneName: "shortOffset" }).formatToParts(
    new Date(plan.time_utc[0]),
  );
  const offset = parts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "UTC") ?? "";
  return `${plan.timezone.replace(/_/g, " ")} (${offset === "UTC" ? "UTC+0" : offset})`;
}

export interface Stage {
  from: string;
  to: string;
  fromKm: number;
  toKm: number;
  speedKmh: number; // average target speed: distance over planned driving time
  arrival: Date;
  arrivalDay: number;
  arrivalSoc: number;
}

/** One stage per leg between consecutive stops, ending with the arrival at its stop. */
export function stages(plan: PlanResponse): Stage[] {
  return plan.stops.slice(1).map((to, i) => {
    const from = plan.stops[i];
    return {
      from: from.name,
      to: to.name,
      fromKm: from.km,
      toKm: to.km,
      speedKmh: averageSpeed(plan, from.km, to.km),
      arrival: timeAt(plan, to.km),
      arrivalDay: dayAt(plan, to.km),
      arrivalSoc: valueAt(plan.km, plan.soc, to.km),
    };
  });
}

function averageSpeed(plan: PlanResponse, fromKm: number, toKm: number): number {
  let km = 0;
  let hours = 0;
  for (let i = 1; i < plan.km.length; i++) {
    if (plan.km[i] <= fromKm || plan.km[i - 1] >= toKm) continue;
    const step = plan.km[i] - plan.km[i - 1];
    km += step;
    hours += step / plan.speed_kmh[i - 1];
  }
  return hours > 0 ? km / hours : 0;
}

export interface DaySummary {
  day: number;
  endKm: number;
  endTime: Date;
  minSoc: number;
  minP10: number;
  safe: boolean; // the pessimistic (P10) battery stays at or above the car's minimum all day
}

export function daySummaries(plan: PlanResponse): DaySummary[] {
  return plan.days.map((d) => {
    let minSoc = Infinity;
    let minP10 = Infinity;
    plan.km.forEach((km, i) => {
      if (dayAt(plan, km) !== d.day) return;
      minSoc = Math.min(minSoc, plan.soc[i]);
      minP10 = Math.min(minP10, plan.soc_p10[i]);
    });
    return { day: d.day, endKm: d.end_km, endTime: timeAt(plan, d.end_km), minSoc, minP10, safe: minP10 >= plan.min_soc };
  });
}
