"""Race route geometry from OpenStreetMap

OSM ways are split, unordered and sometimes drawn backwards, so the route is not
stitched by hand. Instead:

1. Fetch a road graph from Overpass: the race highways (by `ref`), every drivable
   road near each waypoint (control-stop detours) and main roads in the cities.
2. Find the shortest path between consecutive waypoints, in race order, and join
   the pieces into one line. Waypoints come from the race config: start, control
   stops with coordinates, optional `via` points that force a street, and finish.

Lengths are geodesic (WGS84 ellipsoid, `pyproj.Geod`).

Run (writes data/route/route.parquet):
    python -m solar_race_planner.ingest.route
"""

import argparse
import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path

import geopandas as gpd
import httpx
import networkx as nx
import yaml
from pyproj import Geod
from shapely import set_precision
from shapely.geometry import LineString, Point, mapping

GEOD = Geod(ellps="WGS84")
PRECISION_DEG = 1e-5  # ~1 m; rounds coordinates in the frontend sample
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "solar-race-planner"
OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL"

# Roads a car may use. Highways are matched by ref; the rest only near waypoints/cities.
HIGHWAY_CLASSES = "^(motorway|trunk|primary)(_link)?$"
MAIN_ROADS = "^(motorway|trunk|primary|secondary|tertiary)(_link)?$"
LOCAL_ROADS = (
    "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(_link)?$"
)


@dataclass(frozen=True)
class Waypoint:
    name: str
    km: float  # official distance from the start line
    lat: float
    lon: float


@dataclass(frozen=True)
class Route:
    line: LineString  # (lon, lat), EPSG:4326, in driving order
    length_km: float
    waypoint_km: dict[str, float]  # distance along `line` at each waypoint


def waypoints_from_config(race: dict) -> list[Waypoint]:
    """Start, located control stops, via points and finish, sorted by official km.

    Control stops without coordinates are on the highway itself; they don't change
    the path, so they are not waypoints.
    """
    route = race["route"]
    points = [route["start"], *race["control_stops"], *route.get("via", []), route["finish"]]
    located = [Waypoint(p["name"], p["km"], p["lat"], p["lon"]) for p in points if "lat" in p]
    return sorted(located, key=lambda w: w.km)


def overpass_query(waypoints: Sequence[Waypoint], route_config: dict, pad_deg: float = 0.5) -> str:
    """Overpass QL for every road the route can use. `out geom` returns node ids and coordinates."""
    south = min(w.lat for w in waypoints) - pad_deg
    north = max(w.lat for w in waypoints) + pad_deg
    west = min(w.lon for w in waypoints) - pad_deg
    east = max(w.lon for w in waypoints) + pad_deg
    refs = "|".join(route_config["highway_refs"])
    radius = route_config["local_radius_m"]

    clauses = [f'way["highway"~"{HIGHWAY_CLASSES}"]["ref"~"^({refs})$"]({south},{west},{north},{east});']
    clauses += [
        f'way["highway"~"{MAIN_ROADS}"](around:{a["radius_m"]},{a["lat"]},{a["lon"]});'
        for a in route_config["urban_areas"]
    ]
    clauses += [f'way["highway"~"{LOCAL_ROADS}"](around:{radius},{w.lat},{w.lon});' for w in waypoints]
    body = "\n  ".join(clauses)
    return f"[out:json][timeout:600];\n(\n  {body}\n);\nout geom;"


def fetch_overpass(query: str, cache: Path, url: str = OVERPASS_URL, refresh: bool = False) -> dict:
    """Run the query, or reuse the cached response for the same query."""
    if cache.exists() and not refresh:
        cached = json.loads(cache.read_text())
        if cached.get("query") == query:
            return cached["response"]
    response = httpx.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=660)
    response.raise_for_status()
    data = response.json()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"query": query, "response": data}))
    return data


def build_graph(response: dict) -> nx.DiGraph:
    """Directed road graph from an Overpass `out geom` response.

    Nodes are OSM node ids with `lon`/`lat`; edge weight `length_m` is geodesic metres.
    One-way roads get an edge in their direction of travel only.
    """
    graph = nx.DiGraph()
    for way in response.get("elements", []):
        if way.get("type") != "way":
            continue
        oneway = _oneway(way.get("tags", {}))
        points = [(node, (p["lon"], p["lat"])) for node, p in zip(way["nodes"], way["geometry"], strict=True)]
        for (a, pa), (b, pb) in pairwise(points):
            graph.add_node(a, lon=pa[0], lat=pa[1])
            graph.add_node(b, lon=pb[0], lat=pb[1])
            length = _distance_m(pa, pb)
            if oneway >= 0:
                graph.add_edge(a, b, length_m=length)
            if oneway <= 0:
                graph.add_edge(b, a, length_m=length)
    return graph


def _oneway(tags: dict) -> int:
    """1 = drawn direction only, -1 = against it only, 0 = both."""
    value = tags.get("oneway")
    if value in ("yes", "true", "1"):
        return 1
    if value == "-1":
        return -1
    if value == "no":
        return 0
    return 1 if tags.get("highway") == "motorway" or tags.get("junction") == "roundabout" else 0


