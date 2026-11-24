// Made-up /plan and /forecast responses until the API serves them (BE-04), in the shapes of
// src/lib/plan.ts: a crude drive along the sample route with made-up clouds and wind.
// The car charges only from its own array, so at stops only while the sun is up.

import { pointAtKm } from "../lib/geo";
import type { ForecastResponse, PlanResponse } from "../lib/plan";
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

/** Drive the route in STEP_KM steps and record what a plan and a forecast would say. */
export function simulate(route: RouteData) {
  const plan: PlanResponse = {
    plan_id: "sample",
    created_at: new Date(START_UTC - 12 * HOUR_MS).toISOString(),
    timezone: TIMEZONE,
    min_soc: 0.1,
    stops: route.stops.map(({ kind, name, km }) => ({ kind, name, km })),
    days: [],
    km: [],
    time_utc: [],
    speed_kmh: [],
    soc: [],
    soc_p10: [],
    soc_p90: [],
  };
  const forecast: ForecastResponse = { model: "sample", issue_time_utc: plan.created_at, km: [], ghi_w_m2: [], headwind_ms: [] };

  const stopsAhead = route.stops.filter((s) => s.kind === "control_stop").map((s) => s.km);
  let t = START_UTC;
  let departAt = t; // later than `t` when the car stops at this km
  let soc = 1;
  let day = { day: 1, start_km: 0 };

  for (let km = 0; ; km = Math.min(km + STEP_KM, route.lengthKm)) {
    const [lon, lat] = pointAtKm(route.line, route.cumKm, km);
    const arrival = { t, soc, ghi: irradiance(lat, lon, t, km) };
    soc = charge(soc, parkedWh(lat, lon, t, departAt, km));
    t = departAt;

    const ghi = irradiance(lat, lon, t, km);
    const headwind = 3 * Math.sin(km / 180) + 2 * Math.sin(km / 53 + 2);
    // Slow down when the battery is under a straight line from full to 25% at the finish.
    const target = 1 - 0.75 * (km / route.lengthKm);
    const speed = clamp(80 + 300 * (soc - target), 40, 110);
    const spread = 0.02 + 0.1 * (km / route.lengthKm);

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

function nextMorning(t: number): number {
  const localMidnightH = Math.floor((t / HOUR_MS + UTC_OFFSET_H) / 24) * 24;
  return (localMidnightH + 24 + DRIVE_FROM_H - UTC_OFFSET_H) * HOUR_MS;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
