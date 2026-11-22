"""Route building on a tiny hand-made network"""

import pytest
from pyproj import Geod

from solar_race_planner.ingest.route import (
    Waypoint,
    build_graph,
    overpass_query,
    point_at_km,
    route_through,
    sample_geojson,
    waypoints_from_config,
)

GEOD = Geod(ellps="WGS84")

# Main road 1 → 7 dips south between its ends, so a straight 1–7 link is a shortcut.
NODES = {
    1: (134.00, -20.00),
    2: (134.01, -20.02),
    3: (134.02, -20.02),
    4: (134.03, -20.02),
    5: (134.04, -20.02),
    6: (134.05, -20.02),
    7: (134.06, -20.00),
    8: (134.02, -20.04),  # dead-end side road from 3
    9: (134.03, -20.05),
    20: (134.07, -20.00),  # isolated fragment just past the finish
    21: (134.08, -20.00),
}


def way(way_id: int, nodes: list[int], **tags: str) -> dict:
    return {
        "type": "way",
        "id": way_id,
        "nodes": nodes,
        "geometry": [{"lon": NODES[n][0], "lat": NODES[n][1]} for n in nodes],
        "tags": {"highway": "trunk", **tags},
    }


def network(*extra: dict) -> dict:
    """An Overpass-style response."""
    return {
        "elements": [
            {"type": "node", "id": 1, "lat": -20.0, "lon": 134.0},  # bare nodes are ignored
            way(10, [1, 2, 3]),
            way(11, [5, 4, 3]),  # drawn backwards
            way(12, [5, 6]),  # one road split into two ways
            way(13, [6, 7]),
            way(14, [3, 8, 9], highway="residential"),
            way(15, [20, 21]),
            *extra,
        ]
    }


def at(node: int, name: str, km: float = 0.0) -> Waypoint:
    lon, lat = NODES[node]
    return Waypoint(name, km, lat, lon)


def length_km(nodes: list[int]) -> float:
    lons, lats = zip(*(NODES[n] for n in nodes), strict=True)
    return GEOD.line_length(lons, lats) / 1000


def test_route_is_one_ordered_line_through_split_and_reversed_ways():
    route = route_through(build_graph(network()), [at(1, "start"), at(7, "finish", 7.0)])

    assert list(route.line.coords) == [NODES[n] for n in range(1, 8)]
    assert route.length_km == pytest.approx(length_km(list(range(1, 8))), rel=1e-9)


def test_waypoint_km_is_the_distance_along_the_route():
    route = route_through(
        build_graph(network()), [at(1, "start"), at(4, "middle", 3.0), at(7, "finish", 7.0)]
    )

    assert route.waypoint_km["start"] == 0
    assert route.waypoint_km["middle"] == pytest.approx(length_km([1, 2, 3, 4]))
    assert route.waypoint_km["finish"] == pytest.approx(route.length_km)


def test_a_detour_waypoint_drives_in_and_back_out():
    route = route_through(build_graph(network()), [at(1, "start"), at(9, "stop", 3.0), at(7, "finish", 7.0)])

    assert list(route.line.coords)[:7] == [NODES[n] for n in (1, 2, 3, 8, 9, 8, 3)]


def test_one_way_shortcut_is_used_only_in_its_direction():
    wrong_way = network(way(16, [1, 7], oneway="-1"))  # traffic may only go 7 → 1
    right_way = network(way(16, [1, 7], oneway="yes"))
    waypoints = [at(1, "start"), at(7, "finish", 7.0)]

    assert route_through(build_graph(wrong_way), waypoints).length_km == pytest.approx(
        length_km(list(range(1, 8)))
    )
    assert route_through(build_graph(right_way), waypoints).length_km == pytest.approx(length_km([1, 7]))


def test_waypoints_snap_to_the_connected_road_network():
    # Node 20 is closest to this finish, but it is not connected; snap to node 7 instead.
    near_fragment = Waypoint("finish", 7.0, -20.0, 134.069)
    route = route_through(build_graph(network()), [at(1, "start"), near_fragment])

    assert route.line.coords[-1] == NODES[7]


