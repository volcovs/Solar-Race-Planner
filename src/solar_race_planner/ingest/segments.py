"""The race route cut into 100 m segments, the unit the energy model, optimiser and API work in.

Distances are geodesic (WGS84 ellipsoid), the same measure as the route's `length_km`, so a
segment's km is the route's km. A projected CRS would stretch them by up to ~0.4% over a
3,000 km north–south route.

Run (reads data/route/route.parquet, writes data/route/segments.parquet):
    python -m solar_race_planner.ingest.segments
"""

import argparse
from collections.abc import Sequence
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import yaml
from pyproj import Geod
from shapely.geometry import LineString

GEOD = Geod(ellps="WGS84")
SEGMENT_M = 100.0


def segment_route(line: LineString, segment_m: float = SEGMENT_M) -> pd.DataFrame:
    """One row per segment from the start of `line`, which must be in driving order.

    `segment_id` is the segment's index from the start line, so segment 1234 always starts at
    km 123.4; the last segment may be shorter. `heading_deg` is the compass bearing of travel
    from the segment's start to its end (0 = north, 90 = east).
    """
    lon, lat = np.asarray(line.coords).T[:2]
    steps_m = GEOD.inv(lon[:-1], lat[:-1], lon[1:], lat[1:])[2]
    walked_m = np.concatenate([[0.0], np.cumsum(steps_m)])
    total_m = walked_m[-1]

    count = max(1, int(np.ceil(total_m / segment_m - 1e-9)))  # no sliver segment from rounding
    edges_m = np.append(np.arange(count) * segment_m, total_m)

    start_lon, start_lat = _along(lon, lat, walked_m, edges_m[:-1])
    end_lon, end_lat = _along(lon, lat, walked_m, edges_m[1:])
    mid_lon, mid_lat = _along(lon, lat, walked_m, (edges_m[:-1] + edges_m[1:]) / 2)
    heading = GEOD.inv(start_lon, start_lat, end_lon, end_lat)[0] % 360

    return pd.DataFrame(
        {
            "segment_id": np.arange(count, dtype=np.int32),
            "km_start": edges_m[:-1] / 1000,
            "km_end": edges_m[1:] / 1000,
            "lat": mid_lat,
            "lon": mid_lon,
            "heading_deg": heading,
        }
    )


def _along(lon: np.ndarray, lat: np.ndarray, walked_m: np.ndarray, at_m: np.ndarray):
    """(lon, lat) at distances along the line, linear between vertices (they are metres apart)."""
    i = np.clip(np.searchsorted(walked_m, at_m, side="right") - 1, 0, len(walked_m) - 2)
    step = walked_m[i + 1] - walked_m[i]
    t = np.divide(at_m - walked_m[i], step, out=np.zeros_like(at_m), where=step > 0)
    return lon[i] + t * (lon[i + 1] - lon[i]), lat[i] + t * (lat[i + 1] - lat[i])


def check_direction(line: LineString, start: dict) -> None:
    """Fail unless the line begins at the race start: headings must follow the direction of travel."""
    (first_lon, first_lat), (last_lon, last_lat) = line.coords[0][:2], line.coords[-1][:2]
    to_first = GEOD.inv(start["lon"], start["lat"], first_lon, first_lat)[2]
    to_last = GEOD.inv(start["lon"], start["lat"], last_lon, last_lat)[2]
    if to_first > to_last:
        raise ValueError(f"The route line runs towards '{start['name']}'; it must start there.")


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Cut the race route into 100 m segments.")
    parser.add_argument("--config", type=Path, default=Path("configs/race.bwsc.yaml"))
    parser.add_argument("--route", type=Path, default=Path("data/route/route.parquet"))
    parser.add_argument("--out", type=Path, default=Path("data/route/segments.parquet"))
    args = parser.parse_args(argv)

    line = gpd.read_parquet(args.route).geometry.iloc[0]
    check_direction(line, yaml.safe_load(args.config.read_text())["route"]["start"])
    segments = segment_route(line)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    segments.to_parquet(args.out, index=False)
    print(f"Wrote {args.out}: {len(segments)} segments, {segments.km_end.iloc[-1]:.3f} km")


if __name__ == "__main__":
    main()
