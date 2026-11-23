from __future__ import annotations

from pathlib import Path

import httpx
import pandas as pd
import pytest

from solar_race_planner.ingest.open_meteo import (
    OUTPUT_COLUMNS,
    WEATHER_VARIABLES,
    OpenMeteoClient,
    RoutePoint,
)


def _make_location_payload(
    lat: float,
    lon: float,
    *,
    resolution: str = "hourly",
    times: list[str] | None = None,
) -> dict[str, object]:
    step_times = times or ["2026-11-18T00:00", "2026-11-18T01:00"]
    n = len(step_times)
    block: dict[str, object] = {"time": step_times}
    for idx, var in enumerate(WEATHER_VARIABLES, start=1):
        block[var] = [float(idx * 10 + t) for t in range(n)]
    return {
        "latitude": lat,
        "longitude": lon,
        "utc_offset_seconds": 0,
        "timezone": "GMT",
        resolution: block,
    }


def _mock_open_meteo_handler(request: httpx.Request) -> httpx.Response:
    lats = [float(v) for v in request.url.params["latitude"].split(",")]
    lons = [float(v) for v in request.url.params["longitude"].split(",")]
    resolution = "minutely_15" if "minutely_15" in request.url.params else "hourly"

    items = [
        _make_location_payload(lat, lon, resolution=resolution) for lat, lon in zip(lats, lons, strict=True)
    ]
    # Mirror Open-Meteo's actual response shape: dict for 1 point, list for >= 2.
    payload: object = items[0] if len(items) == 1 else items
    return httpx.Response(200, json=payload)


def test_fetch_forecast_returns_tidy_dataframe_with_provenance(tmp_path: Path) -> None:
    points = [
        RoutePoint(point_id="darwin", lat=-12.4634, lon=130.8456),
        RoutePoint(point_id="alice", lat=-23.6980, lon=133.8807),
    ]
    http_client = httpx.Client(transport=httpx.MockTransport(_mock_open_meteo_handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast(points, model="ecmwf_ifs025", forecast_days=2)

    assert list(df.columns) == list(OUTPUT_COLUMNS)
    assert len(df) == 4  # 2 points x 2 hourly steps
    assert set(df["point_id"]) == {"darwin", "alice"}
    assert isinstance(df["time_utc"].dtype, pd.DatetimeTZDtype)
    assert str(df["time_utc"].dtype.tz) == "UTC"
    assert (df["model"] == "ecmwf_ifs025").all()
    assert df["issue_time_utc"].notna().all()
    assert df["request_url"].str.contains("api.open-meteo.com/v1/forecast").all()


def test_fetch_forecast_handles_single_point_object_response(tmp_path: Path) -> None:
    points = [RoutePoint(point_id=0, lat=-12.4634, lon=130.8456)]
    http_client = httpx.Client(transport=httpx.MockTransport(_mock_open_meteo_handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast(points, resolution="minutely_15")

    assert len(df) == 2
    assert (df["point_id"] == "0").all()


def test_fetch_forecast_empty_points_makes_no_requests(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return _mock_open_meteo_handler(request)

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast([])

    assert calls == 0
    assert df.empty
    assert list(df.columns) == list(OUTPUT_COLUMNS)


def test_fetch_forecast_batches_300_points_into_at_most_5_requests(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return _mock_open_meteo_handler(request)

    points = [
        RoutePoint(point_id=f"km_{i * 10}", lat=-12.5 - i * 0.07, lon=130.8 + i * 0.02) for i in range(300)
    ]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast(points)

    assert calls <= 5
    assert df["point_id"].nunique() == 300
    assert len(df) == 600


def test_fetch_forecast_retries_on_429_and_5xx_with_backoff(tmp_path: Path) -> None:
    attempts = 0
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, headers={"Retry-After": "2"})
        if attempts == 2:
            return httpx.Response(503)
        return _mock_open_meteo_handler(request)

    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(
        cache_dir=tmp_path,
        http_client=http_client,
        backoff_base_seconds=0.5,
        sleep_fn=sleeps.append,
    ) as client:
        df = client.fetch_forecast(points)

    assert attempts == 3
    assert sleeps == [2.0, 1.0]  # Retry-After=2s, then 0.5 * 2**1
    assert len(df) == 2


def test_fetch_forecast_raises_after_exhausting_retries(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(
        cache_dir=tmp_path,
        http_client=http_client,
        max_retries=2,
        sleep_fn=lambda _: None,
    ) as client:
        with pytest.raises(httpx.HTTPStatusError):
            client.fetch_forecast(points)


def test_fetch_forecast_uses_disk_cache(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return _mock_open_meteo_handler(request)

    points = [
        RoutePoint(point_id="p1", lat=-12.46, lon=130.84),
        RoutePoint(point_id="p2", lat=-14.47, lon=132.26),
    ]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df1 = client.fetch_forecast(points, use_cache=True)
        df2 = client.fetch_forecast(points, use_cache=True)
        df3 = client.fetch_forecast(points, use_cache=False)

    assert calls == 2  # 1st call populates cache, 2nd reads cache, 3rd bypasses cache
    pd.testing.assert_frame_equal(df1, df2)
    assert len(df3) == len(df1)


def test_fetch_forecast_rejects_invalid_resolution(tmp_path: Path) -> None:
    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(_mock_open_meteo_handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        with pytest.raises(ValueError, match="Unsupported resolution"):
            client.fetch_forecast(points, resolution="daily")  # type: ignore[arg-type]


def test_fetch_forecast_auto_uses_minutely_15_and_falls_back_to_hourly(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "minutely_15" in request.url.params
        assert "hourly" in request.url.params

        # Point 1: has valid 15-min data for 00:00-00:15, plus hourly at 01:00
        p1 = _make_location_payload(
            -12.46,
            130.84,
            resolution="minutely_15",
            times=["2026-11-18T00:00", "2026-11-18T00:15"],
        )
        p1["hourly"] = _make_location_payload(
            -12.46,
            130.84,
            resolution="hourly",
            times=["2026-11-18T00:00", "2026-11-18T01:00"],
        )["hourly"]

        # Point 2: 15-min data is all null -> must fall back completely to hourly
        p2 = _make_location_payload(
            -23.70,
            133.88,
            resolution="hourly",
            times=["2026-11-18T00:00", "2026-11-18T01:00"],
        )
        p2["minutely_15"] = {
            "time": ["2026-11-18T00:00", "2026-11-18T00:15"],
            **{var: [None, None] for var in WEATHER_VARIABLES},
        }
        return httpx.Response(200, json=[p1, p2])

    points = [
        RoutePoint(point_id="p1", lat=-12.46, lon=130.84),
        RoutePoint(point_id="p2", lat=-23.70, lon=133.88),
    ]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast(points, resolution="auto")

    p1_times = df.loc[df["point_id"] == "p1", "time_utc"].dt.strftime("%H:%M").tolist()
    p2_times = df.loc[df["point_id"] == "p2", "time_utc"].dt.strftime("%H:%M").tolist()

    assert p1_times == ["00:00", "00:15", "01:00"]
    assert p2_times == ["00:00", "01:00"]
