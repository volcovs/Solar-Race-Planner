# data/

Local cache for pipeline outputs: route, forecasts, plans, back-tests.
Everything here except this file is git-ignored. Build it with the pipeline commands
in the main README; formats are in `docs/data-contracts.md`.

```
data/
  route/route.parquet          race route (DAT-01)
  route/segments.parquet       the route in 100 m segments (DAT-02)
  route/control_stops.parquet  control stops on the route (DAT-03)
  route/raw/overpass.json      cached OpenStreetMap download
  forecasts/                   (later tickets)
  plans/                       (later tickets)
```

`frontend/public/sample/route.geojson` is a small, simplified copy of the route for the
web app until the API serves it. Rebuild it with:

```bash
python -m solar_race_planner.ingest.route --geojson frontend/public/sample/route.geojson
```
