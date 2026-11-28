"""Control stops placed on the route: their route km next to the official km, and a flag on the segments.

The official km come from the race notes; the route is built from OpenStreetMap, so the two differ by a
few km. The model uses `route_km`. Stop duration and the driving and charging windows stay in the race
config.
"""

import math

import numpy as np
import pandas as pd
from shapely.geometry import LineString

from solar_race_planner.ingest.line import along, walk

M_PER_DEG_LAT = 110_574.0  # near enough for picking the nearest point; km come from geodesic steps
M_PER_DEG_LON_EQUATOR = 111_320.0
TIE_M = 25.0  # passes this close to the nearest count as the same place (a detour in and out)


def place_stops(line: LineString, race: dict) -> pd.DataFrame:
    """One row per control stop, in race order.

    A stop with coordinates is snapped to the nearest point on the route. Where the route passes it more
    than once, the pass nearest its official km wins. A stop without coordinates is on the highway: its
    official km is corrected by the offsets of the stops around it (and the start and finish).
    """
    lon, lat, walked_m = walk(line)
    stops = race["control_stops"]
    route = race["route"]

    official_km = np.array([float(s["km"]) for s in stops])
    snapped = np.array(["lat" in s for s in stops])
    route_km = np.full(len(stops), math.nan)
    off_route_m = np.full(len(stops), math.nan)
    for i in np.flatnonzero(snapped):
        route_km[i], off_route_m[i] = _snap(lon, lat, walked_m, stops[i])

    # Official → route km through every pair we know: the start, the snapped stops and the finish.
    known_official = [route["start"]["km"], *official_km[snapped], route["finish"]["km"]]
    known_route = [0.0, *route_km[snapped], walked_m[-1] / 1000]
    route_km[~snapped] = np.interp(official_km[~snapped], known_official, known_route)

    if np.any(np.diff(route_km) <= 0):
        raise ValueError("Control stops land on the route out of race order; check their coordinates.")

    stop_lon, stop_lat = along(lon, lat, walked_m, route_km * 1000)
    return pd.DataFrame(
        {
            "stop_id": np.arange(1, len(stops) + 1, dtype=np.int32),
            "name": [s["name"] for s in stops],
            "official_km": official_km,
            "route_km": route_km,
            "lat": stop_lat,
            "lon": stop_lon,
            "off_route_m": off_route_m,
            "km_source": np.where(snapped, "snapped", "interpolated"),
        }
    )


def _snap(lon: np.ndarray, lat: np.ndarray, walked_m: np.ndarray, stop: dict) -> tuple[float, float]:
    """(route km, metres off the route) of the stop's nearest pass; of near-equal passes, the one
    nearest its official km."""
    x_scale = M_PER_DEG_LON_EQUATOR * math.cos(math.radians(stop["lat"]))
    x = (lon - stop["lon"]) * x_scale
    y = (lat - stop["lat"]) * M_PER_DEG_LAT
    dx, dy = np.diff(x), np.diff(y)
    length2 = dx**2 + dy**2
    t = np.divide(-(x[:-1] * dx + y[:-1] * dy), length2, out=np.zeros_like(dx), where=length2 > 0)
    t = np.clip(t, 0, 1)
    distance = np.hypot(x[:-1] + t * dx, y[:-1] + t * dy)

    km = (walked_m[:-1] + t * np.diff(walked_m)) / 1000
    near = distance <= distance.min() + TIE_M
    best = np.flatnonzero(near)[np.argmin(np.abs(km[near] - stop["km"]))]
    return float(km[best]), float(distance[best])


def link(segments: pd.DataFrame, stops: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The segments with `control_stop` and `control_stop_name` set where a stop is, and the stops with
    their `segment_id`. `segments` must be in order, indexed from 0, as `segment_route` returns them."""
    rows = np.searchsorted(segments.km_start.to_numpy(), stops.route_km.to_numpy(), side="right") - 1
    rows = np.clip(rows, 0, len(segments) - 1)

    names = pd.Series(pd.NA, index=segments.index, dtype="string")
    flagged = segments.assign(control_stop=False, control_stop_name=names)
    flagged.loc[rows, "control_stop"] = True
    flagged.loc[rows, "control_stop_name"] = stops.name.to_numpy()
    return flagged, stops.assign(segment_id=segments.segment_id.to_numpy()[rows])
