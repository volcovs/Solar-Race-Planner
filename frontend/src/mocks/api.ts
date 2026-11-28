// Made-up /plan, /forecast, /replan and /scenarios responses until the API serves them (BE-04, BE-05), in
// the shapes of src/lib/plan.ts: a crude drive along the sample route with made-up clouds and wind.
// The car is the profile from the Car page; it charges only from its own array, so at stops
// only while the sun is up.

import { currentCar, REFERENCE_CAR, type CarProfile } from "../lib/car";
import { pointAtKm } from "../lib/geo";
import { averageSpeed, type ForecastResponse, type PlanResponse, type ReplanRequest, type Scenario } from "../lib/plan";
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

/** The plan for the car saved in this browser (the mock runs here, so it can read it). */
export function mockResponse(path: "/plan" | "/forecast"): Promise<PlanResponse | ForecastResponse> {
  const car = currentCar();
  if (cached?.car !== car) cached = { car, race: loadRoute(ROUTE_URL).then((route) => planRace(route, RACE_START, { ...AS_FORECAST, car })) };
  return cached.race.then((race) => (path === "/plan" ? race.plan : race.forecast));
}
let cached: { car: CarProfile; race: Promise<{ plan: PlanResponse; forecast: ForecastResponse }> } | undefined;

/** The same drive from where the car is now. /plan stays the original, so there's something to compare with. */
export function mockReplan(request: ReplanRequest, car: CarProfile): Promise<PlanResponse> {
  return loadRoute(ROUTE_URL).then((route) => planRace(route, request, { ...AS_FORECAST, car }).plan);
}

/** One plan per scenario, after a pause that stands in for the optimiser, so Cancel can be tried. */
export async function mockScenarios(scenarios: Scenario[], car: CarProfile, signal?: AbortSignal): Promise<{ plans: PlanResponse[] }> {
  signal?.throwIfAborted(); // cancelled before we got here: a listener added now would never fire
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 1200);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
  const route = await loadRoute(ROUTE_URL, signal);
  return {
    plans: scenarios.map((s) => {
      const from = { ...RACE_START, soc: s.start_soc };
      const conditions: Conditions = {
        car,
        cdaFactor: s.cda_factor,
        cloudShiftH: s.weather_shift_h,
        ...{ p10: { sun: 0.85, windMs: 1.5 }, p50: { sun: 1, windMs: 0 }, p90: { sun: 1.1, windMs: -1.5 } }[s.weather],
      };
      const planned = planRace(route, from, conditions).plan;
      return s.strategy === "planned" ? planned : simulate(route, from, { ...conditions, constantKmh: averageSpeed(planned) }).plan;
    }),
  };
}

const RACE_START: ReplanRequest = { km: 0, time_utc: new Date(START_UTC).toISOString(), soc: 1 };

/** What a scenario changes; the defaults are the forecast and the car as they are. */
interface Conditions {
  car: CarProfile;
  cdaFactor: number;
  cloudShiftH: number; // clouds this many hours later (+) or earlier (-)
  sun: number; // irradiance factor
  windMs: number; // added headwind
  cruiseKmh?: number; // the planner's base speed (planRace finds it)
  constantKmh?: number; // or hold this speed all race, whatever the wind and battery
}
const AS_FORECAST: Conditions = { car: REFERENCE_CAR, cdaFactor: 1, cloudShiftH: 0, sun: 1, windMs: 0 };
const FINISH_SOC = 0.2;

/**
 * A crude stand-in for the optimiser: the cruise speed that reaches the finish with about
 * FINISH_SOC left (by bisection), eased into headwinds and near the battery floor.
 */
export function planRace(route: RouteData, from: ReplanRequest = RACE_START, conditions = AS_FORECAST) {
  let [slow, fast] = [20, conditions.car.max_speed_kmh];
  for (let i = 0; i < 12; i++) {
    const cruiseKmh = (slow + fast) / 2;
    const end = simulate(route, from, { ...conditions, cruiseKmh }).plan.soc.at(-1)!;
    if (end > FINISH_SOC) slow = cruiseKmh;
    else fast = cruiseKmh;
  }
  return simulate(route, from, { ...conditions, cruiseKmh: slow });
}

/** Drive the route in STEP_KM steps from `from` and record what a plan and a forecast would say. */
export function simulate(route: RouteData, from: ReplanRequest = RACE_START, conditions = AS_FORECAST) {
  const { car } = conditions;
  const solarW = (ghi: number) => ghi * car.array.area_m2 * car.array.efficiency;
  // Battery in and out, Wh: losses on the way in (charging) and on the way out (to the wheels).
  const charge = (soc: number, wh: number) =>
    clamp(soc + (wh > 0 ? wh * car.battery.charge_eff : wh / car.battery.discharge_eff) / car.battery.capacity_wh, 0.02, 1);
  const drivingW = (v: number, headwind: number) => {
    const air = v + headwind;
    const force = 0.5 * 1.18 * car.cda_m2 * conditions.cdaFactor * air * Math.abs(air) + car.crr * car.mass_kg * 9.81;
    return (force * v) / car.drivetrain_eff;
  };
  const irradiance = (lat: number, lon: number, t: number, km: number) =>
    Math.min(1100, conditions.sun * clearSky(lat, lon, t) * cloudDimming(km - 80 * conditions.cloudShiftH)); // ~80 km of driving per hour
  const startT = Date.parse(from.time_utc);
  const plan: PlanResponse = {
    plan_id: "sample",
    created_at: new Date(from === RACE_START ? START_UTC - 12 * HOUR_MS : startT).toISOString(),
    timezone: TIMEZONE,
    min_soc: car.battery.min_soc,
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
    for (let p = t; p < departAt; p += HOUR_MS / 6) soc = charge(soc, solarW(irradiance(lat, lon, p, km)) / 6); // parked: array only
    t = departAt;

    const ghi = irradiance(lat, lon, t, km);
    const headwind = 3 * Math.sin(km / 180) + 2 * Math.sin(km / 53 + 2) + conditions.windMs;
    // Ease off into a headwind (and push with a tailwind): it costs less than fighting it at one speed.
    // Near the battery floor, slow down more the closer it gets (to 40% of cruise at the floor).
    const reserve = clamp((soc - car.battery.min_soc) / 0.1, 0, 1);
    const planned = (conditions.cruiseKmh ?? 70) * (1 - 0.03 * headwind) * (0.4 + 0.6 * reserve);
    const speed = conditions.constantKmh ?? clamp(planned, 15, car.max_speed_kmh);
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

/** Clear-sky irradiance from the sun's height (none after dark). */
function clearSky(lat: number, lon: number, t: number): number {
  const date = new Date(t);
  const dayOfYear = (t - Date.UTC(date.getUTCFullYear(), 0, 0)) / (24 * HOUR_MS);
  const rad = Math.PI / 180;
  const declination = -23.44 * rad * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const hourAngle = 15 * rad * (date.getUTCHours() + date.getUTCMinutes() / 60 + lon / 15 - 12);
  const sinHeight =
    Math.sin(lat * rad) * Math.sin(declination) + Math.cos(lat * rad) * Math.cos(declination) * Math.cos(hourAngle);
  return sinHeight <= 0 ? 0 : 1050 * sinHeight ** 1.2;
}

/** Made-up clouds laid along km: the share of sunlight that gets through. */
function cloudDimming(km: number): number {
  const cloud = clamp(0.5 + 0.5 * Math.sin(km / 97) + 0.3 * Math.sin(km / 41 + 1), 0, 1);
  return 1 - 0.6 * clamp((cloud - 0.6) / 0.4, 0, 1);
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
