# Data contracts

Freeze these by the end of week 1. Changing a column after that needs a version
bump and a note in the team channel.

All tables are (Geo)Parquet, rasters are COGs. Times are UTC. Distances are km
from the start line.

## `data/route/route.parquet` (v1)

The race route as one line, built from OpenStreetMap by
`python -m solar_race_planner.ingest.route` (DAT-01). GeoParquet, EPSG:4326, one row.

| Column | Type | Meaning |
|---|---|---|
| `name` | string | Race config name, e.g. `bwsc-2025-route` |
| `length_km` | float | Geodesic length (WGS84 ellipsoid) |
| `osm_timestamp` | string (ISO 8601, UTC) | When the OSM data was last updated on the Overpass server |
| `built_at` | string (ISO 8601, UTC) | When this file was written |
| `attribution` | string | `© OpenStreetMap contributors, ODbL`; show wherever the route is shown |
| `geometry` | LineString | (lon, lat) in driving order, start line to finish |

`data/route/raw/overpass.json` caches the Overpass response with its query; delete it
or pass `--refresh` to download again.

