"""The race route cut into 100 m segments, the unit the energy model, optimiser and API work in.

Distances are geodesic (WGS84 ellipsoid), the same measure as the route's `length_km`, so a
segment's km is the route's km. A projected CRS would stretch them by up to ~0.4% over a
3,000 km north–south route.

Run (reads data/route/route.parquet and the race config; writes data/route/segments.parquet and
data/route/control_stops.parquet):
    python -m solar_race_planner.ingest.segments
"""

import argparse
from collections.abc import Sequence
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import yaml
from shapely.geometry import LineString

from solar_race_planner.ingest.control_stops import link, place_stops
from solar_race_planner.ingest.line import GEOD, along, walk

SEGMENT_M = 100.0


def segment_route(line: LineString, segment_m: float = SEGMENT_M) -> pd.DataFrame:
    """One row per segment from the start of `line`, which must be in driving order.

    `segment_id` is the segment's index from the start line, so segment 1234 always starts at
    km 123.4; the last segment may be shorter. `heading_deg` is the compass bearing of travel
    from the segment's start to its end (0 = north, 90 = east).
    """
    lon, lat, walked_m = walk(line)
    total_m = walked_m[-1]

    count = max(1, int(np.ceil(total_m / segment_m - 1e-9)))  # no sliver segment from rounding
    edges_m = np.append(np.arange(count) * segment_m, total_m)

    start_lon, start_lat = along(lon, lat, walked_m, edges_m[:-1])
    end_lon, end_lat = along(lon, lat, walked_m, edges_m[1:])
    mid_lon, mid_lat = along(lon, lat, walked_m, (edges_m[:-1] + edges_m[1:]) / 2)
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
    parser.add_argument("--stops-out", type=Path, default=Path("data/route/control_stops.parquet"))
    args = parser.parse_args(argv)

    race = yaml.safe_load(args.config.read_text())
    line = gpd.read_parquet(args.route).geometry.iloc[0]
    check_direction(line, race["route"]["start"])
    segments, stops = link(segment_route(line), place_stops(line, race))

    for stop in stops.itertuples():
        off = f"{stop.off_route_m:.0f} m off the route" if stop.km_source == "snapped" else "on the highway"
        print(f"  {stop.name:<16} official {stop.official_km:>7.1f}  route {stop.route_km:>8.2f}  ({off})")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    segments.to_parquet(args.out, index=False)
    stops.to_parquet(args.stops_out, index=False)
    print(f"Wrote {args.out}: {len(segments)} segments, {segments.km_end.iloc[-1]:.3f} km")
    print(f"Wrote {args.stops_out}: {len(stops)} control stops")


if __name__ == "__main__":
    main()
