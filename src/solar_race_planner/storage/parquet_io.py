"""Parquet import and export helpers for local offline work."""

from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from solar_race_planner.storage.access import get_route_segments, insert_route_segments


def export_route_to_parquet(session: Session, output_path: Path | str) -> int:
    """Export route segments to a Parquet file."""
    segments = get_route_segments(session)
    if not segments:
        return 0
    data = [
        {
            "segment_index": s.segment_index,
            "km": s.km,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "elevation_m": s.elevation_m,
            "slope_pct": s.slope_pct,
            "heading_deg": s.heading_deg,
            "speed_limit_kmh": s.speed_limit_kmh,
            "roughness_z0": s.roughness_z0,
            "is_control_stop": s.is_control_stop,
            "control_stop_name": s.control_stop_name,
        }
        for s in segments
    ]
    df = pd.DataFrame(data)
    df.to_parquet(output_path, index=False)
    return len(df)


def import_route_from_parquet(session: Session, input_path: Path | str) -> int:
    """Load route segments from a local Parquet file into PostGIS/Postgres."""
    df = pd.read_parquet(input_path)
    records = df.to_dict(orient="records")
    return insert_route_segments(session, records)