def test_unreachable_waypoint_names_both_ends():
    # The only link to 7 is one-way away from it, so 7 cannot be reached from 1.
    response = {"elements": [way(10, [1, 2, 3]), way(11, [7, 3], oneway="yes")]}

    with pytest.raises(ValueError, match="'start' to 'finish'"):
        route_through(build_graph(response), [at(1, "start"), at(7, "finish", 7.0)])


def test_graph_follows_one_way_rules():
    graph = build_graph(
        {
            "elements": [
                way(10, [1, 2]),
                way(11, [3, 4], junction="roundabout"),
                way(12, [5, 6], highway="motorway"),
                way(13, [7, 8], highway="motorway", oneway="no"),
            ]
        }
    )

    assert graph.has_edge(1, 2) and graph.has_edge(2, 1)  # two-way by default
    assert graph.has_edge(3, 4) and not graph.has_edge(4, 3)  # roundabouts are one-way
    assert graph.has_edge(5, 6) and not graph.has_edge(6, 5)  # motorways are one-way
    assert graph.has_edge(8, 7)  # unless tagged otherwise


def test_waypoints_from_config_are_sorted_and_skip_stops_on_the_highway():
    race = {
        "control_stops": [
            {"name": "B", "km": 200, "lat": -21.0, "lon": 134.0},
            {"name": "On highway", "km": 100},
        ],
        "route": {
            "start": {"name": "Start", "km": 0, "lat": -20.0, "lon": 134.0},
            "finish": {"name": "Finish", "km": 300, "lat": -22.0, "lon": 134.0},
            "via": [{"name": "Via", "km": 150, "lat": -20.5, "lon": 134.0}],
        },
    }

    assert [w.name for w in waypoints_from_config(race)] == ["Start", "Via", "B", "Finish"]


def test_overpass_query_covers_highways_cities_and_waypoints():
    config = {
        "highway_refs": ["A1", "A87"],
        "local_radius_m": 1500,
        "urban_areas": [{"name": "City", "lat": -12.44, "lon": 130.88, "radius_m": 15000}],
    }
    query = overpass_query([at(1, "start"), at(7, "finish")], config)

    assert '["ref"~"^(A1|A87)$"]' in query
    assert "(around:15000,-12.44,130.88)" in query
    assert query.count("(around:1500,") == 2
    assert query.rstrip().endswith("out geom;")


def test_point_at_km_walks_the_line_and_clamps_at_the_ends():
    route = route_through(build_graph(network()), [at(1, "start"), at(7, "finish", 7.0)])
    to_node_4 = length_km([1, 2, 3, 4])

    assert point_at_km(route.line, to_node_4) == pytest.approx(NODES[4])
    assert point_at_km(route.line, -1) == NODES[1]
    assert point_at_km(route.line, 1e6) == NODES[7]


def test_sample_geojson_puts_every_stop_on_the_route():
    route = route_through(
        build_graph(network()), [at(1, "Start"), at(4, "Located", 3.0), at(7, "Finish", 7.0)]
    )
    race = {
        "route": {"start": {"name": "Start", "km": 0}, "finish": {"name": "Finish", "km": 7.0}},
        "control_stops": [{"name": "Located", "km": 3.0}, {"name": "On highway", "km": length_km([1, 2])}],
    }

    features = sample_geojson(route, race)["features"]
    stops = {f["properties"]["name"]: f["geometry"]["coordinates"] for f in features[1:]}

    assert [f["properties"]["kind"] for f in features] == [
        "route",
        "start",
        "control_stop",
        "control_stop",
        "finish",
    ]
    assert stops["Located"] == pytest.approx(NODES[4])  # at its km along our route
    assert stops["On highway"] == pytest.approx(NODES[2])  # at its official km
    assert stops["Finish"] == pytest.approx(NODES[7])
