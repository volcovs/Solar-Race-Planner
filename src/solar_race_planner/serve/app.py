"""API entry point. Run: uvicorn solar_race_planner.serve.app:app --reload"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from solar_race_planner import __version__

app = FastAPI(title="Solar Race Planner API", version=__version__)
# Comma-separated; spaces and trailing slashes are ignored (browsers send the origin without them).
cors_origins = [
    o.strip().rstrip("/") for o in os.environ.get("SRP_CORS_ORIGINS", "http://localhost:5173").split(",")
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in cors_origins if o],
    allow_methods=["GET"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}
