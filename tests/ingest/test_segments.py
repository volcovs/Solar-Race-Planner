"""Cutting the route into 100 m segments"""

import numpy as np
import pytest
from pyproj import Geod
from shapely.geometry import LineString

from solar_race_planner.ingest.segments import check_direction, segment_route

GEOD = Geod(ellps="WGS84")


def walk(start: tuple[float, float], legs: list[tuple[float, float]]) -> LineString:
    """A line from (lon, lat) along (azimuth°, metres) legs."""
    points = [start]
    for azimuth, metres in legs:
        lon, lat, _ = GEOD.fwd(*points[-1], azimuth, metres)
        points.append((lon, lat))
    return LineString(points)


# South, then east, then south again: a small stand-in for a north-to-south route.
ROUTE = walk((133.0, -20.0), [(180, 1234.5), (90, 760.0), (180, 505.25)])


def test_segments_are_contiguous_and_cover_the_route():
    segments = segment_route(ROUTE)

    assert segments.segment_id.tolist() == list(range(len(segments)))
    assert segments.km_start.iloc[0] == 0
    np.testing.assert_array_equal(segments.km_start.iloc[1:].to_numpy(), segments.km_end.iloc[:-1].to_numpy())
    assert segments.km_end.iloc[-1] == pytest.approx(GEOD.geometry_length(ROUTE) / 1000, abs=1e-9)

    lengths_m = (segments.km_end - segments.km_start).to_numpy() * 1000
    np.testing.assert_allclose(lengths_m[:-1], 100)
    assert 0 < lengths_m[-1] <= 100


def test_an_exact_multiple_of_100_m_has_no_sliver_at_the_end():
    segments = segment_route(walk((133.0, -20.0), [(180, 1000.0)]))

    assert len(segments) == 10
    assert (segments.km_end - segments.km_start).iloc[-1] * 1000 == pytest.approx(100)


def angle_off(heading: float, expected: float) -> float:
    return abs((heading - expected + 180) % 360 - 180)


def test_heading_is_the_direction_of_travel():
    segments = segment_route(ROUTE)

    def heading_at(km: float) -> float:
        return segments[(segments.km_start <= km) & (km < segments.km_end)].heading_deg.iloc[0]

    assert angle_off(heading_at(0.5), 180) < 0.01  # south
    assert angle_off(heading_at(1.6), 90) < 0.1  # east (a geodesic's bearing drifts slightly)
    assert angle_off(heading_at(2.3), 180) < 0.01
    assert segments.heading_deg.between(0, 360, inclusive="left").all()

    backwards = segment_route(LineString(ROUTE.coords[::-1]))
    assert angle_off(backwards.heading_deg.iloc[0], 0) < 0.01  # north


def test_midpoints_lie_halfway_along_each_segment():
    segments = segment_route(ROUTE)

    first = segments.iloc[0]
    expected_lon, expected_lat, _ = GEOD.fwd(133.0, -20.0, 180, 50)
    assert (first.lon, first.lat) == pytest.approx((expected_lon, expected_lat), abs=1e-7)


def test_ids_stay_the_same_when_the_route_grows_at_the_end():
    shorter = segment_route(ROUTE)
    longer = segment_route(walk(ROUTE.coords[0], [(180, 1234.5), (90, 760.0), (180, 900.0)]))

    whole = len(shorter) - 1  # the last, shorter segment changes
    np.testing.assert_allclose(longer.iloc[:whole].to_numpy(), shorter.iloc[:whole].to_numpy())


def test_a_line_drawn_finish_to_start_is_refused():
    start = {"name": "Start", "lon": 133.0, "lat": -20.0}

    check_direction(ROUTE, start)
    with pytest.raises(ValueError, match="must start there"):
        check_direction(LineString(ROUTE.coords[::-1]), start)
