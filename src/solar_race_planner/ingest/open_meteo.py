import hashlib
import json
import math
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, Self

import httpx
import pandas as pd

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MAX_REQUESTS = 5
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[3] / "data" / "forecasts" / "raw"

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
    "step_minutes",
    *WEATHER_VARIABLES,
    "model",
    "issue_time_utc",
    "request_url",
)

Resolution = Literal["hourly", "minutely_15"]


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
        cache_dir: Path | None = DEFAULT_CACHE_DIR,
        cache_ttl_seconds: float | None = 1800.0,  # 30 minutes
        max_requests: int = MAX_REQUESTS,
        max_retries: int = 4,
        backoff_base_seconds: float = 1.0,
        max_retry_delay_seconds: float = 60.0,
        timeout_seconds: float = 30.0,
        http_client: httpx.Client | None = None,
        sleep_fn: Callable[[float], None] = time.sleep,
        now_fn: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.base_url = base_url
        self.cache_dir = cache_dir
        self.cache_ttl_seconds = cache_ttl_seconds
        self.max_requests = max_requests
        self.max_retries = max_retries
        self.backoff_base_seconds = backoff_base_seconds
        self.max_retry_delay_seconds = max_retry_delay_seconds
        self._sleep = sleep_fn
        self._now = now_fn
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

    def __enter__(self) -> Self:
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
        resolution: Resolution = "hourly",
        model: str = "best_match",
        forecast_days: int = 7,
        use_cache: bool = True,
    ) -> pd.DataFrame:
        """Fetch weather forecasts for route points in at most `max_requests` HTTP calls.

        Units: irradiance W/m², wind speed and gusts m/s (always requested as such),
        wind direction degrees, temperature °C, cloud cover %.

        Irradiance values (GHI, DNI, DHI) are averages over the preceding `step_minutes`
        interval, not instantaneous.

        `resolution="minutely_15"` is native only in Europe and North America; elsewhere
        (e.g. Australia) Open-Meteo interpolates it from hourly data, so prefer "hourly".

        `issue_time_utc` is when the batch was fetched (or cached), not the model run time.
        `model` is the model requested, not necessarily the one `best_match` resolved to.
        """
        if resolution not in ("hourly", "minutely_15"):
            raise ValueError(f"Unsupported resolution: {resolution!r}")

        if not points:
            return pd.DataFrame(columns=list(OUTPUT_COLUMNS))

        # Split N points across at most `max_requests` batches to stay within
        # fair-use limits and avoid overly long query strings.
        batch_size = max(60, math.ceil(len(points) / self.max_requests))
        batches = [points[i : i + batch_size] for i in range(0, len(points), batch_size)]

        frames = [
            self._fetch_batch(
                batch=batch,
                resolution=resolution,
                model=model,
                forecast_days=forecast_days,
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
        use_cache: bool,
    ) -> pd.DataFrame:
        params = {
            "latitude": ",".join(f"{p.lat:.5f}" for p in batch),
            "longitude": ",".join(f"{p.lon:.5f}" for p in batch),
            resolution: ",".join(WEATHER_VARIABLES),
            "models": model,
            "forecast_days": str(forecast_days),
            "timezone": "UTC",
            "wind_speed_unit": "ms",
        }
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
        now_utc = pd.Timestamp(self._now()).tz_convert("UTC").floor("s").as_unit("s")

        if use_cache and cache_file is not None:
            cached = self._read_cache(cache_file, now_utc)
            if cached is not None:
                return cached

        response = self._send_with_retry(request)
        payload = response.json()

        if cache_file is not None:
            self._write_cache(cache_file, request_url, payload, now_utc)
        return payload, now_utc

    def _read_cache(self, cache_file: Path, now_utc: pd.Timestamp) -> tuple[Any, pd.Timestamp] | None:
        """Return (payload, issue_time) if the cache entry is valid and fresh, else None."""
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            cached_time = pd.Timestamp(cached["issue_time_utc"]).tz_convert("UTC").as_unit("s")
            payload = cached["payload"]
        except (OSError, ValueError, KeyError, TypeError):
            # Missing, unreadable or corrupt entry (json.JSONDecodeError is a ValueError).
            return None

        age_seconds = (now_utc - cached_time).total_seconds()
        if self.cache_ttl_seconds is None or age_seconds <= self.cache_ttl_seconds:
            return payload, cached_time
        return None

    @staticmethod
    def _write_cache(cache_file: Path, request_url: str, payload: Any, issue_time_utc: pd.Timestamp) -> None:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        tmp_file = cache_file.with_suffix(".json.tmp")
        tmp_file.write_text(
            json.dumps(
                {
                    "issue_time_utc": issue_time_utc.isoformat(),
                    "request_url": request_url,
                    "payload": payload,
                }
            ),
            encoding="utf-8",
        )
        tmp_file.replace(cache_file)  # atomic on the same filesystem

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

                self._sleep(self._retry_delay(response, attempt))
            except httpx.TransportError as exc:
                last_exc = exc
                if attempt == self.max_retries:
                    raise
                delay = min(self.max_retry_delay_seconds, self.backoff_base_seconds * (2**attempt))
                self._sleep(delay)

        raise RuntimeError("Retry loop exited unexpectedly") from last_exc

    def _retry_delay(self, response: httpx.Response, attempt: int) -> float:
        retry_after = response.headers.get("Retry-After")
        if retry_after is not None:
            try:
                return min(self.max_retry_delay_seconds, max(0.0, float(retry_after)))
            except ValueError:
                pass
        return min(self.max_retry_delay_seconds, self.backoff_base_seconds * (2**attempt))

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

        step_minutes = 15 if resolution == "minutely_15" else 60
        point_frames: list[pd.DataFrame] = []
        for point, item in zip(batch, items, strict=True):
            if resolution not in item:
                raise KeyError(
                    f"Resolution {resolution!r} missing from response for point {point.point_id!r}"
                )

            df_point = pd.DataFrame(item[resolution]).rename(columns={"time": "time_utc"})
            df_point["time_utc"] = pd.to_datetime(df_point["time_utc"], utc=True)
            df_point["step_minutes"] = step_minutes
            df_point["point_id"] = str(point.point_id)
            df_point["model"] = model
            df_point["issue_time_utc"] = issue_time_utc
            df_point["request_url"] = request_url
            point_frames.append(df_point)

        return pd.concat(point_frames, ignore_index=True)[list(OUTPUT_COLUMNS)]

    def _cache_path(self, request_url: str) -> Path | None:
        if self.cache_dir is None:
            return None
        digest = hashlib.sha256(request_url.encode("utf-8")).hexdigest()[:16]
        return self.cache_dir / f"{digest}.json"
