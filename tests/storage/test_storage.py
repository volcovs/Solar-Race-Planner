"""Tests for the storage layer. Runs offline with an in-memory SQLite database."""

import sqlite3
from datetime import datetime
from pathlib import Path

import geoalchemy2.admin.dialects.sqlite as sqlite_admin
import pytest
from geoalchemy2 import Geometry
from sqlalchemy import create_engine, event
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from solar_race_planner.storage.access import (
    get_forecast_at_km,
    get_latest_plan,
    get_plan,
    get_route_segments,
    insert_route_segments,
    insert_weather_forecasts,
    save_backtest_result,
    save_plan,
    save_telemetry_reading,
)
from solar_race_planner.storage.db import Base, get_database_url
from solar_race_planner.storage.parquet_io import (
    export_route_to_parquet,
    import_route_from_parquet,
)

# Disable SpatiaLite DDL hooks in SQLite for offline tests
sqlite_admin.after_create = lambda *args, **kwargs: None
sqlite_admin.before_create = lambda *args, **kwargs: None


@compiles(Geometry, "sqlite")
def compile_geom_sqlite(type_, compiler, **kw):
    return "BLOB"


def create_test_engine():
    """Create an in-memory SQLite engine with mock PostGIS functions."""
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def on_connect(dbapi_connection, connection_record):
        if isinstance(dbapi_connection, sqlite3.Connection):
            dbapi_connection.create_function("GeomFromEWKT", 1, lambda x: x)
            dbapi_connection.create_function("GeomFromWKB", 1, lambda x: x)
            dbapi_connection.create_function("AsEWKB", 1, lambda x: x)
            dbapi_connection.create_function("AsBinary", 1, lambda x: x)

    return engine


@pytest.fixture
def db_session():
    """Create an isolated in-memory database for testing."""
    engine = create_test_engine()
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    yield session
    session.close()


def test_insert_and_get_route_segments(db_session):
    segments = [
        {"segment_index": 0, "km": 0.0, "latitude": -12.46, "longitude": 130.84, "elevation_m": 25.0},
        {"segment_index": 1, "km": 0.1, "latitude": -12.47, "longitude": 130.84, "elevation_m": 26.0},
        {"segment_index": 2, "km": 0.2, "latitude": -12.48, "longitude": 130.84, "elevation_m": 27.0},
    ]
    inserted = insert_route_segments(db_session, segments)
    assert inserted == 3

    # Query all
    all_segs = get_route_segments(db_session)
    assert len(all_segs) == 3

    # Query slice
    sliced = get_route_segments(db_session, start_km=0.1, end_km=0.15)
    assert len(sliced) == 1
    assert sliced[0].segment_index == 1


def test_save_and_retrieve_plan(db_session):
    plan_data = {
        "id": "test-plan-123",
        "car_profile_hash": "hash-abc",
        "start_km": 0.0,
        "start_time": datetime(2026, 11, 15, 8, 0),
        "start_soc": 1.0,
        "safe_under_p10": True,
        "total_time_hours": 35.5,
        "provenance": {"git_commit": "de4af3a", "weather_issue": "2026-11-15T06:00:00Z"},
    }
    segments = [
        {
            "segment_index": 0,
            "km": 0.0,
            "target_speed_kmh": 84.0,
            "arrival_time": datetime(2026, 11, 15, 8, 0),
            "soc_p50": 1.0,
            "soc_p10": 0.98,
            "soc_p90": 1.0,
        }
    ]
    saved = save_plan(db_session, plan_data, segments)
    assert saved.id == "test-plan-123"

    retrieved = get_plan(db_session, "test-plan-123")
    assert retrieved is not None
    assert retrieved.provenance["git_commit"] == "de4af3a"
    assert len(retrieved.segments) == 1
    assert retrieved.segments[0].target_speed_kmh == 84.0

    # Test latest plan retrieval
    latest = get_latest_plan(db_session)
    assert latest is not None
    assert latest.id == "test-plan-123"


def test_weather_forecast_access(db_session):
    forecasts = [
        {
            "issued_at": datetime(2026, 11, 15, 6, 0),
            "valid_time": datetime(2026, 11, 15, 8, 0),
            "km": 10.0,
            "ghi_w_m2": 850.0,
            "dni_w_m2": 920.0,
            "wind_speed_ms": 4.5,
            "wind_dir_deg": 180.0,
            "temp_c": 31.0,
        },
        {
            "issued_at": datetime(2026, 11, 15, 6, 0),
            "valid_time": datetime(2026, 11, 15, 8, 0),
            "km": 20.0,
            "ghi_w_m2": 860.0,
            "dni_w_m2": 930.0,
            "wind_speed_ms": 5.0,
            "wind_dir_deg": 190.0,
            "temp_c": 32.0,
        },
    ]
    inserted = insert_weather_forecasts(db_session, forecasts)
    assert inserted == 2

    fc = get_forecast_at_km(db_session, km=10.2)
    assert fc is not None
    assert fc.km == 10.0
    assert fc.ghi_w_m2 == 850.0


def test_backtest_result_access(db_session):
    data = {
        "id": "bt-2023-01",
        "race_year": 2023,
        "car_profile_hash": "car-hash-1",
        "simulated_finish_hours": 34.2,
        "actual_finish_hours": 34.8,
        "delta_hours": -0.6,
        "provenance": {"model": "optimizer_dp_v1"},
        "metrics": {"avg_speed_kmh": 87.5},
    }
    result = save_backtest_result(db_session, data)
    assert result.id == "bt-2023-01"
    assert result.delta_hours == -0.6
    assert result.metrics["avg_speed_kmh"] == 87.5


def test_telemetry_reading_access(db_session):
    reading = {
        "recorded_at": datetime(2026, 11, 15, 10, 0),
        "km": 150.5,
        "latitude": -13.5,
        "longitude": 131.2,
        "speed_kmh": 85.0,
        "battery_soc": 0.88,
        "array_power_w": 980.0,
        "motor_power_w": 1100.0,
    }
    saved = save_telemetry_reading(db_session, reading)
    assert saved.id is not None
    assert saved.km == 150.5
    assert saved.speed_kmh == 85.0


def test_database_url_formatting(monkeypatch):
    monkeypatch.setenv("SRP_DATABASE_URL", "postgresql://user:pass@host:5432/dbname")
    url = get_database_url()
    assert url == "postgresql+psycopg://user:pass@host:5432/dbname"


def test_parquet_export_and_import(db_session, tmp_path: Path):
    parquet_file = tmp_path / "test_route.parquet"

    # Export when empty returns 0
    empty_count = export_route_to_parquet(db_session, parquet_file)
    assert empty_count == 0

    # Insert segments
    segments = [
        {"segment_index": 0, "km": 0.0, "latitude": -12.46, "longitude": 130.84},
        {"segment_index": 1, "km": 0.1, "latitude": -12.47, "longitude": 130.85},
    ]
    insert_route_segments(db_session, segments)

    # Export to Parquet
    count = export_route_to_parquet(db_session, parquet_file)
    assert count == 2
    assert parquet_file.exists()

    # Create new clean db session and import
    new_engine = create_test_engine()
    Base.metadata.create_all(new_engine)
    new_session = sessionmaker(bind=new_engine)()

    imported_count = import_route_from_parquet(new_session, parquet_file)
    assert imported_count == 2
    assert len(get_route_segments(new_session)) == 2
