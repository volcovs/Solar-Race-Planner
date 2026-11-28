# Solar Race Planner

We're building a **race strategy app for solar cars**. It tells the team **how
fast to drive, kilometre by kilometre**, so the car crosses Australia as quickly
as possible **without running out of battery**, using only **free weather
forecasts and open satellite/map data**. When the weather changes during the
race, it **re-plans in seconds**.

The showcase is the **Bridgestone World Solar Challenge (BWSC)**: about 3,000 km
from Darwin to Adelaide through the outback, run since 1987. 

## Run it

You need Python 3.12, Node 22 and, for the full stack, Docker.

Install, once:

```bash
cp .env.example .env
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev,geo]"           # geo: the data pipeline (route, rasters)
cd frontend && npm ci && cd ..
```

Build the data (network required; outputs go to `data/`, which is git-ignored):

```bash
python -m solar_race_planner.ingest.route      # race route from OpenStreetMap → data/route/route.parquet
python -m solar_race_planner.ingest.segments   # 100 m segments and control stops → data/route/segments.parquet, control_stops.parquet
```

Run (two terminals, with the venv active for the API):

```bash
uvicorn solar_race_planner.serve.app:app --reload   # API on http://localhost:8000 (docs at /docs)
cd frontend && npm run dev                          # web app on http://localhost:5173
```

**Once the API serves actual data, rebuild the project and run with `VITE_API_MOCK=false`.**

Test and lint (run before opening a PR):

```bash
ruff check . && ruff format --check .   # lint; `ruff format .` fixes formatting
pytest                                  # Python tests (offline)
cd frontend && npm test                 # frontend tests
```

Or everything at once (API, web app, PostGIS):

```bash
docker compose up --build
```

## On a phone

The web app installs to a phone's home screen and opens full screen like an app; there is
nothing to download. Open the deployed (HTTPS) address, then:

- Android, Chrome: menu ⋮ → **Add to Home screen** (or **Install app**).
- iPhone, Safari: **Share → Add to Home Screen**. The app shows this tip on iPhones.

"Use my location" on Re-plan and installing both need HTTPS: they work on the deployed
address and on `localhost`, not on a laptop's address over local Wi-Fi. The icons are drawn
from `frontend/public/icons/icon.svg`.

### Offline

Once opened with signal, the app works without it: its service worker
(`frontend/src/service-worker.js`) keeps the app, the last plan and forecast, and the map tiles
seen. A banner shows when it's offline and how old the forecast is. It exists only in builds:

```bash
cd frontend && npm run build && npx vite preview
```

## Release

Merging to `main` deploys (see `docs/deployment.md`). A release gives that version a
number and notes on GitHub:

1. In a pull request, set the same new version in `pyproject.toml` and the frontend, then merge it:

   ```bash
   cd frontend && npm version 0.2.0 --no-git-tag-version   # package.json and its lock file
   ```

2. Tag the merged commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag v0.2.0 && git push origin v0.2.0
   ```

The Release workflow checks that the tag is on `main` and matches both versions, runs the tests,
and publishes the release with notes from the pull requests merged since the last one. A tag
such as `v0.2.0-rc.1` makes a pre-release. After changing the version, rerun
`pip install -e ".[dev,geo]"` so a local API reports it too.

## Documents

| File | What |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Structure, stack, data flow |
| [docs/data-contracts.md](docs/data-contracts.md) | File formats between layers |
| [docs/testing.md](docs/testing.md) | How each part is tested on its own |
| [docs/deployment.md](docs/deployment.md) | Hosting on Northflank |
| [docs/bwsc-facts.md](docs/bwsc-facts.md) | The competition |

## Data and licences
TBD
