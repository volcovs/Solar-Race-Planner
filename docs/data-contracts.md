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

## `data/forecasts/forecast.parquet` (v1)

Multi-point weather forecast sampled along the route from the Open-Meteo Forecast API
(SCRUM-28). Parquet, one row per `(point_id, time_utc)`.

| Column | Type | Meaning |
|---|---|---|
| `point_id` | string | Identifier of the route sample point (mapped by request index) |
| `time_utc` | timestamp (UTC) | Valid time of the forecast step (`hourly` or `minutely_15`) |
| `shortwave_radiation` | float | Global Horizontal Irradiance (GHI), W/m² — **average over the preceding hour/15 min**, not instantaneous |
| `direct_normal_irradiance` | float | Direct Normal Irradiance (DNI), W/m² — **average over the preceding hour/15 min**, not instantaneous |
| `diffuse_radiation` | float | Diffuse Horizontal Irradiance (DHI), W/m² — **average over the preceding hour/15 min**, not instantaneous |
| `wind_speed_10m` | float | Wind speed at 10 m above ground, km/h |
| `wind_direction_10m` | float | Wind direction at 10 m (meteorological degrees, 0–360°, direction wind blows from) |
| `wind_gusts_10m` | float | Wind gusts at 10 m above ground, km/h |
| `temperature_2m` | float | Air temperature at 2 m above ground, °C |
| `cloud_cover` | float | Total cloud cover, % (0–100) |
| `model` | string | Open-Meteo model identifier, e.g. `best_match` |
| `issue_time_utc` | timestamp (UTC) | When this forecast batch was fetched/issued |
| `request_url` | string | Full Open-Meteo request URL used to produce the row |

**Notes:**
- **Irradiance averaging:** Open-Meteo reports `shortwave_radiation`, `direct_normal_irradiance`,
  and `diffuse_radiation` as averages over the **preceding** time step (e.g. `01:00` is the mean
  from `00:00` to `01:00`), not instantaneous values at `time_utc`. Downstream solar models
  (`pvlib`) must account for this midpoint offset.
- **Caching:** Raw JSON responses per batch are cached locally under `data/forecasts/raw/`
  (keyed by request URL hash) for offline use and fair-use compliance; delete the cache or pass
  `--refresh` to re-fetch.

