"""API entry point. Run: uvicorn solar_race_planner.serve.app:app --reload"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from solar_race_planner import __version__

app = FastAPI(title="Solar Race Planner API", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("SRP_CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}
