import json
import os
from pathlib import Path
import ee


def init_gee_from_key(key_path: str | Path | None = None) -> None:
    """Authenticate and initialize Google Earth Engine using a service account JSON key."""
    resolved_path = Path(key_path or os.environ.get("GEE_KEY_PATH", "secrets/gee-key.json"))

    if not resolved_path.exists():
        raise FileNotFoundError(f"GEE service account key not found at: {resolved_path}")

    # Extract client_email and project_id directly from the JSON key file
    with resolved_path.open("r", encoding="utf-8") as f:
        key_data = json.load(f)

    service_account = key_data["client_email"]
    project_id = key_data["project_id"]

    credentials = ee.ServiceAccountCredentials(service_account, str(resolved_path))
    ee.Initialize(credentials=credentials, project=project_id)


if __name__ == "__main__":
    init_gee_from_key()

    # Quick sanity check: sample Copernicus DEM elevation at Darwin, Australia
    darwin = ee.Geometry.Point([130.8456, -12.4634])
    dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").mosaic().select("DEM")
    sample = dem.sample(region=darwin, scale=30).first().getInfo()

    print("Connected to GEE successfully!")
    print("Darwin elevation (m):", sample["properties"]["DEM"])
