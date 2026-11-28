// The car profile (MOD-01), in the same shape as configs/car.reference.yaml. It lives in this
// browser only and goes to the planner with each plan request; the server never stores it.

import { useSyncExternalStore } from "react";

export interface CarProfile {
  name: string;
  mass_kg: number;
  cda_m2: number;
  crr: number;
  drivetrain_eff: number;
  max_speed_kmh: number;
  array: { area_m2: number; efficiency: number; temp_coeff_per_c: number };
  battery: { capacity_wh: number; min_soc: number; charge_eff: number; discharge_eff: number };
}

/** configs/car.reference.yaml (car.test.ts keeps the two in step). */
export const REFERENCE_CAR: CarProfile = {
  name: "reference-car",
  mass_kg: 260,
  cda_m2: 0.1,
  crr: 0.006,
  drivetrain_eff: 0.95,
  max_speed_kmh: 110,
  array: { area_m2: 4, efficiency: 0.24, temp_coeff_per_c: -0.0029 },
  battery: { capacity_wh: 3060, min_soc: 0.1, charge_eff: 0.97, discharge_eff: 0.97 },
};

/** A number in the profile: where it lives, how it's shown, and the range it must be in. */
export interface Field {
  path: [string] | ["array" | "battery", string];
  label: string;
  unit: string;
  scale: number; // shown = stored × scale (fractions as %)
  min: number; // in shown units, inclusive unless `minExclusive`
  max: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
  step: number;
  help: string;
}

export const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Car",
    fields: [
      { path: ["mass_kg"], label: "Mass", unit: "kg", scale: 1, min: 50, max: 1000, step: 1, help: "With the driver and ballast." },
      { path: ["cda_m2"], label: "Drag area (CdA)", unit: "m²", scale: 1, min: 0.03, max: 1, step: 0.005, help: "Drag coefficient × frontal area; from a coast-down test or CFD." },
      { path: ["crr"], label: "Rolling resistance (Crr)", unit: "", scale: 1, min: 0.001, max: 0.05, step: 0.0005, help: "Tyres on asphalt; solar-car tyres are about 0.005–0.010." },
      { path: ["drivetrain_eff"], label: "Drivetrain efficiency", unit: "%", scale: 100, min: 0, max: 100, minExclusive: true, step: 0.5, help: "Battery to wheel: motor, controller and transmission." },
      { path: ["max_speed_kmh"], label: "Top speed", unit: "km/h", scale: 1, min: 20, max: 200, step: 1, help: "The fastest the plan may ask for (the race's limit, if lower)." },
    ],
  },
  {
    title: "Solar array",
    fields: [
      { path: ["array", "area_m2"], label: "Area", unit: "m²", scale: 1, min: 0.5, max: 10, step: 0.05, help: "Cell area, not the whole top surface." },
      { path: ["array", "efficiency"], label: "Efficiency", unit: "%", scale: 100, min: 0, max: 100, minExclusive: true, step: 0.1, help: "Cells and encapsulation at 25 °C; silicon is about 22–25%." },
      { path: ["array", "temp_coeff_per_c"], label: "Temperature coefficient", unit: "%/°C", scale: 100, min: -1, max: 0, step: 0.01, help: "Power lost per °C above 25 °C; about −0.3 for silicon." },
    ],
  },
  {
    title: "Battery",
    fields: [
      { path: ["battery", "capacity_wh"], label: "Capacity", unit: "Wh", scale: 1, min: 100, max: 20000, step: 10, help: "Usable energy when full; check your class's limit." },
      { path: ["battery", "min_soc"], label: "Minimum charge", unit: "%", scale: 100, min: 0, max: 100, maxExclusive: true, step: 1, help: "The plan never goes below this; a safety margin." },
      { path: ["battery", "charge_eff"], label: "Charge efficiency", unit: "%", scale: 100, min: 0, max: 100, minExclusive: true, step: 0.5, help: "Energy kept when charging (from the array or regen)." },
      { path: ["battery", "discharge_eff"], label: "Discharge efficiency", unit: "%", scale: 100, min: 0, max: 100, minExclusive: true, step: 0.5, help: "Energy delivered when driving." },
    ],
  },
];

export const FIELDS = GROUPS.flatMap((g) => g.fields);
export const fieldKey = (f: Field) => f.path.join(".");

export function getValue(profile: CarProfile, f: Field): number {
  const [a, b] = f.path;
  return b ? (profile[a as "array" | "battery"] as Record<string, number>)[b] : (profile as unknown as Record<string, number>)[a];
}

/** Why a shown value is out of range, or undefined when it's fine. */
export function fieldError(f: Field, shown: number): string | undefined {
  if (!Number.isFinite(shown)) return "Enter a number.";
  const below = f.minExclusive ? shown <= f.min : shown < f.min;
  const above = f.maxExclusive ? shown >= f.max : shown > f.max;
  if (below || above) {
    const from = `${f.minExclusive ? "above" : "from"} ${f.min}`;
    const to = `${f.maxExclusive ? "below" : "up to"} ${f.max}`;
    return `${from[0].toUpperCase()}${from.slice(1)} ${to}${f.unit ? ` ${f.unit}` : ""}.`;
  }
  return undefined;
}

/** Problems with a whole profile (e.g. one loaded from a file), keyed by field; empty when valid. */
export function validate(profile: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  const p = profile as Partial<CarProfile> | null;
  if (typeof p?.name !== "string" || p.name.trim() === "") errors.name = "Give the profile a name.";
  for (const f of FIELDS) {
    const value = p && typeof p === "object" ? getValue(p as CarProfile, f) : undefined;
    const error = typeof value === "number" ? fieldError(f, value * f.scale) : "Missing.";
    if (error) errors[fieldKey(f)] = error;
  }
  return errors;
}

// Saved in this browser only.
const STORAGE_KEY = "srp-car-profile";
const CHANGED = "srp-car-profile-changed";

let cache: { raw: string | null; profile: CarProfile } = { raw: null, profile: REFERENCE_CAR };

/** The saved profile, or the reference car if none is saved (or it no longer validates). */
export function currentCar(): CarProfile {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the reference car.
  }
  if (raw !== cache.raw) {
    let profile = REFERENCE_CAR;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Object.keys(validate(parsed)).length === 0) profile = parsed;
    } catch {
      // Unreadable: the reference car.
    }
    cache = { raw, profile };
  }
  return cache.profile;
}

/** Save (or, with no profile, forget) this browser's car. */
export function saveCar(profile: CarProfile | null): void {
  try {
    if (profile) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the change lasts until the page closes.
    cache = { raw: profile && JSON.stringify(profile), profile: profile ?? REFERENCE_CAR };
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // saved in another tab
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The current car; re-renders when it's saved or reset, here or in another tab. */
export function useCar(): CarProfile {
  return useSyncExternalStore(subscribe, currentCar);
}
