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


## API: `GET /plan` and `GET /forecast` (draft)

What the race timeline (FE-03) reads; BE-04 serves them. Until it does, the frontend answers
both from `frontend/src/mocks/` with made-up numbers; build it with `VITE_API_MOCK=false` to
call the real API. The TypeScript types are in `frontend/src/lib/plan.ts`.

JSON with one array per quantity ("columns"), all the same length and ordered by km. Times
are ISO 8601 UTC strings.

`/plan`: the latest plan.

| Field | Type | Meaning |
|---|---|---|
| `plan_id`, `created_at` | string | Which plan, and when it was made |
| `timezone` | string | IANA zone of the race (e.g. `Australia/Darwin`), for local clock times |
| `min_soc` | number | The car's battery floor (0–1), from its profile; the UI warns where `soc_p10` falls below it |
| `stops` | `{kind, name, km}[]` | The start, control stops and finish the plan was made for, in race order (`kind`: `start`, `control_stop` or `finish`) |
| `days` | `{day, start_km, end_km}[]` | Where each race day starts and ends |
| `km` | number[] | Samples along the route, finer than 1 km |
| `time_utc` | string[] | Planned time at each km |
| `speed_kmh` | number[] | Target speed |
| `soc`, `soc_p10`, `soc_p90` | number[] | Planned battery state of charge (0–1) and its P10/P90 band |

`/forecast`: the weather along the route at the planned arrival times (WX-06).

| Field | Type | Meaning |
|---|---|---|
| `model`, `issue_time_utc` | string | Which forecast |
| `km` | number[] | Samples along the route |
| `ghi_w_m2` | number[] | Global horizontal irradiance, W/m² |
| `headwind_ms` | number[] | Wind along the route, m/s: + against the car, − behind it |
