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

## API: `POST /replan` (draft)

The re-plan screen (FE-06) sends where the car is now; BE-05 answers with a new plan from
there to the finish, in the `/plan` shape above. Its first stop is the re-plan point (`kind`
`start`), followed by the stops still ahead. Mocked like the others until BE-05 exists.

| Field | Type | Meaning |
|---|---|---|
| `km` | number | The car's position, km from the start line |
| `time_utc` | string | When it was there, ISO 8601 UTC (the page asks for local race time and converts) |
| `soc` | number | Battery state of charge then, 0–1 |
## `data/forecasts/forecast.parquet` (v1)

Multi-point weather forecast sampled along the route from the Open-Meteo Forecast API
(SCRUM-28). Parquet, one row per `(point_id, time_utc)`. Produced by
`OpenMeteoClient.fetch_forecast`, which returns this table as a DataFrame.

| Column | Type | Meaning |
|---|---|---|
| `point_id` | string | Identifier of the route sample point, as given by the caller (`str(RoutePoint.point_id)`) |
| `time_utc` | timestamp (UTC) | Valid time of the forecast step |
| `step_minutes` | int | Step / averaging length in minutes (`15` or `60`) |
| `shortwave_radiation` | float | GHI, W/m² — **average over the preceding `step_minutes`**, not instantaneous |
| `direct_normal_irradiance` | float | DNI, W/m² — **average over the preceding `step_minutes`**, not instantaneous |
| `diffuse_radiation` | float | DHI, W/m² — **average over the preceding `step_minutes`**, not instantaneous |
| `wind_speed_10m` | float | Wind speed at 10 m, **m/s** (always requested with `wind_speed_unit=ms`) |
| `wind_direction_10m` | float | Wind direction at 10 m, degrees 0–360, direction the wind blows from |
| `wind_gusts_10m` | float | Wind gusts at 10 m, **m/s** |
| `temperature_2m` | float | Air temperature at 2 m, °C |
| `cloud_cover` | float | Total cloud cover, % (0–100) |
| `model` | string | Model **requested** (e.g. `best_match`), not necessarily the model actually used |
| `issue_time_utc` | timestamp (UTC, unit `s`) | When this batch was **fetched** (cache time for cached batches), not the model run time |
| `request_url` | string | Full Open-Meteo request URL used to produce the row |

**Notes:**
- **Irradiance averaging:** values are means over the **preceding** `step_minutes`
  (e.g. `01:00` with `step_minutes=60` is the mean of `00:00–01:00`). Downstream solar
  models (`pvlib`) must use `step_minutes` to apply the midpoint offset.
- **15-minute availability:** native 15-minute data exists only for Europe and North America.
  For Australia the 15-minute values are interpolated from the hourly forecast, so they add
  request weight without new information. The client defaults to `hourly`.
- **Caching:** raw JSON per batch is cached under `data/forecasts/raw/` (key: request URL hash),
  default TTL 30 min (`cache_ttl_seconds=1800`). Use `use_cache=False` or delete the folder
  to force a fresh fetch.


## API: `POST /scenarios` (draft)

The what-if page (FE-05) sends up to three scenarios as `{"scenarios": [...]}`; BE-05 answers
`{"plans": [...]}`, one plan per scenario in the same order, each in the `/plan` shape. The page
lets the user cancel a run (it aborts the request). Mocked like the others until BE-05 exists.

| Field | Type | Meaning |
|---|---|---|
| `start_soc` | number | Battery at the start, 0–1 |
| `weather_shift_h` | number | The clouds this many hours earlier (−1) or later (+1) than forecast |
| `weather` | `p10` \| `p50` \| `p90` | Plan on the pessimistic, median or optimistic forecast |
| `cda_factor` | number | Drag against the car profile, 0.9–1.1 |
| `strategy` | `planned` \| `constant` | The optimiser's speeds, or the planned average speed held all race |
