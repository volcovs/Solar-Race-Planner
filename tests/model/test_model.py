from pathlib import Path

import pytest

from solar_race_planner.model.car import CarConfig
from solar_race_planner.model.demo_segments import SEGMENTS, equal_time_speed
from solar_race_planner.model.model import (
    RHO,
    AeroResistance,
    RollingForce,
    battery_energy_wh,
    segment_net_energy_wh,
    segment_time_s,
    solar_energy_wh,
    wheel_power_w,
)

CAR_FILE = Path(__file__).parents[2] / "configs" / "car.reference.yaml"


@pytest.fixture(scope="module")
def car() -> CarConfig:
    return CarConfig.from_yaml(CAR_FILE)


def test_car_profile_loads(car):
    assert car.mass_kg > 0
    assert car.array.area_m2 > 0
    assert 0 < car.battery.min_soc < 1


def test_aero_power_grows_with_the_cube_of_speed(car):
    p_10 = AeroResistance(10.0, 0.0, RHO, car.cda_m2) * 10.0
    p_20 = AeroResistance(20.0, 0.0, RHO, car.cda_m2) * 20.0
    assert p_20 / p_10 == pytest.approx(8.0)


def test_tailwind_helps_and_headwind_hurts(car):
    calm = wheel_power_w(car, 25.0, 0.0, 0.0)
    assert wheel_power_w(car, 25.0, 5.0, 0.0) > calm
    assert wheel_power_w(car, 25.0, -5.0, 0.0) < calm


def test_flat_energy_is_force_times_distance(car):
    v, length = 25.0, 1000.0
    force = AeroResistance(v, 0.0, RHO, car.cda_m2) + RollingForce(car.mass_kg, car.crr)
    expected_wh = force * length / (car.drivetrain_eff * car.battery.discharge_eff) / 3600.0
    assert battery_energy_wh(car, length, v, 0.0, 0.0) == pytest.approx(expected_wh)


def test_steep_descent_puts_energy_back(car):
    assert battery_energy_wh(car, 1000.0, 15.0, 0.0, -0.05) < 0


def test_solar_energy_is_power_times_time(car):
    power_w = 800.0 * car.array.area_m2 * car.array.efficiency
    assert solar_energy_wh(car, 800.0, 3600.0) == pytest.approx(power_w)


def test_net_energy_is_used_minus_solar(car):
    used = battery_energy_wh(car, 2000.0, 25.0, 0.0, 0.01)
    solar = solar_energy_wh(car, 800.0, segment_time_s(2000.0, 25.0))
    assert segment_net_energy_wh(car, 2000.0, 25.0, 0.0, 0.01, 800.0) == pytest.approx(used - solar)


def test_same_time_constant_speed_beats_increasing_speed(car):
    ramp = [v / 3.6 for v in (65, 80, 95, 105, 110)]
    v_const = equal_time_speed(SEGMENTS, ramp)

    time_const = sum(segment_time_s(s.length_m, v_const) for s in SEGMENTS)
    time_ramp = sum(segment_time_s(s.length_m, v) for s, v in zip(SEGMENTS, ramp, strict=True))
    assert time_const == pytest.approx(time_ramp)

    used_const = sum(battery_energy_wh(car, s.length_m, v_const, s.headwind_ms, s.grade) for s in SEGMENTS)
    used_ramp = sum(
        battery_energy_wh(car, s.length_m, v, s.headwind_ms, s.grade)
        for s, v in zip(SEGMENTS, ramp, strict=True)
    )
    assert used_ramp > used_const
