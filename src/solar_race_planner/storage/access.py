"""Data access functions for queries and mutations."""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from solar_race_planner.storage.models import (
    BacktestResult,
    Plan,
    PlanSegment,
    RouteSegment,
    TelemetryReading,
    WeatherForecast,
)


def insert_route_segments(session: Session, segments: list[dict]) -> int:
    """Bulk insert or replace route segments."""
    models = [RouteSegment(**s) for s in segments]
    session.add_all(models)
    session.commit()
    return len(models)


def get_route_segments(
    session: Session, start_km: float = 0.0, end_km: float | None = None
) -> Sequence[RouteSegment]:
    """Retrieve route segments ordered by km."""
    stmt = select(RouteSegment).where(RouteSegment.km >= start_km)
    if end_km is not None:
        stmt = stmt.where(RouteSegment.km <= end_km)
    stmt = stmt.order_by(RouteSegment.km.asc())
    return session.execute(stmt).scalars().all()


def insert_weather_forecasts(session: Session, forecasts: list[dict]) -> int:
    """Insert forecasts data points."""
    models = [WeatherForecast(**f) for f in forecasts]
    session.add_all(models)
    session.commit()
    return len(models)


def get_forecast_at_km(
    session: Session, km: float, target_time: datetime | None = None
) -> WeatherForecast | None:
    """Get the closest forecast point for a given km and time."""
    stmt = select(WeatherForecast).where(WeatherForecast.km >= km - 1.0, WeatherForecast.km <= km + 1.0)
    if target_time:
        stmt = stmt.order_by(WeatherForecast.valid_time.desc())
    return session.execute(stmt).scalars().first()


def save_plan(session: Session, plan_data: dict, segments_data: list[dict]) -> Plan:
    """Save a generated plan and its segments."""
    plan = Plan(**plan_data)
    session.add(plan)
    session.flush()

    for seg in segments_data:
        seg_model = PlanSegment(plan_id=plan.id, **seg)
        session.add(seg_model)

    session.commit()
    session.refresh(plan)
    return plan


def get_plan(session: Session, plan_id: str) -> Plan | None:
    """Retrieve a plan by its UUID."""
    stmt = select(Plan).where(Plan.id == plan_id)
    return session.execute(stmt).scalars().first()


def get_latest_plan(session: Session) -> Plan | None:
    """Retrieve the most recently calculated plan."""
    stmt = select(Plan).order_by(desc(Plan.created_at))
    return session.execute(stmt).scalars().first()


def save_backtest_result(session: Session, backtest_data: dict) -> BacktestResult:
    """Save a backtest simulation result."""
    result = BacktestResult(**backtest_data)
    session.add(result)
    session.commit()
    session.refresh(result)
    return result


def save_telemetry_reading(session: Session, reading_data: dict) -> TelemetryReading:
    """Save an incoming telemetry reading."""
    reading = TelemetryReading(**reading_data)
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return reading
