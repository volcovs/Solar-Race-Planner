from __future__ import annotations

import hashlib
import json
import math
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import httpx
import pandas as pd

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MAX_REQUESTS = 5
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

WEATHER_VARIABLES: tuple[str, ...] = (
    "shortwave_radiation",
    "direct_normal_irradiance",
    "diffuse_radiation",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "temperature_2m",
    "cloud_cover",
)

OUTPUT_COLUMNS: tuple[str, ...] = (
    "point_id",
    "time_utc",
    *WEATHER_VARIABLES,
    "model",
    "issue_time_utc",
    "request_url",
)

Resolution = Literal["auto", "hourly", "minutely_15"]


@dataclass(frozen=True)
class RoutePoint:
    point_id: str | int
    lat: float
    lon: float


class OpenMeteoClient:
    """Batched, cached Open-Meteo Forecast API client with retry and back-off."""

    def __init__(
        self,
        base_url: str = OPEN_METEO_FORECAST_URL,
        cache_dir: Path | None = Path("data/forecasts/raw"),
        max_requests: int = MAX_REQUESTS,
        max_retries: int = 4,
        backoff_base_seconds: float = 1.0,
        timeout_seconds: float = 30.0,
        http_client: httpx.Client | None = None,
        sleep_fn: Callable[[float], None] = time.sleep,
    ) -> None:
        self.base_url = base_url
        self.cache_dir = cache_dir
        self.max_requests = max_requests
        self.max_retries = max_retries
        self.backoff_base_seconds = backoff_base_seconds
        self._sleep = sleep_fn
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

        if self.cache_dir is not None:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def __enter__(self) -> OpenMeteoClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def fetch_forecast(
        self,
        points: Sequence[RoutePoint],
        *,
        resolution: Resolution = "auto",
        model: str = "best_match",
        forecast_days: int = 7,
        wind_speed_unit: Literal["kmh", "ms"] = "kmh",
        use_cache: bool = True,
    ) -> pd.DataFrame:
        """Fetch weather forecasts for route points in at most `max_requests` HTTP calls.

        Returns a tidy DataFrame with one row per (point_id, time_utc).
        Note: Open-Meteo irradiance values (GHI, DNI, DHI) are averages over the
        preceding time step, not instantaneous values at `time_utc`.
        """
        if not points:
            return pd.DataFrame(columns=list(OUTPUT_COLUMNS))

        if resolution not in ("auto", "hourly", "minutely_15"):
            raise ValueError(f"Unsupported resolution: {resolution!r}")

        # Split N points evenly across at most `max_requests` batches to stay
        # within fair-use limits and avoid overly long query strings.
        batch_size = max(60, math.ceil(len(points) / self.max_requests))
        batches = [points[i : i + batch_size] for i in range(0, len(points), batch_size)]

        frames = [
            self._fetch_batch(
                batch=batch,
                resolution=resolution,
                model=model,
                forecast_days=forecast_days,
                wind_speed_unit=wind_speed_unit,
                use_cache=use_cache,
            )
            for batch in batches
        ]
        return pd.concat(frames, ignore_index=True)

    def _fetch_batch(
        self,
        *,
        batch: Sequence[RoutePoint],
        resolution: Resolution,
        model: str,
        forecast_days: int,
        wind_speed_unit: str,
        use_cache: bool,
    ) -> pd.DataFrame:
        vars_csv = ",".join(WEATHER_VARIABLES)
        params: dict[str, str] = {
            "latitude": ",".join(f"{p.lat:.5f}" for p in batch),
            "longitude": ",".join(f"{p.lon:.5f}" for p in batch),
            "models": model,
            "forecast_days": str(forecast_days),
            "timezone": "UTC",
            "wind_speed_unit": wind_speed_unit,
        }
        if resolution == "auto":
            params["minutely_15"] = vars_csv
            params["hourly"] = vars_csv
        else:
            params[resolution] = vars_csv

        request = self._client.build_request("GET", self.base_url, params=params)
        request_url = str(request.url)

        payload, issue_time_utc = self._get_or_fetch_payload(
            request=request,
            request_url=request_url,
            use_cache=use_cache,
        )
        return self._parse_batch_payload(
            batch=batch,
            payload=payload,
            resolution=resolution,
            model=model,
            issue_time_utc=issue_time_utc,
            request_url=request_url,
        )

    def _get_or_fetch_payload(
        self,
        *,
        request: httpx.Request,
        request_url: str,
        use_cache: bool,
    ) -> tuple[Any, pd.Timestamp]:
        cache_file = self._cache_path(request_url)
        if use_cache and cache_file is not None and cache_file.exists():
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            return cached["payload"], pd.Timestamp(cached["issue_time_utc"])

        response = self._send_with_retry(request)
        payload = response.json()
        issue_time_utc = pd.Timestamp(datetime.now(UTC)).floor("s")

        if cache_file is not None:
            cache_file.write_text(
                json.dumps(
                    {
                        "issue_time_utc": issue_time_utc.isoformat(),
                        "request_url": request_url,
                        "payload": payload,
                    }
                ),
                encoding="utf-8",
            )
        return payload, issue_time_utc

    def _send_with_retry(self, request: httpx.Request) -> httpx.Response:
        """Send an HTTP request with exponential back-off on 429/5xx and transport errors."""
        last_exc: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                response = self._client.send(request)
                if response.status_code not in RETRYABLE_STATUS_CODES:
                    response.raise_for_status()
                    return response

                if attempt == self.max_retries:
                    response.raise_for_status()

                delay = self._retry_delay(response, attempt)
                self._sleep(delay)
            except httpx.TransportError as exc:
                last_exc = exc
                if attempt == self.max_retries:
                    raise
                self._sleep(self.backoff_base_seconds * (2**attempt))

        # Unreachable, kept for type-checker completeness.
        raise RuntimeError("Retry loop exited unexpectedly") from last_exc

    def _retry_delay(self, response: httpx.Response, attempt: int) -> float:
        retry_after = response.headers.get("Retry-After")
        if retry_after is not None:
            try:
                return max(0.0, float(retry_after))
            except ValueError:
                pass
        return self.backoff_base_seconds * (2**attempt)

    def _parse_batch_payload(
        self,
        *,
        batch: Sequence[RoutePoint],
        payload: Any,
        resolution: Resolution,
        model: str,
        issue_time_utc: pd.Timestamp,
        request_url: str,
    ) -> pd.DataFrame:
        # Open-Meteo returns a single JSON object for 1 coordinate and a list for >= 2.
        items = payload if isinstance(payload, list) else [payload]
        if len(items) != len(batch):
            raise ValueError(f"Expected {len(batch)} location results from Open-Meteo, got {len(items)}")

        point_frames: list[pd.DataFrame] = []
        for point, item in zip(batch, items, strict=True):
            df_point = self._extract_point_frame(item=item, point=point, resolution=resolution)
            df_point["point_id"] = str(point.point_id)
            df_point["model"] = model
            df_point["issue_time_utc"] = issue_time_utc
            df_point["request_url"] = request_url
            point_frames.append(df_point)

        return pd.concat(point_frames, ignore_index=True)[list(OUTPUT_COLUMNS)]

    def _extract_point_frame(
        self,
        *,
        item: dict[str, Any],
        point: RoutePoint,
        resolution: Resolution,
    ) -> pd.DataFrame:
        """Build a point DataFrame, falling back from 15-min to hourly when resolution='auto'."""
        if resolution != "auto":
            if resolution not in item:
                raise KeyError(
                    f"Resolution {resolution!r} missing from response for point {point.point_id!r}"
                )
            df = pd.DataFrame(item[resolution]).rename(columns={"time": "time_utc"})
            df["time_utc"] = pd.to_datetime(df["time_utc"], utc=True)
            return df

        weather_cols = list(WEATHER_VARIABLES)
        df_15: pd.DataFrame | None = None
        if "minutely_15" in item:
            candidate = pd.DataFrame(item["minutely_15"]).rename(columns={"time": "time_utc"})
            candidate["time_utc"] = pd.to_datetime(candidate["time_utc"], utc=True)
            # Keep only 15-min rows where at least one weather variable is non-null.
            valid_15 = candidate.dropna(subset=weather_cols, how="all")
            if not valid_15.empty:
                df_15 = valid_15

        df_hourly: pd.DataFrame | None = None
        if "hourly" in item:
            df_hourly = pd.DataFrame(item["hourly"]).rename(columns={"time": "time_utc"})
            df_hourly["time_utc"] = pd.to_datetime(df_hourly["time_utc"], utc=True)

        if df_15 is not None and df_hourly is not None:
            # Use 15-min data where available, and hourly for timestamps beyond it.
            last_15_time = df_15["time_utc"].max()
            hourly_tail = df_hourly[df_hourly["time_utc"] > last_15_time]
            return pd.concat([df_15, hourly_tail], ignore_index=True)

        if df_15 is not None:
            return df_15
        if df_hourly is not None:
            return df_hourly

        raise KeyError(f"Neither 'minutely_15' nor 'hourly' found for point {point.point_id!r}")

    def _cache_path(self, request_url: str) -> Path | None:
        if self.cache_dir is None:
            return None
        digest = hashlib.sha256(request_url.encode("utf-8")).hexdigest()[:16]
        return self.cache_dir / f"{digest}.json"
