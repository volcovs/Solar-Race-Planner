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

/** POST /replan: where the car is now. The answer is a PlanResponse from there to the finish. */
export interface ReplanRequest {
  km: number;
  time_utc: string; // ISO 8601
  soc: number; // 0–1
}

/** One what-if for POST /scenarios: what to change against the plan's own assumptions. */
export interface Scenario {
  start_soc: number; // 0–1
  weather_shift_h: number; // -1 to +1: the clouds that much earlier (-) or later (+) than forecast
  weather: "p10" | "p50" | "p90"; // plan on the pessimistic, median or optimistic forecast
  cda_factor: number; // 0.9–1.1: the car draggier or slicker than its profile says
  strategy: "planned" | "constant"; // constant: the planned average speed, held all race
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

/** The zone's offset from UTC at instant `t`, in minutes (570 for UTC+9:30). */
function utcOffsetMinutes(timezone: string, t: number): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, timeZoneName: "shortOffset" })
    .formatToParts(t)
    .find((p) => p.type === "timeZoneName")?.value;
  const [, sign, hours, minutes = "0"] = name?.match(/GMT([+-])(\d+)(?::(\d+))?/) ?? [];
  return sign ? (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) : 0;
}

/** The race's zone as people read it, e.g. "Australia/Darwin (UTC+9:30)". */
export function zoneLabel(plan: PlanResponse): string {
  const offset = utcOffsetMinutes(plan.timezone, Date.parse(plan.time_utc[0]));
  const hours = Math.trunc(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset < 0 ? "-" : "+";
  return `${plan.timezone.replace(/_/g, " ")} (UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""})`;
}

/** The instant of a local race clock time ("14:05") on race day `day`; day 1 is the plan's first. */
export function raceTimeToUtc(plan: PlanResponse, day: number, clock: string): Date {
  const first = Date.parse(plan.time_utc[0]);
  const local = new Date(first + utcOffsetMinutes(plan.timezone, first) * 60_000);
  const [hours, minutes] = clock.split(":").map(Number);
  const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + day - 1, hours, minutes);
  return new Date(wall - utcOffsetMinutes(plan.timezone, wall) * 60_000);
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

/** Average driving speed between two km: distance over the planned time on the move. */
export function averageSpeed(plan: PlanResponse, fromKm = plan.km[0], toKm = plan.km[plan.km.length - 1]): number {
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

export interface Change<T> {
  before: T;
  after: T;
}

export interface StopChange {
  name: string;
  km: number;
  arrival: Change<Date>;
  soc: Change<number>; // on arrival
  speedKmh: Change<number>; // average on the way there, from the previous stop (or the re-plan point)
}

/** Stop by stop ahead of a re-plan: what the previous plan said and what the new one says. */
export function compareStops(before: PlanResponse, after: PlanResponse): StopChange[] {
  return stages(after).map((s) => ({
    name: s.to,
    km: s.toKm,
    arrival: { before: timeAt(before, s.toKm), after: s.arrival },
    soc: { before: valueAt(before.km, before.soc, s.toKm), after: s.arrivalSoc },
    speedKmh: { before: averageSpeed(before, s.fromKm, s.toKm), after: s.speedKmh },
  }));
}

/** The lowest planned battery from `km` to the finish. */
export function lowestSocFrom(plan: PlanResponse, km: number): number {
  return Math.min(...plan.soc.filter((_, i) => plan.km[i] >= km));
}

export type RaceMoment =
  | { phase: "before"; start: Date }
  | { phase: "racing"; km: number; day: number; soc: number }
  | { phase: "finished"; finish: Date };

/** Where the plan puts the car at instant `now`: before the start, on the road, or finished. */
export function plannedAt(plan: PlanResponse, now: Date): RaceMoment {
  const t = now.getTime();
  const start = new Date(plan.time_utc[0]);
  const finish = new Date(plan.time_utc[plan.time_utc.length - 1]);
  if (t < start.getTime()) return { phase: "before", start };
  if (t >= finish.getTime()) return { phase: "finished", finish };
  let i = 0;
  while (Date.parse(plan.time_utc[i + 1]) <= t) i++;
  return { phase: "racing", km: plan.km[i], day: dayAt(plan, plan.km[i]), soc: plan.soc[i] };
}
