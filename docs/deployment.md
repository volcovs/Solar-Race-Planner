# Deployment

The production demo is hosted on **Northflank** using student cloud credits.
The entire stack can also run completely offline on a laptop via `docker compose up`.

---

## 1. Architecture on Northflank

| Component | Northflank Service Type | Details |
|---|---|---|
| **Database** | PostgreSQL Addon | Managed PostgreSQL with PostGIS extension |
| **API** | Deployment Service | Python 3.12 + FastAPI container running `solar_race_planner.serve.app` |
| **Frontend** | Static Site / Web Service | React + Vite single page application |

---

## 2. Database Setup (Northflank Postgres + PostGIS)

1. **Addon Creation**:
   - In your Northflank project, create a **PostgreSQL** addon.
   - PostGIS is supported on Northflank PostgreSQL.

2. **Connecting API to Postgres (Environment Variables & Secrets)**:
   - In Northflank, go to the **`api` service** -> **Environment**.
   - Either link the PostgreSQL addon directly or add the environment variable:
     ```bash
     SRP_DATABASE_URL=${POSTGRES_URI}
     ```
     *(Or paste the connection string: `postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require` as a secret).*
   - **Important**: The database connection string contains credentials. **Never commit it to git or push it in code.** It must exist only in Northflank's Environment Variables / Secrets.

3. **Schema Migrations**:
   - When the `api` container boots, it automatically runs `alembic upgrade head`.
   - The initial migration (`001_initial_schema.py`) executes:
     ```sql
     CREATE EXTENSION IF NOT EXISTS postgis;
     ```
     and creates all required tables and spatial indexes.

---

## 3. GitHub Actions CI/CD (`.github/workflows/deploy.yml`)

When changes are merged into `main`:
1. **Test job**: Runs CI tests (`pytest`, `ruff check`, `npm test`).
2. **Build job**: Triggers Northflank build via Northflank API using `NORTHFLANK_API_TOKEN` and `NORTHFLANK_PROJECT_ID`.
3. **Smoke test**: Polls `${API_URL}/health` to verify the deployment is live and healthy.
