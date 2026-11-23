"""SQLAlchemy ORM models for the storage layer."""

import uuid
from datetime import UTC, datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from solar_race_planner.storage.db import Base


class RouteSegment(Base):
    """A 100 m segment along the Darwin -> Adelaide route corridor."""

    __tablename__ = "route_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    segment_index: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    km: Mapped[float] = mapped_column(Float, index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    elevation_m: Mapped[float] = mapped_column(Float, default=0.0)
    slope_pct: Mapped[float] = mapped_column(Float, default=0.0)
    heading_deg: Mapped[float] = mapped_column(Float, default=0.0)
    speed_limit_kmh: Mapped[float] = mapped_column(Float, default=110.0)
    roughness_z0: Mapped[float] = mapped_column(Float, default=0.03)
    is_control_stop: Mapped[bool] = mapped_column(Boolean, default=False)
    control_stop_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)


class WeatherForecast(Base):
    """Weather forecast sampled along the route at a specific time."""

    __tablename__ = "weather_forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    valid_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    km: Mapped[float] = mapped_column(Float, index=True)

    ghi_w_m2: Mapped[float] = mapped_column(Float, default=0.0)
    dni_w_m2: Mapped[float] = mapped_column(Float, default=0.0)
    dhi_w_m2: Mapped[float] = mapped_column(Float, default=0.0)

    wind_speed_ms: Mapped[float] = mapped_column(Float, default=0.0)
    wind_dir_deg: Mapped[float] = mapped_column(Float, default=0.0)
    temp_c: Mapped[float] = mapped_column(Float, default=25.0)

    ghi_p10: Mapped[float] = mapped_column(Float, default=0.0)
    ghi_p50: Mapped[float] = mapped_column(Float, default=0.0)
    ghi_p90: Mapped[float] = mapped_column(Float, default=0.0)

    source: Mapped[str] = mapped_column(String(50), default="open-meteo")


class Plan(Base):
    """A generated race speed & energy plan."""

    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    car_profile_hash: Mapped[str] = mapped_column(String(64), index=True)
    start_km: Mapped[float] = mapped_column(Float, default=0.0)
    start_time: Mapped[datetime] = mapped_column(DateTime)
    start_soc: Mapped[float] = mapped_column(Float, default=1.0)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    safe_under_p10: Mapped[bool] = mapped_column(Boolean, default=True)
    total_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    finish_eta: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    provenance: Mapped[dict] = mapped_column(JSON, default=dict)

    segments: Mapped[list["PlanSegment"]] = relationship(
        "PlanSegment", back_populates="plan", cascade="all, delete-orphan"
    )


class PlanSegment(Base):
    """Detailed target speed and battery state for each segment of a plan."""

    __tablename__ = "plan_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    segment_index: Mapped[int] = mapped_column(Integer)
    km: Mapped[float] = mapped_column(Float)
    target_speed_kmh: Mapped[float] = mapped_column(Float)
    arrival_time: Mapped[datetime] = mapped_column(DateTime)

    soc_p50: Mapped[float] = mapped_column(Float)
    soc_p10: Mapped[float] = mapped_column(Float)
    soc_p90: Mapped[float] = mapped_column(Float)

    solar_power_w: Mapped[float] = mapped_column(Float, default=0.0)
    motor_power_w: Mapped[float] = mapped_column(Float, default=0.0)

    plan: Mapped["Plan"] = relationship("Plan", back_populates="segments")


class BacktestResult(Base):
    """Results from back-testing the strategy against historical races."""

    __tablename__ = "backtest_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    race_year: Mapped[int] = mapped_column(Integer, default=2023)
    car_profile_hash: Mapped[str] = mapped_column(String(64))
    simulated_finish_hours: Mapped[float] = mapped_column(Float)
    actual_finish_hours: Mapped[float] = mapped_column(Float)
    delta_hours: Mapped[float] = mapped_column(Float)

    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)


class TelemetryReading(Base):
    """Live telemetry transmitted from the solar car."""

    __tablename__ = "telemetry_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    km: Mapped[float] = mapped_column(Float, index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    speed_kmh: Mapped[float] = mapped_column(Float)
    battery_soc: Mapped[float] = mapped_column(Float)
    array_power_w: Mapped[float] = mapped_column(Float)
    motor_power_w: Mapped[float] = mapped_column(Float)
