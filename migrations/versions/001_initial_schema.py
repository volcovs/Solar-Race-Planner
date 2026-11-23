"""Initial PostGIS storage schema

Revision ID: 001
Create Date: 2026-11-15
"""

import sqlalchemy as sa
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verifică/creează extensia PostGIS
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # 1. Route segments
    op.create_table(
        "route_segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("km", sa.Float(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("elevation_m", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("slope_pct", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("heading_deg", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("speed_limit_kmh", sa.Float(), server_default="110.0", nullable=False),
        sa.Column("roughness_z0", sa.Float(), server_default="0.03", nullable=False),
        sa.Column("is_control_stop", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("control_stop_name", sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("segment_index"),
    )
    op.create_index("ix_route_segments_km", "route_segments", ["km"])

    # 2. Weather forecasts
    op.create_table(
        "weather_forecasts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("valid_time", sa.DateTime(), nullable=False),
        sa.Column("km", sa.Float(), nullable=False),
        sa.Column("ghi_w_m2", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("dni_w_m2", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("dhi_w_m2", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("wind_speed_ms", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("wind_dir_deg", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("temp_c", sa.Float(), server_default="25.0", nullable=False),
        sa.Column("ghi_p10", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("ghi_p50", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("ghi_p90", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("source", sa.String(length=50), server_default="open-meteo", nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weather_forecasts_valid_time", "weather_forecasts", ["valid_time"])
    op.create_index("ix_weather_forecasts_km", "weather_forecasts", ["km"])

    # 3. Plans
    op.create_table(
        "plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("car_profile_hash", sa.String(length=64), nullable=False),
        sa.Column("start_km", sa.Float(), nullable=False),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("start_soc", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="completed", nullable=False),
        sa.Column("safe_under_p10", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("total_time_hours", sa.Float(), nullable=True),
        sa.Column("finish_eta", sa.DateTime(), nullable=True),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # 4. Plan segments
    op.create_table(
        "plan_segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("km", sa.Float(), nullable=False),
        sa.Column("target_speed_kmh", sa.Float(), nullable=False),
        sa.Column("arrival_time", sa.DateTime(), nullable=False),
        sa.Column("soc_p50", sa.Float(), nullable=False),
        sa.Column("soc_p10", sa.Float(), nullable=False),
        sa.Column("soc_p90", sa.Float(), nullable=False),
        sa.Column("solar_power_w", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("motor_power_w", sa.Float(), server_default="0.0", nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_segments_plan_id", "plan_segments", ["plan_id"])

    # 5. Backtest results
    op.create_table(
        "backtest_results",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("race_year", sa.Integer(), nullable=False),
        sa.Column("car_profile_hash", sa.String(length=64), nullable=False),
        sa.Column("simulated_finish_hours", sa.Float(), nullable=False),
        sa.Column("actual_finish_hours", sa.Float(), nullable=False),
        sa.Column("delta_hours", sa.Float(), nullable=False),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # 6. Telemetry readings
    op.create_table(
        "telemetry_readings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("km", sa.Float(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("speed_kmh", sa.Float(), nullable=False),
        sa.Column("battery_soc", sa.Float(), nullable=False),
        sa.Column("array_power_w", sa.Float(), nullable=False),
        sa.Column("motor_power_w", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_telemetry_readings_recorded_at", "telemetry_readings", ["recorded_at"])


def downgrade() -> None:
    op.drop_table("telemetry_readings")
    op.drop_table("backtest_results")
    op.drop_table("plan_segments")
    op.drop_table("plans")
    op.drop_table("weather_forecasts")
    op.drop_table("route_segments")
