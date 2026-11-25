"""Demo: energy over 5 made-up segments at constant speeds (default 80 and 100 km/h).

No data and no network. Run from the repo root:

    python -m solar_race_planner.model.demo_segments            # 80 and 100 km/h
    python -m solar_race_planner.model.demo_segments 60 90 110  # any constant speeds, km/h
    python -m solar_race_planner.model.demo_segments --ramp     # constant vs increasing speed
"""

import sys
from dataclasses import dataclass

from solar_race_planner.model.car import CarConfig
from solar_race_planner.model.model import (
    RHO,
    AeroResistance,
    RollingForce,
    battery_energy_wh,
    segment_time_s,
    solar_energy_wh,
    wheel_power_w,
)

GHI = 800.0  # W/m^2, the same on every segment
TEMP_C = 25.0


@dataclass(frozen=True)
class Segment:  # a C struct
    length_m: float
    grade: float  # rise / run, + uphill
    headwind_ms: float  # + headwind, - tailwind


SEGMENTS = [
    Segment(2000, 0.000, 0.0),  # flat, calm
    Segment(3000, 0.010, 2.0),  # gentle climb, headwind
    Segment(1500, -0.008, -1.0),  # descent, tailwind
    Segment(2500, 0.020, 3.0),  # steeper climb, headwind
    Segment(1000, -0.012, 0.0),  # descent, calm
]

RAMP_KMH = [65, 80, 95, 105, 110]  # increasing speed, one value per segment


def equal_time_speed(segments: list[Segment], speeds_ms: list[float]) -> float:
    """Constant speed that covers the same distance in the same total time as `speeds_ms`."""
    total_m = 0.0
    total_s = 0.0
    for i in range(len(segments)):
        total_m += segments[i].length_m
        total_s += segment_time_s(segments[i].length_m, speeds_ms[i])
    return total_m / total_s


def run(car: CarConfig, title: str, speeds_ms: list[float]) -> tuple[float, float, float]:
    """Print one table (a speed per segment) and return the totals: time s, used Wh, solar Wh."""
    print(f"\n{title}")
    print("seg  len m  grade  wind  v km/h    t s  used Wh  solar Wh")

    length_tot = 0.0
    t_tot = 0.0
    used_tot = 0.0
    solar_tot = 0.0
    for i in range(len(SEGMENTS)):
        s = SEGMENTS[i]
        v = speeds_ms[i]
        t = segment_time_s(s.length_m, v)
        used = battery_energy_wh(car, s.length_m, v, s.headwind_ms, s.grade)
        solar = solar_energy_wh(car, GHI, t, TEMP_C)
        length_tot += s.length_m
        t_tot += t
        used_tot += used
        solar_tot += solar
        print(
            f"{i + 1:>3} {s.length_m:>6.0f} {s.grade:>6.3f} {s.headwind_ms:>5.1f} "
            f"{v * 3.6:>7.1f} {t:>6.0f} {used:>8.1f} {solar:>9.1f}"
        )

    blank = " " * 20
    print(f"sum {length_tot:>6.0f} {blank} {t_tot:>6.0f} {used_tot:>8.1f} {solar_tot:>9.1f}")
    print(f"    net battery change: {used_tot - solar_tot:+.1f} Wh  (+ = drains)")
    return t_tot, used_tot, solar_tot


def cube_table(car: CarConfig) -> None:
    """Flat road, no wind: show aero power ~ v^3 and aero energy per km ~ v^2."""
    print("\nFlat road, no wind: what each speed costs")
    print(" v km/h  P aero W  P roll W  P wheel W  Wh/km (wheel)")
    for v_kmh in (36, 72, 108):
        v = v_kmh / 3.6
        p_aero = AeroResistance(v, 0.0, RHO, car.cda_m2) * v
        p_roll = RollingForce(car.mass_kg, car.crr) * v
        p_wheel = wheel_power_w(car, v, 0.0, 0.0)
        wh_per_km = p_wheel * (1000 / v) / 3600
        print(f"{v_kmh:>7} {p_aero:>9.0f} {p_roll:>9.0f} {p_wheel:>10.0f} {wh_per_km:>14.1f}")


def print_car(car: CarConfig) -> None:
    print(
        f"Car: {car.name}, {car.mass_kg:.0f} kg, CdA {car.cda_m2}, Crr {car.crr}; irradiance {GHI:.0f} W/m^2"
    )


def compare_speeds(car: CarConfig, speeds_kmh: list[float]) -> None:
    """Run all segments at each constant speed, then compare the totals."""
    print_car(car)

    n = len(speeds_kmh)
    times = []
    useds = []
    solars = []
    for k in range(n):
        v_ms = speeds_kmh[k] / 3.6
        t, used, solar = run(car, f"Constant {speeds_kmh[k]:g} km/h", [v_ms] * len(SEGMENTS))
        times.append(t)
        useds.append(used)
        solars.append(solar)

    total_km = 0.0
    for s in SEGMENTS:
        total_km += s.length_m / 1000

    print(f"\nSummary over {total_km:.0f} km")
    print("  km/h  time min  used Wh  solar Wh   net Wh  used Wh/km")
    for k in range(n):
        print(
            f"{speeds_kmh[k]:>6g} {times[k] / 60:>9.1f} {useds[k]:>8.1f} {solars[k]:>9.1f} "
            f"{useds[k] - solars[k]:>8.1f} {useds[k] / total_km:>11.1f}"
        )

    if n >= 2:
        slow = 0
        fast = n - 1
        net_ratio = (useds[fast] - solars[fast]) / (useds[slow] - solars[slow])
        print(
            f"\n{speeds_kmh[fast]:g} vs {speeds_kmh[slow]:g} km/h: "
            f"time {(times[fast] / times[slow] - 1) * 100:+.1f}%, "
            f"energy used {(useds[fast] / useds[slow] - 1) * 100:+.1f}%, "
            f"solar {(solars[fast] / solars[slow] - 1) * 100:+.1f}%, net drain x{net_ratio:.2f}"
        )


def compare_ramp(car: CarConfig) -> None:
    """Same total time, constant speed vs increasing speed."""
    ramp_ms = []
    for v_kmh in RAMP_KMH:
        ramp_ms.append(v_kmh / 3.6)
    v_const = equal_time_speed(SEGMENTS, ramp_ms)

    print_car(car)
    t_c, used_c, solar_c = run(
        car, f"A) constant {v_const * 3.6:.1f} km/h (same total time as B)", [v_const] * 5
    )
    t_r, used_r, solar_r = run(car, f"B) increasing speed {RAMP_KMH[0]} -> {RAMP_KMH[-1]} km/h", ramp_ms)

    print(f"\nSame time ({t_c:.0f} s vs {t_r:.0f} s), so the same solar ({solar_c:.1f} vs {solar_r:.1f} Wh).")
    print(f"Increasing speed uses {used_r - used_c:+.1f} Wh more ({(used_r / used_c - 1) * 100:+.1f}%).")

    cube_table(car)


def main() -> None:
    car = CarConfig.from_yaml()
    args = sys.argv[1:]

    if "--ramp" in args:
        compare_ramp(car)
        return

    speeds = [80.0, 100.0]
    if len(args) > 0:
        speeds = []
        for arg in args:
            speeds.append(float(arg))

    for v in speeds:
        if v <= 0 or v > car.max_speed_kmh:
            sys.exit(f"speed {v:g} km/h is outside 0 .. {car.max_speed_kmh:g} km/h (the car's maximum)")

    compare_speeds(car, speeds)


if __name__ == "__main__":
    main()