def route_through(graph: nx.DiGraph, waypoints: Sequence[Waypoint]) -> Route:
    """Shortest path through the waypoints in order, as one line."""
    if len(waypoints) < 2:
        raise ValueError("Need at least a start and a finish waypoint.")
    # Snap only to the largest connected part, never to an isolated fragment such as a car park.
    connected = max(nx.weakly_connected_components(graph), key=len)
    snapped = [_nearest_node(graph, connected, w) for w in waypoints]

    path = [snapped[0]]
    for (wa, a), (wb, b) in pairwise(zip(waypoints, snapped, strict=True)):
        try:
            path += nx.shortest_path(graph, a, b, weight="length_m")[1:]
        except nx.NetworkXNoPath as err:
            raise ValueError(f"No road connects '{wa.name}' to '{wb.name}' in the fetched graph.") from err

    cumulative_m = [0.0]
    for a, b in pairwise(path):
        cumulative_m.append(cumulative_m[-1] + graph.edges[a, b]["length_m"])

    # A waypoint's km is where the path first reaches its node after the previous waypoint.
    waypoint_km, search_from = {}, 0
    for wp, node in zip(waypoints, snapped, strict=True):
        search_from = path.index(node, search_from)
        waypoint_km[wp.name] = cumulative_m[search_from] / 1000

    coords = [(graph.nodes[n]["lon"], graph.nodes[n]["lat"]) for n in path]
    return Route(LineString(coords), cumulative_m[-1] / 1000, waypoint_km)


def _nearest_node(graph: nx.DiGraph, nodes: set[int], wp: Waypoint) -> int:
    """Closest node by equirectangular distance; exact enough to pick a node."""
    cos_lat = math.cos(math.radians(wp.lat))

    def squared_distance(n: int) -> float:
        node = graph.nodes[n]
        return ((node["lon"] - wp.lon) * cos_lat) ** 2 + (node["lat"] - wp.lat) ** 2

    return min(nodes, key=squared_distance)


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    return GEOD.inv(a[0], a[1], b[0], b[1])[2]


def point_at_km(line: LineString, km: float) -> tuple[float, float]:
    """(lon, lat) at a geodesic distance along the line; clamped to its ends."""
    target_m, walked_m = km * 1000, 0.0
    for a, b in pairwise(line.coords):
        step = _distance_m(a, b)
        if step > 0 and walked_m + step >= target_m:
            t = max(0.0, (target_m - walked_m) / step)
            return (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        walked_m += step
    return line.coords[-1]


def sample_geojson(route: Route, race: dict, tolerance_deg: float = 0.00025) -> dict:
    """Small GeoJSON for the frontend: the simplified route (tolerance ~25 m) and its stops on the line.

    Located stops sit at their km along our route; stops on the highway (no coordinates)
    at their official km.
    """
    line = set_precision(route.line.simplify(tolerance_deg, preserve_topology=False), PRECISION_DEG)
    stops = [
        ("start", race["route"]["start"]),
        *(("control_stop", stop) for stop in race["control_stops"]),
        ("finish", race["route"]["finish"]),
    ]
    features = [_feature({"kind": "route", "length_km": round(route.length_km, 1)}, mapping(line))]
    for kind, stop in stops:
        km = route.waypoint_km.get(stop["name"], stop["km"])
        point = set_precision(Point(point_at_km(route.line, km)), PRECISION_DEG)
        features.append(_feature({"kind": kind, "name": stop["name"], "km": stop["km"]}, mapping(point)))
    return {"type": "FeatureCollection", "attribution": OSM_ATTRIBUTION, "features": features}


def _feature(properties: dict, geometry: dict) -> dict:
    return {"type": "Feature", "properties": properties, "geometry": geometry}


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build the race route from OpenStreetMap.")
    parser.add_argument("--config", type=Path, default=Path("configs/race.bwsc.yaml"))
    parser.add_argument("--out", type=Path, default=Path("data/route/route.parquet"))
    parser.add_argument("--geojson", type=Path, help="also write a simplified GeoJSON (frontend sample)")
    parser.add_argument("--refresh", action="store_true", help="download again even if cached")
    parser.add_argument(
        "--overpass-url", default=OVERPASS_URL, help="another Overpass server if the default is busy"
    )
    args = parser.parse_args(argv)

    race = yaml.safe_load(args.config.read_text())
    waypoints = waypoints_from_config(race)
    query = overpass_query(waypoints, race["route"])
    response = fetch_overpass(
        query, args.out.parent / "raw" / "overpass.json", args.overpass_url, args.refresh
    )
    route = route_through(build_graph(response), waypoints)
    osm_base = response.get("osm3s", {}).get("timestamp_osm_base")

    official_km = waypoints[-1].km
    print(
        f"Route {route.length_km:.1f} km vs official {official_km} km "
        f"({100 * (route.length_km - official_km) / official_km:+.2f}%), OSM data {osm_base}"
    )
    for w in waypoints:
        km = route.waypoint_km[w.name]
        print(f"  {w.name:<32} official {w.km:>8.1f}  route {km:>8.1f}  diff {km - w.km:+6.1f}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    gpd.GeoDataFrame(
        {
            "name": [race["name"]],
            "length_km": [round(route.length_km, 3)],
            "osm_timestamp": [osm_base],
            "built_at": [datetime.now(UTC).isoformat(timespec="seconds")],
            "attribution": [OSM_ATTRIBUTION],
        },
        geometry=[route.line],
        crs="EPSG:4326",
    ).to_parquet(args.out)
    print(f"Wrote {args.out}")

    if args.geojson:
        args.geojson.parent.mkdir(parents=True, exist_ok=True)
        args.geojson.write_text(json.dumps(sample_geojson(route, race), separators=(",", ":")))
        print(f"Wrote {args.geojson}")


if __name__ == "__main__":
    main()
