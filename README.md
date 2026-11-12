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
pip install -e ".[dev]"
cd frontend && npm ci && cd ..
```

Run (two terminals, with the venv active for the API):

```bash
uvicorn solar_race_planner.serve.app:app --reload   # API on http://localhost:8000 (docs at /docs)
cd frontend && npm run dev                          # web app on http://localhost:5173
```

Test and lint (run before opening a PR):

```bash
ruff check . && ruff format --check .   # lint; `ruff format .` fixes formatting
pytest                                  # API tests
cd frontend && npm test                 # frontend tests
```

Or everything at once (API, web app, PostGIS):

```bash
docker compose up --build
```

## Documents

| File | What |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Structure, stack, data flow |
| [docs/data-contracts.md](docs/data-contracts.md) | File formats between layers |
| [docs/testing.md](docs/testing.md) | How each part is tested on its own |
| [docs/deployment.md](docs/deployment.md) | TBD |
| [docs/bwsc-facts.md](docs/bwsc-facts.md) | The competition |

## Data and licences
TBD
