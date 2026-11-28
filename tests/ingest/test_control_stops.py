"""Placing control stops on the route"""

import pytest
from pyproj import Geod
from shapely.geometry import LineString

from solar_race_planner.ingest.control_stops import link, place_stops
from solar_race_planner.ingest.segments import segment_route

GEOD = Geod(ellps="WGS84")
START = (133.0, -20.0)


def walk(legs: list[tuple[float, float]]) -> LineString:
    """A line from START along (azimuth°, metres) legs."""
    points = [START]
    for azimuth, metres in legs:
        lon, lat, _ = GEOD.fwd(*points[-1], azimuth, metres)
        points.append((lon, lat))
    return LineString(points)


def at(azimuth: float, metres: float, frm: dict | None = None) -> dict:
    """{lon, lat} that far from `frm` (default START)."""
    lon, lat = (frm["lon"], frm["lat"]) if frm else START
    lon, lat, _ = GEOD.fwd(lon, lat, azimuth, metres)
    return {"lon": lon, "lat": lat}


# 2 km south, a 500 m detour east into a town and back along the same street, then 3 km south.
ROUTE = walk([(180, 2000), (90, 500), (270, 500), (180, 3000)])
CORNER = at(180, 2000)  # where the detour leaves the highway (route km 2.0, and again at 3.0)


def race(*stops: dict, finish_km: float = 6.0) -> dict:
    return {
        "control_stops": list(stops),
        "route": {
            "start": {"name": "Start", "km": 0, **at(0, 0)},
            "finish": {"name": "Finish", "km": finish_km},
        },
    }


def test_a_stop_is_snapped_to_the_nearest_point_on_the_route():
    beside = at(270, 40, at(180, 1000))  # 40 m west of the highway at km 1
    stops = place_stops(ROUTE, race({"name": "Roadhouse", "km": 1.3, **beside}))

    stop = stops.iloc[0]
    assert stop.route_km == pytest.approx(1.0, abs=0.001)
    assert stop.official_km == 1.3
    assert stop.off_route_m == pytest.approx(40, abs=0.5)
    assert stop.km_source == "snapped"
    assert (stop.lon, stop.lat) == pytest.approx((at(180, 1000)["lon"], at(180, 1000)["lat"]), abs=1e-6)


def test_on_a_street_driven_both_ways_the_pass_nearest_the_official_km_wins():
    shop = at(0, 10, at(90, 250, CORNER))  # beside the detour street, passed at route km 2.25 and 2.75

    inbound = place_stops(ROUTE, race({"name": "Shop", "km": 2.2, **shop})).route_km.iloc[0]
    outbound = place_stops(ROUTE, race({"name": "Shop", "km": 2.8, **shop})).route_km.iloc[0]
    assert inbound == pytest.approx(2.25, abs=0.001)
    assert outbound == pytest.approx(2.75, abs=0.001)


def test_a_stop_without_coordinates_takes_its_official_km_corrected_by_its_neighbours():
    # Official km run 10% short of the route here: the snapped stop at route km 1.0 is officially 0.9.
    stops = place_stops(
        ROUTE,
        race({"name": "Highway", "km": 0.45}, {"name": "Roadhouse", "km": 0.9, **at(180, 1000)}),
    )

    highway = stops.iloc[0]
    assert highway.km_source == "interpolated"
    assert highway.route_km == pytest.approx(0.5, abs=0.001)
    assert highway.off_route_m != highway.off_route_m  # NaN: never measured
    assert stops.stop_id.tolist() == [1, 2]


def test_stops_out_of_race_order_are_refused():
    later_first = race({"name": "B", "km": 4.0, **at(180, 4000)}, {"name": "A", "km": 4.5, **at(180, 1000)})
    with pytest.raises(ValueError, match="out of race order"):
        place_stops(ROUTE, later_first)


def test_each_stop_flags_the_segment_it_is_on():
    roadhouse = {"name": "Roadhouse", "km": 1.0, **at(180, 1050)}
    stops = place_stops(ROUTE, race(roadhouse, {"name": "Town", "km": 4.0}))
    segments, linked = link(segment_route(ROUTE), stops)

    flagged = segments[segments.control_stop]
    assert flagged.control_stop_name.tolist() == ["Roadhouse", "Town"]
    # Town: official 4.0 between the Roadhouse (1.0 → route 1.05) and the finish (6.0 → 6.0) → route 4.02
    assert flagged.segment_id.tolist() == linked.segment_id.tolist() == [10, 40]
    assert segments.control_stop_name.isna().sum() == len(segments) - 2
