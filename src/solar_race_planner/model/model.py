import math

from solar_race_planner.model.car import CarConfig

# Calcultate the Energy
# Calculate each
# Given a car profile, the route and a forecast, compute energy per segment and
# the speed plan that finishes fastest
# without running the battery below a safety floor.

G = 9.81
RHO = 1.18  # air density, kg/m^3 (sea level, ~25 C); later: from temperature and altitude


def AeroResistance(v_Car: float, wind: float, Rho: float, CdA: float) -> float:
    # v air can be > 0 -> breaking slow
    # v air < 0 -> propulsion
    v_air = v_Car + wind
    F_d = 0.5 * Rho * CdA * v_air * (abs(v_air))

    return F_d


def RollingForce(mass_kg: float, crr: float, grade: float = 0.0) -> float:
    return crr * mass_kg * G * math.cos(math.atan(grade))


def SlopeForce(mass_kg: float, grade: float) -> float:
    return mass_kg * G * math.sin(math.atan(grade))


def total_resistance(
    car: CarConfig, v_ms: float, headwind_ms: float, grade: float, rho: float = RHO
) -> float:
    # Forta de rezistenta e asta gen
    # Negativa inseaman ca impinge masina
    # Poz incetineste
    return (
        AeroResistance(v_ms, headwind_ms, rho, car.cda_m2)
        + RollingForce(car.mass_kg, car.crr, grade)
        + SlopeForce(car.mass_kg, grade)
    )


def wheel_power_w(car: CarConfig, v_ms: float, headwind_ms: float, grade: float, rho: float = RHO) -> float:
    # Forta se amplifica cu viteza
    return total_resistance(car, v_ms, headwind_ms, grade, rho) * v_ms


def segment_time_s(length_m: float, v_ms: float) -> float:
    return length_m / v_ms


def battery_energy_wh(
    car: CarConfig, length_m: float, v_ms: float, headwind_ms: float, grade: float, rho: float = RHO
) -> float:

    e_wheel_j = total_resistance(car, v_ms, headwind_ms, grade, rho) * length_m
    if e_wheel_j >= 0:
        e_battery_j = e_wheel_j / (car.drivetrain_eff * car.battery.discharge_eff)
    else:
        e_battery_j = e_wheel_j * car.drivetrain_eff * car.battery.charge_eff
    return e_battery_j / 3600.0


def solar_energy_wh(car: CarConfig, ghi_w_m2: float, time_s: float, temp_c: float = 25.0) -> float:
    """Energy from the array over `time_s`, in Wh. P = irradiance * area * efficiency * temperature factor.

    Flat panels, irradiance used as-is (no sun angle yet); the temperature factor is relative to 25 C.
    """
    temp_factor = 1.0 + car.array.temp_coeff_per_c * (temp_c - 25.0)
    power_w = ghi_w_m2 * car.array.area_m2 * car.array.efficiency * temp_factor
    return power_w * time_s / 3600.0


def segment_net_energy_wh(
    car: CarConfig,
    length_m: float,
    v_ms: float,
    headwind_ms: float,
    grade: float,
    ghi_w_m2: float,
    temp_c: float = 25.0,
    rho: float = RHO,
) -> float:
    """Battery change over one segment, in Wh: energy used minus solar gained. Positive = battery drains."""
    used = battery_energy_wh(car, length_m, v_ms, headwind_ms, grade, rho)
    gained = solar_energy_wh(car, ghi_w_m2, segment_time_s(length_m, v_ms), temp_c)
    return used - gained
