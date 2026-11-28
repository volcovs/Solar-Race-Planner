"""Positions along a route line, by geodesic distance (WGS84 ellipsoid)."""

import numpy as np
from pyproj import Geod
from shapely.geometry import LineString

GEOD = Geod(ellps="WGS84")


def walk(line: LineString) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """The line's lon and lat, and the geodesic metres walked to each vertex."""
    lon, lat = np.asarray(line.coords).T[:2]
    steps_m = GEOD.inv(lon[:-1], lat[:-1], lon[1:], lat[1:])[2]
    return lon, lat, np.concatenate([[0.0], np.cumsum(steps_m)])


def along(lon: np.ndarray, lat: np.ndarray, walked_m: np.ndarray, at_m: np.ndarray):
    """(lon, lat) at distances along the line, linear between vertices (they are metres apart)."""
    i = np.clip(np.searchsorted(walked_m, at_m, side="right") - 1, 0, len(walked_m) - 2)
    step = walked_m[i + 1] - walked_m[i]
    t = np.divide(at_m - walked_m[i], step, out=np.zeros_like(at_m), where=step > 0)
    return lon[i] + t * (lon[i + 1] - lon[i]), lat[i] + t * (lat[i + 1] - lat[i])
