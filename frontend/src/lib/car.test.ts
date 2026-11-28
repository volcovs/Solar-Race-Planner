import referenceYaml from "../../../configs/car.reference.yaml?raw";
import { beforeEach, describe, expect, it } from "vitest";
import { currentCar, REFERENCE_CAR, saveCar, validate } from "./car";

/** The flat key: value lines of configs/car.reference.yaml, nested one level by indentation. */
function readReferenceYaml(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section: Record<string, unknown> | undefined;
  for (const line of referenceYaml.split("\n")) {
    const match = line.replace(/#.*/, "").match(/^(\s*)(\w+):\s*(.*?)\s*$/);
    if (!match) continue;
    const [, indent, key, raw] = match;
    if (raw === "") out[key] = section = {};
    else (indent ? section! : out)[key] = Number.isNaN(Number(raw)) ? raw : Number(raw);
    if (!indent && raw !== "") section = undefined;
  }
  return out;
}

beforeEach(() => localStorage.clear());

describe("car profile", () => {
  it("has the same reference car as configs/car.reference.yaml", () => {
    expect(REFERENCE_CAR).toEqual(readReferenceYaml());
  });

  it("accepts the reference car and says what's wrong with a bad one", () => {
    expect(validate(REFERENCE_CAR)).toEqual({});
    const bad = { ...REFERENCE_CAR, name: " ", cda_m2: -0.2, array: { ...REFERENCE_CAR.array, efficiency: 23 } };
    expect(validate(bad)).toEqual({
      name: "Give the profile a name.",
      cda_m2: "From 0.03 up to 1 m².",
      "array.efficiency": "Above 0 up to 100 %.",
    });
    expect(validate({ ...REFERENCE_CAR, battery: { capacity_wh: 3000 } })).toMatchObject({ "battery.min_soc": "Missing." });
    expect(validate(null)).toMatchObject({ name: "Give the profile a name.", mass_kg: "Missing." });
  });

  it("keeps a saved car in this browser, and falls back to the reference car", () => {
    expect(currentCar()).toBe(REFERENCE_CAR);

    const mine = { ...REFERENCE_CAR, name: "ours", cda_m2: 0.1 };
    saveCar(mine);
    expect(currentCar()).toEqual(mine);

    localStorage.setItem("srp-car-profile", "{not json");
    expect(currentCar()).toBe(REFERENCE_CAR);

    saveCar(null);
    expect(currentCar()).toBe(REFERENCE_CAR);
  });
});
