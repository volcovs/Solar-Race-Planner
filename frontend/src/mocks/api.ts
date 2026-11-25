// Made-up /plan, /forecast and /replan responses until the API serves them (BE-04, BE-05), in
// the shapes of src/lib/plan.ts: a crude drive along the sample route with made-up clouds and wind.
// The car charges only from its own array, so at stops only while the sun is up.

import { pointAtKm } from "../lib/geo";
import type { ForecastResponse, PlanResponse, ReplanRequest } from "../lib/plan";
import { loadRoute, type RouteData } from "../lib/route";

const ROUTE_URL = `${import.meta.env.BASE_URL}sample/route.geojson`;

const STEP_KM = 0.5;
const HOUR_MS = 3_600_000;
const TIMEZONE = "Australia/Darwin";
const UTC_OFFSET_H = 9.5; // that zone has no daylight saving
const START_UTC = Date.UTC(2025, 7, 24, 8.5 - UTC_OFFSET_H); // 08:30 local, late August
const DRIVE_FROM_H = 8; // local clock
const DRIVE_UNTIL_H = 17;
const CONTROL_STOP_H = 0.5;

// A made-up low-drag single-seater: around midday it gains more from the sun than it uses at 70 km/h.
const CAR = { massKg: 250, cdaM2: 0.08, crr: 0.006, arrayM2: 4, arrayEff: 0.24, batteryWh: 3000, drivetrainEff: 0.95 };

export function mockResponse(path: "/plan" | "/forecast"): Promise<PlanResponse | ForecastResponse> {
  cached ??= loadRoute(ROUTE_URL).then(simulate);
  return cached.then((race) => (path === "/plan" ? race.plan : race.forecast));
}
let cached: Promise<{ plan: PlanResponse; forecast: ForecastResponse }> | undefined;

/** The same drive from where the car is now. /plan stays the original, so there's something to compare with. */
export function mockReplan(request: ReplanRequest): Promise<PlanResponse> {
  return loadRoute(ROUTE_URL).then((route) => simulate(route, request).plan);
}

const RACE_START: ReplanRequest = { km: 0, time_utc: new Date(START_UTC).toISOString(), soc: 1 };

/** Drive the route in STEP_KM steps from `from` and record what a plan and a forecast would say. */
export function simulate(route: RouteData, from: ReplanRequest = RACE_START) {
  const startT = Date.parse(from.time_utc);
  const plan: PlanResponse = {
    plan_id: "sample",
    created_at: new Date(from === RACE_START ? START_UTC - 12 * HOUR_MS : startT).toISOString(),
    timezone: TIMEZONE,
    min_soc: 0.1,
    stops: [
      from.km === 0 ? route.stops[0] : { kind: "start" as const, name: "Re-plan point", km: from.km },
      ...route.stops.filter((s) => s.km > from.km),
    ].map(({ kind, name, km }) => ({ kind, name, km })),
    days: [],
    km: [],
    time_utc: [],
    speed_kmh: [],
    soc: [],
    soc_p10: [],
    soc_p90: [],
  };
  const forecast: ForecastResponse = { model: "sample", issue_time_utc: plan.created_at, km: [], ghi_w_m2: [], headwind_ms: [] };

  const stopsAhead = route.stops.filter((s) => s.kind === "control_stop" && s.km > from.km).map((s) => s.km);
  let t = startT;
  let departAt = drivingTime(t); // later than `t` when the car stops at this km
  let soc = from.soc;
  let day = { day: raceDay(departAt), start_km: from.km };
  const share = (km: number) => (km - from.km) / (route.lengthKm - from.km); // of the distance left

  for (let km = from.km; ; km = Math.min(km + STEP_KM, route.lengthKm)) {
    const [lon, lat] = pointAtKm(route.line, route.cumKm, km);
    const arrival = { t, soc, ghi: irradiance(lat, lon, t, km) };
    soc = charge(soc, parkedWh(lat, lon, t, departAt, km));
    t = departAt;

    const ghi = irradiance(lat, lon, t, km);
    const headwind = 3 * Math.sin(km / 180) + 2 * Math.sin(km / 53 + 2);
    // Slow down when the battery is under a straight line from where it started to 25% at the finish.
    const target = from.soc - (from.soc - 0.25) * share(km);
    const speed = clamp(80 + 300 * (soc - target), 40, 110);
    const spread = 0.02 + 0.1 * share(km);

    plan.km.push(km);
    plan.time_utc.push(new Date(arrival.t).toISOString());
    plan.speed_kmh.push(speed);
    plan.soc.push(arrival.soc);
    plan.soc_p10.push(clamp(arrival.soc - spread, 0, 1));
    plan.soc_p90.push(clamp(arrival.soc + spread, 0, 1));
    forecast.km.push(km);
    forecast.ghi_w_m2.push(arrival.ghi);
    forecast.headwind_ms.push(headwind);
    if (km >= route.lengthKm) break;

    const hours = STEP_KM / speed;
    soc = charge(soc, (solarW(ghi) - drivingW(speed / 3.6, headwind)) * hours);
    t += hours * HOUR_MS;

    departAt = t;
    if (stopsAhead.length > 0 && km + STEP_KM >= stopsAhead[0]) {
      stopsAhead.shift();
      departAt += CONTROL_STOP_H * HOUR_MS;
    }
    if (localHour(departAt) >= DRIVE_UNTIL_H) {
      plan.days.push({ ...day, end_km: km + STEP_KM });
      day = { day: day.day + 1, start_km: km + STEP_KM };
      departAt = nextMorning(departAt);
    }
  }
  plan.days.push({ ...day, end_km: route.lengthKm });
  return { plan, forecast };
}

