# data/

Local cache for pipeline outputs: route segments, forecasts, plans, back-tests.
Everything here except this file is git-ignored. Seed it with the pipeline scripts.
Hosted deployments keep durable results in PostGIS (Neon); this folder is only a working cache.

```
data/
  route/segments.parquet
  forecasts/solar_forecast_<issue_time>.parquet
  plans/<plan_id>.parquet + .json
```
