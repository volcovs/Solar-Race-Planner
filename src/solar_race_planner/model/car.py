from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict

CAR_CONFIG = Path("configs/car.reference.yaml")


class _Config(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class SolarArray(_Config):
    area_m2: float
    efficiency: float
    temp_coeff_per_c: float


class Battery(_Config):
    capacity_wh: float
    min_soc: float
    charge_eff: float
    discharge_eff: float


class CarConfig(_Config):
    name: str
    mass_kg: float
    cda_m2: float
    crr: float
    drivetrain_eff: float
    max_speed_kmh: float
    array: SolarArray
    battery: Battery

    @classmethod
    def from_yaml(cls, path: Path = CAR_CONFIG) -> "CarConfig":
        return cls.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