const charge = (soc: number, wh: number) => clamp(soc + wh / CAR.batteryWh, 0.02, 1);

const solarW = (ghi: number) => ghi * CAR.arrayM2 * CAR.arrayEff;

/** Battery power for driving, W: drag and rolling resistance through the drivetrain. */
function drivingW(v: number, headwind: number) {
  const air = v + headwind;
  const force = 0.5 * 1.18 * CAR.cdaM2 * air * Math.abs(air) + CAR.crr * CAR.massKg * 9.81;
  return (force * v) / CAR.drivetrainEff;
}

/** Energy the parked car's array collects between two times, Wh (nothing after dark). */
function parkedWh(lat: number, lon: number, from: number, to: number, km: number) {
  let wh = 0;
  for (let t = from; t < to; t += HOUR_MS / 6) wh += solarW(irradiance(lat, lon, t, km)) / 6;
  return wh;
}

/** Clear-sky irradiance from the sun's height, dimmed by made-up clouds that drift along km. */
function irradiance(lat: number, lon: number, t: number, km: number): number {
  const date = new Date(t);
  const dayOfYear = (t - Date.UTC(date.getUTCFullYear(), 0, 0)) / (24 * HOUR_MS);
  const rad = Math.PI / 180;
  const declination = -23.44 * rad * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const hourAngle = 15 * rad * (date.getUTCHours() + date.getUTCMinutes() / 60 + lon / 15 - 12);
  const sinHeight =
    Math.sin(lat * rad) * Math.sin(declination) + Math.cos(lat * rad) * Math.cos(declination) * Math.cos(hourAngle);
  if (sinHeight <= 0) return 0;
  const cloud = clamp(0.5 + 0.5 * Math.sin(km / 97) + 0.3 * Math.sin(km / 41 + 1), 0, 1);
  return 1050 * sinHeight ** 1.2 * (1 - 0.6 * clamp((cloud - 0.6) / 0.4, 0, 1));
}

const localHour = (t: number) => (t / HOUR_MS + UTC_OFFSET_H) % 24;

/** `t`, or the next start of driving hours if it's outside them. */
function drivingTime(t: number): number {
  const hour = localHour(t);
  if (hour >= DRIVE_FROM_H && hour < DRIVE_UNTIL_H) return t;
  return hour < DRIVE_FROM_H ? t + (DRIVE_FROM_H - hour) * HOUR_MS : nextMorning(t);
}

/** The race day of instant `t`: 1 on the start's local date. */
const raceDay = (t: number) => {
  const localDay = (u: number) => Math.floor((u / HOUR_MS + UTC_OFFSET_H) / 24);
  return localDay(t) - localDay(START_UTC) + 1;
};

function nextMorning(t: number): number {
  const localMidnightH = Math.floor((t / HOUR_MS + UTC_OFFSET_H) / 24) * 24;
  return (localMidnightH + 24 + DRIVE_FROM_H - UTC_OFFSET_H) * HOUR_MS;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
