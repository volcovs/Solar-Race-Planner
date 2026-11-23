# Data contracts

Freeze these by the end of week 1. Changing a column after that needs a version
bump and a note in the team channel.

All tables are stored in PostGIS / (Geo)Parquet, rasters are COGs. Times are UTC. Distances are km
from the start line (Darwin).

---

## 1. Route segments (`route_segments`)

| Column | Type | Description |
|---|---|---|
| `segment_index` | `int` (unique) | Index from 0 to ~30,000 (100 m steps) |
| `km` | `float` | Distance from start line in Darwin (e.g. 0.0, 0.1, ...) |
| `latitude` | `float` | WGS84 latitude |
| `longitude` | `float` | WGS84 longitude |
| `elevation_m` | `float` | Altitude above sea level in metres (Copernicus DEM) |
| `slope_pct` | `float` | Incline / grade percentage |
| `heading_deg` | `float` | Bearing / heading in degrees (0–360) for wind angle |
| `speed_limit_kmh` | `float` | Local road speed limit (km/h) |
| `roughness_z0` | `float` | Surface roughness length in metres (ESA WorldCover 10m) |
| `is_control_stop` | `bool` | True if this segment is one of the 9 mandatory control stops |
| `control_stop_name` | `str?` | Name of the stop (Katherine, Alice Springs, etc.) |
| `geom` | `Geometry(Point, 4326)?` | PostGIS spatial geometry point |

---

## 2. Weather forecasts (`weather_forecasts`)

| Column | Type | Description |
|---|---|---|
| `issued_at` | `datetime` | When the forecast was published/fetched (UTC) |
| `valid_time` | `datetime` | Target arrival / valid time (UTC) |
| `km` | `float` | Route marker distance (km) |
| `ghi_w_m2` | `float` | Global Horizontal Irradiance ($W/m^2$) |
| `dni_w_m2` | `float` | Direct Normal Irradiance ($W/m^2$) |
| `dhi_w_m2` | `float` | Diffuse Horizontal Irradiance ($W/m^2$) |
| `wind_speed_ms` | `float` | Wind speed at surface ($m/s$) |
| `wind_dir_deg` | `float` | Wind direction in degrees |
| `temp_c` | `float` | Ambient temperature in Celsius |
| `ghi_p10` | `float` | 10th percentile (pessimistic) GHI |
| `ghi_p50` | `float` | 50th percentile (median) GHI |
| `ghi_p90` | `float` | 90th percentile (optimistic) GHI |
| `source` | `str` | Forecast provider or model (e.g. `open-meteo`, `ecmwf`) |

---

## 3. Speed & Energy Plans (`plans` & `plan_segments`)

### `plans`
| Column | Type | Description |
|---|---|---|
| `id` | `uuid` | Plan identifier |
| `created_at` | `datetime` | Generation timestamp (UTC) |
| `car_profile_hash` | `str` | SHA-256 hash of the car configuration YAML |
| `start_km` | `float` | Starting position (0.0 for full race, $>0$ for re-plan) |
| `start_time` | `datetime` | Start departure time (UTC) |
| `start_soc` | `float` | Battery State of Charge at start (0.0 to 1.0) |
| `status` | `str` | Execution status (`completed`, `computing`, `failed`) |
| `safe_under_p10` | `bool` | True if car completes without depleting battery below buffer on P10 |
| `total_time_hours` | `float?` | Simulated total elapsed driving time |
| `finish_eta` | `datetime?` | Estimated time of arrival at finish line (Adelaide) |
| `provenance` | `json` | Metadata trace: git commit, forecast timestamp, parameters |

### `plan_segments`
| Column | Type | Description |
|---|---|---|
| `plan_id` | `uuid` (FK) | Reference to parent plan |
| `segment_index` | `int` | Segment order index |
| `km` | `float` | Distance marker (km) |
| `target_speed_kmh` | `float` | Optimal recommended target speed (km/h) |
| `arrival_time` | `datetime` | Simulated arrival timestamp (UTC) |
| `soc_p50` | `float` | Estimated SoC under median forecast (0.0–1.0) |
| `soc_p10` | `float` | Estimated SoC under pessimistic forecast |
| `soc_p90` | `float` | Estimated SoC under optimistic forecast |
| `solar_power_w` | `float` | Generated solar array power ($W$) |
| `motor_power_w` | `float` | Consumed traction motor power ($W$) |

---

## 4. Backtest results (`backtest_results`)

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` | Run identifier |
| `created_at` | `datetime` | Run timestamp (UTC) |
| `race_year` | `int` | Historical race year (e.g. 2023) |
| `car_profile_hash` | `str` | Car configuration hash |
| `simulated_finish_hours` | `float` | Strategy finishing time |
| `actual_finish_hours` | `float` | Real historical finishing time |
| `delta_hours` | `float` | Simulated minus actual time |
| `provenance` | `json` | Reproducibility metadata |
| `metrics` | `json` | Detailed performance metrics |

---

## 5. Live telemetry (`telemetry_readings`)

| Column | Type | Description |
|---|---|---|
| `id` | `int` | Autoincrement PK |
| `recorded_at` | `datetime` | Timestamp of telemetry packet |
| `km` | `float` | Car location on route |
| `latitude` | `float` | GPS latitude |
| `longitude` | `float` | GPS longitude |
| `speed_kmh` | `float` | Actual car speed |
| `battery_soc` | `float` | Real measured State of Charge |
| `array_power_w` | `float` | Real measured PV generation |
| `motor_power_w` | `float` | Real motor power draw |
